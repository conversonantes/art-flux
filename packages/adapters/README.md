# @art-flux/adapters

Implementaciones de los puertos del `core` con **Supabase** (`supabase-js`). Aquí, y en `supabase/migrations/*auth_bridge*`, es el único lugar donde se menciona Supabase.

## Qué hay

- `groups.ts`, `invites.ts`, `projects.ts`, `sessions.ts`, `approaches.ts`: un repositorio por módulo del `core` (`Supabase<Modulo>Repo`). Convierten filas (`snake_case`) en tipos del `core` y errores de Postgres en errores del `core`.
- `supabase.ts`: `supabaseWiring(env)` → `{ authenticator, depsFor(sesión) }`. Cada petición recibe un cliente **con el token de esa persona**, así RLS aplica aunque una ruta tenga un error. Solo usa la llave `anon`; la `service_role` nunca se usa en una ruta.

## Reglas

- Los repositorios reciben un `SupabaseClient` ya autenticado como el usuario.
- Los códigos de error de las funciones SQL se traducen aquí: `23505` (único) → `HandleTakenError`/`SlugTakenError`/`SessionNumberTakenError`; `P0002` → enlace no válido; `P0004` → no permitido; `P0005` → la lista cambió.
- Un borrado suave o un cambio de varias filas es una **función SQL** (`supabase.rpc`), no un `update` directo (ver `docs/decisiones/0006`).

## Pruebas

```
pnpm --filter @art-flux/adapters test:int
```

Son **de integración contra tu proyecto real de Supabase** (necesitan el `.env`). Crean usuarios temporales `art-flux-test-…`, ejercitan los casos de uso con sus propios tokens, intentan saltarse el `core` para comprobar que la base lo rechaza, y limpian todo al terminar. `pnpm test` normal no las ejecuta.
