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

## Cómo agregar una ruta

1. El caso de uso va en `packages/core` (con su prueba); la ruta solo lee la petición, llama al caso de uso y devuelve el resultado.
2. Los errores del dominio ya se traducen en `app.onError`; no atrapes errores en la ruta.
3. Agrega la fila a esta tabla y una prueba en `apps/api/src/app.test.ts`.
