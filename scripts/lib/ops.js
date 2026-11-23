// Операції предметної області для mongosh (дзеркало того, що робить REST API у app/src).
// Потребує: load("scripts/00_common.js"), load("scripts/lib/ukstem.js").
var MAX_DEPTH = 3; // максимальна глибина вкладеності відповідей (0 — верхній рівень)
function same(a, b) { return String(a) === String(b); }

// ---------- лайки / дизлайки: окрема колекція reactions + атомарна корекція лічильників ----------
function react(postId, userId, value) { // value: 1 — лайк, -1 — дизлайк, 0 — прибрати оцінку
  const post = db.posts.findOne({ _id: postId, status: "published" }, { "author.user_id": 1 });
  if (!post) throw new Error("пост не знайдено або не опублікований");
  if (same(post.author.user_id, userId)) throw new Error("автор не може оцінювати власний пост");
  const old = value === 0
    ? db.reactions.findOneAndDelete({ post_id: postId, user_id: userId })
    : db.reactions.findOneAndUpdate({ post_id: postId, user_id: userId },
        { $set: { value: value, updated_at: new Date() }, $setOnInsert: { created_at: new Date() } },
        { upsert: true, returnDocument: "before" });
  const ov = old ? old.value : 0;
  const dLikes = (value === 1 ? 1 : 0) - (ov === 1 ? 1 : 0), dDislikes = (value === -1 ? 1 : 0) - (ov === -1 ? 1 : 0);
  if (dLikes || dDislikes) db.posts.updateOne({ _id: postId }, { $inc: { "statistics.likes": dLikes, "statistics.dislikes": dDislikes } });
  return db.posts.findOne({ _id: postId }, { _id: 0, "statistics.likes": 1, "statistics.dislikes": 1 }).statistics;
}

// ---------- перегляди: $inc лічильника + «бакет» post_views (місяць → дні) ----------
function viewPost(postId, when) {
  when = when || new Date();
  const iso = when.toISOString();
  const doc = db.posts.findOneAndUpdate({ _id: postId, status: "published" }, { $inc: { "statistics.views": 1 } },
    { returnDocument: "after", projection: { title: 1, "statistics.views": 1 } });
  if (doc) db.post_views.updateOne({ post_id: postId, month: iso.slice(0, 7) }, { $inc: { total: 1, ["days." + iso.slice(8, 10)]: 1 } }, { upsert: true });
  return doc;
}

// ---------- коментарі та модерація ----------
function addComment(postId, userId, text, parentId) { // новий коментар завжди «pending»
  const user = db.users.findOne({ _id: userId, status: "active" });
  if (!user) throw new Error("користувач не знайдений або заблокований");
  const filter = { _id: postId, status: "published" };
  let depth = 0;
  if (parentId) { // атомарна перевірка: батьківський коментар існує, схвалений і глибина не перевищена
    filter.comments = { $elemMatch: { comment_id: parentId, status: "approved", depth: { $lt: MAX_DEPTH } } };
    const p = db.posts.findOne({ _id: postId }, { comments: { $elemMatch: { comment_id: parentId } } });
    if (!p || !p.comments || !p.comments.length) throw new Error("батьківський коментар не знайдено");
    depth = p.comments[0].depth + 1;
  }
  const c = { comment_id: new ObjectId(), parent_id: parentId || null, depth: depth, author: { user_id: user._id, username: user.username },
              text: text, created_at: new Date(), status: "pending", likes: 0, moderated_by: null, moderated_at: null };
  const r = db.posts.updateOne(filter, { $push: { comments: c } });
  if (r.matchedCount === 0) throw new Error("відповідь неможлива: батьківський коментар не схвалений або перевищено глибину " + MAX_DEPTH);
  return c;
}

function notifyAboutComment(post, comment) { // викликається при СХВАЛЕННІ коментаря
  const mk = (uid, type) => ({ user_id: uid, type: type, post_id: post._id, post_title: post.title, comment_id: comment.comment_id,
    from_user: comment.author, text_preview: comment.text.slice(0, 120), is_read: false, created_at: new Date() });
  const docs = [];
  if (!same(comment.author.user_id, post.author.user_id)) docs.push(mk(post.author.user_id, "new_comment"));
  if (comment.parent_id) {
    const pp = db.posts.findOne({ _id: post._id }, { comments: { $elemMatch: { comment_id: comment.parent_id } } }).comments[0];
    const pa = pp.author.user_id;
    if (!same(pa, comment.author.user_id) && !same(pa, post.author.user_id)) docs.push(mk(pa, "reply"));
  }
  if (docs.length) db.notifications.insertMany(docs);
  return docs.length;
}

function moderateComment(postId, commentId, status, moderatorId) {
  if (!db.users.findOne({ _id: moderatorId, role: "admin" })) throw new Error("лише адміністратор може модерувати");
  const post = db.posts.findOne({ _id: postId, "comments.comment_id": commentId },
    { title: 1, author: 1, comments: { $elemMatch: { comment_id: commentId } } });
  if (!post) throw new Error("коментар не знайдено");
  const old = post.comments[0];
  if (old.status === status) return { changed: false, status: status };
  db.posts.updateOne({ _id: postId }, { $set: { "comments.$[c].status": status, "comments.$[c].moderated_by": moderatorId, "comments.$[c].moderated_at": new Date() } },
    { arrayFilters: [{ "c.comment_id": commentId }] });
  const delta = (status === "approved" ? 1 : 0) - (old.status === "approved" ? 1 : 0); // лічильники рахують лише схвалені
  if (delta) {
    db.posts.updateOne({ _id: postId }, { $inc: { "statistics.comments_count": delta } });
    db.users.updateOne({ _id: old.author.user_id }, { $inc: { "statistics.comments_count": delta } });
  }
  let notified = 0;
  if (status === "approved") notified = notifyAboutComment(post, old);
  return { changed: true, from: old.status, to: status, notifications: notified };
}

// ---------- рекурсивне дерево коментарів (плоский масив → вкладена структура) ----------
function buildTree(comments) {
  const byParent = {};
  comments.filter(c => c.status === "approved").forEach(c => {
    const k = c.parent_id ? String(c.parent_id) : "root"; (byParent[k] = byParent[k] || []).push(c);
  });
  const attach = k => (byParent[k] || []).map(c => Object.assign({}, c, { replies: attach(String(c.comment_id)) })); // рекурсія
  return attach("root");
}
function treeLines(nodes, indent) {
  indent = indent || "";
  return nodes.reduce((acc, n) => acc.concat([indent + "└ [" + n.depth + "] " + n.author.username + ": " + n.text.slice(0, 50)], treeLines(n.replies, indent + "   ")), []);
}

// ---------- версіонування постів ----------
function editPost(postId, editorId, changes, note, expectedVersion) {
  const post = db.posts.findOne({ _id: postId });
  const editor = db.users.findOne({ _id: editorId, status: "active" });
  if (!post || !editor) throw new Error("пост або редактор не знайдені");
  if (editor.role !== "admin" && !same(post.author.user_id, editorId)) throw new Error("редагувати може лише автор або адміністратор");
  if (expectedVersion !== undefined && expectedVersion !== post.version) throw new Error("конфлікт версій: у БД v" + post.version + ", очікувалась v" + expectedVersion);
  // Примітка: зміна tags/category/status вимагає ще й коригування лічильників (tags, categories, users) — див. adjustCounters у app/src/posts.js.
  // 1) знімок поточного стану; унікальний індекс (post_id, version) не дасть створити дубль
  db.post_versions.insertOne({ post_id: post._id, version: post.version, title: post.title, content: post.content, excerpt: post.excerpt,
    tags: post.tags, category: post.category, saved_by: editorId, saved_at: new Date(), change_note: note || "" });
  // 2) оновлення з оптимістичним блокуванням: фільтр містить version
  const set = Object.assign({}, changes, { updated_at: new Date() });
  set.search_stems = ukStemText((set.title || post.title) + " " + (set.content || post.content) + " " + (set.tags || post.tags).join(" "));
  const r = db.posts.updateOne({ _id: postId, version: post.version }, { $set: set, $inc: { version: 1 } });
  if (r.matchedCount === 0) { db.post_versions.deleteOne({ post_id: postId, version: post.version }); throw new Error("конфлікт версій (пост змінено паралельно)"); }
  return db.posts.findOne({ _id: postId }, { title: 1, version: 1, updated_at: 1 });
}
function restoreVersion(postId, editorId, n) {
  const v = db.post_versions.findOne({ post_id: postId, version: n });
  if (!v) throw new Error("версію " + n + " не знайдено");
  return editPost(postId, editorId, { title: v.title, content: v.content, excerpt: v.excerpt, tags: v.tags, category: v.category }, "Відновлено версію " + n);
}
function diffVersions(postId, a, b) {
  const cur = db.posts.findOne({ _id: postId });
  const get = n => n === cur.version ? cur : db.post_versions.findOne({ post_id: postId, version: n });
  const x = get(a), y = get(b), out = {};
  ["title", "excerpt"].forEach(f => { if (x[f] !== y[f]) out[f] = { [a]: x[f], [b]: y[f] }; });
  if (x.content !== y.content) out.content = { [a]: x.content.length + " символів", [b]: y.content.length + " символів" };
  if (x.tags.join() !== y.tags.join()) out.tags = { [a]: x.tags, [b]: y.tags };
  return out;
}

// ---------- пагінація через aggregation pipeline ($facet: сторінка + загальна кількість одним запитом) ----------
function pagePosts(page, perPage, match) {
  const res = db.posts.aggregate([
    { $match: Object.assign({ status: "published" }, match || {}) },
    { $sort: { published_at: -1, _id: -1 } },
    { $facet: {
        items: [{ $skip: (page - 1) * perPage }, { $limit: perPage }, { $project: { title: 1, "author.username": 1, published_at: 1 } }],
        total: [{ $count: "count" }] } }
  ]).toArray()[0];
  const total = res.total.length ? res.total[0].count : 0;
  return { page: page, perPage: perPage, total: total, pages: Math.ceil(total / perPage), items: res.items };
}
