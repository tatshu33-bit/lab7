// Рівень 1, крок 4: заповнення реалістичними даними (20 користувачів, 10 категорій, 60 постів, 300+ коментарів ...).
// Дані детерміновані (seed = 7): ті самі, що в PostgreSQL-частині (relational/) і в tests/check_dataset.js.
load("scripts/00_common.js");
load("scripts/lib/ukstem.js");
load("scripts/lib/generator.js");

const ds = generateDataset(() => new ObjectId(), { seed: 7, postCount: 60 });
db.users.insertMany(ds.users);
db.categories.insertMany(ds.categories);
db.tags.insertMany(ds.tags);
db.posts.insertMany(ds.posts);
db.reactions.insertMany(ds.reactions);
db.post_versions.insertMany(ds.versions);
db.notifications.insertMany(ds.notifications);
db.post_views.insertMany(ds.views);

show("Кількість документів", Object.fromEntries(["users", "categories", "tags", "posts", "reactions", "post_versions", "notifications", "post_views"].map(c => [c, db[c].countDocuments()])));
show("Коментарів (вбудованих у пости), за статусами", db.posts.aggregate([
  { $unwind: "$comments" }, { $group: { _id: "$comments.status", count: { $sum: 1 } } }, { $sort: { count: -1 } }]).toArray());
show("Користувачі за ролями", db.users.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]).toArray());
show("Приклад поста (без тексту)", db.posts.findOne({ status: "published" }, { content: 0, comments: { $slice: 2 }, search_stems: 0 }));
