const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const crypto = require('crypto');

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
      delay: 5000,
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
    const configPath = path.join(__dirname, '..', '..', 'backstop.json');
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
  getBaseConfig
};
