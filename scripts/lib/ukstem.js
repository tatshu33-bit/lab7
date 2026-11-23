// Евристичний «стемер» для української (як у ЛР №6): у MongoDB немає українського стемінгу для text-індексу.
// Підключається і в mongosh (через load()), і в Node (через require()).
var UK_ENDINGS = ["ннями", "ннях", "нням", "ння", "нню", "нні", "ами", "ями", "ові", "еві", "ого", "ому", "ими", "їми", "ією", "ії", "ія", "ію",
  "ах", "ях", "ою", "ею", "ям", "ом", "ем", "ів", "їв", "ий", "ій", "ої", "а", "я", "у", "ю", "і", "и", "е", "є", "о", "ь"]
  .sort(function (a, b) { return b.length - a.length; });

function ukStem(w) {
  w = w.toLowerCase().replace(/['’ʼ]/g, "");
  for (var i = 0; i < UK_ENDINGS.length; i++) {
    var e = UK_ENDINGS[i];
    if (w.length - e.length >= 3 && w.endsWith(e)) return w.slice(0, -e.length);
  }
  return w;
}
function ukTokens(text) {
  return (String(text || "").match(/[\p{L}\p{N}]+(?:['’ʼ][\p{L}\p{N}]+)*/gu) || []).map(ukStem);
}
// Рядок унікальних стемів — зберігається у posts.search_stems і входить у text-індекс
function ukStemText(text) {
  return Array.from(new Set(ukTokens(text))).join(" ");
}
if (typeof module !== "undefined" && module.exports) module.exports = { ukStem: ukStem, ukTokens: ukTokens, ukStemText: ukStemText };
