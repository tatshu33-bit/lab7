-- Q4 пости з двома тегами одночасно (AND)
SELECT p.post_id, p.title FROM posts p JOIN post_tags pt USING (post_id) JOIN tags t USING (tag_id)
WHERE p.status = 'published' AND t.name IN ('mongodb', 'практика')
GROUP BY p.post_id, p.title HAVING count(DISTINCT t.name) = 2;
