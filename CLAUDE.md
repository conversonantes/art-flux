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
- `docs/pantallas/` — una imagen por pantalla del recorrido B, nombrada por historia (`hu-07-crear-sesion.png`). Para construir una historia, mira su imagen y replícala con los tokens.
- `design/tokens.css` y `design/tailwind.preset.js` — los tokens de diseño en código. Úsalos siempre; no escribas colores ni fuentes a mano.

Si una decisión de código contradice estos docs, pregunta antes de seguir. Las pantallas son anteriores a la arquitectura: si difieren, manda `docs/arquitectura.md`.

## Stack

- **Monorepo:** pnpm workspaces, TypeScript estricto en todo.
- **`packages/core`:** dominio, esquemas Zod, casos de uso, interfaces (`SesionesRepo`, `ArchivosStore`, etc.). No importa nada de Supabase, R2, Hono ni React.
- **`packages/adapters`:** implementaciones con supabase-js y con el SDK de S3 para Cloudflare R2.
- **`apps/api`:** Hono, desplegado en Netlify Functions.
- **`apps/web`:** Vite + React + TanStack Router + TanStack Query + Tailwind + vite-plugin-pwa + Dexie (IndexedDB).
- **`supabase/`:** migraciones SQL, políticas RLS, funciones `puede_ver()` y `es_miembro()`, seed.
- **`scripts/`:** importar markdown y catálogo semilla, respaldo `pg_dump` a R2, limpieza de R2.
- **Servicios:** Supabase (Postgres + Auth con Google), Cloudflare R2 (archivos), Netlify (web y API), GitHub Actions.

## Reglas de arquitectura

1. **Postgres es el contrato, no Supabase.** SQL estándar, migraciones versionadas en `supabase/migrations`. Nada de lógica de negocio en Edge Functions.
2. **RLS responde quién puede ver; el `core` responde quién puede hacer qué.** Las políticas usan `puede_ver(usuario, obra)` o `es_miembro(usuario, grupo)`. Si una política necesita más de un `exists`, esa lógica va al `core`.
3. **La API usa el JWT del usuario.** Cada petición crea un cliente de Supabase con el token del usuario para que RLS siga aplicando. La llave `service_role` solo se usa en `scripts/`, nunca en rutas de la API ni en la web.
4. **Una sola fuente de validación:** los esquemas Zod del `core` los usan la API y los formularios de la web.
5. **Archivos:** nunca pasan por la API. La API firma URLs; el cliente sube y descarga directo de R2. Ruta: `grupos/{grupo_id}/obras/{obra_id}/{material_id}.{ext}`. La base guarda la ruta, no la URL.
6. **Sin conexión primero en la captura:** fotos, notas y notas de voz se guardan en IndexedDB con un `id_cliente` (UUID generado en el celular) y una cola las sube. Toda operación de escritura que venga de la cola debe ser idempotente por `id_cliente`.
7. **Borrado suave** (`borrado_en`) en todas las tablas.
8. **Visibilidad es un nivel** (`grupo | plataforma`, luego `compartido`), nunca un booleano.

## Modelo de datos (resumen)

`grupos`, `miembros` (admin | miembro), `obras`, `obra_equipo`, `sesiones` (planeada | realizada; `obra_id` opcional), `asistentes`, `planteamientos`, `hallazgo_fragmentos` (autor, tipo `encontrado | falto`, texto), `material` (`obra_id` obligatorio; `sesion_id` y `planteamiento_id` opcionales; tipo foto | audio | documento | enlace), `comentarios` (sobre planteamiento o material), `ejercicios`, `categorias`, `etiquetas`, `referentes`, `planteamiento_ejercicios`, `usos_externos`. Detalle en `docs/contexto.md`.

## Convenciones

- **Nombres del dominio en español** (tablas, tipos, casos de uso): `sesion`, `planteamiento`, `hallazgo`, `marcarRealizada`. Código técnico genérico en inglés está bien (`useQuery`, `fetchJson`).
- Textos de la interfaz en español de Colombia, tono cercano, sin tecnicismos.
- Interfaz celular primero; objetivos táctiles de 44 px o más.
- Tokens de diseño: fondo `#F4F4F1`, hoja `#FFFFFF`, línea `#DADAD3`, grafito `#1E1E1C`, gris `#63635C`, resaltador `#F1DE45`, verde `#17725A`. Tipografías: Bricolage Grotesque (interfaz), Source Serif 4 (lectura), JetBrains Mono (rutas e identificadores).
- Pruebas: Vitest para el `core` con adaptadores en memoria; pgTAP para RLS.

## Entornos

- **Local:** Supabase CLI en Docker, bucket R2 `art-flux-dev`, `netlify dev`.
- **Prueba:** proyecto Supabase `prueba`, bucket `art-flux-prueba`, previews por pull request.
- **Real:** proyecto Supabase `real`, bucket `art-flux`, se despliega al fusionar en `main`.

Variables de entorno en `.env.local` (nunca en el repo). Ver `.env.example`.

## Foco actual: corte 1 · Registrar ya

Objetivo: registrar las sesiones 1 y 2 de *Cristina*. Orden sugerido:

1. Monorepo, cuentas y entornos
2. Primera migración: grupos, miembros, obras, obra_equipo, sesiones, asistentes, planteamientos, hallazgo_fragmentos, material, comentarios, `puede_ver()`, `es_miembro()`
3. `core` con los casos de uso del corte 1 y su adaptador en memoria
4. API con login de Google (verificación del JWT) y subida firmada a R2
5. Web: inicio "lo mío", obra, sesión, captura y cola sin conexión, bitácora

Fuera del MVP (no construir aún): IA de registro o sugerencias, pedir acceso, talleres, publicar versión, convocatorias, video directo.
