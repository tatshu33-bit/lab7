// Рівень 3: версіонування, вкладені коментарі, сповіщення, геолокація, аналітика
load("scripts/00_common.js");
load("scripts/lib/ukstem.js");
load("scripts/lib/ops.js");

const admin = db.users.findOne({ role: "admin" });

// ---- 1. Версіонування постів ----
const author = db.users.findOne({ username: "dmytro_tkachenko" });
const vpost = db.posts.findOne({ status: "published", "author.user_id": author._id });
show("Пост до змін", { title: vpost.title, version: vpost.version, версій_в_історії: db.post_versions.countDocuments({ post_id: vpost._id }) });
editPost(vpost._id, author._id, { title: vpost.title + " (оновлено)" }, "Змінено заголовок", vpost.version);
editPost(vpost._id, author._id, { content: vpost.content + "\n\nДоповнення: додано розділ про моніторинг і метрики після впровадження." }, "Додано розділ про моніторинг");
const cur = db.posts.findOne({ _id: vpost._id });
show("Після двох редагувань", { title: cur.title, version: cur.version });
show("Історія версій", db.post_versions.find({ post_id: vpost._id }, { _id: 0, version: 1, title: 1, change_note: 1, saved_at: 1 }).sort({ version: -1 }).toArray());
show("diff v" + vpost.version + " ↔ v" + cur.version, diffVersions(vpost._id, vpost.version, cur.version));
try { editPost(vpost._id, author._id, { title: "Конфлікт" }, "stale", vpost.version); } catch (e) { show("Редагування зі застарілою версією", "відхилено: " + e.message); }
try { editPost(vpost._id, db.users.findOne({ role: "reader" })._id, { title: "Хакнуто" }, "x"); } catch (e) { show("Редагування читачем", "відхилено: " + e.message); }
show("Відкат до версії " + vpost.version, restoreVersion(vpost._id, author._id, vpost.version));
const rest = db.posts.findOne({ _id: vpost._id });
show("Після відкату: заголовок збігається з оригіналом, версія зросла (історія не втрачається)", { збігається: rest.title === vpost.title && rest.content === vpost.content, version: rest.version, версій_в_історії: db.post_versions.countDocuments({ post_id: vpost._id }) });

// ---- 2. Вкладені коментарі (рекурсивна структура) ----
const readers = db.users.find({ role: "reader", status: "active" }).limit(4).toArray();
const np = db.posts.findOne({ status: "published", "author.user_id": { $nin: readers.map(r => r._id) }, "comments.0": { $exists: false } }) ||
           db.posts.findOne({ status: "published", "author.user_id": { $nin: readers.map(r => r._id) } });
const approveAll = c => moderateComment(np._id, c.comment_id, "approved", admin._id);
let parent = null, chain = [];
for (let d = 0; d <= MAX_DEPTH; d++) { // ланцюжок із 4 рівнів
  const c = addComment(np._id, readers[d % readers.length]._id, "Рівень відповіді " + d + ": обговорюємо матеріал.", parent ? parent.comment_id : undefined);
  approveAll(c); chain.push(c); parent = c;
}
try { addComment(np._id, readers[0]._id, "П'ятий рівень — забагато", parent.comment_id); } catch (e) { show("Спроба відповіді на 4-му рівні глибини", "відхилено: " + e.message); }
const tree = buildTree(db.posts.findOne({ _id: np._id }).comments);
show("Дерево коментарів поста «" + np.title + "»", treeLines(tree));

// ---- 3. Сповіщення авторам ----
show("Сповіщення, створені схваленням ланцюжка (одержувачі)", db.notifications.aggregate([{ $match: { post_id: np._id, comment_id: { $in: chain.map(c => c.comment_id) } } },
  { $lookup: { from: "users", localField: "user_id", foreignField: "_id", as: "u" } }, { $unwind: "$u" },
  { $project: { _id: 0, одержувач: "$u.username", type: 1, від: "$from_user.username", text_preview: 1 } }]).toArray());
show("Непрочитані сповіщення автора поста", db.notifications.countDocuments({ user_id: np.author.user_id, is_read: false }));
show("Інбокс автора (останні 3)", db.notifications.find({ user_id: np.author.user_id }, { _id: 0, type: 1, post_title: 1, "from_user.username": 1, is_read: 1 }).sort({ created_at: -1 }).limit(3).toArray());
show("Позначити прочитаними", db.notifications.updateMany({ user_id: np.author.user_id, is_read: false }, { $set: { is_read: true } }).modifiedCount);
show("Топ авторів за непрочитаними/всіма сповіщеннями", db.notifications.aggregate([{ $group: { _id: "$user_id", total: { $sum: 1 }, unread: { $sum: { $cond: ["$is_read", 0, 1] } } } },
  { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "u" } }, { $unwind: "$u" }, { $project: { _id: 0, username: "$u.username", total: 1, unread: 1 } }, { $sort: { total: -1 } }, { $limit: 5 }]).toArray());
show("План інбокса (індекс inbox)", plan(db.notifications.find({ user_id: np.author.user_id, is_read: false }).sort({ created_at: -1 })));

// ---- 4. Геолокація ----
const kyiv = { type: "Point", coordinates: [30.5234, 50.4501] }, lutsk = { type: "Point", coordinates: [25.3254, 50.7472] };
show("Пости в радіусі 150 км від Луцька ($geoNear, відстані в км)", db.posts.aggregate([
  { $geoNear: { near: lutsk, distanceField: "dist", maxDistance: 150000, spherical: true, query: { status: "published" } } },
  { $project: { _id: 0, title: 1, location_name: 1, dist_km: { $round: [{ $divide: ["$dist", 1000] }, 1] } } }, { $limit: 8 }]).toArray());
show("Скільки постів у радіусі 100 км від Києва ($geoWithin + $centerSphere, радіус у радіанах)", db.posts.countDocuments({ status: "published", location: { $geoWithin: { $centerSphere: [kyiv.coordinates, 100 / 6378.1] } } }));
show("Пости в прямокутнику (Захід України) — $geoWithin $box", db.posts.countDocuments({ status: "published", location: { $geoWithin: { $box: [[22, 48], [27, 51.5]] } } }));
show("План пошуку за координатами", plan(db.posts.find({ location: { $near: { $geometry: kyiv, $maxDistance: 100000 } } })));
show("Кількість постів за містами", db.posts.aggregate([{ $match: { location_name: { $exists: true } } }, { $group: { _id: "$location_name", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 5 }]).toArray());

// ---- 5. Ієрархія категорій ($graphLookup) ----
show("Категорії з нащадками та сумарна кількість постів", db.categories.aggregate([
  { $match: { parent_id: null } },
  { $graphLookup: { from: "categories", startWith: "$_id", connectFromField: "_id", connectToField: "parent_id", as: "descendants", depthField: "level" } },
  { $match: { "descendants.0": { $exists: true } } },
  { $project: { _id: 0, name: 1, descendants: "$descendants.name", total_posts: { $add: ["$statistics.posts_count", { $sum: "$descendants.statistics.posts_count" }] } } }]).toArray());

// ---- 6. Запити для аналітичної панелі (ті ж pipeline використовує app/src/analytics.js) ----
show("Опубліковано постів за місяцями", db.posts.aggregate([{ $match: { status: "published" } },
  { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$published_at" } }, posts: { $sum: 1 }, views: { $sum: "$statistics.views" } } }, { $sort: { _id: 1 } }]).toArray());
show("Перегляди за днями (останні 5 днів набору; $objectToArray по бакетах)", db.post_views.aggregate([
  { $project: { month: 1, d: { $objectToArray: "$days" } } }, { $unwind: "$d" },
  { $group: { _id: { $concat: ["$month", "-", "$d.k"] }, views: { $sum: "$d.v" } } }, { $sort: { _id: -1 } }, { $limit: 5 }]).toArray());
