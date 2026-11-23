// Рівень 1, завдання 4: агрегаційні запити
load("scripts/00_common.js");

show("Топ 10 авторів за кількістю опублікованих постів", db.posts.aggregate([
  { $match: { status: "published" } },
  { $group: { _id: "$author.user_id", username: { $first: "$author.username" }, posts_count: { $sum: 1 },
              total_views: { $sum: "$statistics.views" }, total_likes: { $sum: "$statistics.likes" } } },
  { $sort: { posts_count: -1, username: 1 } },
  { $limit: 10 },
  { $project: { _id: 0, author_id: "$_id", username: 1, posts_count: 1, total_views: 1, total_likes: 1,
                avg_views_per_post: { $round: [{ $divide: ["$total_views", "$posts_count"] }, 1] } } }
]).toArray());

show("Популярні категорії за кількістю постів", db.posts.aggregate([
  { $match: { status: "published" } },
  { $group: { _id: "$category.category_id", category_name: { $first: "$category.name" }, posts_count: { $sum: 1 },
              total_views: { $sum: "$statistics.views" }, avg_likes: { $avg: "$statistics.likes" } } },
  { $sort: { posts_count: -1, category_name: 1 } },
  { $project: { _id: 0, category_name: 1, posts_count: 1, total_views: 1, avg_likes: { $round: ["$avg_likes", 2] } } }
]).toArray());

show("Статистика коментарів: загальна та середня на пост (опубліковані пости; схвалені коментарі)", db.posts.aggregate([
  { $match: { status: "published" } },
  { $project: {
      total: { $size: "$comments" },
      approved: { $size: { $filter: { input: "$comments", as: "c", cond: { $eq: ["$$c.status", "approved"] } } } } } },
  { $group: { _id: null, total_posts: { $sum: 1 }, total_comments_all_statuses: { $sum: "$total" },
              approved_comments: { $sum: "$approved" }, avg_approved_per_post: { $avg: "$approved" }, max_approved: { $max: "$approved" } } },
  { $project: { _id: 0, total_posts: 1, total_comments_all_statuses: 1, approved_comments: 1,
                avg_approved_per_post: { $round: ["$avg_approved_per_post", 2] }, max_approved: 1 } }
]).toArray());

show("Коментарі за статусами модерації", db.posts.aggregate([
  { $unwind: "$comments" }, { $group: { _id: "$comments.status", count: { $sum: 1 } } }, { $sort: { count: -1 } }]).toArray());

show("Топ 10 тегів", db.posts.aggregate([
  { $match: { status: "published" } }, { $unwind: "$tags" },
  { $group: { _id: "$tags", posts_count: { $sum: 1 }, avg_views: { $avg: "$statistics.views" } } },
  { $sort: { posts_count: -1, _id: 1 } }, { $limit: 10 },
  { $project: { _id: 0, tag: "$_id", posts_count: 1, avg_views: { $round: ["$avg_views", 0] } } }]).toArray());
