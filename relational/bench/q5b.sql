-- Q5b кількість усіх збігів повнотекстового пошуку
SELECT count(*) FROM posts WHERE tsv @@ plainto_tsquery('simple', 'kubernetes');
