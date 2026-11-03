# 0001 · Código en inglés; interfaz y documentación en español

**Estado:** Vigente (2 nov 2026)

## Contexto
Al empezar, `CLAUDE.md` pedía nombres de dominio en español (`crearGrupo`, `GruposRepo`). Al ver el primer módulo, el equipo notó que mezclaba español con un ecosistema en inglés (Zod, SQL, `useQuery`) y que costaría mantenerlo si el proyecto se abre a otras personas. Cambiar era barato: solo existía un módulo.

## Decisión
- **Código en inglés:** tablas, columnas, tipos, funciones, archivos y rutas de la API.
- **Interfaz y `docs/` en español**, incluidos los mensajes de validación que ve la gente.
- El **glosario español → inglés** de `CLAUDE.md` es el puente (`obra` = `project`, `planteamiento` = `approach`, `hallazgo` = `finding`…).
- Los nombres son **genéricos a propósito**: lo teatral vive en el contenido (taxonomía, catálogo, fichas), no en el esquema, para que el mismo modelo sirva a cualquier proceso creativo. Se evita `prompt` (se confunde con IA).

## Consecuencias
- Hay que traducir al leer una historia; el glosario lo hace explícito.
- Un nombre nuevo del dominio se agrega al glosario en el mismo cambio que lo introduce.
- Los roles de equipo (`owner`, `director`, `actor`, `technician`) son etiquetas, no un enum cerrado.
