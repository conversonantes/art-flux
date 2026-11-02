# Diseño visual · art-flux

Decisiones y estado de la identidad visual. Empezó el 1 de noviembre de 2026.

Canvas "art-flux · exploración visual": https://claude.ai/artifact/S8xjU8NvCa946SRhRQTNMw (dos páginas: "Exploración" y "Recorrido B"). Las pantallas del recorrido B están exportadas como imágenes en `docs/pantallas/`, nombradas por historia de usuario.

Los tokens viven en código en `design/tokens.css` y `design/tailwind.preset.js`. Si algo de este documento contradice esos archivos, mandan los archivos.

## Decisión vigente (1 nov)

**Se sigue con la dirección B · Grafito y resaltador, tal como quedó en la exploración 01.** La exploración 02 ("Archivo vivo", con los referentes del archivo, las ventanas y el bloque) queda en el canvas como referencia, pero Santi prefirió no seguir por ahí.

**Tokens de la B:** fondo #F4F4F1, hoja #FFFFFF, línea #DADAD3, grafito #1E1E1C, gris #63635C, resaltador #F1DE45 (hallazgos y estado activo), verde #17725A (enlaces, estado "realizada", permiso admin). Tipografía: Bricolage Grotesque (interfaz y títulos), Source Serif 4 (lectura: objetivos, hallazgos, descripciones), JetBrains Mono (rutas tipo `conversonantes/cristina`, identificadores S02 · P3, metadatos). Categorías con su color (ver abajo), siempre con nombre.

**Patrones:** línea de tiempo tipo commits para planteamientos y sesiones; hallazgos subrayados con resaltador; botón flotante "Registrar"; navegación inferior Inicio · Obras · Catálogo · Explorar (componente compartido); hojas inferiores para acciones cortas (marcar realizada, derivar, exportar); objetivos táctiles de 44 px o más.

## Recorrido B (1 nov)

26 pantallas, una por historia (o dos historias en una), en filas por épica y marcadas con su corte:

- Épica 1: entrar (HU-01), sin grupo (HU-02), crear grupo (HU-02), invitar (HU-03), miembros (HU-04).
- Épica 2: inicio "lo mío" (HU-09, con selector de grupo), obra como repositorio (HU-05), crear obra (HU-05, con sesión de origen), equipo y roles (HU-06).
- Épica 3: crear sesión con fecha pasada (HU-07), planteamientos y responsables (HU-08), ejercicios del planteamiento con variante (HU-10).
- Épica 4: marcar realizada y asistentes (HU-11), hallazgo con autoría por color (HU-12), subir material (HU-13), acuerdos/tareas/imprevistos (HU-14), comentarios (HU-15), bitácora completa (HU-16).
- Épica 5: catálogo con filtros y orden por usos (HU-17, HU-20), ficha con rastro y usos (HU-21), nuevo ejercicio con referentes (HU-18, HU-19), derivar (HU-22), uso externo (HU-23).
- Épica 6: visibilidad por elemento con vista previa (HU-24), explorar (HU-25), exportar a markdown (HU-26).

Supuestos marcados en las pantallas: fechas, sinopsis, temas y acuerdos van entre corchetes. Los roles (Santi owner y director; Manu y Kokoro actores) son provisionales.

**Ojo:** las pantallas se dibujaron antes de las decisiones de arquitectura del 1 nov en la noche. Donde difieran, mandan `docs/arquitectura.md` y `CLAUDE.md`. En particular: el botón "Registrar" abre Foto · Nota escrita · Nota de voz · Enlace y funciona sin conexión; el material sin sesión queda como material de la obra; el hallazgo se escribe por fragmentos con autor.

## Lo que respondió Santi (1 nov)

Celular primero; registro durante y después del ensayo; nombre art-flux; el logo de Conversonantes no define el sitio; transmitir comunidad, creatividad, colaboración (no competencia, cuadriculamiento, rigidez); repositorio vivo con sentimiento artesanal; guiños al código abierto entendibles; color por categoría; serif + sans; aireado; React + Tailwind; referencias: Notion y GitHub.

## Colores de categoría (claro)

| # | Categoría | Color | Token |
| --- | --- | --- | --- |
| 1 | Encuentro y grupo | #C2553F | `cat-encuentro` |
| 2 | Atención y presencia | #2F7F8F | `cat-atencion` |
| 3 | Cuerpo y movimiento | #D47A22 | `cat-cuerpo` |
| 4 | Voz y palabra | #8653B3 | `cat-voz` |
| 5 | Juego e improvisación | #C99A12 | `cat-juego` |
| 6 | Análisis del material | #2E5FB0 | `cat-analisis` |
| 7 | Personaje y relación | #B34477 | `cat-personaje` |
| 8 | Composición y montaje | #3F8545 | `cat-composicion` |
| 9 | Reflexión y registro | #6E655B | `cat-reflexion` |

El color nunca va solo: siempre acompaña el nombre de la categoría.

## Pendiente

- Modo oscuro (no definido; los tokens dejan el espacio).
- Confirmar roles de la obra y las decisiones "para confirmar" de las historias.
