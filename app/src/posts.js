// Сервіс постів: список (пагінація/пошук/теги/гео), перегляд, створення, версіоване редагування, реакції.
const { col } = require("./db");
const { ApiError, oid, str, parseTags, mapMongoError, slugify, ukStemText } = require("./util");

const LIST_PROJECTION = { content: 0, comments: 0, search_stems: 0 }; // у списку не віддаємо важкі поля
const SORTS = {
  new: { published_at: -1, _id: -1 },
  old: { published_at: 1, _id: 1 },
  popular: { "statistics.views": -1, _id: -1 },
  rated: { rating: -1, _id: -1 },
  comments: { "statistics.comments_count": -1, _id: -1 }
};
const MAX_DEPTH = 3;

// ---------------------------------------------------------------- список
async function listPosts(q) {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const perPage = Math.min(50, Math.max(1, parseInt(q.per_page, 10) || 9));
  const empty = { items: [], total: 0, page, per_page: perPage, pages: 0 };
  const match = { status: "published" };

  if (q.category) {
    const c = await col("categories").findOne({ slug: String(q.category) }, { projection: { _id: 1 } });
    if (!c) return empty;
    match["category.category_id"] = c._id;
  }
  if (q.author) {
    const u = await col("users").findOne({ username: String(q.author) }, { projection: { _id: 1 } });
    if (!u) return empty;
    match["author.user_id"] = u._id;
  }
  const tags = parseTags(q.tags);
  if (tags.length) match.tags = q.tag_mode === "any" ? { $in: tags } : { $all: tags };
  if (q.from || q.to) {
    match.published_at = {};
    if (q.from) { const d = new Date(q.from); if (isNaN(d)) throw new ApiError(400, "Некоректна дата from"); match.published_at.$gte = d; }
    if (q.to) { const d = new Date(q.to); if (isNaN(d)) throw new ApiError(400, "Некоректна дата to"); match.published_at.$lte = d; }
  }

  const text = str(q.q);
  const hasGeo = q.lon !== undefined && q.lon !== "" && q.lat !== undefined && q.lat !== "";
  if (text && hasGeo) throw new ApiError(400, "Повнотекстовий і геопошук не можна поєднувати ($text і $geoNear мають бути першою стадією)");
  if (text) match.$text = { $search: text.includes('"') ? text : text + " " + ukStemText(text) };

  const pageStage = { $facet: {
    items: [{ $skip: (page - 1) * perPage }, { $limit: perPage }, { $project: LIST_PROJECTION }],
    total: [{ $count: "count" }]
  } };

  let pipeline;
  if (hasGeo) {
    const lon = Number(q.lon), lat = Number(q.lat), km = Math.min(2000, Math.max(1, Number(q.radius_km) || 100));
    if (!(lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90)) throw new ApiError(400, "Некоректні координати");
    pipeline = [{ $geoNear: { near: { type: "Point", coordinates: [lon, lat] }, distanceField: "distance_m", maxDistance: km * 1000, spherical: true, query: match } }, pageStage];
  } else {
    pipeline = [{ $match: match }];
    if (text) pipeline.push({ $addFields: { score: { $meta: "textScore" } } });
    if (q.sort === "rated") pipeline.push({ $addFields: { rating: { $subtract: ["$statistics.likes", "$statistics.dislikes"] } } });
    const sort = text && (!q.sort || q.sort === "relevance") ? { score: { $meta: "textScore" }, _id: -1 } : (SORTS[q.sort] || SORTS.new);
    pipeline.push({ $sort: sort }, pageStage);
  }

  const res = (await col("posts").aggregate(pipeline).toArray())[0];
  const total = res.total.length ? res.total[0].count : 0;
  return { items: res.items, total, page, per_page: perPage, pages: Math.ceil(total / perPage) };
}

// ---------------------------------------------------------------- перегляд поста
// Рекурсивне дерево: плоский масив (parent_id) -> вкладені replies. Прихований (не схвалений) батько приховує всю гілку.
function buildTree(comments) {
  const byParent = new Map();
  comments.forEach(c => { const k = c.parent_id ? String(c.parent_id) : "root"; if (!byParent.has(k)) byParent.set(k, []); byParent.get(k).push(c); });
  const attach = k => (byParent.get(k) || []).map(c => ({ ...c, replies: attach(String(c.comment_id)) }));
  return attach("root");
}

async function getPost(id, opts) {
  const _id = oid(id, "id поста"), users = col("users"), posts = col("posts");
  const viewer = opts.userId ? await users.findOne({ _id: oid(opts.userId, "user_id"), status: "active" }) : null;
  const filter = { _id, status: "published" }, projection = { search_stems: 0 };

  let post;
  if (opts.countView) {
    // атомарно: знайти й збільшити лічильник переглядів в одній операції
    post = await posts.findOneAndUpdate(filter, { $inc: { "statistics.views": 1 } }, { returnDocument: "after", projection });
    if (post) {
      const iso = new Date().toISOString(); // бакет «місяць → день» (патерн Bucket)
      await col("post_views").updateOne({ post_id: _id, month: iso.slice(0, 7) }, { $inc: { total: 1, ["days." + iso.slice(8, 10)]: 1 } }, { upsert: true });
    }
  } else post = await posts.findOne(filter, { projection });

  if (!post) { // чернетки й архів бачать лише автор та адміністратор
    post = await posts.findOne({ _id }, { projection });
    if (!post || !viewer || (viewer.role !== "admin" && !viewer._id.equals(post.author.user_id))) throw new ApiError(404, "Пост не знайдено");
  }
  const isAdmin = viewer && viewer.role === "admin";
  const visible = post.comments.filter(c => c.status === "approved" || isAdmin || (viewer && c.author.user_id.equals(viewer._id)));
  const myReaction = viewer ? await col("reactions").findOne({ post_id: _id, user_id: viewer._id }) : null;
  const { comments, ...rest } = post;
  return { ...rest, comments_tree: buildTree(visible), my_reaction: myReaction ? myReaction.value : 0 };
}

// ---------------------------------------------------------------- валідація введення
function readInput(b, partial) {
  const out = {};
  if (!partial || b.title !== undefined) {
    out.title = str(b.title);
    if (out.title.length < 3 || out.title.length > 200) throw new ApiError(400, "Назва має містити від 3 до 200 символів");
  }
  if (!partial || b.content !== undefined) {
    out.content = str(b.content);
    if (out.content.length < 100) throw new ApiError(400, "Зміст має містити щонайменше 100 символів");
  }
  if (b.excerpt !== undefined) out.excerpt = str(b.excerpt).slice(0, 300);
  if (!partial || b.tags !== undefined) {
    out.tags = parseTags(b.tags);
    if (out.tags.length > 10) throw new ApiError(400, "Не більше 10 тегів");
    if (out.tags.some(t => t.length < 2 || t.length > 40)) throw new ApiError(400, "Тег має містити 2–40 символів");
  }
  if (b.featured_image !== undefined) {
    const u = str(b.featured_image);
    if (u && !/^https?:\/\//i.test(u)) throw new ApiError(400, "featured_image має бути http(s)-посиланням");
    out.featured_image = u || null;
  }
  if (b.status !== undefined) {
    if (!["draft", "published", "archived"].includes(b.status)) throw new ApiError(400, "Некоректний статус");
    out.status = b.status;
  }
  if (b.lon !== undefined && b.lon !== "" && b.lat !== undefined && b.lat !== "") {
    const lon = Number(b.lon), lat = Number(b.lat);
    if (!(lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90)) throw new ApiError(400, "Некоректні координати");
    out.location = { type: "Point", coordinates: [lon, lat] };
    if (str(b.location_name)) out.location_name = str(b.location_name).slice(0, 80);
  }
  return out;
}

async function categoryRef(id) {
  const c = await col("categories").findOne({ _id: oid(id, "category_id") });
  if (!c) throw new ApiError(400, "Категорію не знайдено");
  return { category_id: c._id, name: c.name };
}

// ---------------------------------------------------------------- лічильники (денормалізація)
// Пост «рахується» в users/categories/tags лише коли він опублікований. Порівнюємо стан ДО і ПІСЛЯ й застосовуємо різницю.
async function adjustCounters(oldPost, newPost) {
  const contrib = p => (p && p.status === "published") ? { author: String(p.author.user_id), cat: String(p.category.category_id), tags: p.tags } : null;
  const o = contrib(oldPost), n = contrib(newPost);
  const users = new Map(), cats = new Map(), tags = new Map();
  const bump = (m, k, d) => m.set(k, (m.get(k) || 0) + d);
  if (o) { bump(users, o.author, -1); bump(cats, o.cat, -1); o.tags.forEach(t => bump(tags, t, -1)); }
  if (n) { bump(users, n.author, 1); bump(cats, n.cat, 1); n.tags.forEach(t => bump(tags, t, 1)); }
  const { ObjectId } = require("mongodb");
  const ops = (m, field, filterOf) => [...m].filter(([, d]) => d !== 0).map(([k, d]) => ({ updateOne: { filter: filterOf(k), update: { $inc: { [field]: d } } } }));
  const tasks = [];
  const u = ops(users, "statistics.posts_count", k => ({ _id: new ObjectId(k) })); if (u.length) tasks.push(col("users").bulkWrite(u));
  const c = ops(cats, "statistics.posts_count", k => ({ _id: new ObjectId(k) })); if (c.length) tasks.push(col("categories").bulkWrite(c));
  const t = [...tags].filter(([, d]) => d !== 0).map(([name, d]) => d > 0
    ? { updateOne: { filter: { name }, update: { $inc: { posts_count: d }, $setOnInsert: { created_at: new Date() } }, upsert: true } }
    : { updateOne: { filter: { name }, update: { $inc: { posts_count: d } } } });
  if (t.length) tasks.push(col("tags").bulkWrite(t));
  await Promise.all(tasks);
}

// ---------------------------------------------------------------- створення
async function createPost(b) {
  const author = await col("users").findOne({ _id: oid(b.author_id, "author_id"), status: "active" });
  if (!author || !["author", "admin"].includes(author.role)) throw new ApiError(403, "Створювати пости можуть лише автори та адміністратори");
  const input = readInput(b, false), category = await categoryRef(b.category_id);
  const now = new Date(), status = input.status === "draft" ? "draft" : "published";
  const doc = {
    title: input.title, slug: (slugify(input.title, 70) || "post") + "-" + Date.now().toString(36),
    content: input.content, excerpt: input.excerpt || input.content.slice(0, 160).trim(),
    search_stems: ukStemText(input.title + " " + input.content + " " + input.tags.join(" ")),
    author: { user_id: author._id, username: author.username, avatar_url: author.profile && author.profile.avatar_url || null },
    category, tags: input.tags, featured_image: input.featured_image || null,
    status, version: 1, comments: [], statistics: { views: 0, likes: 0, dislikes: 0, comments_count: 0 },
    created_at: now, updated_at: now
  };
  if (status === "published") doc.published_at = now;
  if (input.location) { doc.location = input.location; if (input.location_name) doc.location_name = input.location_name; }
  try { await col("posts").insertOne(doc); } catch (e) { throw mapMongoError(e); }
  await adjustCounters(null, doc);
  return { _id: doc._id, slug: doc.slug, status: doc.status };
}

// ---------------------------------------------------------------- версіоване редагування
async function updatePost(id, b) {
  const _id = oid(id, "id поста"), posts = col("posts");
  const post = await posts.findOne({ _id });
  const editor = await col("users").findOne({ _id: oid(b.editor_id, "editor_id"), status: "active" });
  if (!post) throw new ApiError(404, "Пост не знайдено");
  if (!editor || (editor.role !== "admin" && !editor._id.equals(post.author.user_id))) throw new ApiError(403, "Редагувати може лише автор або адміністратор");
  if (b.expected_version !== undefined && Number(b.expected_version) !== post.version)
    throw new ApiError(409, `Конфлікт версій: у БД v${post.version}, очікувалась v${b.expected_version}. Оновіть сторінку.`);

  const changes = readInput(b, true);
  if (b.category_id !== undefined) changes.category = await categoryRef(b.category_id);
  if (changes.status === "published" && !post.published_at) changes.published_at = new Date();
  if (!Object.keys(changes).length) throw new ApiError(400, "Немає змін");

  // 1) знімок поточного стану; унікальний індекс (post_id, version) захищає від дубля при гонці
  try {
    await col("post_versions").insertOne({ post_id: _id, version: post.version, title: post.title, content: post.content, excerpt: post.excerpt || "",
      tags: post.tags, category: post.category, saved_by: editor._id, saved_at: new Date(), change_note: str(b.change_note).slice(0, 200) });
  } catch (e) { if (e && e.code === 11000) throw new ApiError(409, "Пост щойно змінено іншою особою"); throw mapMongoError(e); }

  // 2) оновлення з оптимістичним блокуванням (version у фільтрі)
  const set = { ...changes, updated_at: new Date() };
  set.search_stems = ukStemText((set.title || post.title) + " " + (set.content || post.content) + " " + (set.tags || post.tags).join(" "));
  let r;
  try { r = await posts.updateOne({ _id, version: post.version }, { $set: set, $inc: { version: 1 } }); }
  catch (e) { await col("post_versions").deleteOne({ post_id: _id, version: post.version }); throw mapMongoError(e); }
  if (!r.matchedCount) { await col("post_versions").deleteOne({ post_id: _id, version: post.version }); throw new ApiError(409, "Пост змінено паралельно"); }

  const fresh = await posts.findOne({ _id }, { projection: { search_stems: 0, comments: 0 } });
  await adjustCounters(post, { ...post, ...set });
  return fresh;
}

async function archivePost(id, userId) { return updatePost(id, { editor_id: userId, status: "archived", change_note: "Архівовано" }); }

async function listVersions(id) {
  const _id = oid(id, "id поста");
  const post = await col("posts").findOne({ _id }, { projection: { version: 1, title: 1, updated_at: 1 } });
  if (!post) throw new ApiError(404, "Пост не знайдено");
  const items = await col("post_versions").find({ post_id: _id }, { projection: { content: 0 } }).sort({ version: -1 }).toArray();
  return { current: { version: post.version, title: post.title, updated_at: post.updated_at }, items };
}
async function getVersion(id, n) {
  const v = await col("post_versions").findOne({ post_id: oid(id, "id поста"), version: parseInt(n, 10) });
  if (!v) throw new ApiError(404, "Версію не знайдено");
  return v;
}
async function restoreVersion(id, n, userId) {
  const v = await getVersion(id, n);
  return updatePost(id, { editor_id: userId, title: v.title, content: v.content, excerpt: v.excerpt, tags: v.tags, category_id: String(v.category.category_id), change_note: "Відновлено версію " + v.version });
}

// ---------------------------------------------------------------- реакції (лайк / дизлайк / зняти)
async function react(id, userId, value) {
  const _id = oid(id, "id поста"), uid = oid(userId, "user_id");
  value = Number(value);
  if (![1, -1, 0].includes(value)) throw new ApiError(400, "value має бути 1, -1 або 0");
  const post = await col("posts").findOne({ _id, status: "published" }, { projection: { "author.user_id": 1 } });
  if (!post) throw new ApiError(404, "Пост не знайдено");
  const user = await col("users").findOne({ _id: uid, status: "active" });
  if (!user) throw new ApiError(403, "Користувач не знайдений або заблокований");
  if (post.author.user_id.equals(uid)) throw new ApiError(403, "Автор не може оцінювати власний пост");

  const reactions = col("reactions");
  const old = value === 0
    ? await reactions.findOneAndDelete({ post_id: _id, user_id: uid })
    : await reactions.findOneAndUpdate({ post_id: _id, user_id: uid },
        { $set: { value, updated_at: new Date() }, $setOnInsert: { created_at: new Date() } }, { upsert: true, returnDocument: "before" });
  const ov = old ? old.value : 0;
  const dLikes = (value === 1 ? 1 : 0) - (ov === 1 ? 1 : 0), dDislikes = (value === -1 ? 1 : 0) - (ov === -1 ? 1 : 0);
  if (dLikes || dDislikes) await col("posts").updateOne({ _id }, { $inc: { "statistics.likes": dLikes, "statistics.dislikes": dDislikes } });
  const p = await col("posts").findOne({ _id }, { projection: { statistics: 1 } });
  return { likes: p.statistics.likes, dislikes: p.statistics.dislikes, my_reaction: value };
}

module.exports = { listPosts, getPost, createPost, updatePost, archivePost, listVersions, getVersion, restoreVersion, react, buildTree, MAX_DEPTH, adjustCounters };
