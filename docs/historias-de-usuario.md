# Historias de usuario · art-flux MVP

Nov 1, 2026 · @anderson

El MVP permite que un grupo, Conversonantes, planee y registre sus sesiones, construya su catálogo de ejercicios con referentes y publique lo que decida. Son 26 historias en seis épicas, entregadas en tres cortes. El primer corte basta para subir las sesiones 1 y 2 de *Cristina*.

## Principios

1. **Registrar primero.** Si una historia no ayuda a que una sesión quede registrada la misma semana del ensayo, espera. El riesgo principal del proyecto es que el grupo no registre.
2. **Varios grupos, dos permisos.** Una persona puede pertenecer a varios grupos, con un permiso en cada uno; frente a los demás grupos es exploradora. Los permisos son admin y miembro; los roles artísticos (Owner, Director, Actor, Técnico) son etiquetas en la obra.
3. **Privado por defecto.** Nada se ve fuera del grupo hasta que alguien lo marca como visible, y ver algo siempre pide cuenta: no hay usuarios anónimos.
4. **Celular primero.** El registro pasa después del ensayo, de pie y con el celular. Cada pantalla de registro tiene que funcionar ahí.
5. **Material crudo sí, traducción con IA todavía no.** Se pueden subir fotos, audios, documentos y enlaces. Convertirlos en estructura queda para después, pero el material ya queda guardado donde la IA lo encontrará.
6. **Referentes sí, red todavía no.** Un ejercicio puede citar otros ejercicios del catálogo, y el rastro se ve en las dos direcciones: de dónde viene y quién lo usa o deriva. Las referencias entre grupos quedan para el nivel "red".
7. **Lo que no está en una historia no se construye.** Las ideas nuevas van a la lista de fuera del MVP.

## Roles

Tres roles alcanzan para el MVP; "responsable" no es un permiso sino el miembro asignado a un planteamiento.

| Rol | Quién es | Qué puede |
| --- | --- | --- |
| **Admin** | Quien crea el grupo (en Conversonantes, por confirmar si Santi) | Todo lo de un miembro, más invitar y gestionar miembros, crear obras, publicar y exportar |
| **Miembro** | Cada artista del grupo (Manu, Kokoro, Santi) | Crear y registrar sesiones, planteamientos y ejercicios; subir material; comentar |
| **Explorador** | Una persona con cuenta que no es del grupo: de otro grupo o sin grupo todavía | Ver lo que cada grupo marcó como visible en la plataforma |

En las historias, **responsable** es el miembro asignado a un planteamiento: quien trae los ejercicios y escribe su hallazgo.

## Mapa de historias

El corte 1 tiene 13 historias y es todo lo que hace falta para empezar a registrar; los cortes 2 y 3 se pueden mover sin tocarlo.

&#91;embedded content: mapa de historias · 6 épicas × 3 cortes\]

Las filas siguen el recorrido de un artista (entrar, armar la obra, planear, registrar, consultar, publicar) y las columnas son el orden de entrega. Cada corte termina con algo usable de verdad por el grupo.

## Épica 1 · Acceso y grupo

Entrar y reunir al grupo es lo mínimo para todo lo demás; tres de sus cuatro historias van en el corte 1.

| ID | Historia | Criterios de aceptación | Prioridad | Corte |
| --- | --- | --- | --- | --- |
| HU-01 | Como **artista**, quiero entrar con mi cuenta de Google, para no crear otra contraseña. | La primera vez se crea mi perfil con nombre y foto de Google · Puedo cambiar mi nombre visible · Al salir y volver, sigo dentro en el mismo dispositivo | Debe | 1 |
| HU-02 | Como **admin**, quiero crear el grupo con nombre y ciudad, para tener dónde guardar el proceso. | Quien crea el grupo queda como admin · Un grupo necesita nombre; la ciudad es opcional · Si ya pertenezco a un grupo, la app me lleva directo a él · Si no pertenezco a ninguno, la app me ofrece crear un grupo o explorar los procesos visibles · Si pertenezco a varios, un selector en el encabezado cambia de grupo y la app recuerda el último | Debe | 1 |
| HU-03 | Como **admin**, quiero invitar a los artistas con un enlace, para que entren sin trámites. | Genero un enlace desde el grupo y lo comparto por WhatsApp · Quien lo abre e inicia sesión queda como miembro · Puedo anular el enlace y generar otro | Debe | 1 |
| HU-04 | Como **admin**, quiero ver los miembros, cambiar su permiso o quitarlos, para mantener el grupo al día. | Veo la lista con nombre y permiso · Puedo hacer admin a otro miembro · Quitar a alguien no borra lo que registró · El último admin no puede quitarse | Debería | 3 |

## Épica 2 · Obras y equipo

La obra es el repositorio del proceso; con título y equipo basta para empezar.

| ID | Historia | Criterios de aceptación | Prioridad | Corte |
| --- | --- | --- | --- | --- |
| HU-05 | Como **admin**, quiero crear una obra, para agrupar sus sesiones y planteamientos. | Una obra tiene título (obligatorio), estado (en búsqueda, en montaje, en temporada, archivada), temas y un texto de acuerdo de visibilidad · Puedo editar todo después · Una sesión anterior del grupo puede asociarse a la obra (así la sesión 1 de *Cristina* queda como su origen) | Debe | 1 |
| HU-06 | Como **admin**, quiero armar el equipo de la obra con sus roles artísticos, para saber quién hace qué. | Agrego miembros del grupo a la obra · Cada persona puede tener varios roles: Owner, Director, Actor, Técnico · Los roles no cambian permisos | Debería | 1 |

## Épica 3 · Planear la sesión

Planear es el "antes" de la sesión: objetivo, planteamientos y quién trae qué, tal como se repartió en la sesión 1.

| ID | Historia | Criterios de aceptación | Prioridad | Corte |
| --- | --- | --- | --- | --- |
| HU-07 | Como **miembro**, quiero crear una sesión del grupo o de una obra, para dejar claro cuándo, dónde y para qué nos vemos. | Campos: fecha (hoy, una fecha o pendiente), lugar, objetivo, obra (opcional) · Se numera sola dentro de la obra o del grupo · Nace en estado *planeada* · Se puede crear con fecha pasada, para registrar sesiones que ya ocurrieron | Debe | 1 |
| HU-08 | Como **miembro**, quiero agregar planteamientos y asignarles un responsable, para repartir quién trae qué. | Un planteamiento tiene texto y responsable (un miembro) · Puedo reordenarlos · El responsable lo ve en "mis planteamientos" | Debe | 1 |
| HU-09 | Como **miembro**, quiero ver mis sesiones y mis planteamientos, para saber qué me toca preparar y qué me falta registrar. | Inicio con tres listas: próximas sesiones, planteamientos a mi cargo y sesiones realizadas sin hallazgos · Cada elemento lleva a su pantalla | Debe | 1 |
| HU-10 | Como **responsable**, quiero asociar ejercicios del catálogo a mi planteamiento y anotar cómo los voy a variar, para planear con herramientas ya probadas. | Busco y elijo uno o varios ejercicios · Para cada uno puedo escribir una variante · Si el ejercicio no existe, lo creo sin salir del planteamiento (HU-18) | Debe | 2 |

Hasta que llegue el corte 2, los ejercicios de un planteamiento se nombran en su texto o en el hallazgo.

## Épica 4 · Registrar la sesión

Registrar es el corazón del MVP: cada artista sube su parte cuando puede, en el formato que tenga a mano.

| ID | Historia | Criterios de aceptación | Prioridad | Corte |
| --- | --- | --- | --- | --- |
| HU-11 | Como **miembro**, quiero marcar una sesión como realizada y anotar quiénes estuvieron, para cerrar el "antes" y abrir el "después". | Cambia el estado a *realizada* · Marco asistentes entre los miembros · Puedo volver a editarla después | Debe | 1 |
| HU-12 | Como **responsable**, quiero escribir el hallazgo de mi planteamiento, para que quede lo que encontramos y lo que faltó. | Dos campos: qué se encontró y qué faltó · Texto con formato básico (listas, negrita) · Se guarda solo mientras escribo · Cualquier miembro puede completarlo; queda quién escribió qué | Debe | 1 |
| HU-13 | Como **miembro**, quiero subir fotos, audios, documentos y enlaces a una sesión o a un planteamiento, para registrar en el formato que tenga a mano. | Desde el celular puedo tomar una foto o grabar un audio sin salir de la app · Acepto imágenes, audio, PDF y documentos, y enlaces (YouTube, Drive) · Cada archivo muestra quién lo subió y cuándo · Los archivos heredan la privacidad de la sesión · Hay un límite de tamaño por archivo y la app lo avisa antes de subir | Debe | 1 |
| HU-14 | Como **miembro**, quiero anotar acuerdos, tareas para la próxima sesión e imprevistos, para que la sesión deje continuidad. | Tres campos de texto en la sesión: acuerdos, tareas (cada una con responsable opcional) e imprevistos · Las tareas con responsable aparecen en su inicio (HU-09) | Debe | 1 |
| HU-15 | Como **miembro**, quiero comentar un planteamiento, para sumar mi mirada al hallazgo de otro. | Comentarios en orden, con autor y fecha · Puedo editar o borrar los míos | Debería | 3 |
| HU-16 | Como **miembro**, quiero leer una sesión completa como bitácora, para recordar qué pasó de un vistazo. | Una sola página con objetivo, asistentes, planteamientos con sus ejercicios y hallazgos, material, acuerdos, tareas e imprevistos · Se lee bien en el celular | Debe | 1 |

Con este corte, la sesión 2 de *Cristina* se registra así: Santi crea la sesión con fecha pasada y sus tres planteamientos; Manu sube la descripción de su calentamiento como audio o texto; Kokoro hace lo mismo con su impro; Santi sube la foto del timeline de acciones y anota el cierre por lluvia en imprevistos.

## Épica 5 · Catálogo, usos y rastro

El catálogo funciona como un gestor de paquetes: cada ejercicio declara sus referentes, cada uso deja su experiencia y el rastro se puede seguir hacia atrás y hacia adelante.

| ID | Historia | Criterios de aceptación | Prioridad | Corte |
| --- | --- | --- | --- | --- |
| HU-17 | Como **grupo**, queremos empezar con el catálogo semilla y la lista de etiquetas ya cargados, para no partir de cero. | Un script carga las 9 categorías, las etiquetas iniciales y los 20 ejercicios semilla con sus usos documentados · Los ejercicios semilla son públicos y no pertenecen a ningún grupo · Correr el script dos veces no duplica nada | Debe | 2 |
| HU-18 | Como **miembro**, quiero crear un ejercicio con su categoría y etiquetas, para que el grupo lo pueda reusar. | Campos: nombre, categoría (una), etiquetas por faceta, cuándo usarlo, consignas, qué observar · Solo nombre y categoría son obligatorios · Las etiquetas se eligen de la lista existente | Debe | 2 |
| HU-19 | Como **miembro**, quiero citar los referentes de un ejercicio, otros ejercicios o un texto libre, para reconocer de dónde viene. | Puedo citar varios ejercicios del catálogo y varias inspiraciones en texto ("recogido de talleres") · Un ejercicio no puede citarse a sí mismo | Debe | 2 |
| HU-20 | Como **miembro**, quiero buscar y filtrar el catálogo, para encontrar el ejercicio que necesita un planteamiento. | Búsqueda por texto en nombre y consignas · Filtros por categoría y por etiquetas, combinables · Puedo ordenar por cantidad de usos | Debe | 2 |
| HU-21 | Como **miembro**, quiero ver la ficha de un ejercicio con sus usos y su rastro, para entender cómo ha vivido. | La ficha muestra referentes (de dónde viene) y ejercicios que lo citan (quién lo deriva) · Lista los usos propios, cada uno con su sesión, variante y hallazgo, y los usos externos, del más reciente al más antiguo · Desde un referente puedo saltar a su ficha | Debe | 2 |
| HU-22 | Como **miembro**, quiero derivar un ejercicio a partir de otro, para adaptarlo sin perder su origen. | "Derivar" crea una copia editable que ya cita al original como referente · El original muestra la derivación en su rastro | Debería | 2 |
| HU-23 | Como **miembro**, quiero registrar un uso externo de un ejercicio (un libro, un taller, otro grupo), para que la ficha recoja experiencias de fuera. | Campos: quién, cuándo, contexto, hallazgo y enlace · Aparece en la ficha junto a los usos propios | Debería | 3 |

Sugerir etiquetas nuevas queda fuera del MVP: si hace falta una, el admin la agrega directamente en la base.

## Épica 6 · Visibilidad y exportación

Abrir los engranajes al público llega al final, cuando ya hay proceso registrado que mostrar.

| ID | Historia | Criterios de aceptación | Prioridad | Corte |
| --- | --- | --- | --- | --- |
| HU-24 | Como **admin**, quiero marcar como visibles en la plataforma una obra, sus sesiones, planteamientos y ejercicios, para mostrar el detrás de escena que el grupo decida. | Todo nace privado · Un interruptor por elemento · Para que algo sea visible, su obra también tiene que serlo · Los archivos siguen la privacidad de su sesión o planteamiento · Antes de publicar, la app muestra qué se verá | Debe | 3 |
| HU-25 | Como **explorador**, quiero explorar las obras visibles de otros grupos, para conocer sus procesos. | Pide sesión iniciada · Una página de exploración lista las obras visibles de todos los grupos · Muestra solo lo marcado como visible · Desde un ejercicio visible puedo seguir su rastro hacia otros ejercicios visibles · Nada privado aparece, ni siquiera como título | Debe | 3 |
| HU-26 | Como **admin**, quiero exportar una obra a markdown, para tener una copia propia fuera de la app. | Descarga un .zip con un archivo por sesión y uno por ejercicio usado, en el formato de la fase 0 · Los archivos subidos van como enlaces | Debería | 3 |

**Diseñado para abrir procesos cerrados después.** Pedir acceso a un proceso cerrado queda fuera del MVP, pero dos detalles lo dejan listo sin complicar nada hoy:

- **La visibilidad es un nivel, no un sí o no.** El MVP usa dos valores, `grupo` y `plataforma`; más adelante se agrega `compartido` sin migrar datos.
- **Una sola función decide quién ve qué.** Todas las reglas de Row Level Security llaman a `puede_ver(usuario, obra)`. Cuando lleguen los accesos otorgados, basta con una tabla `accesos` (obra, persona o grupo, quién lo otorgó, hasta cuándo) y con cambiar esa función.

## Requisitos de estabilidad

"Estable" aquí significa que el grupo nunca pierde un registro y nunca ve algo que no le toca. Estos requisitos aplican a todas las historias.

1. **Privacidad en la base, no solo en la pantalla.** Row Level Security en todas las tablas y en el almacenamiento de archivos: un miembro solo ve su grupo y un usuario de fuera solo lo visible. Cada corte trae pruebas automáticas de esas reglas.
2. **Nada se borra en duro.** Borrar oculta el elemento y queda recuperable; los archivos también.
3. **Ningún texto se pierde.** Los campos largos se guardan solos mientras se escribe; si se cae la conexión, la app avisa y reintenta.
4. **Celular primero.** Las pantallas de registro (HU-11 a HU-14) se prueban en un teléfono real antes de cerrar cada corte.
5. **Subidas livianas.** Las fotos se comprimen en el celular antes de subir; el límite por archivo se fija según el plan de Supabase.
6. **Cambios de esquema versionados.** Toda modificación de la base es una migración guardada en el repositorio.
7. **Dos entornos.** Uno de prueba y uno real; nada llega al real sin pasar por el de prueba.
8. **Copia propia.** Además de lo que ofrezca el plan, una copia semanal de la base fuera de Supabase.

## Fuera del MVP

Nueve ideas quedan anotadas para después; cada una tiene la señal que diría que es su momento.

| Idea | Se vuelve a mirar cuando |
| --- | --- |
| IA que traduce fotos y audios a planteamientos y hallazgos | El grupo ya sube material crudo con regularidad |
| IA que sugiere ejercicios para un planteamiento | El catálogo tenga usos propios suficientes para aprender de ellos |
| Nivel "red": varios grupos, referencias entre grupos | Un segundo grupo de Medellín quiera usar la app |
| Pedir acceso: unirse a un grupo, o ver un proceso cerrado para una investigación u otro grupo, que el admin abre a esa persona o grupo | Alguien de fuera lo pida por primera vez |
| "Publicar versión": congelar una selección del proceso como un release | Haya una obra en temporada con proceso público |
| Talleres: empaquetar secuencias de ejercicios | Una misma secuencia se repita en varias sesiones |
| Sugerir y aprobar etiquetas desde la app | La lista inicial se quede corta más de una vez al mes |
| Eventos y funciones | La obra llegue a temporada |
| Convocatorias y servicio de postulación | El registro de varias obras esté completo |

## Para confirmar

Cinco decisiones las tomé para que las historias quedaran cerradas; cualquiera se puede cambiar.

- [ ] **Subir archivos entra al corte 1** (antes estaba fuera del MVP), porque el registro multimodal ataca el riesgo principal.
- [ ] **El catálogo semilla es público y no pertenece a ningún grupo;** los ejercicios propios nacen privados.
- [ ] **Los referentes solo apuntan a ejercicios dentro de la app** (los del grupo y los semilla). Un referente de fuera va como texto libre.
- [ ] **Publicar lo decide el admin.** El Owner artístico de la obra y el admin pueden no ser la misma persona; ¿basta con eso por ahora?
- [ ] **El hallazgo va por planteamiento**, y en cada ejercicio usado solo queda la variante. ¿Hace falta un hallazgo por ejercicio?
