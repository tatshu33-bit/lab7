// Узгодженість денормалізованих даних (відповідь на контрольне запитання про консистентність).
// Кожна перевірка порівнює збережений лічильник із перерахунком «з першоджерела». Очікується 0 розбіжностей.
load("scripts/00_common.js");

const S = String;
const users = db.users.find().toArray(), posts = db.posts.find().toArray(), cats = db.categories.find().toArray(), tags = db.tags.find().toArray();
const results = [];
const check = (name, bad) => { results.push({ перевірка: name, розбіжностей: bad.length, приклади: bad.slice(0, 3) }); };

// 1. users.statistics.posts_count = опубліковані пости автора
const pc = {}; posts.filter(p => p.status === "published").forEach(p => pc[S(p.author.user_id)] = (pc[S(p.author.user_id)] || 0) + 1);
check("users.posts_count", users.filter(u => u.statistics.posts_count !== (pc[S(u._id)] || 0)).map(u => u.username));
// 2. users.statistics.comments_count = схвалені коментарі користувача
const cc = {}; posts.forEach(p => p.comments.forEach(c => { if (c.status === "approved") cc[S(c.author.user_id)] = (cc[S(c.author.user_id)] || 0) + 1; }));
check("users.comments_count", users.filter(u => u.statistics.comments_count !== (cc[S(u._id)] || 0)).map(u => u.username));
// 3. categories.posts_count
const cp = {}; posts.filter(p => p.status === "published").forEach(p => cp[S(p.category.category_id)] = (cp[S(p.category.category_id)] || 0) + 1);
check("categories.posts_count", cats.filter(c => c.statistics.posts_count !== (cp[S(c._id)] || 0)).map(c => c.name));
// 4. tags.posts_count
const tp = {}; posts.filter(p => p.status === "published").forEach(p => p.tags.forEach(t => tp[t] = (tp[t] || 0) + 1));
check("tags.posts_count", tags.filter(t => t.posts_count !== (tp[t.name] || 0)).map(t => t.name).concat(Object.keys(tp).filter(t => !tags.some(x => x.name === t))));
// 5. posts.statistics.comments_count = схвалені коментарі в масиві
check("posts.comments_count", posts.filter(p => p.statistics.comments_count !== p.comments.filter(c => c.status === "approved").length).map(p => p.slug));
// 6. likes/dislikes = reactions
const rx = {}; db.reactions.find().forEach(r => { const e = rx[S(r.post_id)] || (rx[S(r.post_id)] = { l: 0, d: 0 }); r.value === 1 ? e.l++ : e.d++; });
check("posts.likes/dislikes", posts.filter(p => { const e = rx[S(p._id)] || { l: 0, d: 0 }; return p.statistics.likes !== e.l || p.statistics.dislikes !== e.d; }).map(p => p.slug));
// 7. views = сума бакетів
const vb = {}; db.post_views.find().forEach(v => vb[S(v.post_id)] = (vb[S(v.post_id)] || 0) + v.total);
check("posts.views = Σ post_views.total", posts.filter(p => p.status !== "draft" && p.statistics.views !== (vb[S(p._id)] || 0)).map(p => p.slug));
// 8. кількість знімків = version − 1
const vc = {}; db.post_versions.find({}, { post_id: 1 }).forEach(v => vc[S(v.post_id)] = (vc[S(v.post_id)] || 0) + 1);
check("post_versions = version − 1", posts.filter(p => (vc[S(p._id)] || 0) !== p.version - 1).map(p => p.slug));
// 9. «сироти»: сповіщення посилаються на існуючі схвалені коментарі; реакції — на існуючі пости
const byId = {}; posts.forEach(p => byId[S(p._id)] = p);
check("notifications → схвалений коментар", db.notifications.find().toArray().filter(n => !byId[S(n.post_id)] || !byId[S(n.post_id)].comments.some(c => S(c.comment_id) === S(n.comment_id) && c.status === "approved")).map(n => S(n._id)));
check("reactions → існуючий пост і користувач", db.reactions.find().toArray().filter(r => !byId[S(r.post_id)] || !users.some(u => S(u._id) === S(r.user_id))).map(r => S(r._id)));
// 10. вбудовані «знімки» автора/категорії відповідають першоджерелу
const un = {}; users.forEach(u => un[S(u._id)] = u.username); const cn = {}; cats.forEach(c => cn[S(c._id)] = c.name);
check("posts.author.username = users.username", posts.filter(p => p.author.username !== un[S(p.author.user_id)] || p.comments.some(c => c.author.username !== un[S(c.author.user_id)])).map(p => p.slug));
check("posts.category.name = categories.name", posts.filter(p => p.category.name !== cn[S(p.category.category_id)]).map(p => p.slug));

show("Результати перевірок", results);
const total = results.reduce((s, r) => s + r.розбіжностей, 0);
print("\n" + (total === 0 ? "ПІДСУМОК: дані узгоджені (0 розбіжностей)" : "ПІДСУМОК: знайдено розбіжностей: " + total));
