# Changelog

---

## [Unreleased] — 2026-06-22

### Añadido

#### Modo 3: Comparación Diseño vs. Live URL

Nueva funcionalidad que permite comparar una imagen de diseño estática (exportada de Figma o enviada por un diseñador UX/UI) contra una URL viva utilizando BackstopJS.

**Archivos creados:**
- `scripts/generate-from-design.js` — script principal del nuevo modo

**Archivos modificados:**
- `package.json` — nuevos scripts `design-generate` y `design-compare`
- `scripts/reset-backstop.js` — agrega `backstop_data/design_reference/` al cleanup
- `.gitignore` — agrega `backstop_data/design_reference/` explícitamente
- `.env.EXAMPLE` — documenta las nuevas variables de entorno
- `docs/01-overview.md` — actualiza características, arquitectura y flujo de trabajo
- `docs/04-usage.md` — agrega Modo 3 con workflow completo

**Carpetas nuevas:**
- `img/` — carpeta para guardar imágenes de diseño exportadas de Figma (versionada)
- `backstop_data/design_reference/` — generada en runtime, en `.gitignore`

#### Comportamiento clave

- El **ancho del viewport** se extrae automáticamente del ancho de la imagen PNG/JPG (sin dependencias npm adicionales — lee el chunk IHDR de PNG y el marcador SOF0/SOF2 de JPEG con Node.js puro).
- Dominios locales (`localhost`, `.test`, `.local`, `192.168.x`, `10.x`) se detectan automáticamente: se omite la verificación SSL del navegador (`--ignore-certificate-errors`) y de Node.js (`NODE_TLS_REJECT_UNAUTHORIZED=0`).
- `requireSameDimensions: false` para permitir que el diseño (altura fija) y el live site (altura variable) difieran en alto sin causar falsos positivos.
- La imagen de diseño se sirve como `file://` URL local vía un wrapper HTML — no se necesita servidor HTTP.

#### Comandos

```bash
# Paso 1: generar config (lee DESIGN_IMAGE y DESIGN_URL del .env)
npm run design-generate

# Paso 2: capturar diseño como referencia + comparar contra live
npm run design-compare

# Limpiar todo (incluye design_reference/)
npm run reset
```

#### Variables de entorno nuevas

| Variable | Descripción | Default |
|----------|-------------|---------|
| `DESIGN_IMAGE` | Ruta a la imagen PNG/JPG de diseño | — (requerida) |
| `DESIGN_URL` | URL a comparar (fallback: `SITE_URL`) | — (requerida) |
| `DESIGN_LABEL` | Nombre del escenario en el reporte | nombre del archivo |
| `DESIGN_THRESHOLD` | Tolerancia de diferencia (0–100) | `0.1` |
| `DESIGN_HIDE` | Selectores CSS a ocultar (separados por coma) | — |
| `DESIGN_VIEWPORT_HEIGHT` | Alto del viewport en px | `900` |

#### Configuración activa (`.env`)

```
DESIGN_IMAGE=./img/5a3f4d26-6c45-4686-a963-df06c64f4382.png
DESIGN_URL=http://www.amcedh.casamecate.local/
```
