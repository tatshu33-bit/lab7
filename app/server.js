// ЛР №7: REST API блог-системи на Express + MongoDB. Запуск: npm install && npm start (http://localhost:3000)
const path = require("path");
const express = require("express");
const { connect, col, client } = require("./src/db");
const { ApiError, ah, mapMongoError } = require("./src/util");
const { cache, cached, invalidateOnWrite } = require("./src/cache");
const posts = require("./src/posts");
const comments = require("./src/comments");
const { queries } = require("./src/analytics");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(invalidateOnWrite);
app.use(express.static(path.join(__dirname, "public")));

const api = express.Router();
const wrap = fn => ah(async (req, res) => res.json(await fn(req)));

api.get("/health", ah(async (req, res) => { await client.db().command({ ping: 1 }); res.json({ ok: true }); }));

// ---- довідники ----
api.get("/users", cached(60), wrap(() => col("users").find({ status: "active" }, { projection: { username: 1, role: 1, "profile.full_name": 1, "profile.avatar_url": 1, statistics: 1 } }).sort({ role: 1, username: 1 }).toArray()));
api.get("/categories", cached(60), wrap(() => col("categories").find().sort({ name: 1 }).toArray()));
api.get("/tags", cached(60), wrap(() => col("tags").find().sort({ posts_count: -1, name: 1 }).limit(100).toArray()));

// ---- пости ----
api.get("/posts", cached(30), wrap(req => posts.listPosts(req.query)));
api.post("/posts", wrap(async req => posts.createPost(req.body)));
api.get("/posts/:id", wrap(req => posts.getPost(req.params.id, { userId: req.query.user_id, countView: !req.query.nocount })));
api.put("/posts/:id", wrap(req => posts.updatePost(req.params.id, req.body)));
api.delete("/posts/:id", wrap(req => posts.archivePost(req.params.id, req.query.user_id)));
api.get("/posts/:id/versions", wrap(req => posts.listVersions(req.params.id)));
api.get("/posts/:id/versions/:n", wrap(req => posts.getVersion(req.params.id, req.params.n)));
api.post("/posts/:id/versions/:n/restore", wrap(req => posts.restoreVersion(req.params.id, req.params.n, req.body.user_id)));
api.post("/posts/:id/reaction", wrap(req => posts.react(req.params.id, req.body.user_id, req.body.value)));

// ---- коментарі, модерація ----
api.post("/posts/:id/comments", ah(async (req, res) => res.status(201).json(await comments.addComment(req.params.id, req.body))));
api.patch("/posts/:id/comments/:cid", wrap(req => comments.moderate(req.params.id, req.params.cid, req.body)));
api.get("/moderation/queue", wrap(req => comments.queue(req.query.user_id, req.query.status)));

// ---- сповіщення ----
api.get("/notifications", wrap(req => comments.inbox(req.query.user_id, req.query.unread === "1")));
api.post("/notifications/read", wrap(req => comments.markRead(req.body.user_id, req.body.ids)));

// ---- аналітика (кешується) ----
api.get("/analytics/:name", cached(60), wrap(req => {
  const q = queries[req.params.name];
  if (!q) throw new ApiError(404, "Невідомий показник: " + Object.keys(queries).join(", "));
  return q();
}));

// ---- кеш ----
api.get("/cache/stats", (req, res) => res.json(cache.stats()));
api.post("/cache/clear", (req, res) => { cache.clear(); res.json({ cleared: true }); });

app.use("/api", api);
app.use("/api", (req, res) => res.status(404).json({ error: "Маршрут не знайдено" }));
app.use((err, req, res, next) => { // єдиний обробник помилок
  const e = mapMongoError(err);
  if (e instanceof ApiError) return res.status(e.status).json({ error: e.message, details: e.details });
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Некоректний JSON" });
  console.error(err);
  res.status(500).json({ error: "Внутрішня помилка сервера" });
});

const port = process.env.PORT || 3000;
connect().then(() => app.listen(port, () => console.log("Сервер працює: http://localhost:" + port)))
  .catch(e => { console.error("Не вдалося підключитись до MongoDB:", e.message); process.exit(1); });
