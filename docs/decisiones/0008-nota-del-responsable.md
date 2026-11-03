# 0008 · Nota del responsable: «cómo lo planteo»

**Estado:** Vigente · **Historia:** extensión de HU-08

## Contexto
Quien tiene asignado un planteamiento (por ejemplo «Calentamiento») necesita dejar escrito cómo lo va a plantear, para que el grupo sepa qué esperar. Es preparación del «antes» de la sesión.

## Decisión
- Es una **nota por planteamiento** (hasta 2000 caracteres), guardada en la misma fila (`approaches.note`).
- **La lee todo el grupo; la escribe solo el responsable actual** (`owner_id`) y solo mientras la sesión esté *planeada*. Al marcarla realizada queda como estaba, igual que el resto de la planeación.
- Se escribe con la función SQL `set_approach_note` y la columna no tiene permiso de `UPDATE` directo ([0006](0006-escrituras-delicadas-por-funcion-sql.md)): las políticas por fila no pueden distinguir «solo el responsable» a nivel de columna.
- Texto vacío borra la nota. Si el planteamiento se reasigna, la nota se queda y el nuevo responsable puede editarla.
- **No es privada.** Una nota privada pediría otra política de lectura y no aparecería en la bitácora (HU-16).

## Consecuencias
- No reemplaza la «variante por ejercicio» de HU-10 (corte 2): esa se atará a cada ejercicio del catálogo; esta es texto libre.
- Aparece bajo el planteamiento en la pantalla de la sesión; la bitácora (HU-16) la mostrará con el planteamiento.
