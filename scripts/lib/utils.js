const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const crypto = require('crypto');

/**
 * Ruta del archivo de configuración de BackstopJS a leer/escribir. Por
 * defecto es el backstop.json de la raíz (uso normal por CLI/terminal).
 * El dashboard la sobrescribe con un archivo aislado por corrida
 * (BACKSTOP_CONFIG_FILE), para que dos ejecuciones concurrentes nunca
 * lean ni pisen el mismo archivo.
 */
function getConfigFilePath() {
  return process.env.BACKSTOP_CONFIG_FILE || path.join(__dirname, '..', '..', 'backstop.json');
}

/**
 * Obtiene los headers para las peticiones HTTP desde variables de entorno
 * @returns {Object} Headers configurados
 */
function getRequestHeaders() {
  return process.env.REQUEST_HEADERS 
    ? JSON.parse(process.env.REQUEST_HEADERS)
    : {
        'User-Agent': 'Mozilla/5.0 (compatible; BackstopJS-SitemapParser/1.0)',
        'Accept': 'application/xml, text/xml, */*'
      };
}

/**
 * Detecta si un dominio es local (requiere certificado autofirmado)
 * @param {string} url - URL a verificar
 * @returns {boolean} - true si es un dominio local
 */
function isLocalDomain(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    return hostname === 'localhost' || 
           hostname.endsWith('.test') || 
           hostname.endsWith('.local') ||
           hostname.startsWith('127.') ||
           hostname.startsWith('192.168.') ||
           hostname.startsWith('10.') ||
           hostname === '0.0.0.0';
  } catch (error) {
    return false;
  }
}

/**
 * Detecta si es un dominio local y configura SSL apropiadamente
 * @param {string} targetUrl - URL objetivo para verificar si es local
 */
function detectAndConfigureSSL(targetUrl) {
  try {
    const isLocal = isLocalDomain(targetUrl);
    
    // Configuración SSL para certificados autofirmados
    const REJECT_UNAUTHORIZED = process.env.REJECT_UNAUTHORIZED !== undefined
      ? process.env.REJECT_UNAUTHORIZED === 'true' || process.env.REJECT_UNAUTHORIZED === '1'
      : null; // null = auto-detectar
    
    const shouldRejectUnauthorized = REJECT_UNAUTHORIZED !== null 
      ? REJECT_UNAUTHORIZED 
      : !isLocal; // Auto-detectar: si es local, no rechazar certificados autofirmados
    
    if (!shouldRejectUnauthorized && !process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      if (isLocal) {
        console.log(`🔓 Detectado dominio local, deshabilitando verificación SSL...`);
      }
    }
  } catch (error) {
    // Si hay error parseando la URL, no hacer nada
  }
}

/**
 * Genera un label legible desde una URL
 * @param {string} url - URL completa
 * @returns {string} - Label formateado
 */
function generateLabel(url) {
  try {
    const urlObj = new URL(url);
    let pathname = urlObj.pathname;
    
    // Remover slash inicial y final
    pathname = pathname.replace(/^\/|\/$/g, '');
    
    if (!pathname || pathname === '') {
      return 'Homepage';
    }
    
    // Capitalizar y formatear
    return pathname
      .split('/')
      .map(part => {
        return part
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      })
      .join(' - ');
  } catch (error) {
    return url;
  }
}

/**
 * Genera escenarios de BackstopJS desde las URLs
 * @param {string[]} urls - Array de URLs
 * @returns {Object[]} - Array de escenarios
 */
function generateScenarios(urls) {
  // Obtener configuración de directorios desde variables de entorno
  const SCRIPTS_DIR = process.env.BACKSTOP_SCRIPTS_DIR || 'backstop_data/engine_scripts';
  // Tiempo de espera antes de capturar cada página (ms). Subilo para sitios
  // con animaciones, lazy-load o contenido que tarda en renderizar.
  const DELAY = process.env.SCENARIO_DELAY ? parseInt(process.env.SCENARIO_DELAY, 10) : 5000;

  // Selectores a aplicar en TODOS los escenarios generados (headers, banners
  // de cookies, widgets de chat, etc. que se repiten en todo el sitio).
  // SCENARIO_HIDE = visibility:hidden (oculta, pero reserva su espacio).
  // SCENARIO_REMOVE = display:none (lo saca del flujo, el contenido de abajo sube).
  const splitSelectors = value => (value ? value.split(',').map(s => s.trim()).filter(Boolean) : []);
  const HIDE_SELECTORS = splitSelectors(process.env.SCENARIO_HIDE);
  const REMOVE_SELECTORS = splitSelectors(process.env.SCENARIO_REMOVE);

  return urls.map(url => {
    const labelBase = generateLabel(url);
    // Generar hash corto para unicidad y evitar nombres de archivo largos
    const hash = crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
    
    // Sanitizar label para evitar caracteres inválidos en Windows y limitar longitud
    // Caracteres prohibidos en Windows: < > : " / \ | ? *
    let safeLabel = labelBase.replace(/[<>:"/\\|?*]/g, '').trim();
    
    // Limitar la longitud del nombre legible para evitar errores de MAX_PATH
    if (safeLabel.length > 60) {
      safeLabel = safeLabel.substring(0, 60).trim();
    }
    
    return {
      label: `${safeLabel} [${hash}]`,
      cookiePath: `${SCRIPTS_DIR}/cookies.json`,
      url,
      referenceUrl: "",
      readySelector: "body",
      delay: DELAY,
      hideSelectors: HIDE_SELECTORS,
      removeSelectors: REMOVE_SELECTORS,
      selectors: [],
      misMatchThreshold: 0.1,
      requireSameDimensions: true
    };
  });
}

/**
 * Lee la configuración base de BackstopJS
 * @returns {Object} - Configuración base
 */
function getBaseConfig() {
  // Obtener configuración desde variables de entorno
  const PROJECT_ID = process.env.PROJECT_ID || 'backstop_default';
  const CUSTOM_DATA_DIR = process.env.BACKSTOP_DATA_DIR;
  const DATA_DIR = CUSTOM_DATA_DIR ? path.join('backstop_data', CUSTOM_DATA_DIR) : 'backstop_data';
  const SCRIPTS_DIR = process.env.BACKSTOP_SCRIPTS_DIR || 'backstop_data/engine_scripts';
  
  let baseConfig = {};
  
  try {
    const configPath = getConfigFilePath();
    if (fs.existsSync(configPath)) {
      const existing = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      // Mantener toda la configuración excepto los escenarios
      const { scenarios, ...rest } = existing;
      baseConfig = rest;
    }
  } catch (error) {
    console.warn('⚠️  No se pudo leer backstop.json existente, usando configuración por defecto');
  }
  
  // Configuración por defecto
  const defaultConfig = {
    viewports: [
      {
        label: "phone",
        width: 320,
        height: 480
      },
      {
        label: "tablet",
        width: 1024,
        height: 768
      }
    ],
    report: ["browser"],
    engine: "puppeteer",
    engineOptions: {
      args: ["--no-sandbox"]
    },
    // Recorre la página antes de capturar, para disparar contenido con
    // lazy-load (imágenes, secciones con IntersectionObserver, etc.) que
    // de otra forma queda en blanco aunque el "delay" sea muy alto.
    // Ver backstop_data/engine_scripts/onReady.js
    onReadyScript: "onReady.js",
    asyncCaptureLimit: 5,
    asyncCompareLimit: 50,
    debug: false,
    debugWindow: false
  };

  // Mezclar configuración existente con defaults (existente tiene preferencia)
  const config = { ...defaultConfig, ...baseConfig };

  // Sobrescribir ID y Paths con variables de entorno para personalización dinámica
  config.id = PROJECT_ID;
  config.paths = {
    bitmaps_reference: `${DATA_DIR}/bitmaps_reference`,
    bitmaps_test: `${DATA_DIR}/bitmaps_test`,
    engine_scripts: SCRIPTS_DIR,
    html_report: `${DATA_DIR}/html_report`,
    ci_report: `${DATA_DIR}/ci_report`
  };

  return config;
}

module.exports = {
  getRequestHeaders,
  isLocalDomain,
  detectAndConfigureSSL,
  generateLabel,
  generateScenarios,
  getBaseConfig,
  getConfigFilePath
};
