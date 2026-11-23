-- Q1 стрічка: 10 останніх опублікованих постів (автор, категорія, теги, кількість схвалених коментарів)
SELECT p.post_id, p.title, p.excerpt, p.published_at, p.views, p.likes, p.dislikes, u.username, c.name AS category,
       (SELECT array_agg(t.name) FROM post_tags pt JOIN tags t USING (tag_id) WHERE pt.post_id = p.post_id) AS tags,
       (SELECT count(*) FROM comments cm WHERE cm.post_id = p.post_id AND cm.status = 'approved') AS comments_count
FROM posts p JOIN users u ON u.user_id = p.author_id JOIN categories c ON c.category_id = p.category_id
WHERE p.status = 'published' ORDER BY p.published_at DESC, p.post_id DESC LIMIT 10;
