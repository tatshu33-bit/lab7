-- Q5 повнотекстовий пошук: 10 найрелевантніших
SELECT post_id, title, ts_rank(tsv, q) AS score FROM posts, plainto_tsquery('simple', 'kubernetes') q
WHERE tsv @@ q ORDER BY score DESC LIMIT 10;
