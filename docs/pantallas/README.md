# Pantallas del recorrido B

26 pantallas del canvas "art-flux · exploración visual" (página "Recorrido B"), exportadas el 1 de noviembre de 2026. El nombre de cada archivo empieza por la historia de usuario que dibuja (`hu-07-crear-sesion`), para cruzarlo con `docs/historias-de-usuario.md`.

- **`*.png`**: captura a 390 px de ancho (celular), escala 2x. Las tipografías de las capturas son aproximadas (Inter, Charter y DejaVu Sans Mono en lugar de Bricolage Grotesque, Source Serif 4 y JetBrains Mono), porque se generaron sin acceso a Google Fonts. Usa las capturas para la composición, no para medir la letra.
- **`html/*.html`**: la misma pantalla como HTML autónomo con estilos en línea. Abierto en un navegador con internet carga las fuentes reales. Es la referencia exacta de medidas, colores y espaciados, y los enlaces entre pantallas funcionan.

Al construir una pantalla en React, traduce los estilos en línea a las clases del preset (`design/tailwind.preset.js`); no copies los colores a mano.

Las pantallas son anteriores a las decisiones de arquitectura del 1 de noviembre en la noche. Donde no coincidan, mandan `docs/arquitectura.md` y `CLAUDE.md`:

- `hu-13-registrar-material`: la hoja de "Registrar" debe ofrecer Foto · Nota escrita · Nota de voz (hasta 3 min) · Enlace, guardar sin conexión y mostrar el contador de pendientes.
- `hu-12-hallazgo`: cada aporte es un fragmento con autor (`hallazgo_fragmentos`), no un solo texto compartido.
- Material sin sesión: queda como material de la obra, comentable (no hay pantalla propia todavía).

Los textos entre corchetes (`[fecha]`, `[Objetivo de la sesión 3]`) son supuestos por completar.
