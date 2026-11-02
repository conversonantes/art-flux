# Contexto del proyecto art-flux · Conversonantes

Resumen de las conversaciones del 31 de octubre y el 1 de noviembre de 2026 entre Santi (actor de Conversonantes, Medellín, desarrollador web) y Claude. Sirve como punto de partida para las próximas sesiones.

**Estado (1 nov, noche):** historias de usuario del MVP escritas en el doc "Historias de usuario · art-flux MVP" (https://claude.ai/artifact/TiA9hcmp7M8k33ZLmWTEXt): 26 historias, 6 épicas, 3 cortes. Arquitectura definida en el doc "Arquitectura · art-flux MVP" (https://claude.ai/artifact/SBxVrUWoaEuXApqX2PRMEb), resumida en la sección 9. Santi piensa pasar a Claude Code para construir; se preparó un `CLAUDE.md` para la raíz del repo. Pendiente: confirmar las decisiones "para confirmar" de las historias y arrancar el corte 1.

---

## 1. La idea

Un sistema para registrar los procesos de creación artística (empezando por el teatro) con la filosofía de los repositorios de código abierto.

- **Filosofía base:** todo deriva de todo. "El código abierto real es el mundo; la creación es el ordenamiento y los ángulos que los artistas van esculpiendo en el tiempo, ayudados por herramientas: los ejercicios (skills)". Nadie es dueño de un ejercicio: se reconocen sus inspiraciones (varias, nunca un solo autor) y se sigue transformando.
- **Un ejercicio vale por sus usos (1 nov):** lo que le da fuerza no es la descripción sino que ha sido usado, con implementaciones y hallazgos particulares. Cada uso registrado alimenta la ficha.
- **Interreferencialidad como paquetes (1 nov):** un ejercicio cita a otros como referentes (como dependencias), cada uso es la experiencia de haber aplicado parte o todo de él, y se puede derivar uno nuevo de otro (como un fork). Para Santi es "una potencia increíble": quien se interese en un montaje puede seguir el rastro hacia atrás (de dónde viene) y hacia adelante (quién lo usa o lo deriva).
- **Primer usuario:** Conversonantes, el grupo de Santi. Después, el sector creativo de Medellín, que Santi conoce bien.
- **Puente con la IA:** el ciclo de una sesión (objetivo → planteamiento → ejercicio → hallazgo) es el mismo ciclo de un agente (tarea → herramienta → ejecución → observación). Los ejercicios son, literalmente, skills: un encabezado con `cuando_usar` y las consignas debajo. Esto conecta el proyecto con harness engineering.

## 2. Conceptos del dominio

| Concepto | Qué es | Código abierto | Agentes |
| --- | --- | --- | --- |
| Grupo | Organismo de artistas | Organización | — |
| Obra | Lo que se crea | Repositorio | Proyecto/contexto |
| Sesión | Encuentro con un objetivo | Commit | Una ejecución (run) |
| Planteamiento (P) | Pregunta, problema, búsqueda o implementación | Issue | Tarea |
| Ejercicio | Herramienta para abordar un P | Librería / paquete | Skill |
| Referente | Ejercicio citado por otro | Dependencia | — |
| Derivación | Ejercicio nuevo a partir de otro | Fork | — |
| Hallazgo (R) | Lo encontrado y lo que faltó | Changelog | Observación/memoria |
| Caso de uso | P + ejercicios + hallazgo; la pieza que se comparte | Ejemplo de uso | Ejemplo para elegir skill |
| Taller | Secuencia de ejercicios probada en procesos reales | Paquete compuesto | Plugin |

- **Clasificación de ejercicios (decidida el 1 nov):** se abandonan los códigos letra + número (A1, B4). Cada ejercicio lleva una categoría principal (de nueve, máximo diez) y etiquetas múltiples en siete facetas (momento, etapa del proceso, formación, foco, tradición, produce, logística). Propuesta completa con bibliografía en el doc "Taxonomía de ejercicios · art-flux" (Claude Docs): https://claude.ai/artifact/8JsPm4LvEgayt3vAdNoak9
  - Categorías: 1 Encuentro y grupo · 2 Atención y presencia · 3 Cuerpo y movimiento · 4 Voz y palabra · 5 Juego e improvisación · 6 Análisis del material · 7 Personaje y relación · 8 Composición y montaje · 9 Reflexión y registro. Candidata al cupo 10: Diseño y técnica.
  - Los tipos del cuaderno quedan así: corporal → 3, vocal → 4, impro → 5, análisis → 6, montaje → 8. Las letras históricas del cuaderno eran A = corporal, B = análisis, C = impro.
- **Catálogo semilla (1 nov):** 20 ejercicios de los referentes, dos o tres por categoría, cada uno con su uso documentado y un espacio para los usos de Conversonantes. Está en la pestaña "Catálogo semilla" del doc de taxonomía. Son: hipnosis colombiana y máquina de ritmos (Boal); foco blando (Viewpoints); equilibrio en acción (Barba); plásticos (Grotowski); ocho esfuerzos (Laban); máscara neutra (Lecoq); suspiro de alivio (Linklater); resonadores (Grotowski y Molik); espejo (Spolin); estatus y aceptar ofertas (Johnstone); étude de análisis activo (Stanislavski y Knébel); acontecimientos y fuerzas en pugna (TEC); rol en la pared y silla caliente (Neelands y Goode); composición (Bogart y Landau); imagen real e ideal (Boal); marcar el momento (Neelands y Goode); respuesta crítica (Liz Lerman). Más adelante se evalúa un catálogo grande.
- **Roles en la obra (del cuaderno):** Owner (decisiones administrativas finales), Director (decisiones creativas finales), Actor (propone soluciones dentro de la obra), Técnico (propone soluciones que apoyan la obra). Son etiquetas artísticas.
- **Permisos de la app:** admin y miembro dentro del grupo. **Explorador** = persona con cuenta que no es del grupo (de otro grupo o sin grupo); ve lo marcado como visible en la plataforma. **No hay usuarios anónimos (decidido el 1 nov):** ver cualquier cosa pide cuenta.
- **Sesión:** tiene un "antes" (objetivo, planteamientos, ejercicios previstos, responsable de cada bloque; estado `planeada`) y un "después" (hallazgos, material, acuerdos, tareas para la próxima, imprevistos; estado `realizada`).
- **Material sin asignar (decidido el 1 nov):** toda captura pertenece a una obra; puede quedar sin sesión ni planteamiento, visible y comentable por el equipo, y ligarse después.

## 3. Lo que enseñaron las sesiones reales (1 nov)

- **Una sesión puede existir antes que la obra.** La sesión 1 fue de búsqueda y de ella nació la obra. Las sesiones de búsqueda pertenecen al grupo; una obra puede nacer de una de ellas.
- **Una sesión produce acuerdos y tareas, no solo hallazgos.** Ejemplo: "Kokoro trae impro, Manu calentamiento, Santi análisis" se decidió en la sesión 1 para la sesión 2.
- **El registro es asincrónico y con varios autores.** Cada quien completa después lo que propuso. Cualquier miembro puede completar un hallazgo y queda quién escribió qué.
- **Un ejercicio puede producir material**, no solo hallazgos: el análisis de acciones dejó un timeline de acciones.
- **Las inspiraciones son difusas** (yoga, Grotowski, talleres varios) y eso es válido; "recogido de talleres" es una respuesta aceptable.
- **Lo planeado y lo realizado pueden diferir** (la sesión 2 cerró antes por la lluvia): se registran imprevistos.
- **Registro multimodal:** la forma más eficiente de registrar es mandar fotos, audios, documentos o texto. En el MVP se suben como material crudo; la traducción con IA a estructura queda para después.
- **Registro durante el ensayo (1 nov):** casi siempre hay señal, pero se quiere registrar sin ella; cada persona captura desde su celular (fotos, notas escritas, notas de voz cortas); las grabaciones largas van a YouTube y entran como enlace; se completa el mismo día, desde celular o computador; la PWA instalada es un plus, no un requisito.

## 4. Visión a futuro (lo que Santi respondió)

- **Engranajes visibles, con cuenta:** cualquier persona registrada puede ver el detrás de escena que un grupo marque como visible, incluso mientras el proceso sucede. El producto de una obra es "el compuesto de afectos", así que mostrar el proceso no le quita valor. Sirve como valor agregado, marketing, orden de datos y soporte para convocatorias.
  - **Al registrarse, una persona puede:** crear un grupo, explorar lo visible en la plataforma o (más adelante) pedir acceso a procesos cerrados, por ejemplo para una investigación. El admin puede abrir un proceso cerrado a esa persona o a otro grupo, y a otros más.
  - **Modelo "versión abierta / versión de plataforma":** el grupo decide qué versión estable del proceso publica, mientras la puesta en escena conserva sus implementaciones propias.
- **Lo compartible:** planteamientos, ejercicios y hallazgos, como casos de uso. Decide el Owner, según cada proceso.
- **Consentimiento:** dentro del grupo, con políticas claras (el "acuerdo de visibilidad" de cada obra).
- **Del registro al taller:** cuando una secuencia de ejercicios se repite, se puede empaquetar como taller guiado o abierto.
- **Catálogo de consulta** común a todos los grupos, ordenable por cantidad de usos y hallazgos.
- **Subproductos digitales** de la creación.
- **Servicio de pago (largo plazo):** monitorear convocatorias estatales, cruzarlas con obras afines y ayudar a postular con lo ya registrado.
- **IA en tres momentos, con juicio:** registrar (traducir fotos y audios a estructura), proponer (sugerir ejercicios) y mostrar (que quien explora converse con lo visible). La IA es memoria y archivo del grupo, no directora.
- **Construcción:** Santi solo por ahora. Maneja web en general (backend, frontend, arquitectura). Quiere un MVP estable y sencillo, sin complicar lo que es "para mucho más allá".

## 5. Decisiones técnicas

1. **Primera versión (31 oct):** repositorio de markdown en `art-flux/data/grupos/conversonantes`, con plantillas y nueve fichas (A1…C7). Lo armado como sesión 1 es en realidad la sesión 2.
2. **Cambio (1 nov):** el markdown no es mantenible como fuente de verdad.
3. **Decisión:** la fuente de verdad es **Supabase** (Postgres, login con Google, Row Level Security). Los **archivos van a Cloudflare R2** (ver sección 9). El **markdown queda como formato de exportación**. Los md actuales y el catálogo semilla entran por script de importación.

### Esquema propuesto (borrador, actualizado 1 nov noche)

```
grupos              id, nombre, ciudad
miembros            grupo_id, user_id, permiso (admin | miembro)
obras               id, grupo_id, titulo, estado, temas[], acuerdo_visibilidad, visibilidad
obra_equipo         obra_id, user_id, roles[]
sesiones            id, grupo_id, obra_id (opcional), numero, fecha, lugar, objetivo,
                    estado, acuerdos, tareas, imprevistos, visibilidad
asistentes          sesion_id, user_id
planteamientos      id, sesion_id, orden, texto, responsable_id, visibilidad
hallazgo_fragmentos id, planteamiento_id, autor_id, tipo (encontrado | falto), texto,
                    creado_en, id_cliente
ejercicios          id, grupo_id (null = semilla), nombre, categoria_id, codigo (opcional),
                    cuando_usar, consignas (md), que_observar (md), propuesto_por, visibilidad
categorias          id, nombre, descripcion, orden
etiquetas           id, faceta, nombre, slug, descripcion
ejercicio_etiquetas ejercicio_id, etiqueta_id
referentes          ejercicio_id, ejercicio_ref_id | texto, es_derivacion
planteamiento_ejercicios   planteamiento_id, ejercicio_id, variante
usos_externos       id, ejercicio_id, quien, cuando, contexto, hallazgo, fuente_url
comentarios         planteamiento_id | material_id, user_id, texto
material            id, obra_id, sesion_id (opcional), planteamiento_id (opcional),
                    tipo (foto | audio | documento | enlace), url | storage_path,
                    subido_por, creado_en, id_cliente, estado

-- después del MVP
accesos             obra_id, user_id | grupo_id, otorgado_por, hasta
```

- **Visibilidad es un nivel, no un booleano:** en el MVP `grupo | plataforma`; más adelante se agrega `compartido` (para los accesos otorgados) sin migrar datos.
- **Una sola función decide quién ve qué:** todas las reglas de RLS llaman a `puede_ver(usuario, obra)`. Cuando lleguen los accesos otorgados, basta con crear `accesos` y cambiar esa función.
- `inspiraciones` pasa a llamarse `referentes` y gana `es_derivacion` (para HU-22).
- **Hallazgos por fragmentos (1 nov):** cada aporte es una fila con autor y tipo; reemplaza las columnas `hallazgo_encontrado` y `hallazgo_falto`. Evita conflictos al escribir varios a la vez y da la autoría por color.
- **`id_cliente`** en material y fragmentos: id generado en el celular para que la sincronización sin conexión sea idempotente.
- Borrado suave en todas las tablas; migraciones versionadas; dos entornos (prueba y real).

### MVP (historias de usuario, 1 nov)

- **Corte 1 · Registrar ya (13 historias):** entrar con Google (sin grupo: crear grupo o explorar), crear grupo, invitar por enlace, crear obra, equipo y roles, crear sesión (también con fecha pasada), planteamientos con responsable, mis sesiones y planteamientos, marcar realizada con asistentes, escribir hallazgo, subir material (fotos, notas de voz, documentos, enlaces), acuerdos/tareas/imprevistos, bitácora de sesión. Objetivo: registrar las sesiones 1 y 2 de *Cristina*.
- **Corte 2 · Catálogo vivo (7):** ejercicios al planteamiento, catálogo semilla cargado, crear ejercicio, citar referentes, buscar y filtrar, ficha con usos y rastro, derivar ejercicio.
- **Corte 3 · Abrir la puerta (6):** gestionar miembros, comentarios, usos externos, marcar visible en la plataforma, explorar procesos visibles (con cuenta), exportar a markdown.
- **Decisiones por confirmar:** catálogo semilla público y sin grupo; referentes solo hacia ejercicios de la app (lo de fuera, como texto); publicar lo decide el admin; hallazgo por planteamiento (no por ejercicio). Confirmado: subir archivos y notas de voz (hasta 3 min) entran al corte 1.
- **Fuera del MVP:** IA de registro y de sugerencias, nivel red, pedir acceso (unirse a un grupo o ver un proceso cerrado; el admin lo abre a una persona o grupo), publicar versión, talleres, sugerir etiquetas desde la app, eventos, convocatorias, subir video directo (va como enlace).
- **Riesgo principal:** que el grupo no registre después de ensayar.

## 6. La obra en montaje: *Cristina*

- Dramaturgia escrita por Santi hace tiempo.
- **Equipo:** Santi (dramaturgo; trae los ejercicios de análisis), Manuela "Manu" (calentamiento corporal), Kokoro (improvisación; también se llama Katerina, pero siempre se le dice Kokoro). Roles formales por confirmar.

### Sesión 1 · reencuentro (fecha por confirmar)

- Improvisada, sin ejercicios formales. Café, conversación sobre inquietudes creativas, lectura de textos y referentes. Leyeron *Cristina* en voz alta y se engancharon.
- **Acuerdos:** montar *Cristina*, un calendario de trabajo, y repartir tareas para la sesión 2.

### Sesión 2 · Universidad Nacional (fecha por confirmar)

- **Objetivo:** analizar el texto, trabajar sus puntos fuertes y seguir ahondando.
- **P1 · Calentamiento corporal (Manu):** saludo al sol, calidades de movimiento, juegos, parada de cabeza. Posibles fuentes: yoga, plásticos de Grotowski, esfuerzos de Laban. Hallazgo: conexión respiratoria. Descripción pendiente.
- **P2 · Improvisación (Kokoro):** el 1-2-3 en pareja y otros. Referente encontrado: *Two by Three by Bradford*. Descripción pendiente.
- **P3 · Análisis de acciones por personaje (Santi):** acciones muy claras, timeline de acciones, sentido de las acciones, los caracteres empiezan a separarse. Pariente: "acontecimientos y fuerzas en pugna" del TEC; siguiente paso natural: étude de análisis activo.
- **Imprevisto:** cierre forzado por lluvia.

### Por conocer

- Fechas de ambas sesiones; sinopsis de *Cristina*; roles formales; descripciones de Manu y Kokoro; el timeline de acciones; calendario acordado.

## 7. Preguntas abiertas

- ¿CC0 o CC BY-SA para lo que se publique?
- ¿Basta el acuerdo del grupo para publicar, o cada artista aprueba lo que lo involucra?
- ¿Qué ve primero quien explora: fichas sueltas o un recorrido narrado del proceso?
- ¿El repo `art-flux` de markdown (fase 0) se reutiliza para la app o se crea uno nuevo?
- ¿Cómo se marca la "versión estable" que el grupo publica (como un release)?
- Taxonomía: cupo diez, granularidad, alias en inglés (ver el doc de taxonomía).
- ¿Catálogo grande después de las 20 fichas semilla?

## 8. Material existente

- "Formatos de creación abierta — Conversonantes" (Claude Docs): formatos de ejercicio, sesión y obra.
- "Taxonomía de ejercicios · art-flux" (Claude Docs): categorías, facetas, bibliografía; pestaña "Catálogo semilla" con 20 fichas.
- "Historias de usuario · art-flux MVP" (Claude Docs): principios, roles, mapa de historias, 26 historias con criterios, requisitos de estabilidad, fuera del MVP, decisiones por confirmar.
- "Arquitectura · art-flux MVP" (Claude Docs): https://claude.ai/artifact/SBxVrUWoaEuXApqX2PRMEb
- Canvas "art-flux · exploración visual" y `claude/diseno-visual-art-flux.md`: dirección B (grafito y resaltador).
- `CLAUDE.md` para la raíz del repo (preparado el 1 nov, para trabajar en Claude Code).
- Cuatro fotos del cuaderno: definición de sesión, mapa de ejercicios, diagrama del dominio y mockup del flujo.
- Carpeta `art-flux/data/grupos/conversonantes` en el computador de Santi (markdown, fase 0).

## 9. Arquitectura (decidida el 1 nov)

Detalle completo en el doc "Arquitectura · art-flux MVP".

- **Nombre:** art-flux.
- **Principio:** Postgres es el contrato, no Supabase. RLS sencilla responde quién puede *ver* (`puede_ver`, `es_miembro`); el `core` en TypeScript responde quién puede *hacer* qué y cuándo. Si una política necesita más de un `exists`, va al `core`.
- **Backend:** monorepo con `packages/core` (dominio, Zod, casos de uso, interfaces; no conoce Supabase), `packages/adapters` (supabase-js, SDK S3 para R2) y `apps/api` (Hono en Netlify Functions). La API crea un cliente de Supabase con el JWT del usuario en cada petición para que RLS siga aplicando; `service_role` solo en scripts.
- **Login:** Supabase Auth con Google, directo desde la web; la API solo verifica el token.
- **Frontend:** SPA con Vite + React + TypeScript, TanStack Router y Query, Tailwind con los tokens de la dirección B, vite-plugin-pwa, Zod compartido, IndexedDB (Dexie). Sin Next (no hay SEO ni usuarios anónimos; la lógica de servidor vive en la API). Capacitor queda como puerta a las tiendas.
- **Registro sin conexión:** botón "Registrar" → foto, nota escrita, nota de voz (hasta 3 min) o enlace. Se guarda en IndexedDB con `id_cliente`, se comprime, y una cola sube cuando hay red: la API registra el material → URL firmada → subida directa a R2 → confirmación. En iPhone no hay sincronización en segundo plano: contador visible de pendientes.
- **Archivos:** R2, bucket privado, ruta `grupos/{grupo_id}/obras/{obra_id}/{material_id}.{ext}`, lectura con URL firmada si `puede_ver()`. Video solo como enlace. ~12 MB por ensayo.
- **Infraestructura (0 USD al arrancar):** Supabase Free (proyectos `prueba` y `real`), R2 Free (10 GB), Netlify Free (300 créditos), GitHub Actions para despliegue y `pg_dump` semanal a R2. Supabase Pro (25 USD/mes) cuando entre un segundo grupo.
- **Entornos:** local (Supabase CLI, `netlify dev`), prueba (previews por PR), real (al fusionar en `main`). Vitest para el `core`, pgTAP para RLS.
