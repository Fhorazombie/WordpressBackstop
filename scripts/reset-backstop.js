#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const ROOT = path.resolve(__dirname, '..');
const CUSTOM_DATA_DIR = process.env.BACKSTOP_DATA_DIR;
const DATA_DIR = CUSTOM_DATA_DIR ? path.join('backstop_data', CUSTOM_DATA_DIR) : 'backstop_data';
const SCRIPTS_DIR = process.env.BACKSTOP_SCRIPTS_DIR || 'backstop_data/engine_scripts';

const pathsToRemove = [
  // Carpetas del proyecto personalizado (si existe)
  `${DATA_DIR}/bitmaps_reference`,
  `${DATA_DIR}/bitmaps_test`,
  `${DATA_DIR}/html_report`,
  `${DATA_DIR}/ci_report`,
  
  // Carpetas por defecto de backstop_data
  'backstop_data/bitmaps_reference',
  'backstop_data/bitmaps_test',
  'backstop_data/html_report',
  'backstop_data/ci_report',
  
  // Scripts de puppet
  `${SCRIPTS_DIR}/puppet`,

  // Archivo de configuración generado
  'backstop.json',

  // Opcional: borrar recordings copiados
  'puppet'
];

function remove(targetPath) {
  const fullPath = path.join(ROOT, targetPath);

  if (fs.existsSync(fullPath)) {
    fs.rmSync(fullPath, { recursive: true, force: true });
    console.log(`🗑️  Eliminado: ${targetPath}`);
  } else {
    console.log(`✔️  No existe: ${targetPath}`);
  }
}

console.log('🧨 RESET TOTAL BACKSTOP / PUPPETEER');
console.log('----------------------------------');

pathsToRemove.forEach(remove);

console.log('\n✨ Proyecto limpio. Listo para empezar de nuevo.');
