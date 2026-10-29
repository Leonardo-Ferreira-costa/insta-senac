import "dotenv/config";
import bcrypt from "bcryptjs";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import { mkdirSync } from "node:fs";
import { open, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import multer, { MulterError } from "multer";
import { z } from "zod";
import { authenticate, requireAdmin } from "./auth";
import { pool } from "./db";

const app = express();
const mediaDirectory = path.resolve(__dirname, "..", "media");
const profileMediaDirectory = path.join(mediaDirectory, "profile");
const maxVideoDurationSeconds = 60;
const maxImageBytes = 15 * 1024 * 1024;
const maxProfileImageBytes = 10 * 1024 * 1024;
const maxMediaBytes = 60 * 1024 * 1024;
const supportedMp4Brands = new Set(["isom", "iso2", "mp41", "mp42", "avc1", "M4V ", "dash", "MSNV"]);
const supportedHeicBrands = new Set(["heic", "heix", "hevc", "hevx", "mif1", "msf1"]);
mkdirSync(mediaDirectory, { recursive: true });
mkdirSync(profileMediaDirectory, { recursive: true });
const corsOrigins = process.env.CORS_ORIGIN?.split(",").map((origin) => origin.trim());
app.use(cors({ origin: corsOrigins?.length ? corsOrigins : true }));
app.use(express.json({ limit: "1mb" }));
app.use("/media", express.static(mediaDirectory, {
  dotfiles: "deny",
  index: false,
  setHeaders: (response, filePath) => {
    if (filePath.endsWith(".heic")) response.setHeader("Content-Type", "image/heic");
  },
}));

class MediaUploadError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: mediaDirectory,
    filename: (_req, _file, callback) => callback(null, randomUUID()),
  }),
  limits: { fileSize: maxMediaBytes, files: 1, fields: 2, parts: 3 },
}).single("media");
const profilePhotoUpload = multer({
  storage: multer.diskStorage({
    destination: profileMediaDirectory,
    filename: (_req, _file, callback) => callback(null, randomUUID()),
  }),
  limits: { fileSize: maxProfileImageBytes, files: 1, fields: 2, parts: 3 },
}).single("media");

async function removeMediaFile(filePath: string) {
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function detectMediaExtension(filePath: string): Promise<string | null> {
  const file = await open(filePath, "r");
  try {
    const signature = Buffer.alloc(12);
    const { bytesRead } = await file.read(signature, 0, signature.length, 0);
    if (bytesRead >= 3 && signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff) {
      return "jpg";
    }
    if (bytesRead >= 6 && ["GIF87a", "GIF89a"].includes(signature.toString("ascii", 0, 6))) {
      return "gif";
    }
    if (bytesRead >= 8 && signature.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      return "png";
    }
    if (bytesRead >= 12 && signature.toString("ascii", 0, 4) === "RIFF" &&
      signature.toString("ascii", 8, 12) === "WEBP") {
      return "webp";
    }
    if (bytesRead >= 12 && signature.toString("ascii", 4, 8) === "ftyp") {
      const brand = signature.toString("ascii", 8, 12);
      if (brand === "qt  ") return "mov";
      if (supportedMp4Brands.has(brand)) return "mp4";
      if (supportedHeicBrands.has(brand)) return "heic";
    }
    return null;
  } finally {
    await file.close();
  }
}

const asyncRoute =
  (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    void handler(req, res, next).catch(next);

app.post(
  "/api/auth/login",
  asyncRoute(async (req, res) => {
    const input = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    const result = await pool.query(
      "SELECT id, password_hash, role FROM users WHERE email = $1",
      [input.email.toLowerCase()],
    );
    const user = result.rows[0] as { id: string; password_hash: string; role: "admin" | "student" } | undefined;
    if (!user || !(await bcrypt.compare(input.password, user.password_hash))) {
      res.status(401).json({ error: "E-mail ou senha inválidos" });
      return;
    }
    if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET não configurada");
    res.json({
      token: jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "12h" }),
      role: user.role,
    });
  }),
);

app.get(
  "/api/feed",
  authenticate,
  asyncRoute(async (req, res) => {
    const parsedLimit = Number(req.query.limit ?? 20);
    const limit = Number.isInteger(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 50) : 20;
    const excludeParam = z.string().max(200000).optional().parse(req.query.exclude);
    const excludedIds = excludeParam
      ? z.array(z.string().uuid()).max(5000).parse(excludeParam.split(","))
      : [];
    const feed = await pool.query(
      `WITH category_consumption AS (
         SELECT p.category_id, SUM(GREATEST(v.duration_seconds, 1))::numeric AS consumed
         FROM post_views v
         JOIN posts p ON p.id = v.post_id
         WHERE v.user_id = $1
         GROUP BY p.category_id
       ),
       total_consumption AS (
         SELECT COALESCE(SUM(consumed), 0)::numeric AS consumed FROM category_consumption
       )
       SELECT p.id, p.user_id, p.media_url, p.media_type, p.caption, p.created_at,
              u.name AS user_name, u.photo_url AS user_photo_url,
              likes.like_count, comments.comment_count,
              EXISTS (
                SELECT 1 FROM post_likes own_like
                WHERE own_like.post_id = p.id AND own_like.user_id = $1
              ) AS liked_by_me,
              comment_preview.comments_preview,
              (views.post_id IS NOT NULL) AS viewed,
              ROUND((
                (1 + likes.like_count + 2 * comments.comment_count + 3 * views_engagement.average_seconds)
                * (
                    CASE WHEN p.user_id = $1 THEN 1
                    ELSE 1 + LEAST(
                        0.5,
                        CASE WHEN affinity.viewer_messages > 0 AND affinity.creator_messages > 0
                             THEN (affinity.viewer_messages + affinity.creator_messages) * 0.01 ELSE 0 END
                        + CASE WHEN affinity.viewer_comments > 0 AND affinity.creator_comments > 0
                               THEN (affinity.viewer_comments + affinity.creator_comments) * 0.05 ELSE 0 END
                        + CASE WHEN affinity.viewer_tags > 0 AND affinity.creator_tags > 0
                               THEN (affinity.viewer_tags + affinity.creator_tags) * 0.03 ELSE 0 END
                      )
                    END
                  )
                * EXP(-0.693147 * GREATEST(EXTRACT(EPOCH FROM (NOW() - p.created_at)), 0) / 3600 / 168)
                * (
                    1 + LEAST(
                      0.2,
                      0.2 * COALESCE(category_consumption.consumed / NULLIF(total_consumption.consumed, 0), 0)
                    )
                  )
                * CASE WHEN views.post_id IS NOT NULL THEN 0.01 ELSE 1 END
              )::numeric, 4)::float8 AS relevance_score
       FROM posts p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN post_views views ON views.post_id = p.id AND views.user_id = $1
       LEFT JOIN category_consumption ON category_consumption.category_id = p.category_id
       CROSS JOIN total_consumption
       CROSS JOIN LATERAL (
         SELECT COUNT(*)::int AS like_count
         FROM post_likes WHERE post_id = p.id
       ) likes
       CROSS JOIN LATERAL (
         SELECT COUNT(*)::int AS comment_count
         FROM comments WHERE post_id = p.id
       ) comments
       CROSS JOIN LATERAL (
         SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'id', recent.id,
               'user_id', recent.user_id,
               'user_name', recent.user_name,
               'body', recent.body,
               'created_at', recent.created_at
             ) ORDER BY recent.created_at DESC, recent.id DESC
           ),
           '[]'::jsonb
         ) AS comments_preview
         FROM (
           SELECT c.id, c.user_id, u.name AS user_name, c.body, c.created_at
           FROM comments c
           JOIN users u ON u.id = c.user_id
           WHERE c.post_id = p.id
           ORDER BY c.created_at DESC, c.id DESC
           LIMIT 3
         ) recent
       ) comment_preview
       CROSS JOIN LATERAL (
         SELECT COALESCE(AVG(duration_seconds), 0)::numeric AS average_seconds
         FROM post_views WHERE post_id = p.id
       ) views_engagement
       CROSS JOIN LATERAL (
         SELECT
           (SELECT COUNT(*)::numeric FROM direct_messages
            WHERE sender_id = $1 AND recipient_id = p.user_id) AS viewer_messages,
           (SELECT COUNT(*)::numeric FROM direct_messages
            WHERE sender_id = p.user_id AND recipient_id = $1) AS creator_messages,
           (SELECT COUNT(*)::numeric FROM comments c JOIN posts target ON target.id = c.post_id
            WHERE c.user_id = $1 AND target.user_id = p.user_id) AS viewer_comments,
           (SELECT COUNT(*)::numeric FROM comments c JOIN posts target ON target.id = c.post_id
            WHERE c.user_id = p.user_id AND target.user_id = $1) AS creator_comments,
           (SELECT COUNT(*)::numeric FROM post_tags t JOIN posts tagged_post ON tagged_post.id = t.post_id
            WHERE t.tagged_user_id = $1 AND tagged_post.user_id = p.user_id) AS viewer_tags,
           (SELECT COUNT(*)::numeric FROM post_tags t JOIN posts tagged_post ON tagged_post.id = t.post_id
            WHERE t.tagged_user_id = p.user_id AND tagged_post.user_id = $1) AS creator_tags
       ) affinity
       WHERE NOT (p.id = ANY($3::uuid[]))
       ORDER BY (views.post_id IS NULL) DESC, relevance_score DESC, p.created_at DESC, p.id DESC
       LIMIT $2`,
      [req.authUser!.id, limit, excludedIds],
    );
    res.json({ posts: feed.rows });
  }),
);

app.get(
  "/api/users/me",
  authenticate,
  asyncRoute(async (req, res) => {
    const result = await pool.query(
      `SELECT u.id, u.email, u.enrollment_number, u.name, u.bio, u.photo_url,
              u.category_id, c.name AS category
       FROM users u JOIN categories c ON c.id = u.category_id WHERE u.id = $1`,
      [req.authUser!.id],
    );
    if (!result.rowCount) {
      res.status(404).json({ error: "Usuário não encontrado" });
      return;
    }
    res.json({ user: result.rows[0] });
  }),
);

app.patch(
  "/api/users/me",
  authenticate,
  asyncRoute(async (req, res) => {
    const input = z.object({
      name: z.string().trim().min(1).max(120),
      bio: z.string().max(500),
      photoUrl: z.union([
        z.string().url(),
        z.string().regex(/^\/media\/profile\/[0-9a-f-]+\.(jpg|png|webp|gif|heic)$/i),
      ]).nullable(),
    }).strict().parse(req.body);
    const result = await pool.query(
      `UPDATE users SET name = $1, bio = $2, photo_url = $3
       WHERE id = $4
       RETURNING id, name, bio, photo_url, category_id`,
      [input.name, input.bio, input.photoUrl, req.authUser!.id],
    );
    res.json({ user: result.rows[0] });
  }),
);

app.post(
  "/api/users/me/profile",
  authenticate,
  profilePhotoUpload,
  asyncRoute(async (req, res) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "Selecione uma foto de perfil." });
      return;
    }

    let storedPath = file.path;
    let profileSaved = false;
    try {
      const extension = await detectMediaExtension(file.path);
      if (!extension || !["jpg", "png", "webp", "gif", "heic"].includes(extension)) {
        throw new MediaUploadError("Formato não suportado. Use JPG, PNG, WebP, GIF ou HEIC.");
      }

      const input = z.object({
        name: z.string().trim().min(1).max(120),
        bio: z.string().max(500),
      }).strict().parse(req.body);
      const storedFilename = `${file.filename}.${extension}`;
      const finalPath = path.join(profileMediaDirectory, storedFilename);
      await rename(file.path, finalPath);
      storedPath = finalPath;

      const photoUrl = `/media/profile/${storedFilename}`;
      const client = await pool.connect();
      let transactionOpen = false;
      let committed = false;
      let previousFilename: string | undefined;
      let user: Record<string, unknown> | undefined;
      try {
        await client.query("BEGIN");
        transactionOpen = true;
        const previous = await client.query(
          "SELECT photo_url FROM users WHERE id = $1 FOR UPDATE",
          [req.authUser!.id],
        );
        if (!previous.rowCount) {
          throw new MediaUploadError("Usuário não encontrado", 404);
        }
        const previousPhoto = previous.rows[0].photo_url as string | null;
        previousFilename = previousPhoto?.match(/^\/media\/profile\/([0-9a-f-]+\.(?:jpg|png|webp|gif|heic))$/i)?.[1];
        const result = await client.query(
          `UPDATE users SET name = $1, bio = $2, photo_url = $3
           WHERE id = $4
           RETURNING id, email, enrollment_number, name, bio, photo_url, category_id`,
          [input.name, input.bio, photoUrl, req.authUser!.id],
        );
        user = result.rows[0] as Record<string, unknown>;
        await client.query("COMMIT");
        transactionOpen = false;
        committed = true;
        profileSaved = true;
      } finally {
        try {
          if (transactionOpen) await client.query("ROLLBACK");
        } finally {
          client.release();
        }
      }
      if (!committed || !user) {
        throw new Error("Não foi possível salvar a foto de perfil.");
      }
      if (previousFilename && previousFilename !== storedFilename) {
        await removeMediaFile(path.join(profileMediaDirectory, previousFilename));
      }
      res.json({ user });
    } catch (error) {
      if (!profileSaved) {
        await removeMediaFile(storedPath);
      }
      throw error;
    }
  }),
);

app.get(
  "/api/users/:id/profile",
  authenticate,
  asyncRoute(async (req, res) => {
    const result = await pool.query(
      `SELECT u.id, u.name, u.bio, u.photo_url, c.name AS category
       FROM users u JOIN categories c ON c.id = u.category_id
       WHERE u.id = $1 AND u.role = 'student'`,
      [req.params.id],
    );
    if (!result.rowCount) {
      res.status(404).json({ error: "Perfil não encontrado" });
      return;
    }
    res.json({ user: result.rows[0] });
  }),
);

app.get(
  "/api/users/:id/posts",
  authenticate,
  asyncRoute(async (req, res) => {
    const result = await pool.query(
      `SELECT id, user_id, media_url, media_type, caption, created_at
       FROM posts WHERE user_id = $1 ORDER BY created_at DESC, id DESC`,
      [req.params.id],
    );
    res.json({ posts: result.rows });
  }),
);

app.get(
  "/api/posts/:id",
  authenticate,
  asyncRoute(async (req, res) => {
    const result = await pool.query(
      `SELECT p.id, p.user_id, p.media_url, p.media_type, p.caption, p.created_at,
              u.name AS user_name, u.photo_url AS user_photo_url,
              (SELECT COUNT(*)::int FROM post_likes WHERE post_id = p.id) AS like_count,
              (SELECT COUNT(*)::int FROM comments WHERE post_id = p.id) AS comment_count,
              EXISTS (
                SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = $2
              ) AS liked_by_me
       FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = $1`,
      [req.params.id, req.authUser!.id],
    );
    if (!result.rowCount) {
      res.status(404).json({ error: "Publicação não encontrada" });
      return;
    }
    res.json({ post: result.rows[0] });
  }),
);

app.post(
  "/api/posts/:id/view",
  authenticate,
  asyncRoute(async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { durationSeconds } = z.object({
      durationSeconds: z.number().int().min(0).max(3600).default(0),
    }).strict().parse(req.body);
    const result = await pool.query(
      `INSERT INTO post_views (user_id, post_id, duration_seconds)
       SELECT $1, id, $3 FROM posts WHERE id = $2
       ON CONFLICT (user_id, post_id) DO UPDATE
         SET viewed_at = NOW(),
             duration_seconds = post_views.duration_seconds + EXCLUDED.duration_seconds
       RETURNING post_id`,
      [req.authUser!.id, id, durationSeconds],
    );
    if (!result.rowCount) {
      res.status(404).json({ error: "Publicação não encontrada" });
      return;
    }
    res.status(204).end();
  }),
);

app.post(
  "/api/posts/:id/like",
  authenticate,
  asyncRoute(async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const post = await client.query("SELECT id FROM posts WHERE id = $1 FOR UPDATE", [id]);
      if (!post.rowCount) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Publicação não encontrada" });
        return;
      }
      const deleted = await client.query(
        "DELETE FROM post_likes WHERE user_id = $1 AND post_id = $2 RETURNING user_id",
        [req.authUser!.id, id],
      );
      const liked = !deleted.rowCount;
      if (liked) {
        await client.query(
          "INSERT INTO post_likes (user_id, post_id) VALUES ($1, $2)",
          [req.authUser!.id, id],
        );
      }
      const count = await client.query(
        "SELECT COUNT(*)::int AS like_count FROM post_likes WHERE post_id = $1",
        [id],
      );
      await client.query("COMMIT");
      res.json({ liked_by_me: liked, like_count: count.rows[0].like_count });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

app.get(
  "/api/posts/:id/comments",
  authenticate,
  asyncRoute(async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { limit, beforeCreatedAt, beforeId } = z.object({
      limit: z.coerce.number().int().min(1).max(50).default(30),
      beforeCreatedAt: z.string().datetime({ offset: true }).optional(),
      beforeId: z.string().uuid().optional(),
    }).refine(
      ({ beforeCreatedAt, beforeId }) => Boolean(beforeCreatedAt) === Boolean(beforeId),
      "beforeCreatedAt e beforeId devem ser informados juntos",
    ).parse(req.query);
    const post = await pool.query("SELECT id FROM posts WHERE id = $1", [id]);
    if (!post.rowCount) {
      res.status(404).json({ error: "Publicação não encontrada" });
      return;
    }
    const [page, count] = await Promise.all([
      pool.query(
        `SELECT c.id, c.user_id, c.body, c.created_at, u.name AS user_name
         FROM comments c
         JOIN users u ON u.id = c.user_id
         WHERE c.post_id = $1
           AND ($2::timestamptz IS NULL OR (c.created_at, c.id) < ($2::timestamptz, $3::uuid))
         ORDER BY c.created_at DESC, c.id DESC
         LIMIT $4`,
        [id, beforeCreatedAt ?? null, beforeId ?? null, limit],
      ),
      pool.query("SELECT COUNT(*)::int AS total_count FROM comments WHERE post_id = $1", [id]),
    ]);
    const totalCount = count.rows[0].total_count as number;
    res.json({
      comments: page.rows,
      total_count: totalCount,
      has_more: page.rows.length === limit,
    });
  }),
);

app.post(
  "/api/posts/:id/comments",
  authenticate,
  asyncRoute(async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { body } = z.object({ body: z.string().trim().min(1).max(1000) }).strict().parse(req.body);
    const result = await pool.query(
      `WITH inserted AS (
         INSERT INTO comments (user_id, post_id, body)
         SELECT $1, id, $3 FROM posts WHERE id = $2
         RETURNING id, user_id, body, created_at
       )
       SELECT inserted.id, inserted.user_id, inserted.body, inserted.created_at,
              users.name AS user_name
       FROM inserted JOIN users ON users.id = inserted.user_id`,
      [req.authUser!.id, id, body],
    );
    if (!result.rowCount) {
      res.status(404).json({ error: "Publicação não encontrada" });
      return;
    }
    res.status(201).json({ comment: result.rows[0] });
  }),
);

app.post(
  "/api/posts",
  authenticate,
  mediaUpload,
  asyncRoute(async (req, res) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "Selecione uma imagem ou um vídeo para publicar." });
      return;
    }

    let mediaFilePath = file.path;
    try {
      const extension = await detectMediaExtension(file.path);
      if (!extension) {
        throw new MediaUploadError("Não foi possível identificar o formato do arquivo.");
      }
      const isImage = ["jpg", "png", "webp", "gif", "heic"].includes(extension);
      const isVideo = ["mp4", "mov"].includes(extension);
      if (!isImage && !isVideo) {
        throw new MediaUploadError("Formato não suportado. Use JPG, PNG, WebP, GIF, HEIC, MP4 ou MOV.");
      }
      if (isImage && file.size > maxImageBytes) {
        throw new MediaUploadError("Imagens devem ter no máximo 15 MB.", 413);
      }

      const storedFilename = `${file.filename}.${extension}`;
      const storedPath = path.join(mediaDirectory, storedFilename);
      await rename(file.path, storedPath);
      mediaFilePath = storedPath;

      const input = z.object({
        caption: z.string().max(2200).default(""),
        durationSeconds: z.preprocess(
          (value) => value === undefined || value === "" ? undefined : Number(value),
          z.number().finite().nonnegative().optional(),
        ),
      }).strict().parse(req.body);
      const mediaType = isVideo ? "video" : "image";
      if (mediaType === "video" &&
        (input.durationSeconds == null || input.durationSeconds > maxVideoDurationSeconds)) {
        throw new MediaUploadError("Vídeos devem ter duração verificada de no máximo 60 segundos.");
      }

      const mediaUrl = `/media/${storedFilename}`;
      const result = await pool.query(
        `INSERT INTO posts (user_id, media_url, media_type, caption, category_id)
         SELECT id, $2, $3, $4, category_id FROM users WHERE id = $1
         RETURNING id, user_id, media_url, media_type, caption, created_at`,
        [req.authUser!.id, mediaUrl, mediaType, input.caption],
      );
      if (!result.rowCount) {
        throw new MediaUploadError("Usuário não encontrado", 404);
      }
      res.status(201).json({ post: result.rows[0] });
    } catch (error) {
      await removeMediaFile(mediaFilePath);
      throw error;
    }
  }),
);

app.get(
  "/api/admin/categories",
  authenticate,
  requireAdmin,
  asyncRoute(async (_req, res) => {
    const result = await pool.query("SELECT id, name FROM categories WHERE is_active ORDER BY name");
    res.json({ categories: result.rows });
  }),
);

app.post(
  "/api/admin/categories",
  authenticate,
  requireAdmin,
  asyncRoute(async (req, res) => {
    const input = z.object({ name: z.string().trim().min(1).max(100) }).parse(req.body);
    const result = await pool.query(
      `INSERT INTO categories (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET is_active = TRUE
       RETURNING id, name`,
      [input.name],
    );
    res.status(201).json({ category: result.rows[0] });
  }),
);

app.delete(
  "/api/admin/categories/:id",
  authenticate,
  requireAdmin,
  asyncRoute(async (req, res) => {
    const result = await pool.query(
      "UPDATE categories SET is_active = FALSE WHERE id = $1 AND is_active RETURNING id",
      [req.params.id],
    );
    if (!result.rowCount) {
      res.status(404).json({ error: "Categoria não encontrada" });
      return;
    }
    res.status(204).end();
  }),
);

app.get(
  "/api/admin/students",
  authenticate,
  requireAdmin,
  asyncRoute(async (req, res) => {
    const { search } = z.object({
      search: z.string().trim().max(120).default(""),
    }).parse(req.query);
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.enrollment_number, c.name AS category_name
       FROM users u
       JOIN categories c ON c.id = u.category_id
       WHERE u.role = 'student'
         AND ($1 = '' OR u.name ILIKE '%' || $1 || '%'
           OR u.email ILIKE '%' || $1 || '%'
           OR u.enrollment_number ILIKE '%' || $1 || '%')
       ORDER BY u.name, u.id`,
      [search],
    );
    res.json({ students: result.rows });
  }),
);

app.delete(
  "/api/admin/students/:id",
  authenticate,
  requireAdmin,
  asyncRoute(async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const result = await pool.query(
      "DELETE FROM users WHERE id = $1 AND role = 'student' RETURNING id",
      [id],
    );
    if (!result.rowCount) {
      res.status(404).json({ error: "Aluno não encontrado" });
      return;
    }
    res.status(204).end();
  }),
);

app.post(
  "/api/admin/students",
  authenticate,
  requireAdmin,
  asyncRoute(async (req, res) => {
    const input = z.object({
      email: z.string().email(),
      enrollmentNumber: z.string().trim().min(1).max(40),
      password: z.string().min(8),
      name: z.string().trim().min(1).max(120),
      bio: z.string().max(500).optional(),
      categoryId: z.string().uuid(),
    }).parse(req.body);
    const hash = await bcrypt.hash(input.password, 12);
    const result = await pool.query(
      `INSERT INTO users (email, enrollment_number, password_hash, name, bio, category_id)
       SELECT $1, $2, $3, $4, $5, id FROM categories WHERE id = $6 AND is_active
       RETURNING id, email, enrollment_number, name, category_id`,
      [input.email.toLowerCase(), input.enrollmentNumber, hash, input.name, input.bio ?? "", input.categoryId],
    );
    if (!result.rowCount) {
      res.status(400).json({ error: "Categoria não encontrada ou inativa" });
      return;
    }
    res.status(201).json({ student: result.rows[0] });
  }),
);

app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof MulterError) {
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    res.status(status).json({
      error: error.code === "LIMIT_FILE_SIZE"
        ? req.path === "/api/users/me/profile"
          ? "A foto de perfil deve ter no máximo 10 MB."
          : "A mídia deve ter no máximo 60 MB."
        : "Não foi possível receber a mídia.",
    });
    return;
  }
  if (error instanceof MediaUploadError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: "Dados inválidos", details: error.issues });
    return;
  }
  const pgError = error as { code?: string };
  if (pgError.code === "23505") {
    res.status(409).json({ error: "E-mail, matrícula ou categoria já cadastrados" });
    return;
  }
  if (pgError.code === "23503") {
    res.status(409).json({ error: "Categoria em uso ou inexistente" });
    return;
  }
  console.error(error);
  res.status(500).json({ error: "Erro interno do servidor" });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Insta Senac API ouvindo na porta ${port}`));
