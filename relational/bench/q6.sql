-- Q6 топ-10 авторів
SELECT author_id, count(*) AS n, sum(views) AS views FROM posts WHERE status = 'published' GROUP BY author_id ORDER BY n DESC, author_id LIMIT 10;
