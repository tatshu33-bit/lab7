// Перевірка згенерованого набору даних БЕЗ MongoDB:
//  1) кожен документ проходить $jsonSchema-валідатори (власна міні-реалізація тих ключових слів, що вжито в schemas.js);
//  2) виконуються вимоги завдання (≥50 постів, ≥200 коментарів, 20 користувачів, 10 категорій);
//  3) узгодженість денормалізованих лічильників;
//  4) обчислюються очікувані результати агрегацій (для звірки з виводом mongosh) -> tests/expected.json.
// Запуск: node tests/check_dataset.js
const fs = require("fs"), path = require("path");
const S = require("../scripts/lib/schemas.js");
const G = require("../scripts/lib/generator.js");

class FakeId { constructor(n) { this.n = n; } toString() { return this.n.toString(16).padStart(24, "0"); } }
let counter = 0; const newId = () => new FakeId(++counter);

function typeOk(v, t) {
  switch (t) {
    case "string": return typeof v === "string";
    case "object": return v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof FakeId);
    case "array": return Array.isArray(v);
    case "date": return v instanceof Date && !isNaN(v);
    case "objectId": return v instanceof FakeId;
    case "int": return Number.isInteger(v) && v >= -2147483648 && v <= 2147483647;
    case "long": return Number.isInteger(v);
    case "number": case "double": return typeof v === "number";
    case "bool": return typeof v === "boolean";
    case "null": return v === null;
  }
  throw new Error("невідомий bsonType " + t);
}
function validate(v, s, p, errs) {
  if (s.bsonType) { const ts = [].concat(s.bsonType); if (!ts.some(t => typeOk(v, t))) { errs.push(`${p}: тип ${typeof v}, очікувано ${ts}`); return; } }
  if (s.enum && !s.enum.includes(v)) errs.push(`${p}: ${v} не в enum ${s.enum}`);
  if (typeof v === "string") {
    if (s.minLength !== undefined && v.length < s.minLength) errs.push(`${p}: короткий рядок (${v.length} < ${s.minLength})`);
    if (s.maxLength !== undefined && v.length > s.maxLength) errs.push(`${p}: довгий рядок (${v.length} > ${s.maxLength})`);
    if (s.pattern && !new RegExp(s.pattern).test(v)) errs.push(`${p}: не відповідає pattern ${s.pattern}`);
  }
  if (typeof v === "number") {
    if (s.minimum !== undefined && v < s.minimum) errs.push(`${p}: ${v} < ${s.minimum}`);
    if (s.maximum !== undefined && v > s.maximum) errs.push(`${p}: ${v} > ${s.maximum}`);
  }
  if (Array.isArray(v)) {
    if (s.minItems !== undefined && v.length < s.minItems) errs.push(`${p}: мало елементів`);
    if (s.maxItems !== undefined && v.length > s.maxItems) errs.push(`${p}: забагато елементів`);
    if (s.uniqueItems && new Set(v.map(String)).size !== v.length) errs.push(`${p}: дублікати`);
    if (s.items) v.forEach((x, i) => validate(x, s.items, `${p}[${i}]`, errs));
  }
  if (typeOk(v, "object")) {
    (s.required || []).forEach(k => { if (!(k in v)) errs.push(`${p}.${k}: відсутнє обов'язкове поле`); });
    for (const k of Object.keys(s.properties || {})) if (k in v) validate(v[k], s.properties[k], `${p}.${k}`, errs);
  }
}

const ds = G.generateDataset(newId, { seed: 7, postCount: 60 });
const colls = { users: ds.users, categories: ds.categories, tags: ds.tags, posts: ds.posts, reactions: ds.reactions, post_versions: ds.versions, notifications: ds.notifications, post_views: ds.views };
let failed = 0;
const fail = m => { failed++; console.log("  ✗ " + m); };
const ok = m => console.log("  ✓ " + m);

console.log("1. Валідація документів за $jsonSchema");
for (const [name, docs] of Object.entries(colls)) {
  let bad = 0;
  docs.forEach((d, i) => { const errs = []; validate(d, S.validators[name], name, errs); if (errs.length) { bad++; if (bad <= 3) console.log(`     [${i}] ${errs.slice(0, 3).join("; ")}`); } });
  bad ? fail(`${name}: ${bad} з ${docs.length} не проходять валідацію`) : ok(`${name}: ${docs.length} документів — усі валідні`);
}

console.log("2. Вимоги завдання");
const allComments = ds.posts.reduce((s, p) => s + p.comments.length, 0);
const approved = ds.posts.reduce((s, p) => s + p.comments.filter(c => c.status === "approved").length, 0);
const nested = ds.posts.reduce((s, p) => s + p.comments.filter(c => c.parent_id).length, 0);
const maxDepth = Math.max(...ds.posts.flatMap(p => p.comments.map(c => c.depth)));
(ds.posts.length >= 50 ? ok : fail)(`постів: ${ds.posts.length} (≥50)`);
(allComments >= 200 ? ok : fail)(`коментарів: ${allComments}, схвалених: ${approved} (≥200)`);
(ds.users.length === 20 ? ok : fail)(`користувачів: ${ds.users.length} (20); ролі: ${JSON.stringify(ds.users.reduce((a, u) => (a[u.role] = (a[u.role] || 0) + 1, a), {}))}`);
(ds.categories.length === 10 ? ok : fail)(`категорій: ${ds.categories.length} (10)`);
ok(`вкладених відповідей: ${nested}, максимальна глибина: ${maxDepth}`);
ok(`тегів: ${ds.tags.length}; реакцій: ${ds.reactions.length}; версій: ${ds.versions.length}; сповіщень: ${ds.notifications.length}; бакетів переглядів: ${ds.views.length}`);
const slugs = new Set(ds.posts.map(p => p.slug)); (slugs.size === ds.posts.length ? ok : fail)("slug унікальні");
const titles = new Set(ds.posts.map(p => p.title)); (titles.size === ds.posts.length ? ok : fail)("заголовки унікальні");

console.log("3. Узгодженість даних");
const k = String;
const byPost = new Map(ds.posts.map(p => [k(p._id), p]));
let inc = 0;
ds.posts.forEach(p => {
  const ids = new Set(p.comments.map(c => k(c.comment_id)));
  p.comments.forEach(c => { if (c.parent_id && !ids.has(k(c.parent_id))) inc++; });                       // батько існує
  const idx = new Map(p.comments.map((c, i) => [k(c.comment_id), i]));
  p.comments.forEach(c => { if (c.parent_id) { const pa = p.comments[idx.get(k(c.parent_id))]; if (idx.get(k(c.parent_id)) > idx.get(k(c.comment_id)) || c.depth !== pa.depth + 1 || pa.status !== "approved") inc++; } });
  if (p.statistics.comments_count !== p.comments.filter(c => c.status === "approved").length) inc++;
  const rx = ds.reactions.filter(r => k(r.post_id) === k(p._id));
  if (p.statistics.likes !== rx.filter(r => r.value === 1).length || p.statistics.dislikes !== rx.filter(r => r.value === -1).length) inc++;
  const vs = ds.views.filter(v => k(v.post_id) === k(p._id));
  if (p.status !== "draft" && vs.reduce((s, v) => s + v.total, 0) !== p.statistics.views) inc++;
  vs.forEach(v => { if (Object.values(v.days).reduce((s, x) => s + x, 0) !== v.total) inc++; });
  if (p.status !== "published" && p.comments.length && p.status === "draft") inc++;
  if (p.published_at && p.published_at < p.created_at) inc++;
  p.comments.forEach(c => { if (p.published_at && c.created_at < p.published_at) inc++; });
});
ds.notifications.forEach(n => { const p = byPost.get(k(n.post_id)); if (!p || !p.comments.some(c => k(c.comment_id) === k(n.comment_id) && c.status === "approved")) inc++; });
ds.versions.forEach(v => { const p = byPost.get(k(v.post_id)); if (!p || v.version >= p.version) inc++; });
(inc === 0 ? ok : fail)(`перевірки зв'язків/лічильників: порушень ${inc}`);
const dupReact = new Set(ds.reactions.map(r => k(r.post_id) + k(r.user_id))); (dupReact.size === ds.reactions.length ? ok : fail)("реакції: пара (post, user) унікальна");
const own = ds.reactions.filter(r => k(r.user_id) === k(byPost.get(k(r.post_id)).author.user_id)).length; (own === 0 ? ok : fail)("автор не оцінює власний пост");

console.log("4. Очікувані результати агрегацій");
const pub = ds.posts.filter(p => p.status === "published");
const top = {}; pub.forEach(p => { const e = top[p.author.username] || (top[p.author.username] = { username: p.author.username, posts_count: 0, total_views: 0, total_likes: 0 }); e.posts_count++; e.total_views += p.statistics.views; e.total_likes += p.statistics.likes; });
const topAuthors = Object.values(top).sort((a, b) => b.posts_count - a.posts_count || a.username.localeCompare(b.username)).slice(0, 10);
const cats = {}; pub.forEach(p => { const e = cats[p.category.name] || (cats[p.category.name] = { category_name: p.category.name, posts_count: 0, total_views: 0, likes: 0 }); e.posts_count++; e.total_views += p.statistics.views; e.likes += p.statistics.likes; });
const popularCategories = Object.values(cats).map(c => ({ category_name: c.category_name, posts_count: c.posts_count, total_views: c.total_views, avg_likes: Math.round(c.likes / c.posts_count * 100) / 100 })).sort((a, b) => b.posts_count - a.posts_count || a.category_name.localeCompare(b.category_name));
const apprPerPost = pub.map(p => p.comments.filter(c => c.status === "approved").length);
const commentStats = {
  total_posts: pub.length, total_comments_all_statuses: pub.reduce((s, p) => s + p.comments.length, 0),
  approved_comments: apprPerPost.reduce((a, b) => a + b, 0), avg_approved_per_post: Math.round(apprPerPost.reduce((a, b) => a + b, 0) / pub.length * 100) / 100, max_approved: Math.max(...apprPerPost)
};
const byStatus = {}; ds.posts.forEach(p => p.comments.forEach(c => byStatus[c.status] = (byStatus[c.status] || 0) + 1));
const tagCount = {}; pub.forEach(p => p.tags.forEach(t => tagCount[t] = (tagCount[t] || 0) + 1));
const topTags = Object.entries(tagCount).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10).map(([tag, posts_count]) => ({ tag, posts_count }));
const expected = { posts_by_status: ds.posts.reduce((a, p) => (a[p.status] = (a[p.status] || 0) + 1, a), {}), topAuthors, popularCategories, commentStats, comments_by_status: byStatus, topTags,
  totals: { users: ds.users.length, categories: ds.categories.length, posts: ds.posts.length, comments: allComments, tags: ds.tags.length, reactions: ds.reactions.length, versions: ds.versions.length, notifications: ds.notifications.length, views_total: pub.reduce((s, p) => s + p.statistics.views, 0) } };
fs.writeFileSync(path.join(__dirname, "expected.json"), JSON.stringify(expected, null, 2));
console.log(JSON.stringify({ topAuthors: topAuthors.slice(0, 3), commentStats, comments_by_status: byStatus }, null, 1));
console.log("  (повний файл: tests/expected.json)");

// Приклад стемінгу — для звіту
const { ukStem } = require("../scripts/lib/ukstem.js");
console.log("5. Стемінг:", ["програмування", "базах", "даних", "тестами", "статті", "помилки"].map(w => w + "→" + ukStem(w)).join(", "));


console.log("6. «Легкі» документи для бенчмарка (scripts/09_benchmark.js) проходять валідатор posts");
{
  const c2 = G.createContext(newId, 7); let bad = 0;
  for (let i = 0; i < 300; i++) { const errs = []; validate(G.makePost(c2, i * 37, { lite: true }).post, S.validators.posts, "posts", errs); if (errs.length) { bad++; if (bad <= 3) console.log("     " + errs.slice(0, 2).join("; ")); } }
  bad ? fail(`${bad} з 300 не проходять валідацію`) : ok("300 вибіркових документів — усі валідні");
}

console.log(failed ? `\nПРОВАЛЕНО перевірок: ${failed}` : "\nУсі перевірки пройдено");
process.exit(failed ? 1 : 0);
