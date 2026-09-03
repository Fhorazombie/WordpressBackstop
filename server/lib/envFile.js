const fs = require('fs');
const dotenv = require('dotenv');
const { ENV_FILE } = require('./paths');

// Variables que expone el editor de Configuración de la UI.
// Se mantienen en el mismo orden que .env.EXAMPLE para que el archivo
// generado sea legible.
const KNOWN_KEYS = [
  'SITE_URL',
  'SITEMAP_URL',
  'SITEMAP_SAMPLE_MODE',
  'SAMPLE_SIZE',
  'MAX_URLS',
  'TIMEOUT',
  'SCENARIO_DELAY',
  'SCENARIO_HIDE',
  'SCENARIO_REMOVE',
  'PROJECT_ID',
  'BACKSTOP_DATA_DIR',
  'URL_LIST',
  'REQUEST_HEADERS',
  'REJECT_UNAUTHORIZED',
  'DEBUG',
  'MAX_CONCURRENT_RUNS'
];

function readEnv() {
  const values = {};
  if (fs.existsSync(ENV_FILE)) {
    const parsed = dotenv.parse(fs.readFileSync(ENV_FILE, 'utf8'));
    Object.assign(values, parsed);
  }
  const result = {};
  for (const key of KNOWN_KEYS) {
    result[key] = values[key] !== undefined ? values[key] : '';
  }
  return result;
}

/**
 * Actualiza (o agrega) las claves conocidas dentro de .env, preservando
 * el resto del archivo (comentarios, orden, variables no gestionadas por la UI).
 */
function writeEnv(updates) {
  let lines = [];
  if (fs.existsSync(ENV_FILE)) {
    lines = fs.readFileSync(ENV_FILE, 'utf8').split('\n');
  }

  const seen = new Set();
  const nextLines = lines.map(line => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=/i);
    if (!match) return line;
    const key = match[1];
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      seen.add(key);
      const value = updates[key];
      if (value === undefined || value === null || value === '') {
        return `# ${key}=`;
      }
      return `${key}=${value}`;
    }
    return line;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (seen.has(key)) continue;
    if (value === undefined || value === null || value === '') continue;
    nextLines.push(`${key}=${value}`);
  }

  fs.writeFileSync(ENV_FILE, nextLines.join('\n'), 'utf8');

  // Recargar en el proceso actual para que las siguientes lecturas de
  // configuración (getBaseConfig, etc.) vean los nuevos valores.
  const parsed = dotenv.parse(fs.readFileSync(ENV_FILE, 'utf8'));
  Object.assign(process.env, parsed);

  return readEnv();
}

module.exports = { KNOWN_KEYS, readEnv, writeEnv };
