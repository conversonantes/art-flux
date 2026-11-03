# art-flux

Sistema para registrar procesos de creación teatral con la lógica de un repositorio de código abierto: un grupo es una organización, una obra es un repositorio, una sesión es un commit, un planteamiento es un issue, un ejercicio es un paquete (con referentes como dependencias y derivaciones como forks) y un hallazgo es el changelog. Primer usuario: Conversonantes (Medellín), con la obra *Cristina*.

Lo construye una sola persona (Santi). Prioridad: un MVP estable y sencillo. Ante la duda, la opción más simple que no cierre puertas.

## Documentación

Los docs de diseño viven en `docs/` (exportados de Claude Docs). Léelos antes de cambiar el dominio o el esquema:

- `docs/contexto.md` — la idea, el dominio, decisiones y preguntas abiertas
- `docs/historias-de-usuario.md` — 26 historias en 3 cortes, con criterios de aceptación
- `docs/arquitectura.md` — capas, registro sin conexión, archivos, infraestructura
- `docs/taxonomia.md` — categorías y facetas de ejercicios
- `docs/catalogo-semilla.md` — las 20 fichas semilla (fuente del seed de HU-17)
- `docs/diseno-visual.md` — dirección B, colores de categoría y patrones de interfaz
- `docs/decisiones/` — por qué se decidió lo que se decidió (código en inglés, Supabase como adaptador, invitaciones, numeración de sesiones…). Léelo antes de cambiar una de esas reglas.
- `docs/api.md` — las rutas de la API, quién puede usarlas y qué errores devuelven
- `README.md` de cada paquete (`packages/core`, `packages/adapters`, `apps/api`, `apps/web`) — estructura y reglas de ese paquete
- `docs/pantallas/` — una imagen por pantalla del recorrido B, nombrada por historia (`hu-07-crear-sesion.png`). Para construir una historia, mira su imagen y replícala con los tokens.
- `design/tokens.css` y `design/tailwind.preset.js` — los tokens de diseño en código. Úsalos siempre; no escribas colores ni fuentes a mano.

Si una decisión de código contradice estos docs, pregunta antes de seguir. Las pantallas son anteriores a la arquitectura: si difieren, manda `docs/arquitectura.md`.

## Stack

- **Monorepo:** pnpm workspaces, TypeScript estricto en todo.
- **`packages/core`:** dominio, esquemas Zod, casos de uso y los puertos que necesita (`GroupsRepo`, `ProjectsRepo`, `SessionsRepo`, `ApproachesRepo`, `ArchivosStore`, etc.). No importa nada de Supabase, R2, Hono ni React.
- **`packages/adapters`:** implementaciones con supabase-js y con el SDK de S3 para Cloudflare R2.
- **`apps/api`:** Hono, desplegado en Netlify Functions.
- **`apps/web`:** Vite + React + TanStack Router + TanStack Query + Tailwind + vite-plugin-pwa + Dexie (IndexedDB).
- **`supabase/`:** migraciones SQL, políticas RLS, funciones `is_member()`, `is_admin()` y `current_user_id()` (`can_view()` llega con la visibilidad, HU-24), seed.
- **`scripts/`:** importar markdown y catálogo semilla, respaldo `pg_dump` a R2, limpieza de R2.
- **Servicios:** Supabase (Postgres + Auth con Google), Cloudflare R2 (archivos), Netlify (web y API), GitHub Actions.

## Reglas de arquitectura

1. **Postgres es el contrato, no Supabase.** SQL estándar, migraciones versionadas en `supabase/migrations`. Nada de lógica de negocio en Edge Functions.
2. **RLS responde quién puede ver; el `core` responde quién puede hacer qué.** Las políticas usan `is_member(usuario, grupo)` / `is_admin(usuario, grupo)` (y `can_view()` cuando exista la visibilidad). Si una política necesita más de un `exists`, esa lógica va al `core`.
3. **La API usa el JWT del usuario.** Cada petición crea un cliente de Supabase con el token del usuario para que RLS siga aplicando. La llave `service_role` solo se usa en `scripts/`, nunca en rutas de la API ni en la web.
4. **Una sola fuente de validación:** los esquemas Zod del `core` los usan la API y los formularios de la web.
5. **Archivos:** nunca pasan por la API. La API firma URLs; el cliente sube y descarga directo de R2. Ruta: `grupos/{grupo_id}/obras/{obra_id}/{material_id}.{ext}`. La base guarda la ruta, no la URL.
6. **Sin conexión primero en la captura:** fotos, notas y notas de voz se guardan en IndexedDB con un `id_cliente` (UUID generado en el celular) y una cola las sube. Toda operación de escritura que venga de la cola debe ser idempotente por `id_cliente`.
7. **Borrado suave** (`deleted_at`) en las tablas con contenido. Se hace por una función SQL, no con un `UPDATE` directo (RLS lo impide; ver `docs/decisiones/0006`).
8. **Visibilidad es un nivel** (`grupo | plataforma`, luego `compartido`), nunca un booleano.

## Modelo de datos (resumen)

`grupos`, `miembros` (admin | miembro), `obras`, `obra_equipo`, `sesiones` (planeada | realizada; `obra_id` opcional), `asistentes`, `planteamientos`, `hallazgo_fragmentos` (autor, tipo `encontrado | falto`, texto), `material` (`obra_id` obligatorio; `sesion_id` y `planteamiento_id` opcionales; tipo foto | audio | documento | enlace), `comentarios` (sobre planteamiento o material), `ejercicios`, `categorias`, `etiquetas`, `referentes`, `planteamiento_ejercicios`, `usos_externos`. Detalle en `docs/contexto.md`.

## Convenciones

- **Código en inglés** (tablas, columnas, tipos, funciones, archivos, rutas de API): `session`, `inquiry`, `finding`, `markCompleted`. Los textos de interfaz y la documentación (`docs/`, historias) van en español; el glosario de abajo es el puente.
- Textos de la interfaz en español de Colombia, tono cercano, sin tecnicismos (incluidos los mensajes de validación que ve la gente).
- Interfaz celular primero; objetivos táctiles de 44 px o más.
- Tokens de diseño: fondo `#F4F4F1`, hoja `#FFFFFF`, línea `#DADAD3`, grafito `#1E1E1C`, gris `#63635C`, resaltador `#F1DE45`, verde `#17725A`. Tipografías: Bricolage Grotesque (interfaz), Source Serif 4 (lectura), JetBrains Mono (rutas e identificadores).
- Pruebas: Vitest para el `core` con adaptadores en memoria; pruebas de integración (`pnpm test:int`) contra Supabase que también intentan saltarse el `core` para comprobar que la base lo rechaza.
- **Escrituras delicadas por función SQL** (borrado suave, reordenar, adoptar, aceptar): el `core` decide y la función revalida. Columnas que no deben cambiar a mano se dejan sin permiso de `UPDATE` (ver `docs/decisiones/0006`).
- **Documenta al construir:** una historia no está terminada hasta que su ruta está en `docs/api.md`, su texto en `historias-de-usuario.md` refleja lo construido y, si tomó una decisión de diseño, hay un registro en `docs/decisiones/`.
- **Supabase solo en `packages/adapters` y en `supabase/migrations/*auth_bridge*`.** Nunca en `core` ni en las rutas de `apps/api` (lo vigila `packages/core/src/architecture.test.ts`). El `core` solo conoce un `userId`; las tablas apuntan a `profiles` y las políticas usan `current_user_id()`, no `auth.uid()`.

## Glosario español → inglés (nombres en código)

Los nombres son genéricos a propósito: lo teatral vive en el contenido (taxonomía, catálogo, fichas), no en el esquema, para que el mismo modelo sirva a cualquier proceso creativo. Evitar `prompt` (se confunde con IA).

| Español | Inglés | Español | Inglés |
| --- | --- | --- | --- |
| grupo | `group` | ejercicio | `exercise` |
| miembro | `member` | referente | `reference` |
| obra | `project` | material | `media` |
| sesión | `session` | comentario | `comment` |
| planteamiento | `approach` | acuerdos | `agreements` |
| hallazgo | `finding` | @usuario del grupo | `handle` |
| asistente | `attendee` | equipo | `team` |

El modelo de datos de arriba se describe con los nombres en español; en la base y el código llevan los nombres en inglés de esta tabla.

## Entornos

**Por ahora un solo proyecto de Supabase en la nube** (el de prueba), para no complicar. Se separan `prueba` y `real` cuando haya algo estable; como las migraciones son archivos, crear el segundo es enlazarlo y correr `pnpm migrar`. Mientras haya datos reales ahí: no reiniciar la base, no editar migraciones ya aplicadas y respaldar antes de cambios grandes.

Plan a futuro: Local (Supabase CLI en Docker, `netlify dev`), Prueba (previews por pull request) y Real (se despliega al fusionar en `main`), cada uno con su bucket R2.

Variables de entorno en `.env` en la raíz (nunca en el repo). Ver `.env.example`. A la web solo llegan `SUPABASE_URL` y `SUPABASE_ANON_KEY` (lo define `apps/web/vite.config.ts`).

## Cómo correrlo

```
pnpm install
pnpm check:conexion   # verifica .env, base y llaves de Supabase
pnpm migrar           # aplica supabase/migrations en orden (--dry para simular)
pnpm dev:api          # API en :8787
pnpm dev:web          # web en :5173 (/api se redirige a la API)
pnpm test             # pruebas sin red; pnpm test:int usa el Supabase real
```

## Receta para agregar una historia

1. Lee la historia (`docs/historias-de-usuario.md`) y mira su pantalla (`docs/pantallas/`).
2. **Migración** nueva en `supabase/migrations/` (nunca edites una ya aplicada): tablas, RLS, permisos por columna, funciones si hay escrituras delicadas. `pnpm migrar --dry` y luego `pnpm migrar`.
3. **`packages/core/src/<modulo>/`**: tipos y esquemas, puerto (`repo.ts`), casos de uso, repositorio en memoria y pruebas. Agrega el módulo a `AppDeps` (`deps.ts`).
4. **`packages/adapters`**: el repositorio de Supabase, y la prueba de integración (incluye saltarse el `core`).
5. **`apps/api`**: las rutas (delgadas) y sus pruebas.
6. **`apps/web`**: cliente de la API (`api.ts`), pantallas con los tokens, falsos en `test/fakes.ts` y pruebas.
7. **Docs:** `docs/api.md`, el texto de la historia, y un registro en `docs/decisiones/` si hubo una decisión.
8. `pnpm typecheck`, `pnpm test`, `pnpm test:int` y commit.

## Foco actual: corte 1 · Registrar ya

Objetivo: registrar las sesiones 1 y 2 de *Cristina*. Orden sugerido:

Hecho: HU-01 a HU-08 (entrar con Google, grupos, invitaciones, obras, equipo, sesiones y planteamientos), con base, `core`, API y web.

Sigue, en este orden:

1. **HU-09** · inicio "lo mío" (próximas sesiones, planteamientos a mi cargo, sesiones realizadas sin hallazgos)
2. **HU-11** · marcar la sesión como realizada, con asistentes
3. **HU-12** · hallazgo en fragmentos con autor
4. **HU-13** · material (foto, nota, nota de voz, enlace) con cola sin conexión y subida firmada a R2
5. **HU-14 a HU-16** · acuerdos y tareas, comentarios, bitácora de sesión
6. Pendientes transversales: límite de grupos por persona antes de exponer la API en público; despliegue en Netlify

Fuera del MVP (no construir aún): IA de registro o sugerencias, pedir acceso, talleres, publicar versión, convocatorias, video directo.
