/**
 * art-flux · preset de Tailwind · dirección B "Grafito y resaltador"
 * Uso en apps/web/tailwind.config.js:
 *   presets: [require("../../design/tailwind.preset.js")]
 * Los valores vienen de design/tokens.css (variables --af-*).
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        fondo: "var(--af-fondo)",
        hoja: "var(--af-hoja)",
        linea: "var(--af-linea)",
        grafito: "var(--af-grafito)",
        gris: "var(--af-gris)",
        resaltador: "var(--af-resaltador)",
        verde: "var(--af-verde)",
        cat: {
          encuentro: "var(--af-cat-encuentro)",
          atencion: "var(--af-cat-atencion)",
          cuerpo: "var(--af-cat-cuerpo)",
          voz: "var(--af-cat-voz)",
          juego: "var(--af-cat-juego)",
          analisis: "var(--af-cat-analisis)",
          personaje: "var(--af-cat-personaje)",
          composicion: "var(--af-cat-composicion)",
          reflexion: "var(--af-cat-reflexion)",
        },
      },
      fontFamily: {
        interfaz: "var(--af-font-interfaz)",
        lectura: "var(--af-font-lectura)",
        mono: "var(--af-font-mono)",
      },
      borderRadius: {
        af: "var(--af-radio)",
        "af-chico": "var(--af-radio-chico)",
      },
      minHeight: { tactil: "var(--af-tactil)" },
      minWidth: { tactil: "var(--af-tactil)" },
    },
  },
};

/**
 * Orden de las categorías tal como las guarda la tabla `categorias`.
 * Útil para pintar chips: categoriaColor[ejercicio.categoria_orden].
 */
module.exports.categorias = [
  { orden: 1, nombre: "Encuentro y grupo", token: "cat-encuentro" },
  { orden: 2, nombre: "Atención y presencia", token: "cat-atencion" },
  { orden: 3, nombre: "Cuerpo y movimiento", token: "cat-cuerpo" },
  { orden: 4, nombre: "Voz y palabra", token: "cat-voz" },
  { orden: 5, nombre: "Juego e improvisación", token: "cat-juego" },
  { orden: 6, nombre: "Análisis del material", token: "cat-analisis" },
  { orden: 7, nombre: "Personaje y relación", token: "cat-personaje" },
  { orden: 8, nombre: "Composición y montaje", token: "cat-composicion" },
  { orden: 9, nombre: "Reflexión y registro", token: "cat-reflexion" },
];
