// Зводить виміри MongoDB (output/09_benchmark.txt) і PostgreSQL (output/10_bench_pg.jsonl) у таблицю output/10_comparison.md
// Запуск: node relational/merge_bench.js
const fs = require("fs"), path = require("path");
const out = path.join(__dirname, "..", "output");
const mongoTxt = fs.readFileSync(path.join(out, "09_benchmark.txt"), "utf8");
const mline = mongoTxt.split("\n").find(l => l.startsWith('{"N":'));
if (!mline) throw new Error("У output/09_benchmark.txt немає JSON-рядка — спершу виконайте scripts/09_benchmark.js");
const mongo = JSON.parse(mline);
const pg = Object.fromEntries(fs.readFileSync(path.join(out, "10_bench_pg.jsonl"), "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)).map(r => [r.id, r]));
const TOTALS = { Q8: 1000, Q9: 1000 };   // у MongoDB для цих запитів вимірювався сумарний час 1000 операцій
const f = x => x === undefined ? "—" : (x >= 100 ? Math.round(x) : x.toFixed(x >= 10 ? 1 : 2)).toString().replace(".", ",");
const rows = mongo.results.map(r => {
  const p = pg[r.id], pgMs = p ? p.ms_avg * (TOTALS[r.id] || 1) : undefined;
  const ratio = p ? (pgMs / r.ms) : undefined;
  return `| ${r.id} | ${r.name}${TOTALS[r.id] ? " (сума ×" + TOTALS[r.id] + ")" : ""} | ${f(r.ms)} | ${f(pgMs)} | ${ratio === undefined ? "—" : ratio >= 1 ? "Mongo швидше у " + ratio.toFixed(1) + "×" : "PostgreSQL швидше у " + (1 / ratio).toFixed(1) + "×"} |`;
});
const md = `| № | Запит | MongoDB, мс | PostgreSQL, мс | Співвідношення |\n|---|---|---|---|---|\n${rows.join("\n")}\n\nN = ${mongo.N} постів. MongoDB: завантаження ${mongo.load_ms} мс, індекси ${mongo.index_ms} мс, дані ${mongo.data_mb} МБ + індекси ${mongo.index_mb} МБ.\n`;
fs.writeFileSync(path.join(out, "10_comparison.md"), md);
console.log(md);
