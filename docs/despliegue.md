# Despliegue en Netlify

La web (Vite) y la API (Hono) se publican juntas en un solo sitio de Netlify: la web como archivos estáticos y toda la API como **una función** que responde en `/api/*`. Por qué así: [decisiones/0011](decisiones/0011-despliegue-netlify.md).

```
https://NOMBRE.netlify.app/            → la web (cualquier ruta carga index.html; el router decide)
https://NOMBRE.netlify.app/api/health  → la API ({"ok":true})
```

Lo que hay en el repositorio ya está listo: [`netlify.toml`](../netlify.toml) (compilación, redirecciones, cabeceras), [`apps/api/src/function.ts`](../apps/api/src/function.ts) (la función, delgada; la lógica vive en `apps/api`) y [`scripts/build-function.mjs`](../scripts/build-function.mjs), que en cada build empaqueta la API **en un solo archivo** (`netlify/functions/api.mjs`, que no se sube a git).

## Variables de entorno del sitio

En Netlify → *Site configuration → Environment variables*:

| Variable | Para qué | Notas |
| --- | --- | --- |
| `SUPABASE_URL` | La web y la API | Pública: llega al navegador |
| `SUPABASE_ANON_KEY` | La web y la API | Pública por diseño (RLS protege los datos) |
| `R2_ACCOUNT_ID` | La API (archivos) | |
| `R2_ACCESS_KEY_ID` | La API (archivos) | |
| `R2_SECRET_ACCESS_KEY` | La API (archivos) | Marcar como **secreta** |
| `R2_BUCKET` | La API (archivos) | |

**No** subas `SUPABASE_SERVICE_ROLE_KEY` ni `DATABASE_URL`: solo las usan los `scripts/` desde tu computador. La API ni siquiera las lee (`apps/api/src/wiring.ts`). Sin las `R2_*` el sitio funciona, pero no se pueden subir fotos, audios ni archivos.

## Primer despliegue

1. **GitHub.** Crea un repositorio **privado**. En la carpeta del proyecto:
   ```
   git remote add origin https://github.com/TU-USUARIO/art-flux.git
   git push -u origin main
   ```
   (`.env` está en `.gitignore`: no se sube. Antes del primer push puedes revisar con `git ls-files | findstr .env`: solo debe aparecer `.env.example`.)
2. **Netlify → Add new site → Import an existing project → GitHub** y elige el repositorio. Netlify lee `netlify.toml`; no hay que escribir comandos. Antes de desplegar, agrega las variables de la tabla.
3. En *Site configuration → Build & deploy → Branches and deploy contexts*: producción = `main`, y **vistas previas de pull requests desactivadas** (hoy hay un solo proyecto de Supabase y un solo bucket: una vista previa tocaría los datos reales).
4. Opcional: *Domain management → Options → Edit site name* para tener una dirección corta, `https://art-flux.netlify.app`.
5. Con la dirección ya definida:
   - **Supabase** → Authentication → URL Configuration: *Site URL* = `https://NOMBRE.netlify.app` y en *Redirect URLs* agrega `https://NOMBRE.netlify.app/**` (deja `http://localhost:5173/**` para desarrollar). Sin esto, el inicio de sesión te devuelve a `localhost:3000`.
   - **Cloudflare R2** → el bucket → Settings → CORS Policy: agrega `https://NOMBRE.netlify.app` a `AllowedOrigins` (el JSON completo está en [decisiones/0010](decisiones/0010-material-en-r2.md)).
6. **Prueba:**
   - `https://NOMBRE.netlify.app/api/health` → `{"ok":true}`.
   - Abre una dirección profunda (por ejemplo `/conversonantes/cristina/s02`) y recarga: debe cargar.
   - Entra con Google desde el celular; registra una foto y una nota de voz (el micrófono funciona porque hay HTTPS).

## Después

Cada `git push` a `main` vuelve a desplegar solo. Las migraciones de la base **no** se aplican en el despliegue: se corren a mano con `pnpm migrar` desde tu computador, antes de publicar código que las necesite.

## Si algo falla

| Síntoma | Qué mirar |
| --- | --- |
| El build falla con «secrets scanning» | Que `SECRETS_SCAN_OMIT_KEYS` siga en `netlify.toml`; y que no hayas puesto una llave secreta con el mismo valor en un archivo del repo |
| `/api/health` devuelve la página de la web | Netlify no ve la función: revisa en *Functions* que aparezca `api` y que el log del build diga «Función empaquetada» |
| La función se cae con «Cannot find module 'hono'» (o cualquier otro módulo) | Netlify estaba empaquetando la función por su cuenta y no encuentra las dependencias del monorepo. Por eso el build la empaqueta con esbuild (`pnpm build:api`) y la prueba `function.bundle.test.ts` la corre sin `node_modules`. Revisa que el *Build command* del panel esté vacío y que se use el de `netlify.toml` |
| La web carga pero todo da error | Faltan `SUPABASE_URL` / `SUPABASE_ANON_KEY` **antes** del build (la web las lee al compilar): agrégalas y vuelve a desplegar |
| Entras con Google y vuelves a `localhost:3000` | La *Site URL* y *Redirect URLs* de Supabase (paso 5) |
| «No se pudo subir el archivo» | El CORS del bucket no incluye la dirección del sitio (paso 5) |
| Subir archivos da «los archivos todavía no están configurados» | Faltan las `R2_*` del sitio |
| «Puedes crear hasta 3 grupos» | Es el tope por persona (`MAX_GROUPS_PER_USER`, en el `core`) |
