import "dotenv/config";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pool } from "./db";

const workspaceDirectory = path.resolve(__dirname, "..", "..");
const sourceDirectory = path.join(workspaceDirectory, "moke");
const mediaDirectory = path.resolve(__dirname, "..", "media", "demo");
const demoPassword = "Demo@123456";
const demoUsers = [
  { name: "Ana Beatriz Souza", bio: "Estudante de tecnologia e apaixonada por inovação." },
  { name: "Bruno Henrique Lima", bio: "Aprendendo desenvolvimento e compartilhando projetos." },
  { name: "Camila Rodrigues Alves", bio: "Curiosa por design, tecnologia e novas ideias." },
  { name: "Daniel Oliveira Costa", bio: "Estudante de TI. Sempre criando e aprendendo." },
  { name: "Eduarda Martins Rocha", bio: "Tecnologia para transformar ideias em soluções." },
  { name: "Felipe Santos Pereira", bio: "Explorando programação, redes e segurança." },
  { name: "Gabriela Ferreira Nunes", bio: "Construindo meu caminho na área de tecnologia." },
  { name: "Heitor Carvalho Mendes", bio: "Estudante e entusiasta de computação." },
  { name: "Isabela Monteiro Barros", bio: "Design, tecnologia e aprendizado contínuo." },
  { name: "João Pedro Ribeiro", bio: "Compartilhando projetos da minha jornada em TI." },
];

function deterministicUuid(value: string) {
  const hash = createHash("md5").update(`insta-senac-demo:${value}`).digest();
  hash[6] = (hash[6] & 0x0f) | 0x30;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function main() {
  const filenames = (await readdir(sourceDirectory))
    .filter((filename) => /\.(?:jpe?g|png|webp|gif)$/i.test(filename))
    .sort((left, right) => left.localeCompare(right, "pt-BR"));
  if (filenames.length < demoUsers.length) {
    throw new Error(`A pasta moke precisa conter pelo menos ${demoUsers.length} imagens; foram encontradas ${filenames.length}.`);
  }

  await mkdir(mediaDirectory, { recursive: true });
  const images = await Promise.all(filenames.map(async (filename, index) => {
    const extension = path.extname(filename).toLowerCase();
    const storedFilename = `demo-${String(index + 1).padStart(2, "0")}${extension}`;
    const sourcePath = path.join(sourceDirectory, filename);
    const size = (await stat(sourcePath)).size;
    if (size > 15 * 1024 * 1024) {
      throw new Error(`A imagem "${filename}" excede o limite de 15 MB.`);
    }
    await copyFile(sourcePath, path.join(mediaDirectory, storedFilename));
    return {
      filename: storedFilename,
      originalFilename: filename,
      mediaUrl: `/media/demo/${storedFilename}`,
    };
  }));

  const passwordHash = await bcrypt.hash(demoPassword, 10);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const category = await client.query(
      `SELECT id FROM categories WHERE is_active
       ORDER BY (name = 'TI/IA/Multimidia') DESC, name, id LIMIT 1`,
    );
    if (!category.rowCount) {
      throw new Error("Não há categorias ativas. Cadastre uma categoria antes de gerar os dados de demonstração.");
    }

    const users: Array<{ id: string; name: string }> = [];
    for (const [index, demoUser] of demoUsers.entries()) {
      const email = `demo${String(index + 1).padStart(2, "0")}@instasenac.local`;
      const enrollmentNumber = `DEMO2026${String(index + 1).padStart(4, "0")}`;
      const result = await client.query(
        `INSERT INTO users (
           id, email, enrollment_number, password_hash, name, bio, photo_url, category_id, role
         ) VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, 'student')
         ON CONFLICT (email) DO UPDATE SET
           password_hash = EXCLUDED.password_hash,
           name = EXCLUDED.name,
           bio = EXCLUDED.bio,
           category_id = EXCLUDED.category_id,
           role = 'student'
         RETURNING id, name`,
        [
          deterministicUuid(`user-${index + 1}`),
          email,
          enrollmentNumber,
          passwordHash,
          demoUser.name,
          demoUser.bio,
          category.rows[0].id,
        ],
      );
      users.push(result.rows[0] as { id: string; name: string });
    }

    for (const [index, image] of images.entries()) {
      const userIndex = index % demoUsers.length;
      const owner = users[userIndex];
      const createdAt = new Date(Date.now() - index * 60 * 60 * 1000);
      const caption = `Projeto de demonstração ${index + 1}: ${path.parse(image.originalFilename).name.replace(/[-_]+/g, " ")}.`;
      await client.query(
        `INSERT INTO posts (id, user_id, media_url, media_type, caption, category_id, created_at)
         VALUES ($1, $2, $3, 'image', $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           user_id = EXCLUDED.user_id,
           media_url = EXCLUDED.media_url,
           media_type = EXCLUDED.media_type,
           caption = EXCLUDED.caption,
           category_id = EXCLUDED.category_id,
           created_at = EXCLUDED.created_at`,
        [
          deterministicUuid(`post-${image.filename}`),
          owner.id,
          image.mediaUrl,
          caption,
          category.rows[0].id,
          createdAt,
        ],
      );
    }
    await client.query("COMMIT");
    console.log(`Dados de demonstração prontos: ${users.length} usuários, ${images.length} publicações.`);
    console.log(`Login de todos: ${demoPassword}`);
    console.log("Usuários: demo01@instasenac.local até demo10@instasenac.local");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Falha ao gerar dados de demonstração:", error);
  process.exitCode = 1;
});
