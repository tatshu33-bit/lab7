-- Q3 пости автора за діапазон дат
SELECT p.post_id, p.title, p.published_at FROM posts p JOIN users u ON u.user_id = p.author_id
WHERE u.username = 'natalia_kravchenko' AND p.status = 'published' AND p.published_at >= '2026-09-01' AND p.published_at < '2026-10-01'
ORDER BY p.published_at DESC;
