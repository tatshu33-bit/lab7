-- Реляційні еквіваленти агрегацій рівня 1 (scripts/04_aggregations.js). Результати мають збігатися з MongoDB.

-- Топ 10 авторів за кількістю опублікованих постів
SELECT u.username, count(*) AS posts_count, sum(p.views) AS total_views, sum(p.likes) AS total_likes, round(avg(p.views), 1) AS avg_views_per_post
FROM posts p JOIN users u ON u.user_id = p.author_id
WHERE p.status = 'published'
GROUP BY u.user_id, u.username ORDER BY posts_count DESC, u.username LIMIT 10;

-- Популярні категорії
SELECT c.name AS category_name, count(*) AS posts_count, sum(p.views) AS total_views, round(avg(p.likes), 2) AS avg_likes
FROM posts p JOIN categories c ON c.category_id = p.category_id
WHERE p.status = 'published' GROUP BY c.category_id, c.name ORDER BY posts_count DESC, c.name;

-- Статистика коментарів (опубліковані пости; схвалені коментарі)
SELECT count(*) AS total_posts,
       sum(t) AS total_comments_all_statuses,
       sum(a) AS approved_comments, round(avg(a), 2) AS avg_approved_per_post, max(a) AS max_approved
FROM (SELECT p.post_id, count(c.comment_id) AS t, count(c.comment_id) FILTER (WHERE c.status = 'approved') AS a
      FROM posts p LEFT JOIN comments c ON c.post_id = p.post_id WHERE p.status = 'published' GROUP BY p.post_id) s;

-- Коментарі за статусами
SELECT status, count(*) FROM comments GROUP BY status ORDER BY 2 DESC;

-- Топ 10 тегів
SELECT t.name AS tag, count(*) AS posts_count, round(avg(p.views), 0) AS avg_views
FROM post_tags pt JOIN tags t USING (tag_id) JOIN posts p USING (post_id)
WHERE p.status = 'published' GROUP BY t.name ORDER BY posts_count DESC, t.name LIMIT 10;
