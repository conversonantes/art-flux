# @art-flux/core

El dominio: reglas de negocio, validación y los puertos (interfaces) que necesita. **No importa nada de Supabase, Hono, Postgres ni React**; lo vigila `src/architecture.test.ts`.

## Estructura

Un módulo por tema, todos con la misma forma:

```
src/<modulo>/
  <modulo>.ts   tipos y esquemas Zod (lo que es y qué es válido)
  repo.ts       el puerto: la interfaz del repositorio que el módulo necesita
  useCases.ts   las acciones; reciben `deps` (repos, reloj) y una entrada, devuelven el resultado
  memory.ts     repositorio en memoria, para pruebas
  *.test.ts     comportamiento escrito como frases
```

Módulos: `groups`, `invites`, `projects`, `sessions`, `approaches`. `auth.ts` define `AuthSession` y `Authenticator`; `deps.ts` junta lo que necesita una petición (`AppDeps`); `errors.ts` tiene `ForbiddenError`, `NotFoundError` y `ConflictError`.

## Reglas

- **Los casos de uso deciden** quién puede hacer qué y cuándo; la base solo revalida como barrera de seguridad.
- **Reciben todo por parámetro** (repos, `Clock`, generador de tokens): nada global, así las pruebas son deterministas.
- **Errores:** `NotFoundError` también cuando la persona no puede ver el recurso (no se revela que existe); `ForbiddenError` cuando es del grupo pero no tiene permiso; `ConflictError` cuando el estado no lo permite.
- **Mensajes para la gente en español**; nombres de código en inglés (ver `docs/decisiones/0001`).
- **Carreras:** la numeración y las direcciones se asignan con `máximo + 1` y se reintentan si el repositorio avisa que ya existen (`SlugTakenError`, `SessionNumberTakenError`, `HandleTakenError`).

## Probar

```
pnpm --filter @art-flux/core test
pnpm --filter @art-flux/core typecheck
```
