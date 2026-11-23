// Кеш популярних запитів: пам'ять процесу, TTL + обмеження розміру (LRU) + скидання при будь-якій зміні даних.
class TTLCache {
  constructor(opts) {
    opts = opts || {};
    this.max = opts.max || 500; this.map = new Map();
    this.hits = 0; this.misses = 0; this.evictions = 0; this.invalidations = 0;
  }
  get(key) {
    const e = this.map.get(key);
    if (!e) { this.misses++; return undefined; }
    if (e.exp < Date.now()) { this.map.delete(key); this.misses++; return undefined; }
    this.hits++; this.map.delete(key); this.map.set(key, e); // «освіжаємо» позицію (LRU)
    return e.val;
  }
  set(key, val, ttlMs) {
    this.map.delete(key); this.map.set(key, { val: val, exp: Date.now() + ttlMs });
    while (this.map.size > this.max) { this.map.delete(this.map.keys().next().value); this.evictions++; }
  }
  clear() { if (this.map.size) this.invalidations++; this.map.clear(); }
  stats() {
    const total = this.hits + this.misses;
    return { entries: this.map.size, max: this.max, hits: this.hits, misses: this.misses, hit_ratio: total ? Math.round(this.hits / total * 1000) / 1000 : 0, evictions: this.evictions, invalidations: this.invalidations };
  }
}
const cache = new TTLCache({ max: 500 });

// Middleware для GET-маршрутів: заголовок X-Cache: HIT | MISS | BYPASS (?nocache=1)
function cached(ttlSec) {
  return (req, res, next) => {
    if (req.method !== "GET") return next();
    if (req.query.nocache) { res.set("X-Cache", "BYPASS"); return next(); }
    const key = req.originalUrl, hit = cache.get(key);
    if (hit !== undefined) { res.set("X-Cache", "HIT"); return res.json(hit); }
    res.set("X-Cache", "MISS");
    const send = res.json.bind(res);
    res.json = body => { if (res.statusCode === 200) cache.set(key, body, ttlSec * 1000); return send(body); };
    next();
  };
}
// Будь-який успішний запит, що змінює дані, скидає кеш (проста й надійна стратегія інвалідації)
function invalidateOnWrite(req, res, next) {
  if (req.method !== "GET") res.on("finish", () => { if (res.statusCode < 400) cache.clear(); });
  next();
}
module.exports = { cache, cached, invalidateOnWrite, TTLCache };
