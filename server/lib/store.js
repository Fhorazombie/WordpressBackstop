const fs = require('fs');
const path = require('path');

/**
 * Lee un archivo JSON, devolviendo un valor por defecto si no existe o está corrupto.
 */
function readJson(filePath, defaultValue) {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return defaultValue;
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`⚠️  No se pudo leer ${filePath}: ${error.message}`);
    return defaultValue;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

module.exports = { readJson, writeJson };
