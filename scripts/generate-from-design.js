#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
require('dotenv').config();

const {
  detectAndConfigureSSL,
  isLocalDomain,
  getBaseConfig
} = require('./lib/utils');

// ─── Configuración desde env vars ────────────────────────────────────────────
const DESIGN_IMAGE      = process.env.DESIGN_IMAGE;
const DESIGN_URL        = process.env.DESIGN_URL || process.env.SITE_URL;
const DESIGN_LABEL      = process.env.DESIGN_LABEL || '';
const DESIGN_THRESHOLD  = parseFloat(process.env.DESIGN_THRESHOLD) || 0.1;
const DESIGN_HIDE       = process.env.DESIGN_HIDE || '';
const DESIGN_VP_HEIGHT  = parseInt(process.env.DESIGN_VIEWPORT_HEIGHT) || 900;
const SCRIPTS_DIR       = process.env.BACKSTOP_SCRIPTS_DIR || 'backstop_data/engine_scripts';

const ROOT         = path.resolve(__dirname, '..');
const OUTPUT_FILE  = path.join(ROOT, 'backstop.json');
const DESIGN_REF_DIR = path.join(ROOT, 'backstop_data', 'design_reference');

// ─── Detección de dimensiones PNG (bytes 16-23 del chunk IHDR) ────────────────
function getPngDimensions(filePath) {
  const buf = Buffer.alloc(24);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buf, 0, 24, 0);
  fs.closeSync(fd);

  // Verificar firma PNG
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4E || buf[3] !== 0x47) {
    return null;
  }

  return {
    width:  buf.readUInt32BE(16),
    height: buf.readUInt32BE(20)
  };
}

// ─── Detección de dimensiones JPEG (marcadores SOF0/SOF2) ────────────────────
function getJpegDimensions(filePath) {
  const buf = fs.readFileSync(filePath);

  for (let i = 0; i < buf.length - 9; i++) {
    if (buf[i] === 0xFF && (buf[i + 1] === 0xC0 || buf[i + 1] === 0xC2)) {
      return {
        height: buf.readUInt16BE(i + 5),
        width:  buf.readUInt16BE(i + 7)
      };
    }
  }
  return null;
}

function getImageDimensions(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const dims = ext === '.png' ? getPngDimensions(filePath) : getJpegDimensions(filePath);

  if (!dims || dims.width === 0 || dims.height === 0) {
    console.error(`❌ No se pudieron leer las dimensiones de la imagen: ${filePath}`);
    console.error('   El archivo puede estar corrupto o en un formato no soportado.');
    process.exit(1);
  }

  return dims;
}

// ─── Validaciones ─────────────────────────────────────────────────────────────
function validate() {
  if (!DESIGN_IMAGE) {
    console.error('❌ Error: Debes definir la variable de entorno DESIGN_IMAGE');
    console.error('\n💡 Uso:');
    console.error('   DESIGN_IMAGE=./designs/homepage.png DESIGN_URL=https://misite.com npm run design-generate');
    console.error('   O agrega las variables a tu archivo .env');
    process.exit(1);
  }

  const imagePath = path.resolve(process.cwd(), DESIGN_IMAGE);

  if (!fs.existsSync(imagePath)) {
    console.error(`❌ Error: La imagen no existe: ${imagePath}`);
    console.error('   Verifica la ruta o usa una ruta absoluta.');
    process.exit(1);
  }

  const ext = path.extname(imagePath).toLowerCase();
  if (!['.png', '.jpg', '.jpeg'].includes(ext)) {
    console.error(`❌ Error: Formato de imagen no soportado: ${ext}`);
    console.error('   Solo se soportan .png, .jpg y .jpeg');
    console.error('   Exporta el diseño desde Figma como PNG para mejores resultados.');
    process.exit(1);
  }

  if (!DESIGN_URL) {
    console.error('❌ Error: Debes definir DESIGN_URL (o SITE_URL) con la URL a comparar');
    console.error('\n💡 Ejemplo:');
    console.error('   DESIGN_URL=https://misite.com npm run design-generate');
    process.exit(1);
  }

  try {
    new URL(DESIGN_URL);
  } catch {
    console.error(`❌ URL inválida: "${DESIGN_URL}"`);
    console.error('   ¿Olvidaste agregar https://? Ejemplo: https://misite.com');
    process.exit(1);
  }

  return imagePath;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🎨 Iniciando comparación Diseño vs. Live URL...\n');

  const imagePath = validate();
  const liveUrl   = DESIGN_URL;

  // Configuración SSL para dominios locales (localhost, .test, .local, 192.168.x, etc.)
  detectAndConfigureSSL(liveUrl);
  const isLocal = isLocalDomain(liveUrl);
  if (isLocal) {
    console.log('🔒 Dominio local detectado — se deshabilitará la verificación SSL en el navegador\n');
  }

  // Detectar dimensiones de la imagen para definir el ancho del viewport
  const dims = getImageDimensions(imagePath);
  console.log(`📐 Dimensiones de la imagen: ${dims.width} x ${dims.height}px`);
  console.log(`   → Viewport de prueba: ${dims.width}px de ancho (tomado de la imagen)\n`);

  // Preparar carpeta design_reference
  fs.mkdirSync(DESIGN_REF_DIR, { recursive: true });

  // Copiar imagen como design.png para que el wrapper la referencie con nombre fijo
  const destImage = path.join(DESIGN_REF_DIR, 'design.png');
  fs.copyFileSync(imagePath, destImage);
  console.log(`📄 Imagen copiada: backstop_data/design_reference/design.png`);

  // Generar wrapper HTML que muestra la imagen al 100% del ancho del viewport
  const wrapperHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; background: #ffffff; }
  img { display: block; width: 100%; }
</style>
</head>
<body>
<img src="./design.png" width="${dims.width}" height="${dims.height}" alt="Design reference">
</body>
</html>`;

  const wrapperPath = path.join(DESIGN_REF_DIR, 'wrapper.html');
  fs.writeFileSync(wrapperPath, wrapperHtml, 'utf8');
  console.log(`🌐 Wrapper HTML generado: backstop_data/design_reference/wrapper.html`);

  // URL del wrapper usando pathToFileURL (maneja barras de Windows correctamente)
  const referenceUrl = pathToFileURL(wrapperPath).href;

  // Label del escenario
  const labelBase = DESIGN_LABEL || path.basename(imagePath, path.extname(imagePath));

  // Selectores a ocultar (DESIGN_HIDE puede ser lista separada por comas)
  const hideSelectors = DESIGN_HIDE
    ? DESIGN_HIDE.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  // Clamp del threshold (0–100, BackstopJS lo usa directamente en ese rango)
  const threshold = Math.max(0, Math.min(100, DESIGN_THRESHOLD));

  // Construir escenario
  const scenario = {
    label: `Design: ${labelBase}`,
    url: liveUrl,
    referenceUrl: referenceUrl,
    cookiePath: `${SCRIPTS_DIR}/cookies.json`,
    readySelector: 'body',
    delay: 1000,
    misMatchThreshold: threshold,
    requireSameDimensions: false,
    hideSelectors: hideSelectors,
    removeSelectors: []
  };

  // Obtener configuración base (paths, engine, etc.)
  const baseConfig = getBaseConfig();

  // Flags del engine — agregar ignore-certificate-errors para dominios locales
  const engineArgs = ['--no-sandbox'];
  if (isLocal) engineArgs.push('--ignore-certificate-errors');

  const finalConfig = {
    ...baseConfig,
    viewports: [
      {
        label: 'design',
        width: dims.width,
        height: DESIGN_VP_HEIGHT
      }
    ],
    engineOptions: { args: engineArgs },
    scenarios: [scenario]
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalConfig, null, 2), 'utf8');

  console.log('\n✨ Configuración generada exitosamente!');
  console.log(`📄 Escenario : "Design: ${labelBase}"`);
  console.log(`🌐 URL live  : ${liveUrl}`);
  console.log(`📐 Viewport  : ${dims.width}px de ancho (tomado de la imagen)`);
  if (hideSelectors.length > 0) {
    console.log(`🙈 Ocultar   : ${hideSelectors.join(', ')}`);
  }
  console.log('\n💡 Siguiente paso:');
  console.log('   npm run design-compare');
  console.log('   (captura el diseño como referencia y luego compara contra el live)');
}

main().catch(error => {
  console.error('❌ Error inesperado:', error.message);
  process.exit(1);
});
