-- Insta Senac - schema inicial. Categorias são dados administráveis, não enum.
CREATE TABLE categories (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         VARCHAR(100) NOT NULL UNIQUE,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email            VARCHAR(320) NOT NULL UNIQUE,
    enrollment_number VARCHAR(40) NOT NULL UNIQUE,
    password_hash    TEXT NOT NULL,
    name             VARCHAR(120) NOT NULL,
    bio              VARCHAR(500) NOT NULL DEFAULT '',
    photo_url        TEXT,
    category_id      UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    role             VARCHAR(10) NOT NULL DEFAULT 'student'
                     CHECK (role IN ('admin', 'student')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE posts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    media_url   TEXT NOT NULL,
    media_type  VARCHAR(5) NOT NULL CHECK (media_type IN ('image', 'video')),
    caption     VARCHAR(2200) NOT NULL DEFAULT '',
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE post_views (
    user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id  UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
    PRIMARY KEY (user_id, post_id)
);

CREATE INDEX posts_feed_idx ON posts (category_id, created_at DESC, id DESC);
CREATE INDEX posts_relevance_idx ON posts (created_at DESC, id DESC);
CREATE INDEX posts_user_idx ON posts (user_id, created_at DESC, id DESC);
CREATE INDEX post_views_post_idx ON post_views (post_id);

CREATE TABLE post_likes (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, post_id)
);

CREATE INDEX post_likes_post_idx ON post_likes (post_id);

CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    body VARCHAR(1000) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX comments_post_idx ON comments (post_id, created_at, id);
CREATE INDEX comments_user_post_idx ON comments (user_id, post_id);

CREATE TABLE post_tags (
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    tagged_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (post_id, tagged_user_id)
);

CREATE INDEX post_tags_user_idx ON post_tags (tagged_user_id, post_id);

CREATE TABLE direct_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (sender_id <> recipient_id)
);

CREATE INDEX direct_messages_participants_idx ON direct_messages (sender_id, recipient_id);
