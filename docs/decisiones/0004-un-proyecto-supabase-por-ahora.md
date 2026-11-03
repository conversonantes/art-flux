# 0004 · Un solo proyecto de Supabase por ahora

**Estado:** Vigente (2 nov 2026)

## Contexto
`arquitectura.md` preveía tres entornos (local, prueba, real). Para una persona construyendo el MVP, eso agrega cuentas, llaves y pasos antes de que haya algo estable.

## Decisión
Un solo proyecto de Supabase en la nube, que hace de "prueba". Se separa `real` cuando haya algo estable. Las migraciones son archivos en git y `pnpm migrar` las aplica y registra (`schema_migrations` con checksum), así que crear el segundo proyecto es enlazarlo y correr el mismo comando.

## Consecuencias
Como los datos reales de *Cristina* vivirán ahí mientras tanto:
- No reiniciar la base ni borrar tablas para probar.
- Nunca editar una migración ya aplicada: se agrega una nueva (`pnpm migrar` se detiene si el checksum cambió).
- Respaldar (`pg_dump`) antes de cambios grandes.
- Las pruebas de integración crean y borran sus propios usuarios y filas (`art-flux-test-…`) y verifican que no quedan residuos.
