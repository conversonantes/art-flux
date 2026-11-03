# 0002 · Supabase es un adaptador: perfiles propios y sesión opaca

**Estado:** Vigente (2 nov 2026)

## Contexto
`arquitectura.md` dice "Postgres es el contrato, no Supabase". Al revisar el código había acoplamiento: las migraciones usaban `auth.uid()` en muchos lugares y claves foráneas a `auth.users`; la API pasaba "el token" a los repositorios (un detalle de Supabase); y nada impedía importar Supabase desde el `core`.

## Decisión
- **Perfiles propios:** las tablas apuntan a `public.profiles`, no a `auth.users`. Un disparador crea el perfil al iniciar sesión por primera vez (copia el nombre de Google).
- **Un solo puente SQL:** `supabase/migrations/*auth_bridge*.sql` es el único archivo que conoce Supabase Auth. Define `current_user_id()`; las políticas y funciones usan esa función, nunca `auth.uid()`.
- **Sesión opaca en TypeScript:** el `core` define `AuthSession { userId, credential }` y `Authenticator`. La credencial solo la lee el adaptador que la emitió; las rutas y los casos de uso usan `userId`.
- **Cableado en `packages/adapters`** (`supabaseWiring`); la raíz de composición (`apps/api/src/server.ts`, `apps/web/src/main.tsx`) elige el proveedor.
- **Guardia automática:** `packages/core/src/architecture.test.ts` falla si el `core` o las rutas importan un SDK de proveedor.

## Consecuencias
- Cambiar de proveedor de identidad = reescribir el archivo puente y un adaptador; el `core` y las rutas no cambian.
- Lo que alguien registró sobrevive si se elimina su cuenta de acceso (el perfil se queda).
- Las políticas RLS siguen asumiendo que el proveedor de base de datos ofrece una forma de saber quién llama; `current_user_id()` es la única pieza que reimplementar.
