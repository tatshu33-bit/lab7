// Генерує SQL (COPY) з ТИХ САМИХ детермінованих даних (seed = 7), що завантажуються в MongoDB.
//   node relational/gen_pg.js lab   out.sql          — повний набір лабораторної (60 постів, усі колекції)
//   node relational/gen_pg.js bench out.sql [N]      — N постів (за замовчуванням 50000) у «легкому» режимі, як scripts/09_benchmark.js
const fs = require("fs"), path = require("path");
const G = require("../scripts/lib/generator.js");
const [mode, out, nArg] = [process.argv[2], process.argv[3], process.argv[4]];
if (!["lab", "bench"].includes(mode) || !out) { console.error("Використання: node gen_pg.js lab|bench out.sql [N]"); process.exit(1); }
const N = mode === "lab" ? 60 : Number(nArg || 50000), lite = mode === "bench";

class Id { constructor(n) { this.n = n; } toString() { return "i" + this.n; } }
let seq = 0; const newId = () => new Id(++seq);
const maps = { users: new Map(), cats: new Map(), posts: new Map(), comments: new Map(), tags: new Map() };
const reg = (m, id) => { if (!m.has(String(id))) m.set(String(id), m.size + 1); return m.get(String(id)); };

const fd = fs.openSync(out, "w");
const w = s => fs.writeSync(fd, s);
const esc = v => v === null || v === undefined ? "\\N" : String(v instanceof Date ? v.toISOString() : v).replace(/\\/g, "\\\\").replace(/\t/g, "\\t").replace(/\n/g, "\\n").replace(/\r/g, "\\r");
const arr = a => "{" + a.map(x => '"' + String(x).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"').join(",") + "}";
const copy = (table, cols, rows) => { if (!rows.length) return; w(`COPY ${table} (${cols}) FROM stdin;\n` + rows.map(r => r.map(esc).join("\t")).join("\n") + "\n\\.\n\n"); };

const ctx = G.createContext(newId, 7);
w("SET client_encoding = 'UTF8';\nBEGIN;\n");
ctx.users.forEach(u => reg(maps.users, u._id));
ctx.categories.forEach(c => reg(maps.cats, c._id));
copy("users", "user_id,username,email,password_hash,role,full_name,bio,avatar_url,website,status,created_at,last_login",
  ctx.users.map(u => [maps.users.get(String(u._id)), u.username, u.email, u.password_hash, u.role, u.profile.full_name, u.profile.bio, u.profile.avatar_url, u.profile.website, u.status, u.created_at, u.last_login]));
copy("categories", "category_id,name,slug,description,parent_id,created_at",
  ctx.categories.map(c => [maps.cats.get(String(c._id)), c.name, c.slug, c.description, c.parent_id ? maps.cats.get(String(c.parent_id)) : null, c.created_at]));

const tagIds = new Map(); // назва -> tag_id (за порядком першої появи)
let commentSeq = 0, notifSeq = 0;
const BATCH = 2000;
let acc;
const flushAcc = () => {
  copy("posts", "post_id,title,slug,content,excerpt,search_stems,author_id,category_id,featured_image,status,version,views,likes,dislikes,lon,lat,location_name,created_at,updated_at,published_at", acc.posts);
  copy("post_tags", "post_id,tag_id", acc.post_tags);
  copy("comments", "comment_id,post_id,parent_id,depth,author_id,text,status,likes,created_at,moderated_by,moderated_at", acc.comments);
  copy("reactions", "post_id,user_id,value,created_at", acc.reactions);
  copy("post_versions", "post_id,version,title,content,excerpt,tags,category_id,saved_by,saved_at,change_note", acc.versions);
  copy("post_daily_views", "post_id,day,views", acc.views);
  copy("notifications", "notification_id,user_id,type,post_id,comment_id,from_user_id,text_preview,is_read,created_at", acc.notifs);
};
const fresh = () => ({ posts: [], post_tags: [], comments: [], reactions: [], versions: [], views: [], notifs: [] });
acc = fresh();
// tags мають існувати до post_tags: збираємо назви першим проходом? — простіше: тег реєструємо при першій появі й пишемо tags окремо наприкінці з відкладеними FK
w("SET CONSTRAINTS ALL DEFERRED;\n"); // FK у COPY перевіряються при COMMIT лише для DEFERRABLE; тут порядок вставки й так коректний, окрім tags — вони йдуть першими нижче
const allPosts = [];
for (let i = 0; i < N; i++) allPosts.push(G.makePost(ctx, i, { lite }));
// теги (унікальні назви в порядку появи)
allPosts.forEach(o => o.post.tags.forEach(t => { if (!tagIds.has(t)) tagIds.set(t, tagIds.size + 1); }));
copy("tags", "tag_id,name,created_at", [...tagIds].map(([n, id]) => [id, n, new Date(G.NOW - 300 * G.DAY)]));

allPosts.forEach((o, idx) => {
  const p = o.post, pid = reg(maps.posts, p._id);
  acc.posts.push([pid, p.title, p.slug, p.content, p.excerpt, p.search_stems, maps.users.get(String(p.author.user_id)), maps.cats.get(String(p.category.category_id)), p.featured_image, p.status, p.version,
    p.statistics.views, p.statistics.likes, p.statistics.dislikes, p.location ? p.location.coordinates[0] : null, p.location ? p.location.coordinates[1] : null, p.location_name || null, p.created_at, p.updated_at, p.published_at || null]);
  p.tags.forEach(t => acc.post_tags.push([pid, tagIds.get(t)]));
  p.comments.forEach(c => { // у mongo-масиві коментарі відсортовані за часом, батько завжди раніше за відповідь, тож FK parent_id виконується
    const cid = ++commentSeq; maps.comments.set(String(c.comment_id), cid);
    acc.comments.push([cid, pid, c.parent_id ? maps.comments.get(String(c.parent_id)) : null, c.depth, maps.users.get(String(c.author.user_id)), c.text, c.status, c.likes, c.created_at,
      c.moderated_by ? maps.users.get(String(c.moderated_by)) : null, c.moderated_at]);
  });
  o.reactions.forEach(r => acc.reactions.push([pid, maps.users.get(String(r.user_id)), r.value, r.created_at]));
  o.versions.forEach(v => acc.versions.push([pid, v.version, v.title, v.content, v.excerpt, arr(v.tags), maps.cats.get(String(v.category.category_id)), maps.users.get(String(v.saved_by)), v.saved_at, v.change_note]));
  o.views.forEach(b => Object.keys(b.days).forEach(d => acc.views.push([pid, b.month + "-" + d, b.days[d]])));
  o.notifications.forEach(n => acc.notifs.push([++notifSeq, maps.users.get(String(n.user_id)), n.type, pid, maps.comments.get(String(n.comment_id)), maps.users.get(String(n.from_user.user_id)), n.text_preview, n.is_read, n.created_at]));
  if ((idx + 1) % BATCH === 0) { flushAcc(); acc = fresh(); }
});
flushAcc();
// послідовності IDENTITY: продовжити після завантажених ключів
["users:user_id", "categories:category_id", "tags:tag_id", "posts:post_id", "comments:comment_id", "notifications:notification_id"].forEach(s => {
  const [t, c] = s.split(":"); w(`SELECT setval(pg_get_serial_sequence('${t}','${c}'), (SELECT COALESCE(MAX(${c}),1) FROM ${t}));\n`);
});
w("COMMIT;\n");
fs.closeSync(fd);
console.error(`${mode}: постів ${N}, коментарів ${commentSeq}, тегів ${tagIds.size}, сповіщень ${notifSeq} -> ${out}`);
