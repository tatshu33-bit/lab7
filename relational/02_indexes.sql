-- Індекси, еквівалентні індексам MongoDB (scripts/lib/schemas.js). Створюються ПІСЛЯ завантаження даних.
UPDATE posts SET tsv = setweight(to_tsvector('simple', title), 'A') || setweight(to_tsvector('simple', coalesce(search_stems,'')), 'B') || setweight(to_tsvector('simple', content), 'D');
CREATE INDEX posts_author_date     ON posts (author_id, created_at DESC);
CREATE INDEX posts_category_date   ON posts (category_id, status, published_at DESC);
CREATE INDEX posts_feed            ON posts (published_at DESC, post_id DESC) WHERE status = 'published';
CREATE INDEX post_tags_tag         ON post_tags (tag_id, post_id);          -- пошук постів за тегом(-ами)
CREATE INDEX comments_post         ON comments (post_id);
CREATE INDEX comments_status       ON comments (status, created_at);        -- черга модерації
CREATE INDEX comments_author       ON comments (author_id);
CREATE INDEX comments_parent       ON comments (parent_id);
CREATE INDEX reactions_user        ON reactions (user_id);
CREATE INDEX notifications_inbox   ON notifications (user_id, is_read, created_at DESC);
CREATE INDEX posts_tsv_gin         ON posts USING gin (tsv);                -- повнотекстовий (аналог text-індексу)
CREATE INDEX posts_geo_gist        ON posts USING gist (ll_to_earth(lat, lon));  -- геопошук (аналог 2dsphere)
ANALYZE;
