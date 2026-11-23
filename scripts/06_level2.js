// Рівень 2: теги, повнотекстовий пошук, рейтинги, пагінація, перегляди, модерація коментарів
load("scripts/00_common.js");
load("scripts/lib/ukstem.js");
load("scripts/lib/ops.js");

// ---- 1. Система тегів: пошук за кількома тегами ----
const sample = db.posts.findOne({ status: "published", "tags.2": { $exists: true } });
const two = sample.tags.slice(0, 2), t1 = sample.tags[0], t2 = sample.tags[2];
show("Усі пости з тегами " + JSON.stringify(two) + " ($all — перетин)", db.posts.find({ status: "published", tags: { $all: two } }, { title: 1, tags: 1, _id: 0 }).toArray());
show("Пости з будь-яким із тегів " + JSON.stringify([t1, t2]) + " ($in — об'єднання), кількість", db.posts.countDocuments({ status: "published", tags: { $in: [t1, t2] } }));
show("Індекс tags: план для $all", plan(db.posts.find({ status: "published", tags: { $all: two } })));

// ---- 2. Повнотекстовий пошук (назва + зміст), стеми української ----
function searchPosts(q, limit) {
  const query = q.includes("\"") ? q : q + " " + ukStemText(q);   // оригінал (назва/зміст) + стеми (search_stems); фразу в лапках не змінюємо
  return db.posts.find({ status: "published", $text: { $search: query } }, { title: 1, score: { $meta: "textScore" }, _id: 0 })
    .sort({ score: { $meta: "textScore" } }).limit(limit || 5).toArray();
}
["помилку", "продуктивності", "кубернетес Kubernetes", "\"досвід команди\""].forEach(q => show("$text: «" + q + "»", searchPosts(q)));
show("Без стемінгу «помилку» нічого не знаходить", db.posts.countDocuments({ $text: { $search: "помилку" } }));
show("План $text", plan(db.posts.find({ $text: { $search: "Docker" } })));

// ---- 3. Рейтинги: лайки / дизлайки ----
const pst = db.posts.findOne({ status: "published", "author.username": "andrii_melnyk" });
const readers = db.users.find({ role: "reader", status: "active" }).limit(3).toArray();
const before = db.posts.findOne({ _id: pst._id }, { "statistics.likes": 1, "statistics.dislikes": 1, _id: 0 }).statistics;
show("Пост «" + pst.title + "» — до", before);
const rx = db.reactions.find({ post_id: pst._id, user_id: { $in: readers.map(r => r._id) } }).toArray(); rx.length && print("(частина читачів уже оцінювала пост — лічильники корегуються за різницею)");
show("1-й читач ставить лайк", react(pst._id, readers[0]._id, 1));
show("2-й читач ставить дизлайк", react(pst._id, readers[1]._id, -1));
show("1-й читач повторює лайк (ідемпотентно)", react(pst._id, readers[0]._id, 1));
show("1-й читач змінює лайк на дизлайк", react(pst._id, readers[0]._id, -1));
show("2-й читач прибирає оцінку", react(pst._id, readers[1]._id, 0));
try { react(pst._id, pst.author.user_id, 1); } catch (e) { show("Автор оцінює власний пост", "відхилено: " + e.message); }
const rc = db.reactions.aggregate([{ $match: { post_id: pst._id } }, { $group: { _id: "$value", n: { $sum: 1 } } }]).toArray();
show("Перевірка: лічильники = кількість документів reactions", { counters: db.posts.findOne({ _id: pst._id }).statistics, reactions: rc });
show("Рейтинг (likes − dislikes), топ-5 постів", db.posts.aggregate([{ $match: { status: "published" } },
  { $project: { title: 1, rating: { $subtract: ["$statistics.likes", "$statistics.dislikes"] } } }, { $sort: { rating: -1, title: 1 } }, { $limit: 5 }]).toArray());

// ---- 4. Пагінація через aggregation pipeline ----
const p1 = pagePosts(1, 10), p2 = pagePosts(2, 10), pl = pagePosts(p1.pages, 10);
show("Сторінка 1 з " + p1.pages + " (всього " + p1.total + ")", p1.items.map(x => x.title));
show("Сторінка 2", p2.items.map(x => x.title));
show("Остання сторінка: елементів", pl.items.length);
show("Пагінація в межах категорії «databases»", (() => { const c = db.categories.findOne({ slug: "databases" }); const r = pagePosts(1, 5, { "category.category_id": c._id }); return { total: r.total, pages: r.pages, titles: r.items.map(x => x.title) }; })());

// ---- 5. Статистика переглядів ----
const vp = db.posts.findOne({ status: "published" });
const v0 = vp.statistics.views;
for (let i = 0; i < 5; i++) viewPost(vp._id);
show("Перегляди поста: було → стало", [v0, db.posts.findOne({ _id: vp._id }).statistics.views]);
show("Бакет за поточний місяць (патерн Bucket)", db.post_views.findOne({ post_id: vp._id, month: new Date().toISOString().slice(0, 7) }, { _id: 0, month: 1, total: 1, days: 1 }));
show("Топ-5 за переглядами", db.posts.find({ status: "published" }, { title: 1, "statistics.views": 1, _id: 0 }).sort({ "statistics.views": -1 }).limit(5).toArray());

// ---- 6. Модерація коментарів ----
const admin = db.users.findOne({ role: "admin" });
const reader = db.users.findOne({ role: "reader", status: "active" });
const target = db.posts.findOne({ status: "published", "author.user_id": { $ne: reader._id } });
const c1 = addComment(target._id, reader._id, "Тестовий коментар від читача, очікує модерації.");
const c2 = addComment(target._id, reader._id, "Дешеві підписки за посиланням!");
show("Нові коментарі створені зі статусом", [c1.status, c2.status]);
show("Черга модерації (pending): кількість", db.posts.aggregate([{ $unwind: "$comments" }, { $match: { "comments.status": "pending" } }, { $count: "pending" }]).toArray());
const cnt0 = db.posts.findOne({ _id: target._id }).statistics.comments_count;
show("Схвалити коментар №1", moderateComment(target._id, c1.comment_id, "approved", admin._id));
show("Відхилити коментар №2", moderateComment(target._id, c2.comment_id, "rejected", admin._id));
show("Лічильник схвалених коментарів поста: було → стало", [cnt0, db.posts.findOne({ _id: target._id }).statistics.comments_count]);
try { moderateComment(target._id, c1.comment_id, "rejected", reader._id); } catch (e) { show("Модерація не-адміністратором", "відхилено: " + e.message); }
show("Лише схвалені коментарі видимі читачам (приклад проєкції через $filter)", db.posts.aggregate([{ $match: { _id: target._id } },
  { $project: { _id: 0, title: 1, visible_comments: { $size: { $filter: { input: "$comments", as: "c", cond: { $eq: ["$$c.status", "approved"] } } } }, all_comments: { $size: "$comments" } } }]).toArray());
