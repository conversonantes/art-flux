# 0007 · Sesión realizada y asistentes

**Estado:** Vigente · **Historia:** HU-11

## Contexto
Marcar una sesión como *realizada* cierra el «antes» (planteamientos congelados) y abre el «después» (hallazgos, material, acuerdos). Hay que guardar quiénes estuvieron, y el estado de la sesión es una columna que nadie puede cambiar a mano (ver [0006](0006-escrituras-delicadas-por-funcion-sql.md)).

## Decisión
- **Cualquier miembro** marca la sesión como realizada, no solo el admin o quien la creó: quien está en la sala suele ser quien registra.
- El cambio de estado y los asistentes se guardan **en un solo paso** con la función SQL `complete_session`; si falla algo, la sesión sigue *planeada*. Después, `set_attendees` corrige los asistentes (también cualquier miembro).
- Los asistentes deben ser miembros del grupo. Se puede marcar a nadie (lista vacía).
- La tabla `attendees` solo se lee desde el cliente; no hay `INSERT/UPDATE/DELETE` directo.
- **No hay vuelta a *planeada***: es el camino de un solo sentido que ya supone el congelamiento de planteamientos (HU-08). Si algún día hace falta, será una decisión nueva.

## Consecuencias
- En la hoja «¿Quiénes estuvieron?» todos los miembros vienen marcados por defecto, como en el diseño; desmarcar es el caso raro.
- La sesión marcada sale de «Próximas sesiones» y aparece en «Falta registrar» del inicio (HU-09).
- Editar fecha, lugar u objetivo sigue como en HU-07 (admin o quien la creó), también en sesiones realizadas.
