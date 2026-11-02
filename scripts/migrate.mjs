// Applies supabase/migrations/*.sql in order against DATABASE_URL.
// Each file runs in its own transaction and is recorded in public.schema_migrations.
// A recorded file is never re-run; if its content changed since, the script stops.
//
//   node scripts/migrate.mjs --dry   list what would be applied
//   node scripts/migrate.mjs         apply pending migrations
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const dry = process.argv.includes("--dry");

try {
  process.loadEnvFile(".env");
} catch {
  console.error("No encuentro .env en la raíz del proyecto.");
  process.exit(1);
}
if (!process.env.DATABASE_URL?.trim()) {
  console.error("Falta DATABASE_URL en .env");
  process.exit(1);
}

const dir = "supabase/migrations";
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const sha = (text) => createHash("sha256").update(text).digest("hex");

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000,
});
await client.connect();

try {
  // --dry must not write anything, not even the bookkeeping table.
  const exists = (await client.query("select to_regclass('public.schema_migrations') as t")).rows[0].t;
  if (!dry) {
    await client.query(`
      create table if not exists public.schema_migrations (
        name        text primary key,
        checksum    text not null,
        applied_at  timestamptz not null default now()
      )`);
  }
  const { rows } =
    exists || !dry
      ? await client.query("select name, checksum from public.schema_migrations")
      : { rows: [] };
  const applied = new Map(rows.map((r) => [r.name, r.checksum]));

  let pending = 0;
  for (const name of files) {
    const sql = readFileSync(join(dir, name), "utf8");
    const checksum = sha(sql);

    if (applied.has(name)) {
      if (applied.get(name) !== checksum) {
        console.error(`✗ ${name} ya se aplicó pero el archivo cambió. Crea una migración nueva en vez de editarla.`);
        process.exit(1);
      }
      console.log(`· ${name} (ya aplicada)`);
      continue;
    }

    pending++;
    if (dry) {
      console.log(`→ ${name} (pendiente)`);
      continue;
    }

    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into public.schema_migrations (name, checksum) values ($1, $2)", [name, checksum]);
      await client.query("commit");
      console.log(`✓ ${name} aplicada`);
    } catch (e) {
      await client.query("rollback");
      console.error(`✗ ${name} falló y se revirtió: ${e.message}`);
      process.exit(1);
    }
  }
  if (!pending) console.log("Nada pendiente.");
  else if (dry) console.log(`${pending} migración(es) pendiente(s). Corre sin --dry para aplicarlas.`);
} finally {
  await client.end();
}
