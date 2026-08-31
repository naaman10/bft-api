import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import "dotenv/config";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../migrations"
);

function statementsFrom(sql: string): string[] {
  return sql
    .split(";")
    .map((statement) =>
      statement
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim()
    )
    .filter(Boolean);
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const sql = neon(connectionString);

  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const applied = await sql`
      SELECT 1 FROM schema_migrations WHERE id = ${file}
    `;

    if (applied.length > 0) {
      console.log(`skip ${file}`);
      continue;
    }

    const contents = await readFile(join(migrationsDir, file), "utf8");
    console.log(`apply ${file}`);

    for (const statement of statementsFrom(contents)) {
      await sql.query(statement);
    }

    await sql`INSERT INTO schema_migrations (id) VALUES (${file})`;
  }

  console.log("migrations complete");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
