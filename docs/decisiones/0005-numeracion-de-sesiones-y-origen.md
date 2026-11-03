# 0005 · Numeración de sesiones por ámbito y obra de origen

**Estado:** Vigente (2 nov 2026)

## Contexto
Una sesión puede existir antes que la obra: la sesión 1 de *Cristina* fue de búsqueda y de ella nació la obra (HU-05, HU-07). Las sesiones se numeran solas "dentro de la obra o del grupo".

## Decisión
- **Ámbito de la numeración:** dentro de la obra si la sesión tiene obra; dentro del grupo si no. Dos índices únicos parciales lo garantizan en la base.
- **El `core` asigna `máximo + 1` y reintenta** si otra persona tomó el número entre tanto (`SessionNumberTakenError`), igual que con las direcciones de obras.
- **Origen de una obra:** una sesión del grupo puede volverse el origen de una obra. **Pasa a la obra y se renumera** (S01 si es la primera); la obra guarda `origin_session_id`. Es atómico en SQL (`attach_origin_session`).
- **Direcciones:** `/<grupo>/s02` es una sesión del grupo; `/<grupo>/<obra>/s02`, una de la obra. Por eso **una obra no puede tener un slug con la forma `s` + dígitos** (lo impide el `core` y una restricción en la base).
- **Fecha:** una fecha `YYYY-MM-DD` o ninguna (pendiente). Una fecha pasada es válida; "pasada" es solo una etiqueta de la pantalla.
- **Quién:** cualquier miembro planea sesiones; edita el admin o quien la creó. Número, obra y estado no se editan directamente (permisos por columna en la base).

## Consecuencias
- Al adoptar una sesión, la numeración del grupo queda con un hueco (S01 pasó a la obra); la siguiente sesión del grupo usa `máximo + 1` de las que quedan.
- `completed` (sesión realizada) llega con HU-11 y tendrá su propia función.
