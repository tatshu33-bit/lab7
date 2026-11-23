-- Q9 додати коментар
\set k random(0, 39)
\set i (:k * 7919) % :N
INSERT INTO comments (post_id, parent_id, depth, author_id, text, status, likes, created_at) VALUES (:i + 1, NULL, 0, 13, 'Бенчмарк', 'pending', 0, now());
