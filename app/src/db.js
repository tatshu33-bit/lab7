const { MongoClient } = require("mongodb");
// Одне підключення на весь застосунок: MongoClient має власний пул з'єднань
const client = new MongoClient(process.env.MONGO_URL || "mongodb://localhost:27017");
let db = null;
async function connect() {
  await client.connect();
  db = client.db(process.env.DB_NAME || "blog_system");
  return db;
}
const col = name => db.collection(name);
module.exports = { connect, col, client };
