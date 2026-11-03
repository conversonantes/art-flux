# @art-flux/web

La interfaz: React + Vite + TanStack Router + TanStack Query + Tailwind (con los tokens de `design/`). Celular primero; objetivos táctiles de 44 px o más.

## Estructura

```
src/
  main.tsx            raíz de composición: elige Supabase como proveedor de login y la API HTTP
  App.tsx             proveedores (login, API, caché) y el router; recibe `auth` y `api` por parámetro
  router.tsx          las rutas (ver "Direcciones")
  auth/               AuthClient (interfaz) + supabaseAuth.ts (única importación del SDK de Supabase)
  api/                el cliente de la API: tipos (`*Dto`), `Api` (interfaz) y `createHttpApi`
  screens/            una pantalla por archivo, nombrada por lo que muestra
  ui.tsx              piezas de interfaz compartidas (botón, campo, chip, etiqueta, avatar…)
  test/fakes.ts       una `Api` y un `AuthClient` en memoria para las pruebas
```

## Direcciones

`/entrar` · `/` (a dónde ir) · `/grupos/nuevo` · `/i/<código>` (invitación) · `/<grupo>` · `/<grupo>/invitar` · `/<grupo>/obras/nueva` · `/<grupo>/sesiones/nueva` · `/<grupo>/<obra>` (+ `/editar`, `/equipo`, `/sesiones/nueva`) · `/<grupo>/s02` y `/<grupo>/<obra>/s02` (sesiones). Los nombres reservados que no pueden usarse como grupo u obra están en el `core` (`RESERVED_HANDLES`, `RESERVED_PROJECT_SLUGS`).

## Reglas

- **Una pantalla recibe lo que necesita de `useApi()` / `useAuth()`**, no importa el SDK de un proveedor. Los textos van en español de Colombia, sin tecnicismos.
- **Estilos:** clases de Tailwind con los tokens del preset (`bg-fondo`, `text-grafito`, `font-lectura`…); nunca colores ni fuentes a mano.
- **Las pruebas usan los falsos de `test/fakes.ts`** y recorren la pantalla como lo haría una persona (roles y etiquetas accesibles, no detalles internos).
- **Arrastre** (planteamientos): `@dnd-kit`, con asa, retardo corto en táctil y teclado como alternativa. jsdom no simula el gesto: la lógica (`approachOrder.ts`, `useApproaches.ts`) se prueba aparte y el gesto táctil se verifica a mano.
- **A la web solo llegan** `SUPABASE_URL` y `SUPABASE_ANON_KEY` (lo define `vite.config.ts`).

## Correr y probar

```
pnpm dev:web      # http://localhost:5173  (/api se redirige a la API)
pnpm --filter @art-flux/web test
pnpm --filter @art-flux/web build
```
