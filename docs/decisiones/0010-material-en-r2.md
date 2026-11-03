# 0010 · Material: archivos en R2, subida directa y firmada

**Estado:** Vigente · **Historia:** HU-13 (parte a: con conexión)

## Contexto
Desde el celular se registran fotos, notas de voz, archivos, enlaces y notas escritas dentro de una obra. Los archivos no pueden pasar por la API (Netlify Functions tiene tope de tamaño y de tiempo) ni vivir en la base.

## Decisión
- **Pertenece siempre a una obra** (`media.project_id` obligatorio); la sesión y el planteamiento son opcionales y deben ser de esa obra. Un planteamiento implica su sesión. Las sesiones del grupo que aún no son de una obra no muestran «Registrar».
- **Tipos:** `photo`, `audio`, `document` (van a R2), `link` (la URL) y `note` (texto). Los enlaces y las notas nacen listos; los archivos nacen `pending`.
- **Flujo de un archivo:** (1) el cliente genera un `id` y pide registrarlo: la API valida y devuelve una URL de subida firmada; (2) el celular sube **directo a R2** con esa URL; (3) el cliente confirma y el `core` verifica con `head` que el objeto exista y pese lo prometido antes de marcarlo `uploaded`.
- **La firma cubre `content-type` y `content-length`:** R2 rechaza una subida que no sea lo registrado. Vive 10 minutos.
- **Idempotente por `id`:** registrar de nuevo el mismo `id` (un reintento) devuelve el mismo material y una URL nueva; nadie más puede tomar un `id` ajeno.
- **Ruta en R2:** `grupos/{grupo_id}/obras/{obra_id}/{material_id}.{ext}`. La base guarda la ruta, nunca la URL; la lectura se firma por 5 minutos solo si el usuario es del grupo.
- **Límites** (en el `core`, con Zod): foto 10 MB (13b la comprimirá a ~0,5 MB en el celular), audio 15 MB y 3 minutos, documento 20 MB; tipos MIME permitidos por tipo; enlaces `http(s)`; nota hasta 4000 caracteres. Lo largo (video, grabaciones) va como enlace.
- **Lo pendiente solo lo ve su autor.** Quitar es borrado suave por función SQL (autor o admin); el archivo sigue en R2 hasta la limpieza mensual (`scripts/`, pendiente).
- **Puerto `FileStore`** en el `core` (`signUpload`, `signDownload`, `head`, `delete`) con `R2FileStore` en `packages/adapters` (SDK de S3). La API lo recibe al componerse (`apps/api/src/server.ts`).

## Antes de usarlo: crear el bucket y llenar el .env
1. En Cloudflare → R2, crea un bucket **privado** (sin acceso público).
2. En R2 → Manage API tokens, crea un token con permiso *Object Read & Write* limitado a ese bucket. Cloudflare muestra el *Access Key ID* y el *Secret Access Key* una sola vez.
3. Llena en tu `.env` local (nunca en el repo ni en el chat): `R2_ACCOUNT_ID` (está en la URL del panel y en R2 → Overview), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` y `R2_BUCKET`.
4. Reinicia `pnpm dev:api`. Sin esas variables la API arranca igual, pero avisa y el material con archivos no funciona (enlaces y notas sí).
5. `pnpm test:int` incluye una prueba con el bucket real que solo corre cuando las variables están llenas.

## Configuración única del bucket (CORS)
Para que el navegador pueda subir y leer directo, en Cloudflare → R2 → el bucket → Settings → **CORS Policy**, pega:

```json
[
  {
    "AllowedOrigins": ["http://localhost:5173", "https://TU-SITIO.netlify.app"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Cambia `TU-SITIO` por el dominio real cuando exista el despliegue. El bucket **sigue privado**: no actives el acceso público. Las llaves `R2_*` van solo en el `.env`.

## Consecuencias
- 13b agrega la cola sin conexión (IndexedDB), la compresión de fotos y el contador «por subir»; el `id` generado en el celular y la confirmación idempotente ya están pensados para eso.
- `can_view()` (HU-24) reemplazará «miembro del grupo» como regla de lectura.
- Comentarios sobre material (HU-15) y su uso en la bitácora (HU-16) cuelgan de `media.id`.
