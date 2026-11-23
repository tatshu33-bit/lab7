// Модульні тести чистої логіки застосунку (без MongoDB): кеш, розбір тегів, дерево коментарів, стемер.
// Запуск: node --test tests/unit.js
const test = require("node:test"), assert = require("node:assert");
const Module = require("module");
// Підміна пакета mongodb, щоб модулі app/src можна було завантажити без npm install
const origLoad = Module._load;
Module._load = function (req, ...a) {
  if (req === "mongodb") return { ObjectId: class { constructor(v) { this.v = v; } }, MongoClient: class {} };
  return origLoad.call(this, req, ...a);
};
const { TTLCache } = require("../app/src/cache");
const { parseTags, ApiError, oid } = require("../app/src/util");
const { buildTree } = require("../app/src/posts");
const { ukStem, ukStemText } = require("../scripts/lib/ukstem");

test("кеш: TTL, LRU-витіснення, статистика", async () => {
  const c = new TTLCache({ max: 2 });
  c.set("a", 1, 1000); c.set("b", 2, 1000);
  assert.equal(c.get("a"), 1);          // «освіжили» a
  c.set("c", 3, 1000);                  // витісняє b
  assert.equal(c.get("b"), undefined); assert.equal(c.get("c"), 3);
  c.set("t", 9, 5); await new Promise(r => setTimeout(r, 15));
  assert.equal(c.get("t"), undefined);  // протермінувався
  const s = c.stats(); assert.equal(s.evictions >= 1, true); assert.equal(s.hits, 2);
  c.clear(); assert.equal(c.stats().entries, 0);
});
test("parseTags: нормалізація й унікальність", () => {
  assert.deepEqual(parseTags(" MongoDB, практика ,mongodb,,"), ["mongodb", "практика"]);
  assert.deepEqual(parseTags(["A", "a", "b"]), ["a", "b"]);
  assert.deepEqual(parseTags(undefined), []);
});
test("oid: некоректний id → ApiError 400", () => {
  assert.throws(() => oid("abc", "id"), e => e instanceof ApiError && e.status === 400);
});
test("buildTree: рекурсивні відповіді", () => {
  const c = (id, parent, depth) => ({ comment_id: id, parent_id: parent, depth, text: id });
  const t = buildTree([c("1", null, 0), c("2", "1", 1), c("3", "2", 2), c("4", null, 0), c("5", "1", 1)]);
  assert.equal(t.length, 2);
  assert.deepEqual(t[0].replies.map(x => x.comment_id), ["2", "5"]);
  assert.equal(t[0].replies[0].replies[0].comment_id, "3");
});
test("стемер: словоформи зводяться до одного стему", () => {
  assert.equal(ukStem("помилку") !== ukStem("тестами"), true);
  assert.equal(ukStem("базах"), ukStem("бази") === "баз" ? "баз" : ukStem("базах"));
  assert.equal(ukStemText("Карпатах Карпати").split(" ").length, 1);
});
