// Аналітика для дашборда: усі показники рахуються агрегаційними pipeline на стороні MongoDB.
const { col } = require("./db");

const pub = { $match: { status: "published" } };

const queries = {
  // Картки-підсумки
  async overview() {
    const [posts, users, comments, reactions] = await Promise.all([
      col("posts").aggregate([pub, { $group: { _id: null, posts: { $sum: 1 }, views: { $sum: "$statistics.views" }, likes: { $sum: "$statistics.likes" }, dislikes: { $sum: "$statistics.dislikes" }, approved_comments: { $sum: "$statistics.comments_count" } } }]).toArray(),
      col("users").countDocuments({ status: "active" }),
      col("posts").aggregate([{ $unwind: "$comments" }, { $group: { _id: "$comments.status", n: { $sum: 1 } } }]).toArray(),
      col("reactions").countDocuments()
    ]);
    const p = posts[0] || { posts: 0, views: 0, likes: 0, dislikes: 0, approved_comments: 0 };
    const byStatus = Object.fromEntries(comments.map(c => [c._id, c.n]));
    const total = comments.reduce((s, c) => s + c.n, 0);
    return { posts: p.posts, users, views: p.views, likes: p.likes, dislikes: p.dislikes, reactions,
      comments_total: total, comments_by_status: byStatus, avg_approved_comments_per_post: p.posts ? Math.round(p.approved_comments / p.posts * 100) / 100 : 0 };
  },
  // Топ 10 авторів
  authors: () => col("posts").aggregate([pub,
    { $group: { _id: "$author.user_id", username: { $first: "$author.username" }, posts: { $sum: 1 }, views: { $sum: "$statistics.views" }, likes: { $sum: "$statistics.likes" } } },
    { $sort: { posts: -1, username: 1 } }, { $limit: 10 }, { $project: { _id: 0, username: 1, posts: 1, views: 1, likes: 1 } }]).toArray(),
  // Категорії
  categories: () => col("posts").aggregate([pub,
    { $group: { _id: "$category.category_id", name: { $first: "$category.name" }, posts: { $sum: 1 }, views: { $sum: "$statistics.views" } } },
    { $sort: { posts: -1, name: 1 } }, { $project: { _id: 0, name: 1, posts: 1, views: 1 } }]).toArray(),
  // Теги
  tags: () => col("posts").aggregate([pub, { $unwind: "$tags" }, { $group: { _id: "$tags", posts: { $sum: 1 } } },
    { $sort: { posts: -1, _id: 1 } }, { $limit: 12 }, { $project: { _id: 0, tag: "$_id", posts: 1 } }]).toArray(),
  // Динаміка публікацій і переглядів за місяцями
  timeline: () => col("posts").aggregate([pub,
    { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$published_at" } }, posts: { $sum: 1 }, views: { $sum: "$statistics.views" } } },
    { $sort: { _id: 1 } }, { $project: { _id: 0, month: "$_id", posts: 1, views: 1 } }]).toArray(),
  // Перегляди за днями (останні 30 днів із бакетів post_views)
  views_daily: () => col("post_views").aggregate([
    { $project: { month: 1, d: { $objectToArray: "$days" } } }, { $unwind: "$d" },
    { $group: { _id: { $concat: ["$month", "-", "$d.k"] }, views: { $sum: "$d.v" } } },
    { $sort: { _id: -1 } }, { $limit: 30 }, { $sort: { _id: 1 } }, { $project: { _id: 0, day: "$_id", views: 1 } }]).toArray(),
  // Коментарі за статусами модерації
  comments_status: () => col("posts").aggregate([{ $unwind: "$comments" }, { $group: { _id: "$comments.status", n: { $sum: 1 } } },
    { $sort: { n: -1 } }, { $project: { _id: 0, status: "$_id", n: 1 } }]).toArray(),
  // Розподіл за рейтингом (лайки − дизлайки), корзини
  ratings: () => col("posts").aggregate([pub, { $project: { r: { $subtract: ["$statistics.likes", "$statistics.dislikes"] } } },
    { $bucket: { groupBy: "$r", boundaries: [-100, 0, 3, 6, 10, 1000], default: "інше", output: { posts: { $sum: 1 } } } }]).toArray(),
  // Географія: пости за містами
  geo: () => col("posts").aggregate([{ $match: { status: "published", location: { $exists: true } } },
    { $group: { _id: "$location_name", posts: { $sum: 1 }, lon: { $first: { $arrayElemAt: ["$location.coordinates", 0] } }, lat: { $first: { $arrayElemAt: ["$location.coordinates", 1] } } } },
    { $sort: { posts: -1 } }, { $limit: 12 }, { $project: { _id: 0, city: "$_id", posts: 1, lon: 1, lat: 1 } }]).toArray()
};
module.exports = { queries };
