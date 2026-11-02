// Checks that .env is filled and that the database and the Supabase API answer.
// Never prints values; only variable names, status and server facts.
import pg from "pg";

try {
  process.loadEnvFile(".env");
} catch {
  console.error("No encuentro .env en la raíz del proyecto (copia .env.example a .env).");
  process.exit(1);
}

const required = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL"];
const missing = required.filter((k) => !process.env[k]?.trim());
if (missing.length) {
  console.error(`Faltan variables en .env: ${missing.join(", ")}`);
  process.exit(1);
}
console.log("✓ Variables presentes:", required.join(", "));

let failed = false;

// 1. Database
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000,
});
try {
  await client.connect();
  const { rows } = await client.query(
    "select current_database() as db, split_part(version(), ' ', 2) as pg, " +
      "(select count(*) from information_schema.tables where table_schema = 'public') as public_tables",
  );
  const r = rows[0];
  console.log(`✓ Base de datos: PostgreSQL ${r.pg}, base "${r.db}", ${r.public_tables} tablas en public`);
} catch (e) {
  failed = true;
  console.error(`✗ Base de datos: ${e.code ?? ""} ${e.message}`.trim());
  if (e.code === "ENOTFOUND" || e.code === "ETIMEDOUT") {
    console.error("  Pista: usa la cadena del Session pooler (Connect → URI), no la conexión directa.");
  }
  if (e.code === "28P01") console.error("  Pista: contraseña incorrecta en DATABASE_URL.");
} finally {
  await client.end().catch(() => {});
}

// 2. Supabase API keys: each must carry the right role and be accepted by the project.
const base = process.env.SUPABASE_URL.replace(/\/$/, "");
const roleOf = (key) => {
  try {
    return JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role;
  } catch {
    return "desconocido (¿formato nuevo sb_...?)";
  }
};

for (const [label, name, key] of [
  ["anon", "SUPABASE_ANON_KEY", process.env.SUPABASE_ANON_KEY],
  ["service_role", "SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY],
]) {
  const role = roleOf(key);
  if (key.startsWith("eyJ") && role !== label) {
    failed = true;
    console.error(`✗ ${name} trae una llave con rol "${role}", se esperaba "${label}".`);
    continue;
  }
  try {
    // anon cannot read the REST root anymore; the auth settings endpoint accepts any valid key.
    const path = label === "anon" ? "/auth/v1/settings" : "/rest/v1/";
    const res = await fetch(`${base}${path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) console.log(`✓ API Supabase con llave ${label}: aceptada (${res.status})`);
    else {
      failed = true;
      console.error(`✗ API Supabase con llave ${label}: HTTP ${res.status}`);
    }
  } catch (e) {
    failed = true;
    console.error(`✗ API Supabase con llave ${label}: ${e.message}`);
  }
}

process.exit(failed ? 1 : 0);
