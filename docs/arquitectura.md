# Arquitectura · art-flux MVP

Nov 1, 2026 · Santi. Fuente: doc "Arquitectura · art-flux MVP" en Claude Docs (https://claude.ai/artifact/SBxVrUWoaEuXApqX2PRMEb).

## Resumen y principios

art-flux arranca como una PWA en React que habla con una API propia en TypeScript; Supabase pone la base de datos y el login, Cloudflare R2 guarda los archivos y Netlify sirve todo. Costo inicial: 0 USD, sin contar el dominio.

- **Postgres es el contrato, no Supabase.** Esquema en SQL estándar con migraciones versionadas. Lo propio de Supabase (auth, storage) queda detrás de adaptadores.
- **Reglas sencillas en la base, lógica en TypeScript.** RLS responde quién puede *ver*; el `core` responde quién puede *hacer* qué y cuándo.
- **Un solo lugar para la lógica de negocio:** el paquete `core`. La web, la API, los scripts y más adelante un agente lo usan igual.
- **Registrar primero, ordenar después.** Capturar una foto o una nota en el ensayo tiene que funcionar sin señal y en dos toques.
- **Estable y sencillo.** Nada de servidores que mantener ni tecnologías que Santi no maneje, salvo donde ahorren trabajo real.

## Vista general

La lógica vive en el `core`; Supabase y R2 son piezas intercambiables.

```
                         login con Google
        ┌──────────────────────────────────────────────────┐
        │                                                  ▼
┌───────────────┐   JWT   ┌─────────────────────────┐   ┌──────────────────────┐
│ Web PWA       │────────▶│ API · Hono              │   │ Supabase             │
│ React + Vite  │         │ (Netlify Functions)     │   │ Postgres + RLS       │
│ + Tailwind    │         │  ┌───────────────────┐  │   │ Auth con Google      │
│ Estático en   │         │  │ core              │  │SQL│ Proyectos prueba     │
│ Netlify       │         │  │ casos de uso,     │  │──▶│ y real               │
│ Cola en       │         │  │ reglas, Zod       │  │   └──────────────────────┘
│ IndexedDB     │         │  └─────────┬─────────┘  │
└───────┬───────┘         │  ┌─────────▼─────────┐  │   ┌──────────────────────┐
        │                 │  │ adapters          │  │   │ Cloudflare R2        │
        │                 │  │ supabase-js (JWT) │  │──▶│ Bucket privado       │
        │                 │  │ SDK S3 para R2    │  │fir│ Fotos, audios, docs  │
        │                 │  └───────────────────┘  │ma │ Respaldos semanales  │
        │                 └─────────────────────────┘   └──────────▲───────────┘
        │              subida directa con URL firmada              │
        └──────────────────────────────────────────────────────────┘
```

La web habla solo con la API, salvo para el login (Supabase Auth) y para subir archivos (directo a R2 con una URL que firma la API). Toda decisión pasa por el `core`.

## Backend

El backend son tres piezas: un `core` de dominio que no conoce a Supabase, adaptadores que sí lo conocen y una API delgada en Hono que expone los casos de uso.

**`packages/core`.** Tipos y esquemas Zod (compartidos con la web), casos de uso y las interfaces que necesita: `SesionesRepo`, `EjerciciosRepo`, `ArchivosStore`, `Reloj`. Casos de uso del corte 1, por ejemplo:

- `crearSesion`, `agregarPlanteamiento`, `marcarRealizada` (exige estado `planeada`, registra asistentes)
- `registrarHallazgo` (guarda autor por fragmento), `adjuntarMaterial`, `registrarAcuerdos`
- `pedirSubida` (devuelve URL firmada), `exportarMarkdown`

**`packages/adapters`.** Implementaciones con supabase-js y con el SDK de S3 para R2. Cambiar de proveedor = escribir otro adaptador.

**`apps/api`.** Hono con un middleware que valida el JWT de Supabase y crea un cliente de Supabase *con el token del usuario* en cada petición. Así RLS sigue aplicando aunque la API tenga un error. La llave `service_role` solo la usan los scripts de importación y respaldo, nunca las rutas públicas.

**Quién decide qué:**

| Pregunta | Dónde vive | Ejemplo |
| --- | --- | --- |
| ¿Puede *ver* esta fila? | RLS + `puede_ver(usuario, obra)` | Miembro del grupo, o visible en la plataforma |
| ¿Puede *escribir* aquí? | RLS + `es_miembro(usuario, grupo)` | Solo miembros crean sesiones del grupo |
| ¿Puede *hacer esta acción ahora*? | `core` | Solo el admin publica; solo una sesión planeada se marca realizada |
| ¿Los datos son válidos? | Zod en `core` | Fecha, longitud, tipo de material |

Regla práctica: si una política RLS necesita más de un `exists`, la lógica va al `core`.

**Login.** Supabase Auth con Google, directo desde la web. La API solo verifica la credencial. Si algún día se cambia de proveedor, el `core` recibe un `userId` y no sabe de dónde vino.

**Sesión.** El `core` define `AuthSession { userId, credential }` y `Authenticator` (el nombre evita confundirla con una sesión de ensayo). La `credential` (hoy un JWT) es opaca: solo la lee el adaptador que la emitió; las rutas y los casos de uso usan únicamente `userId`. Cada adaptador decide cómo autorizar: el de Supabase reenvía el JWT para que RLS aplique; otro adaptador podría ignorar la credencial y filtrar por `userId`.

**Perfiles.** Las tablas apuntan a `profiles`, no a `auth.users`. Un trigger crea el perfil cuando alguien inicia sesión por primera vez, y `current_user_id()` es la única función SQL que pregunta a Supabase quién llama. Lo que alguien registró sobrevive aunque su cuenta de acceso se elimine o cambie el proveedor.

**Dónde vive Supabase** (y solo ahí):

| Pieza | Lugar |
| --- | --- |
| Quién llama y creación de perfiles (SQL) | `supabase/migrations/*auth_bridge*.sql`, el único archivo que menciona `auth.users` y `auth.uid()` |
| Repositorios y autenticación en TypeScript | `packages/adapters` (`supabaseWiring`) |
| Elección del proveedor | raíz de composición: `apps/api/src/server.ts` |
| Pantalla de login en la web (más adelante) | detrás de una interfaz `AuthClient` en `apps/web` |
| Usuarios de prueba | pruebas de integración (`*.int.test.ts`) |

`packages/core/src/architecture.test.ts` falla si el `core` o las rutas de la API importan un SDK de proveedor.

## Frontend

La web es una SPA en React con Vite, instalable como PWA. Tiene que verse bien en el navegador del celular; instalarla mejora la experiencia, pero no es requisito.

| Pieza | Elección | Para qué |
| --- | --- | --- |
| Base | Vite + React + TypeScript | Build simple y rápido |
| Rutas | TanStack Router | Rutas con tipos tipo repositorio: `/conversonantes/cristina/s02` |
| Datos | TanStack Query | Caché, reintentos, persistencia para ver sin conexión |
| Estilo | Tailwind con los tokens de la dirección B | Colores, tipografías y categorías del canvas |
| PWA | vite-plugin-pwa | Manifest, service worker, instalación |
| Validación | Zod desde `core` | El formulario valida lo mismo que la API |
| Local | IndexedDB (Dexie) | Borradores y cola de subida (ver Registro durante el ensayo) |

**Por qué no Next.** No hay usuarios anónimos ni SEO que cuidar, y ya existe una API: Next agregaría un segundo lugar para la lógica de servidor. Las vistas previas al compartir un enlace se resuelven con un endpoint de la API que devuelva etiquetas Open Graph.

**Puerta abierta a móvil nativo.** Si un día se quiere estar en las tiendas, la misma web se envuelve con Capacitor sin reescribir.

## Registro durante el ensayo

Cada persona captura desde su celular durante el ensayo, todo se guarda primero en el teléfono y se sube solo cuando hay señal; el mismo día se ordena y se escriben los hallazgos, desde el celular o el computador.

**Lo que sabemos (1 nov):** casi siempre hay señal, pero se quiere poder registrar sin ella; cualquiera puede capturar; se capturan fotos y notas; las grabaciones largas van a YouTube y entran como enlace; la PWA instalada es un plus, no un requisito.

**Captura en dos toques.** El botón flotante "Registrar" abre una hoja con: Foto · Nota escrita · Nota de voz corta (hasta 3 min) · Enlace. La captura siempre pertenece a una obra; la sesión y el planteamiento son opcionales. Si hay una sesión de esa obra hoy, se propone por defecto.

**Cómo viaja una captura:**

1. Se guarda al instante en IndexedDB con un id generado en el celular, autor, hora, sesión y estado `pendiente`. Las fotos se comprimen antes (lado mayor 1600 px, ~0,5 MB).
2. Cuando hay red, la cola le pide a la API registrar el material. El id del celular hace la operación idempotente: si se repite, no se duplica.
3. La API devuelve una URL firmada y el celular sube el archivo directo a R2.
4. El celular confirma; la captura pasa a `subida` y se borra de la cola.
5. Si algo falla, reintenta al recuperar la señal, al volver a abrir la app o al volver a la pestaña.

**Material sin asignar de la obra.** Lo capturado sin sesión o sin planteamiento queda como material de la obra, visible y comentable por el equipo. Después, cada quien lo puede ligar a una sesión o a un planteamiento y escribir su parte del hallazgo. Cambio al esquema: en `material`, `obra_id` es obligatorio y `sesion_id` y `planteamiento_id` son opcionales; `comentarios` puede apuntar a un planteamiento o a un material.

**Hallazgos sin conflictos.** Para que varios escriban a la vez, incluso sin señal, cada aporte es un fragmento propio (autor, tipo `encontrado` o `faltó`, texto) en vez de un solo campo que todos editan. Cambio al esquema: una tabla `hallazgo_fragmentos` reemplaza las columnas `hallazgo_encontrado` y `hallazgo_falto`. La autoría por color del diseño sale de ahí directamente.

**Preparar el ensayo.** Al abrir la sesión planeada con señal, la app guarda en el celular la sesión, sus planteamientos y el equipo, para mostrarlos sin conexión.

**Límites conocidos.** En iPhone no hay sincronización en segundo plano: la cola se vacía cuando la app está abierta. Safari puede borrar datos locales de sitios que no se usan en varios días, así que la app avisa con un contador visible ("3 por subir") para no dejar nada pendiente mucho tiempo.

## Archivos

Los archivos van a Cloudflare R2 desde el primer día, en un bucket privado, y se suben y se leen con URLs firmadas de corta duración que entrega la API.

- **Por qué R2 y no Supabase Storage:** el plan gratuito de Supabase trae 1 GB y se corta al llegar al límite; R2 da 10 GB gratis y no cobra descargas. Con el adaptador `ArchivosStore`, volver a Supabase Storage o pasar a S3 es cambiar una pieza.
- **Ruta de cada archivo:** `grupos/{grupo_id}/obras/{obra_id}/{material_id}.{ext}`. La base guarda la ruta, no la URL.
- **Quién puede leer:** la API firma la lectura solo si `puede_ver()` lo permite para esa obra.
- **Tipos y tamaños en el MVP:** fotos comprimidas en el celular; notas de voz hasta 3 min; documentos hasta 20 MB; video y grabaciones largas solo como enlace (YouTube, Drive).
- **Borrado suave:** se marca `borrado_en`; un trabajo mensual borra de R2 lo que lleva más de 30 días marcado.

**Cuánto ocupa un ensayo (estimado):**

| Material | Por sesión |
| --- | --- |
| 15 fotos comprimidas | ~8 MB |
| 3 notas de voz de 3 min | ~3 MB |
| Documentos | ~1 MB |
| **Total** | **~12 MB** |

Con dos ensayos por semana, Conversonantes generaría ~100 MB al mes: los 10 GB gratuitos de R2 alcanzan para varios años de un grupo.

## Infraestructura y costos

Todo arranca en planes gratuitos; el primer pago previsto es Supabase Pro (25 USD al mes) cuando entre un segundo grupo o el registro se vuelva imprescindible.

| Servicio | Plan | Qué incluye (nov 2026) | Qué usamos |
| --- | --- | --- | --- |
| [Supabase](https://supabase.com/pricing.md) | Free | 2 proyectos, 500 MB de base, 1 GB de archivos, 5 GB de salida, 50.000 usuarios al mes | Base de datos y login; proyectos `prueba` y `real` |
| [Cloudflare R2](https://upstash.com/kb/cloudflare-r2-pricing-in-2026-storage-operations-and-real-monthly-bills) | Free | 10 GB, 1 M escrituras, 10 M lecturas, salida gratis | Fotos, audios, documentos, respaldos |
| [Netlify](https://www.hackceleration.com/labs/netlify-pricing) | Free | 300 créditos al mes, dominio con SSL, funciones | Web estática y API (Hono en Netlify Functions) |
| GitHub | Free | Repo y Actions | Código, migraciones, respaldo semanal |

**Riesgos del plan gratuito y cómo se cubren:**

- **Supabase pausa proyectos tras una semana sin actividad.** El proyecto `real` se usa cada semana; si el grupo para (vacaciones), una tarea programada hace una consulta liviana cada día.
- **Supabase Free no tiene respaldos automáticos.** Una GitHub Action hace `pg_dump` semanal del proyecto `real` y lo guarda en R2.
- **Al llegar a un límite de Supabase Free, el servicio se detiene.** Los archivos no van ahí, así que el límite que importa es la base de 500 MB, lejana para texto.
- **Netlify cuenta por créditos.** Cada GB de transferencia gasta 10; la web es liviana y los archivos salen de R2, no de Netlify.

**Cuándo pagar:** Supabase Pro al entrar el segundo grupo (respaldos diarios, sin pausa, 8 GB de base). R2 cobra solo lo que pase de 10 GB, a 0,015 USD por GB. Netlify Personal (9 USD) solo si los créditos no alcanzan.

## Estructura del repo y entornos

Un monorepo con pnpm workspaces; el `core` no importa nada de `adapters` ni de las apps.

```
art-flux/
  packages/core        dominio, Zod, casos de uso, interfaces, exportar a md
  packages/adapters    supabase (repos), r2 (archivos)
  apps/api             Hono: rutas, middleware de JWT, Open Graph
  apps/web             React + Vite + Tailwind + PWA
  supabase/            migraciones SQL, RLS, puede_ver(), es_miembro(), seed
  scripts/             importar md y catálogo semilla, respaldo, limpieza de R2
```

| Entorno | Supabase | R2 | Netlify | Se despliega |
| --- | --- | --- | --- | --- |
| Local | Supabase CLI en Docker | Bucket `art-flux-dev` | `netlify dev` | — |
| Prueba | Proyecto `prueba` | Bucket `art-flux-prueba` | Previews por rama | Cada pull request |
| Real | Proyecto `real` | Bucket `art-flux` | Sitio principal | Al fusionar en `main` |

Las migraciones se aplican primero en prueba y luego en real con `supabase db push`. Pruebas del `core` con Vitest contra un adaptador en memoria; pruebas de RLS con pgTAP en el Supabase local.

## Decisiones y siguientes pasos

**Decidido (1 nov):**

- Las notas de voz cortas (hasta 3 min) entran al corte 1.
- Se adopta `hallazgo_fragmentos` en el esquema.
- Se puede capturar sin sesión, pero siempre dentro de una obra: queda como material sin asignar, comentable.
- El nombre es art-flux.

**Siguientes pasos:**

- [ ] Crear el monorepo y las cuentas (Supabase prueba y real, R2, Netlify)
- [ ] Escribir la primera migración: grupos, miembros, obras, sesiones, planteamientos, material, `puede_ver()`
- [ ] `core` con los casos de uso del corte 1 y su adaptador en memoria
- [ ] API con login de Google y subida firmada a R2
- [ ] Web: inicio, sesión, captura y cola sin conexión
- [ ] Registrar las sesiones 1 y 2 de *Cristina* como prueba real

## Fuentes

- [Supabase Pricing](https://supabase.com/pricing.md)
- [Supabase Pricing: 2026 Guide (Jetadmin)](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/)
- [Cloudflare R2 Pricing in 2026 (Upstash)](https://upstash.com/kb/cloudflare-r2-pricing-in-2026-storage-operations-and-real-monthly-bills)
- [How Much Does Netlify Cost? (Hackceleration)](https://www.hackceleration.com/labs/netlify-pricing)
- [Netlify Pricing and Limits in 2026](https://netli.fyi/blog/netlify-pricing-and-limits)
- [React Native vs Expo vs Capacitor 2026 (PkgPulse)](https://www.pkgpulse.com/guides/react-native-vs-expo-vs-capacitor-cross-platform-mobile-2026)
