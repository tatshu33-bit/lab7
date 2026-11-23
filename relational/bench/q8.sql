-- Q8 лічильник переглядів (одна операція; -t 1000 дає 1000 операцій, як у mongosh)
\set k random(0, 39)
\set i (:k * 7919) % :N
UPDATE posts SET views = views + 1 WHERE post_id = :i + 1;
