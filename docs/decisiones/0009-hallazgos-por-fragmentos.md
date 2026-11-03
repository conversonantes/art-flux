# 0009 · Hallazgos por fragmentos, con autor

**Estado:** Vigente · **Historia:** HU-12 · Parte de lo decidido en `arquitectura.md` («Hallazgos sin conflictos»)

## Contexto
El hallazgo de un planteamiento («qué encontramos», «qué faltó») lo escriben varias personas, a veces a la vez y desde el celular. Un solo campo compartido se pisaría y no diría quién escribió qué.

## Decisión
- El hallazgo es una lista de **fragmentos** (`finding_fragments`): cada uno tiene autor, tipo (`found` | `missing`) y texto de hasta 4000 caracteres. La pantalla pinta cada autor con su color.
- **Solo en sesiones realizadas.** Es el «después»: se abre al marcar la sesión como realizada (HU-11).
- **Cualquier miembro agrega fragmentos**; el responsable del planteamiento no tiene más permiso que los demás.
- **Cada fragmento lo edita y quita solo su autor** (ni el admin): así la autoría es confiable. Lo ajeno se complementa con un fragmento propio.
- El `id` del fragmento lo genera el cliente: guardar dos veces el mismo `id` es la misma operación (guardado automático, reintentos y la futura cola sin conexión de HU-13).
- **Formato con marcas simples**, guardadas como texto: `**negrita**`, `==resaltado==` y listas con `- `. Nunca se guarda HTML; la web convierte las marcas en elementos (sin `dangerouslySetInnerHTML`).
- El tipo de un fragmento no cambia; el borrado es suave y va por función SQL (`remove_finding_fragment`, ver [0006](0006-escrituras-delicadas-por-funcion-sql.md)); de la columna solo se puede editar el texto.

## Consecuencias
- «Falta registrar» (HU-09) pasa a ser real: una sesión realizada está pendiente mientras algún planteamiento no tenga ningún fragmento.
- La bitácora (HU-16) leerá los fragmentos por autor.
- Foto, audio y archivo del diseño (HU-13) se enlazarán después al planteamiento.
