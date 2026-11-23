// Рівень 3: тести продуктивності MongoDB для порівняння з PostgreSQL (relational/bench.py) на ТИХ САМИХ даних.
// Ті самі детерміновані дані (seed = 7), N постів (за замовчуванням 50 000; змінити: BENCH_N=20000 mongosh --file ...).
// БД blog_bench створюється окремо й видаляється наприкінці лише якщо BENCH_KEEP не задано.
load("scripts/00_common.js");
load("scripts/lib/schemas.js");
load("scripts/lib/ukstem.js");
load("scripts/lib/generator.js");

const N = Number((typeof process !== "undefined" && process.env && process.env.BENCH_N) || 50000);
const bdb = db.getSiblingDB("blog_bench");
bdb.dropDatabase();
print("// Генерація й завантаження " + N + " постів у blog_bench ...");

const ctx = GEN.createContext(() => new ObjectId(), 7);
["users", "categories"].forEach(c => bdb.createCollection(c, { validator: { $jsonSchema: LAB7_SCHEMAS.validators[c] } }));
bdb.createCollection("posts", { validator: { $jsonSchema: LAB7_SCHEMAS.validators.posts } });
bdb.users.insertMany(ctx.users); bdb.categories.insertMany(ctx.categories);
let t0 = now();
for (let s = 0; s < N; s += 2000) {
  const docs = [];
  for (let i = s; i < Math.min(N, s + 2000); i++) docs.push(GEN.makePost(ctx, i, { lite: true }).post);
  bdb.posts.insertMany(docs, { ordered: false });
}
const loadMs = Math.round(now() - t0);
t0 = now();
LAB7_SCHEMAS.indexes.filter(x => x[0] === "posts").forEach(([c, k, o]) => bdb.posts.createIndex(k, o));
bdb.users.createIndex({ username: 1 }, { unique: true });
const idxMs = Math.round(now() - t0);
const st = bdb.posts.stats();
print("// Завантаження: " + loadMs + " мс; побудова індексів: " + idxMs + " мс");
print("// posts: " + bdb.posts.countDocuments() + " документів, дані " + Math.round(st.size / 1048576) + " МБ, індекси " + Math.round(st.totalIndexSize / 1048576) + " МБ");

const kravchenko = bdb.users.findOne({ username: "natalia_kravchenko" });
const kyiv = { type: "Point", coordinates: [30.5234, 50.4501] };
const d1 = new Date("2026-09-01T00:00:00Z"), d2 = new Date("2026-10-01T00:00:00Z");
const slugs = []; for (let k = 0; k < 40; k++) slugs.push(GEN.makePost(ctx, (k * 7919) % N, { lite: true }).post.slug);
const ids = []; for (let k = 0; k < 1000; k++) ids.push(bdb.posts.findOne({ slug: slugs[k % slugs.length] }, { _id: 1 })._id);
const R = [];
const rec = (id, name, ms, rows) => { R.push({ id: id, name: name, ms: ms, rows: rows }); print(id + "\t" + ms + " мс\t" + rows + " рядків\t" + name); };

// Q1. Стрічка: 10 останніх опублікованих постів (з автором і категорією)
let rows;
rec("Q1", "стрічка: 10 останніх постів", medianMs(() => { rows = bdb.posts.find({ status: "published" }, { content: 0, comments: 0, search_stems: 0 }).sort({ published_at: -1, _id: -1 }).limit(10).toArray().length; }, 40), rows);
// Q2. Сторінка поста: пост + автор + категорія + теги + схвалені коментарі (в Mongo — один документ)
rec("Q2", "пост за slug з коментарями, автором, категорією, тегами", medianMs(k => { rows = bdb.posts.findOne({ slug: slugs[k % slugs.length] }).comments.length; }, 40), "коментарів: " + rows);
// Q3. Пости автора за місяць
rec("Q3", "пости автора за діапазон дат", medianMs(() => { rows = bdb.posts.find({ "author.user_id": kravchenko._id, status: "published", published_at: { $gte: d1, $lt: d2 } }).sort({ published_at: -1 }).toArray().length; }, 30), rows);
// Q4. Два теги одночасно
rec("Q4", "теги mongodb І практика", medianMs(() => { rows = bdb.posts.find({ status: "published", tags: { $all: ["mongodb", "практика"] } }, { title: 1 }).toArray().length; }, 20), rows);
// Q5. Повнотекстовий пошук (10 найрелевантніших)
rec("Q5", "повнотекстовий: kubernetes (топ-10)", medianMs(() => { rows = bdb.posts.find({ $text: { $search: "kubernetes" } }, { title: 1, score: { $meta: "textScore" } }).sort({ score: { $meta: "textScore" } }).limit(10).toArray().length; }, 10), rows);
rec("Q5b", "повнотекстовий: кількість усіх збігів", medianMs(() => { rows = bdb.posts.countDocuments({ $text: { $search: "kubernetes" } }); }, 5), rows);
// Q6. Топ-10 авторів
rec("Q6", "агрегація: топ-10 авторів", medianMs(() => { rows = bdb.posts.aggregate([{ $match: { status: "published" } }, { $group: { _id: "$author.user_id", n: { $sum: 1 }, views: { $sum: "$statistics.views" } } }, { $sort: { n: -1, _id: 1 } }, { $limit: 10 }]).toArray()[0].n; }, 5), "лідер: " + rows + " постів");
// Q7. Статистика коментарів
rec("Q7", "агрегація: схвалені коментарі (сума, середнє на пост)", medianMs(() => { const r = bdb.posts.aggregate([{ $match: { status: "published" } }, { $project: { a: { $size: { $filter: { input: "$comments", as: "c", cond: { $eq: ["$$c.status", "approved"] } } } } } }, { $group: { _id: null, total: { $sum: "$a" }, avg: { $avg: "$a" } } }]).toArray()[0]; rows = r.total + " / " + Math.round(r.avg * 1000) / 1000; }, 5), "сума/середнє: " + rows);
// Q8. Лічильник переглядів: 1000 оновлень
rec("Q8", "1000 × $inc перегляду (сумарно)", Math.round(medianMs(() => { ids.forEach(id => bdb.posts.updateOne({ _id: id }, { $inc: { "statistics.views": 1 } })); }, 1)), 1000);
// Q9. Додавання коментаря: 1000 × $push
rec("Q9", "1000 × додати коментар (сумарно)", Math.round(medianMs(() => {
  ids.forEach(id => bdb.posts.updateOne({ _id: id }, { $push: { comments: { comment_id: new ObjectId(), parent_id: null, depth: 0, author: { user_id: ctx.users[12]._id, username: ctx.users[12].username }, text: "Бенчмарк", created_at: new Date(), status: "pending", likes: 0, moderated_by: null, moderated_at: null } } }));
}, 1)), 1000);
// Q10. Зміна імені користувача (ціна денормалізації)
const uid = ctx.users[12]._id;
rec("Q10", "перейменування користувача (пости + його коментарі в усіх постах)", Math.round(medianMs(() => {
  const a = bdb.posts.updateMany({ "author.user_id": uid }, { $set: { "author.username": "taras_renamed" } });
  const b = bdb.posts.updateMany({ "comments.author.user_id": uid }, { $set: { "comments.$[c].author.username": "taras_renamed" } }, { arrayFilters: [{ "c.author.user_id": uid }] });
  bdb.users.updateOne({ _id: uid }, { $set: { username: "taras_renamed" } });
  rows = a.modifiedCount + b.modifiedCount;
}, 1)), "змінено документів: " + rows);
// Q11. Геопошук
rec("Q11", "10 найближчих постів у радіусі 50 км від Києва", medianMs(() => { rows = bdb.posts.aggregate([{ $geoNear: { near: kyiv, distanceField: "d", maxDistance: 50000, spherical: true, query: { status: "published" } } }, { $limit: 10 }, { $project: { title: 1, d: 1 } }]).toArray().length; }, 20), rows);

print("\n// JSON для порівняння:"); print(JSON.stringify({ N: N, load_ms: loadMs, index_ms: idxMs, data_mb: Math.round(st.size / 1048576), index_mb: Math.round(st.totalIndexSize / 1048576), results: R }));
if (!(typeof process !== "undefined" && process.env && process.env.BENCH_KEEP)) bdb.dropDatabase();
