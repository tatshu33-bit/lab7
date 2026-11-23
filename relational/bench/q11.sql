-- Q11 10 найближчих постів у радіусі 50 км від Києва
SELECT post_id, title, earth_distance(ll_to_earth(lat, lon), ll_to_earth(50.4501, 30.5234)) AS d
FROM posts WHERE status = 'published' AND earth_box(ll_to_earth(50.4501, 30.5234), 50000) @> ll_to_earth(lat, lon)
  AND earth_distance(ll_to_earth(lat, lon), ll_to_earth(50.4501, 30.5234)) <= 50000
ORDER BY d LIMIT 10;
