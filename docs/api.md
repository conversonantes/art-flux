# API

Hono en `apps/api/src/app.ts`. Todas las rutas, salvo `/health`, piden `Authorization: Bearer <credencial>`; la API la valida con el proveedor de identidad y trabaja **como esa persona** (RLS sigue aplicando). Los cuerpos y respuestas son JSON; las fechas viajan como texto ISO; las sesiones llevan `date` como `YYYY-MM-DD`.

Desde la web se llega por `/api/...` (el servidor de desarrollo y el despliegue lo redirigen a esta API, sin CORS).

## Errores

Siempre `{ "error": "<código>", "message": "<texto en español listo para mostrar>" }`.

| HTTP | `error` | Cuándo |
| --- | --- | --- |
| 400 | `validation` / `bad_request` | Datos no válidos (título vacío, fecha imposible, id que no es UUID, cuerpo que no es JSON) |
| 401 | `unauthorized` | Sin credencial o credencial no válida |
| 403 | `forbidden` | Es del grupo pero no tiene permiso (p. ej. un miembro intenta crear una obra) |
| 404 | `not_found` | No existe **o no puedes verlo** (no se distingue a propósito) |
| 409 | `conflict` / `handle_taken` | El estado no lo permite (la obra ya tiene origen; la lista de planteamientos cambió) |
| 410 | `invite_invalid` | El enlace de invitación ya no sirve (usado, anulado, caducado o inexistente) |
| 500 | `internal` | Error inesperado |

## Rutas

"Miembro" = pertenece al grupo; "admin" = admin del grupo. Quien no es del grupo recibe 404.

### Cuenta y grupos (HU-01, HU-02)
| Método y ruta | Quién | Qué hace |
| --- | --- | --- |
| `GET /health` | cualquiera | Comprobación de vida |
| `GET /me/start?last=<groupId>` | sesión | A dónde ir al entrar: `{destination: "group" \| "choose" \| "none"}` |
| `GET /me/groups` | sesión | Mis grupos |
| `POST /groups` | sesión | Crear grupo (`name`, `city?`); quien lo crea queda admin |
| `GET /groups/:groupId/members` | miembro | Miembros con su nombre y rol |

### Invitaciones (HU-03)
| Método y ruta | Quién | Qué hace |
| --- | --- | --- |
| `GET /groups/:groupId/invites` | admin | Enlaces no anulados, con quién entró por cada uno |
| `POST /groups/:groupId/invites` | admin | Crear un enlace de un solo uso (`label?`); caduca a los 7 días |
| `DELETE /invites/:inviteId` | admin | Anular (no saca a quien ya entró) |
| `POST /invites/accept` | sesión | Unirse con `{token}`; 410 si ya no sirve |

### Obras y equipo (HU-05, HU-06)
| Método y ruta | Quién | Qué hace |
| --- | --- | --- |
| `GET /groups/:groupId/projects` | miembro | Obras del grupo, la más nueva primero |
| `POST /groups/:groupId/projects` | admin | Crear obra (`title`, `status?`, `themes?`, `visibilityAgreement?`, `originSessionId?`) |
| `GET /groups/:groupId/projects/:slug` | miembro | Una obra por su dirección |
| `PATCH /projects/:projectId` | admin | Editar; la dirección no cambia |
| `GET /projects/:projectId/team` | miembro | Equipo con roles y nombres |
| `PUT /projects/:projectId/team/:memberId` | admin | Agregar a alguien **del grupo** o cambiar sus roles (`roles: []`) |
| `DELETE /projects/:projectId/team/:memberId` | admin | Quitarlo del equipo (sigue en el grupo) |

### Sesiones (HU-07)
| Método y ruta | Quién | Qué hace |
| --- | --- | --- |
| `GET /groups/:groupId/sessions?project=none\|<projectId>` | miembro | Todas, solo las del grupo (`none`) o las de una obra |
| `POST /groups/:groupId/sessions` | miembro | Crear (`projectId?`, `date?`, `place?`, `objective?`); nace `planned` con el siguiente número |
| `GET /groups/:groupId/sessions/:number?project=<slug>` | miembro | Por dirección: S`number` de la obra, o del grupo si no hay `project` |
| `PATCH /sessions/:sessionId` | admin o quien la creó | Cambiar fecha, lugar u objetivo (`null` o texto vacío los borra) |

### Planteamientos (HU-08)
| Método y ruta | Quién | Qué hace |
| --- | --- | --- |
| `GET /sessions/:sessionId/approaches` | miembro | En orden |
| `POST /sessions/:sessionId/approaches` | miembro | Agregar (`text`, `ownerId?` = quién lo trae; por defecto, quien lo crea). 409 si la sesión ya se realizó |
| `PUT /sessions/:sessionId/approaches/order` | miembro | Nuevo orden completo (`ids`); 409 si la lista cambió entre tanto |
| `PATCH /approaches/:approachId` | miembro | Cambiar `text` y/o `ownerId` |
| `DELETE /approaches/:approachId` | miembro | Quitar (borrado suave) |
| `PUT /approaches/:approachId/note` | solo el responsable | Nota «cómo lo planteo» (`note`, hasta 2000 caracteres; `null` o vacío la borra). La lee todo el grupo en el planteamiento. 403 si no eres el responsable; 409 si la sesión ya se realizó |

### Inicio «lo mío» (HU-09)
| Método y ruta | Quién | Qué hace |
| --- | --- | --- |
| `GET /groups/:groupId/home` | miembro | `{ toRecord, mine, upcoming }`: sesiones realizadas por registrar, mis planteamientos en sesiones planeadas y las sesiones planeadas (con su número de planteamientos), las más próximas primero. 404 si no es del grupo |

### Sesión realizada y asistentes (HU-11)
| Método y ruta | Quién | Qué hace |
| --- | --- | --- |
| `POST /sessions/:sessionId/complete` | miembro | Pasa de *planeada* a *realizada* con `attendeeIds` (miembros del grupo; puede ir vacía). 409 si ya estaba realizada; 403 si alguien no es del grupo |
| `GET /sessions/:sessionId/attendees` | miembro | Ids de quienes estuvieron |
| `PUT /sessions/:sessionId/attendees` | miembro | Corrige quiénes estuvieron (`attendeeIds`). 409 si la sesión aún no se realizó |

### Hallazgos (HU-12)
| Método y ruta | Quién | Qué hace |
| --- | --- | --- |
| `GET /approaches/:approachId/findings` | miembro | Fragmentos del hallazgo, del más viejo al más nuevo (`id`, `authorId`, `kind` = `found` | `missing`, `text`) |
| `PUT /findings/:fragmentId` | miembro | Crea el fragmento o, si el `id` ya existe, cambia su texto (guardado automático y reintentos). Cuerpo: `approachId`, `kind`, `text` (1–4000, con marcas `**negrita**`, `==resaltado==`, `- lista`). 409 si la sesión aún no se realizó o si cambia el `kind`; 403 si el fragmento es de otra persona |
| `DELETE /findings/:fragmentId` | solo el autor | Quitar (borrado suave) |

Además, `GET /groups/:groupId/home` ahora devuelve `toRecord` como `{ session, total, done, pendingOwnerIds }` (solo sesiones realizadas con planteamientos sin hallazgo) y `mine` incluye `order` (el «P3» de cada planteamiento) y los planteamientos míos de sesiones realizadas sin hallazgo.

### Material (HU-13)
| Método y ruta | Quién | Qué hace |
| --- | --- | --- |
| `POST /projects/:projectId/media` | miembro | Registra material en la obra. Cuerpo: `id?` (UUID del cliente: repetirlo es un reintento), `kind` (`photo` | `audio` | `document` | `link` | `note`), `sessionId?`, `approachId?`, y según el tipo: `mime`, `sizeBytes` (y `durationSeconds` en audio), `url` o `body`; `title?`. Responde `{ media, upload? }`: los archivos traen la URL firmada para subir directo a R2 (`PUT`, 10 min); los enlaces y notas ya quedan listos. 400 si el tipo, el tamaño o el enlace no sirven; 404 si la sesión o el planteamiento no son de la obra |
| `POST /media/:mediaId/confirm` | solo quien lo subió | Confirma que el archivo llegó; el `core` verifica con R2 que exista y pese lo prometido. 409 si aún no llegó o llegó incompleto |
| `GET /projects/:projectId/media?session=&approach=` | miembro | Material de la obra, o solo de una sesión o un planteamiento, del más nuevo al más viejo. Lo que aún se sube solo lo ve su autor |
| `GET /media/:mediaId/url` | miembro | Dirección para abrirlo: firmada por 5 minutos para archivos; el enlace mismo para enlaces. 409 si es una nota o aún se sube |
| `DELETE /media/:mediaId` | autor o admin | Quitar (borrado suave; el archivo se limpia después de 30 días) |

## Cómo agregar una ruta

1. El caso de uso va en `packages/core` (con su prueba); la ruta solo lee la petición, llama al caso de uso y devuelve el resultado.
2. Los errores del dominio ya se traducen en `app.onError`; no atrapes errores en la ruta.
3. Agrega la fila a esta tabla y una prueba en `apps/api/src/app.test.ts`.
