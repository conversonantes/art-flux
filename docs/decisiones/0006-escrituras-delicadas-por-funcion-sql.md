# 0006 · Borrado suave y escrituras delicadas por función SQL

**Estado:** Vigente (2 nov 2026)

## Contexto
Al implementar HU-08 (planteamientos) apareció un límite de Postgres: un `UPDATE` bajo RLS exige que la **fila nueva** siga siendo visible por la política de lectura. Marcar `deleted_at` hace que la fila deje de cumplir `deleted_at is null`, y la base responde "new row violates row-level security policy". Es decir, el borrado suave directo es imposible con esa política.

## Decisión
- **El borrado suave pasa por una función SQL** (`remove_approach`, `security definer`) que revalida permisos y marca `deleted_at`. `deleted_at` deja de poder escribirse directamente. La misma regla aplica a futuros borrados suaves.
- **Las columnas que no deben cambiar a mano** (número y obra de una sesión, posición de un planteamiento, estado) no tienen permiso de `UPDATE` para el usuario: `grant update (columnas permitidas)`. Se cambian solo por funciones.
- **Las operaciones que tocan varias filas** (reordenar planteamientos, adoptar una sesión como origen, aceptar una invitación) son **una función SQL atómica**, con bloqueo de fila cuando hay concurrencia.
- **Patrón de las funciones:** el `core` decide y valida (mensajes claros); la función revalida (la base es la barrera de seguridad) y devuelve un código de error propio (`P0002`, `P0004`, `P0005`) que el adaptador traduce a un error del `core`.

## Consecuencias
- Cada escritura delicada tiene dos defensas; las pruebas de integración intentan saltarse el `core` (inserciones y `UPDATE` directos, funciones con datos falsos) y comprueban que la base lo rechaza.
- Más SQL que mantener, a cambio de que un error en una ruta de la API no pueda corromper datos.
