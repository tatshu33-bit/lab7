// Допоміжні функції для всіх скриптів (підключаються через load("scripts/00_common.js"); запускати з кореня проєкту)
db = db.getSiblingDB("blog_system");
function show(title, value) {
  print("\n// " + title);
  if (value !== undefined) printjson(value);
}
// Короткий підсумок explain("executionStats"): ланцюжок стадій + переглянуто ключів/документів
function plan(cursor) {
  const e = cursor.explain("executionStats"), es = e.executionStats;
  let stage = e.queryPlanner.winningPlan, chain = [];
  while (stage) {
    chain.push(stage.stage + (stage.indexName ? "(" + stage.indexName + ")" : ""));
    stage = stage.inputStage || (stage.inputStages && stage.inputStages[0]);
  }
  return { plan: chain.join(" -> "), nReturned: es.nReturned, totalKeysExamined: es.totalKeysExamined,
           totalDocsExamined: es.totalDocsExamined, executionTimeMillis: es.executionTimeMillis };
}
// Таймер з дробовими мілісекундами (performance.now() є в Node; запасний варіант — Date.now())
function now() { return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now(); }
// Медіана часу виконання fn (мс) за n запусків; fn отримує номер запуску
function medianMs(fn, n) {
  n = n || 30; const t = [];
  for (let i = 0; i < n; i++) { const s = now(); fn(i); t.push(now() - s); }
  t.sort((a, b) => a - b); return Math.round(t[Math.floor(t.length / 2)] * 100) / 100;
}
