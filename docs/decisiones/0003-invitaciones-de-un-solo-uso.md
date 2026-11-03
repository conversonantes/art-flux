# 0003 · Invitaciones de un solo uso, sin correo, que caducan a los 7 días

**Estado:** Vigente (2 nov 2026). Reemplaza una primera versión ligada a un correo.

## Contexto
HU-03 pide invitar "con un enlace que se comparte por WhatsApp". Primero se implementó un enlace por grupo reutilizable; luego uno ligado a un correo. El de correo obligaba al admin a conocer el correo de cada persona y chocaba con compartir por WhatsApp. Un enlace reutilizable por cualquiera era demasiado abierto.

## Decisión
- **Un enlace por persona**, generado por el admin (con una nota opcional como "para Ana").
- **Un solo uso:** el primero que lo abre con sesión iniciada entra y el enlace queda gastado (`accepted_by`, `accepted_at`).
- **Caduca a los 7 días** (`expires_at`, calculado en el `core` con el reloj) o antes si el admin lo anula.
- Quien ya es miembro y lo abre **no lo gasta**; quien lo gastó puede recargar sin error.
- El gasto es **atómico en SQL** (`accept_invite`, con bloqueo de fila): si dos personas lo abren a la vez, entra una sola. La base revalida todo aunque el `core` ya lo hizo.
- Todos los casos inválidos (no existe, anulado, caducado, usado por otra persona) dan el **mismo mensaje**.
- Los tokens se guardan en texto plano: solo los ven los admins del grupo, que de todos modos pueden generar el enlace. Pasar a un hash es una migración futura si el producto se abre.

## Consecuencias
- Un enlace reenviado sirve a quien lo abra primero. Lo mitigan los 7 días, el uso único y que el admin ve quién entró.
- "Solicitar unirse y que el admin acepte" queda como historia futura; el diseño no lo impide.
