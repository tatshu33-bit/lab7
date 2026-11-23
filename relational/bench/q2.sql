-- Q2 сторінка поста за slug: пост + автор + категорія + теги + усі коментарі (з авторами)
\set k random(0, 39)
\set i (:k * 7919) % :N
SELECT p.*, u.username, c.name AS category,
       (SELECT array_agg(t.name) FROM post_tags pt JOIN tags t USING (tag_id) WHERE pt.post_id = p.post_id) AS tags,
       (SELECT json_agg(json_build_object('id', cm.comment_id, 'parent', cm.parent_id, 'depth', cm.depth, 'author', cu.username, 'text', cm.text, 'status', cm.status) ORDER BY cm.created_at)
          FROM comments cm JOIN users cu ON cu.user_id = cm.author_id WHERE cm.post_id = p.post_id) AS comments
FROM posts p JOIN users u ON u.user_id = p.author_id JOIN categories c ON c.category_id = p.category_id
WHERE p.post_id = :i + 1;
