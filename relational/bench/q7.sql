-- Q7 статистика схвалених коментарів: сума і середнє на пост
SELECT sum(a) AS total, round(avg(a), 3) AS avg
FROM (SELECT p.post_id, count(c.comment_id) FILTER (WHERE c.status = 'approved') AS a
      FROM posts p LEFT JOIN comments c ON c.post_id = p.post_id WHERE p.status = 'published' GROUP BY p.post_id) s;
