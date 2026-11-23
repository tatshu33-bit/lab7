// Рівень 1, крок 3 / завдання 5: індекси для пошуку за автором, категорією та датою (+ індекси рівнів 2–3)
load("scripts/00_common.js");
load("scripts/lib/schemas.js");
LAB7_SCHEMAS.indexes.forEach(([coll, keys, opts]) => db.getCollection(coll).createIndex(keys, opts));
["users", "categories", "tags", "posts", "reactions", "post_versions", "notifications", "post_views"].forEach(c =>
  show("Індекси " + c, db[c].getIndexes().map(i => i.name + "  " + JSON.stringify(i.key))));
