BEGIN;

DO $$
BEGIN
    IF to_regclass('public.post_views') IS NULL
       AND to_regclass('public.user_views') IS NOT NULL THEN
        ALTER TABLE user_views RENAME TO post_views;
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS post_views (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
    PRIMARY KEY (user_id, post_id)
);

ALTER TABLE post_views
    ADD COLUMN IF NOT EXISTS duration_seconds INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS post_views_post_idx ON post_views (post_id);
DROP INDEX IF EXISTS user_views_post_idx;
CREATE INDEX IF NOT EXISTS posts_relevance_idx ON posts (created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS post_likes (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS post_likes_post_idx ON post_likes (post_id);

CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    body VARCHAR(1000) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS comments_post_idx ON comments (post_id, created_at, id);
CREATE INDEX IF NOT EXISTS comments_user_post_idx ON comments (user_id, post_id);

CREATE TABLE IF NOT EXISTS post_tags (
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    tagged_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (post_id, tagged_user_id)
);

CREATE INDEX IF NOT EXISTS post_tags_user_idx ON post_tags (tagged_user_id, post_id);

CREATE TABLE IF NOT EXISTS direct_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (sender_id <> recipient_id)
);

CREATE INDEX IF NOT EXISTS direct_messages_participants_idx
    ON direct_messages (sender_id, recipient_id);

COMMIT;
