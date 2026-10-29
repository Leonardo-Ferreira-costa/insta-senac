import "dotenv/config";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool } from "./db";

async function main() {
  const inputSchema = z.object({
    email: z.string().email(),
    password: z.string().min(12),
    name: z.string().min(1),
    enrollmentNumber: z.string().min(1),
    categoryName: z.string().default("Administração"),
  });
  const result = inputSchema.safeParse({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    name: process.env.ADMIN_NAME,
    enrollmentNumber: process.env.ADMIN_ENROLLMENT_NUMBER,
    categoryName: process.env.ADMIN_CATEGORY ?? "Administração",
  });
  if (!result.success) {
    const issues = result.error.issues
      .map(({ path, message }) => `- ${path.join(".")}: ${message}`)
      .join("\n");
    throw new Error(`Verifique as variáveis ADMIN_* no arquivo .env:\n${issues}`);
  }
  const input = result.data;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const category = await client.query(
      `INSERT INTO categories (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET is_active = TRUE RETURNING id`,
      [input.categoryName],
    );
    const hash = await bcrypt.hash(input.password, 12);
    await client.query(
      `INSERT INTO users (email, enrollment_number, password_hash, name, category_id, role)
       VALUES ($1, $2, $3, $4, $5, 'admin')`,
      [input.email.toLowerCase(), input.enrollmentNumber, hash, input.name, category.rows[0].id],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Não foi possível criar o administrador:", error);
  process.exitCode = 1;
});
