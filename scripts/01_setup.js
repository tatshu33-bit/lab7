// Рівень 1, крок 2: база blog_system, колекції з валідацією схеми ($jsonSchema)
load("scripts/00_common.js");
load("scripts/lib/schemas.js");
db.dropDatabase();
db = db.getSiblingDB("blog_system");

Object.keys(LAB7_SCHEMAS.validators).forEach(name => {
  db.createCollection(name, {
    validator: { $jsonSchema: LAB7_SCHEMAS.validators[name] },
    validationLevel: "strict",   // перевіряються і вставки, і оновлення
    validationAction: "error"    // некоректні документи відхиляються (код 121)
  });
});
show("Колекції бази blog_system", db.getCollectionNames().sort());

// Швидка перевірка: валідатор справді працює
const bad = [
  ["користувач із ролью 'guest'", () => db.users.insertOne({ username: "tester", email: "t@x.ua", password_hash: "x".repeat(60), role: "guest", status: "active", created_at: new Date() })],
  ["пост із коротким змістом (<100)", () => db.posts.insertOne({ title: "Тест", slug: "test", content: "коротко", author: { user_id: new ObjectId(), username: "tester" }, category: { category_id: new ObjectId(), name: "x" }, tags: [], status: "draft", version: 1, comments: [], statistics: { views: 0, likes: 0, dislikes: 0, comments_count: 0 }, created_at: new Date(), updated_at: new Date() })]
];
bad.forEach(([name, fn]) => { try { fn(); print("НЕ відхилено: " + name); } catch (e) { print("відхилено [" + e.code + "]: " + name); } });
