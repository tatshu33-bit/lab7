// Рівень 1, завдання 5: вплив індексів на пошук постів за автором, категорією та датою.
// «Без індексу» — hint({$natural:1}) (повний перегляд колекції); «з індексом» — вибір оптимізатора.
// Колекція мала (60 документів), тому головний показник — totalDocsExamined; для часу див. 09_benchmark.js (50 000 постів).
load("scripts/00_common.js");

const author = db.users.findOne({ username: "natalia_kravchenko" });
const cat = db.categories.findOne({ slug: "databases" });
const tagSample = db.posts.findOne({ status: "published", "tags.2": { $exists: true } }).tags.slice(0, 2); // два теги одного поста — результат гарантовано непорожній
const d1 = new Date("2026-09-01T00:00:00Z"), d2 = new Date("2026-10-01T00:00:00Z");

const cases = [
  ["За автором, нові спочатку", () => db.posts.find({ "author.user_id": author._id }).sort({ created_at: -1 })],
  ["За категорією (опубліковані), нові спочатку", () => db.posts.find({ "category.category_id": cat._id, status: "published" }).sort({ published_at: -1 })],
  ["За діапазоном дат публікації", () => db.posts.find({ status: "published", published_at: { $gte: d1, $lt: d2 } }).sort({ published_at: -1 })],
  ["За двома тегами ($all): " + tagSample.join(" + "), () => db.posts.find({ status: "published", tags: { $all: tagSample } })]
];
cases.forEach(([name, q]) => {
  show(name + " — БЕЗ індексу", plan(q().hint({ $natural: 1 })));
  show(name + " — З індексом", plan(q()));
});
