#!/usr/bin/env node

// sitemapper v4.0.2 es un módulo ES6, necesitamos importarlo dinámicamente
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

// Importar utilidades compartidas
const {
  getRequestHeaders: getRequestHeadersUtil,
  isLocalDomain: isLocalDomainUtil,
  detectAndConfigureSSL: detectAndConfigureSSLUtil,
  generateLabel: generateLabelUtil,
  generateScenarios: generateScenariosUtil,
  getBaseConfig: getBaseConfigUtil
} = require('./lib/utils');

// Configuración
const SITE_URL = process.env.SITE_URL || 'https://wordpress.org';
const SITEMAP_URL = process.env.SITE_URL + process.env.SITEMAP_URL || `${SITE_URL}/sitemap.xml`;
const OUTPUT_FILE = path.join(__dirname, '..', 'backstop.json');
const PROJECT_ID = process.env.PROJECT_ID || 'backstop_default';
const CUSTOM_DATA_DIR = process.env.BACKSTOP_DATA_DIR;
const DATA_DIR = CUSTOM_DATA_DIR ? path.join('backstop_data', CUSTOM_DATA_DIR) : 'backstop_data';
const SCRIPTS_DIR = process.env.BACKSTOP_SCRIPTS_DIR || 'backstop_data/engine_scripts';

const MAX_URLS = process.env.MAX_URLS ? parseInt(process.env.MAX_URLS) : null; // Límite opcional
const TIMEOUT = process.env.TIMEOUT ? parseInt(process.env.TIMEOUT) : 30000; // Timeout en ms

// Tiempo de espera antes de capturar cada página (ms). Subilo para sitios
// con animaciones, lazy-load o contenido que tarda en renderizar.
const SCENARIO_DELAY = process.env.SCENARIO_DELAY ? parseInt(process.env.SCENARIO_DELAY) : 5000;

const SITEMAP = process.env.SITEMAP == '0' ? false : true;
const PUPPET = process.env.PUPPET == '0' ? false : true;

// Modo de muestreo: limita URLs por sub-sitemap para pruebas rápidas
const SITEMAP_SAMPLE_MODE = process.env.SITEMAP_SAMPLE_MODE === 'true' || process.env.SITEMAP_SAMPLE_MODE === '1';
const SAMPLE_SIZE = process.env.SAMPLE_SIZE ? parseInt(process.env.SAMPLE_SIZE) : 5; // URLs por sub-sitemap

// Headers personalizados para el request (usando función de utils.js)
const REQUEST_HEADERS = getRequestHeadersUtil();

// Configuración SSL para certificados autofirmados
const REJECT_UNAUTHORIZED = process.env.REJECT_UNAUTHORIZED !== undefined
  ? process.env.REJECT_UNAUTHORIZED === 'true' || process.env.REJECT_UNAUTHORIZED === '1'
  : null; // null = auto-detectar

// Configurar SSL ANTES de cualquier import usando la función de utils.js
detectAndConfigureSSLUtil(SITEMAP_URL);

// Variable para cachear el módulo Sitemapper
let SitemapperClass = null;

// isLocalDomain ahora se importa desde utils.js
const isLocalDomain = isLocalDomainUtil;

/**
 * Obtiene la clase Sitemapper (caché del import dinámico)
 * @returns {Promise<Class>} - Clase Sitemapper
 */
async function getSitemapperClass() {
  if (!SitemapperClass) {
    try {
      // Importar sitemapper dinámicamente (ES6 module)
      const SitemapperModule = await import('sitemapper');
      SitemapperClass = SitemapperModule.default || SitemapperModule;
    } catch (error) {
      console.error('❌ Error importando sitemapper:', error.message);
      throw error;
    }
  }
  return SitemapperClass;
}

/**
 * Verifica si la respuesta es HTML en lugar de XML
 * @param {string} url - URL a verificar
 * @returns {Promise<boolean>} - true si la respuesta es HTML
 */
async function isHtmlResponse(url) {
  try {
    const https = require('https');
    const http = require('http');
    const { URL } = require('url');
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'HEAD',
      headers: REQUEST_HEADERS,
      timeout: 5000,
      rejectUnauthorized: false // Para sitios con certificados autofirmados
    };
    
    return new Promise((resolve) => {
      const req = client.request(options, (res) => {
        const contentType = res.headers['content-type'] || '';
        // Verificar si es HTML
        const isHtml = contentType.includes('text/html');
        res.destroy(); // Cerrar la conexión
        resolve(isHtml);
      });
      
      req.on('error', () => {
        resolve(false); // Si hay error, asumimos que no es HTML
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve(false); // Timeout, no podemos determinar
      });
      
      req.setTimeout(5000);
      req.end();
    });
  } catch (error) {
    // Si hay error al parsear la URL, asumimos que no es HTML
    return false;
  }
}

/**
 * Descarga y parsea un sitemap XML manualmente para obtener URLs con lastmod
 * @param {string} sitemapUrl - URL del sitemap
 * @returns {Promise<Array<{url: string, lastmod: string|null}>>} - Array de URLs con fechas
 */
async function fetchSitemapWithDates(sitemapUrl) {
  const https = require('https');
  const http = require('http');
  const { URL } = require('url');
  
  return new Promise((resolve, reject) => {
    const urlObj = new URL(sitemapUrl);
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: REQUEST_HEADERS,
      timeout: TIMEOUT,
      rejectUnauthorized: false
    };
    
    const req = client.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const urls = [];
          
          // Parsear URLs con lastmod usando regex
          // Formato: <url><loc>...</loc><lastmod>...</lastmod></url>
          const urlRegex = /<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/gi;
          let match;
          
          while ((match = urlRegex.exec(data)) !== null) {
            urls.push({
              url: match[1].trim(),
              lastmod: match[2] ? match[2].trim() : null
            });
          }
          
          resolve(urls);
        } catch (error) {
          reject(error);
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    
    req.setTimeout(TIMEOUT);
    req.end();
  });
}

/**
 * Detecta si un sitemap es un índice (contiene otros sitemaps)
 * @param {string} sitemapUrl - URL del sitemap
 * @returns {Promise<{isIndex: boolean, sitemaps: Array<{url: string, lastmod: string|null}>}>}
 */
async function detectSitemapIndex(sitemapUrl) {
  const https = require('https');
  const http = require('http');
  const { URL } = require('url');
  
  return new Promise((resolve, reject) => {
    const urlObj = new URL(sitemapUrl);
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: REQUEST_HEADERS,
      timeout: TIMEOUT,
      rejectUnauthorized: false
    };
    
    const req = client.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const sitemaps = [];
          
          // Detectar si es un sitemap index
          const isSitemapIndex = data.includes('<sitemapindex') || data.includes('</sitemapindex>');
          
          if (isSitemapIndex) {
            // Parsear sub-sitemaps con lastmod
            const sitemapRegex = /<sitemap>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/gi;
            let match;
            
            while ((match = sitemapRegex.exec(data)) !== null) {
              sitemaps.push({
                url: match[1].trim(),
                lastmod: match[2] ? match[2].trim() : null
              });
            }
          }
          
          resolve({ isIndex: isSitemapIndex, sitemaps });
        } catch (error) {
          reject(error);
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    
    req.setTimeout(TIMEOUT);
    req.end();
  });
}

/**
 * Selecciona las URLs más recientes de un array basándose en lastmod
 * @param {Array<{url: string, lastmod: string|null}>} urlsWithDates - URLs con fechas
 * @param {number} limit - Número máximo de URLs a seleccionar
 * @returns {string[]} - Array de URLs seleccionadas
 */
function selectMostRecentUrls(urlsWithDates, limit) {
  // Separar URLs con y sin fecha
  const withDate = urlsWithDates.filter(u => u.lastmod);
  const withoutDate = urlsWithDates.filter(u => !u.lastmod);
  
  // Ordenar las que tienen fecha por lastmod descendente (más recientes primero)
  withDate.sort((a, b) => {
    const dateA = new Date(a.lastmod);
    const dateB = new Date(b.lastmod);
    return dateB - dateA;
  });
  
  // Combinar: primero las más recientes, luego las sin fecha (últimas del listado)
  const combined = [...withDate, ...withoutDate.reverse()];
  
  // Tomar solo el límite especificado
  return combined.slice(0, limit).map(u => u.url);
}

/**
 * Obtiene todas las URLs de un sitemap usando sitemapper
 * El paquete sitemapper maneja automáticamente sitemaps indexados
 * @param {string} sitemapUrl - URL del sitemap inicial
 * @returns {Promise<string[]>} - Array de todas las URLs encontradas
 */
async function getAllUrlsFromSitemap(sitemapUrl) {
  try {
    console.log(`📥 Descargando sitemap: ${sitemapUrl}`);
    
    // Verificar si la respuesta es HTML
    console.log(`🔍 Verificando tipo de contenido...`);
    const isHtml = await isHtmlResponse(sitemapUrl);
    
    if (isHtml) {
      console.error(`\n❌ El sitemap está devolviendo HTML en lugar de XML.`);
      console.error(`   Esto puede indicar que:`);
      console.error(`   - El sitemap requiere autenticación`);
      console.error(`   - Hay una redirección a una página de login`);
      console.error(`   - La URL del sitemap es incorrecta`);
      console.error(`   - El servidor está bloqueando el acceso`);
      console.error(`\n💡 Soluciones:`);
      console.error(`   1. Verifica que la URL del sitemap sea correcta`);
      console.error(`   2. Si el sitio requiere autenticación, agrega headers:`);
      console.error(`      REQUEST_HEADERS='{"Cookie":"session=xxx"}' npm run generate-sitemap`);
      console.error(`   3. Verifica que el sitemap sea accesible en el navegador`);
      console.error(`   4. Intenta usar una URL específica del sitemap (ej: post-sitemap.xml)`);
      return [];
    }
    
    // Si está activado el modo de muestreo, usar lógica personalizada
    if (SITEMAP_SAMPLE_MODE) {
      console.log(`\n🎯 Modo de muestreo activado: ${SAMPLE_SIZE} URLs por sub-sitemap`);
      return await getAllUrlsWithSampling(sitemapUrl);
    }
    
    console.log(`⏳ Esto puede tomar unos momentos si hay muchos sitemaps...\n`);
    
    const Sitemapper = await getSitemapperClass();
    const sitemap = new Sitemapper({
      timeout: TIMEOUT,
      requestHeaders: REQUEST_HEADERS,
      debug: process.env.DEBUG === 'true' || process.env.DEBUG === '1'
    });
    
    const result = await sitemap.fetch(sitemapUrl);
    
    // Verificar errores en la respuesta
    if (result.errors && result.errors.length > 0) {
      console.error(`\n⚠️  Se encontraron errores al procesar el sitemap:`);
      result.errors.forEach((error, index) => {
        console.error(`   ${index + 1}. ${error.message || error} (URL: ${error.url || sitemapUrl})`);
      });
    }
    
    const { sites } = result;
    
    if (!sites || sites.length === 0) {
      console.warn('⚠️  No se encontraron URLs en el sitemap');
      if (result.errors && result.errors.length > 0) {
        console.warn('   Revisa los errores anteriores para más detalles.');
      }
      return [];
    }
    
    console.log(`✅ Total de URLs encontradas: ${sites.length}\n`);
    return sites;
    
  } catch (error) {
    console.error(`\n❌ Error obteniendo URLs del sitemap:`, error.message);
    
    // Verificar si el error indica HTML
    if (error.message && (error.message.includes('HTML') || error.message.includes('text/html'))) {
      console.error(`\n⚠️  El sitemap parece estar devolviendo HTML en lugar de XML.`);
      console.error(`   Esto puede indicar problemas de autenticación o redirección.`);
    }
    
    // Si falla con sitemap_index, intentar con sitemap.xml normal
    if (sitemapUrl.includes('sitemap_index.xml')) {
      console.log(`\n🔄 Intentando con sitemap.xml normal...`);
      const fallbackUrl = sitemapUrl.replace('sitemap_index.xml', 'sitemap.xml');
      try {
        const isHtml = await isHtmlResponse(fallbackUrl);
        if (isHtml) {
          console.error(`❌ El sitemap.xml también devuelve HTML`);
          return [];
        }
        
        const Sitemapper = await getSitemapperClass();
        const fallbackSitemap = new Sitemapper({
          timeout: TIMEOUT,
          requestHeaders: REQUEST_HEADERS,
          debug: process.env.DEBUG === 'true' || process.env.DEBUG === '1'
        });
        const result = await fallbackSitemap.fetch(fallbackUrl);
        const { sites } = result;
        if (sites && sites.length > 0) {
          console.log(`✅ Total de URLs encontradas: ${sites.length}\n`);
          return sites;
        }
      } catch (fallbackError) {
        console.error(`❌ Error con sitemap.xml:`, fallbackError.message);
      }
    }
    
    return [];
  }
}

/**
 * Obtiene URLs con muestreo: limita a N URLs por cada sub-sitemap
 * Prioriza las URLs más recientes basándose en lastmod
 * SIEMPRE incluye la homepage (SITE_URL) como primera URL
 * @param {string} sitemapUrl - URL del sitemap principal
 * @returns {Promise<string[]>} - Array de URLs muestreadas
 */
async function getAllUrlsWithSampling(sitemapUrl) {
  const allUrls = [];
  
  // Normalizar SITE_URL para comparación (sin trailing slash)
  const normalizedSiteUrl = SITE_URL.replace(/\/+$/, '');
  const homepageVariants = [
    normalizedSiteUrl,
    normalizedSiteUrl + '/',
    normalizedSiteUrl + '/index.html',
    normalizedSiteUrl + '/index.php'
  ];
  
  try {
    // Detectar si es un sitemap index
    const { isIndex, sitemaps } = await detectSitemapIndex(sitemapUrl);
    
    if (isIndex && sitemaps.length > 0) {
      console.log(`📋 Detectado sitemap index con ${sitemaps.length} sub-sitemaps\n`);
      
      // Procesar cada sub-sitemap
      for (const subsitemap of sitemaps) {
        try {
          console.log(`   📥 Procesando: ${subsitemap.url}`);
          
          // Obtener URLs con fechas del sub-sitemap
          const urlsWithDates = await fetchSitemapWithDates(subsitemap.url);
          
          if (urlsWithDates.length === 0) {
            console.log(`      ⚠️  Sin URLs`);
            continue;
          }
          
          // Seleccionar las más recientes
          const selectedUrls = selectMostRecentUrls(urlsWithDates, SAMPLE_SIZE);
          
          console.log(`      ✓ ${selectedUrls.length}/${urlsWithDates.length} URLs seleccionadas (más recientes)`);
          
          allUrls.push(...selectedUrls);
        } catch (error) {
          console.log(`      ❌ Error: ${error.message}`);
        }
      }
    } else {
      // No es un index, procesar como sitemap normal
      console.log(`📋 Sitemap simple (no es un index)`);
      
      const urlsWithDates = await fetchSitemapWithDates(sitemapUrl);
      
      if (urlsWithDates.length > 0) {
        const selectedUrls = selectMostRecentUrls(urlsWithDates, SAMPLE_SIZE);
        console.log(`   ✓ ${selectedUrls.length}/${urlsWithDates.length} URLs seleccionadas (más recientes)`);
        allUrls.push(...selectedUrls);
      }
    }
    
    // Verificar si la homepage ya está incluida
    const hasHomepage = allUrls.some(url => {
      const normalizedUrl = url.replace(/\/+$/, '');
      return homepageVariants.includes(normalizedUrl) ||
             homepageVariants.includes(normalizedUrl + '/');
    });
    
    // Si no está la homepage, agregarla al inicio
    if (!hasHomepage) {
      console.log(`🏠 Agregando homepage: ${SITE_URL}`);
      allUrls.unshift(SITE_URL);
    }
    
    console.log(`\n✅ Total de URLs muestreadas: ${allUrls.length}\n`);
    return allUrls;
    
  } catch (error) {
    console.error(`❌ Error en modo de muestreo: ${error.message}`);
    console.log(`🔄 Intentando con método estándar...`);
    
    // Fallback al método estándar
    const Sitemapper = await getSitemapperClass();
    const sitemap = new Sitemapper({
      timeout: TIMEOUT,
      requestHeaders: REQUEST_HEADERS,
      debug: process.env.DEBUG === 'true' || process.env.DEBUG === '1'
    });
    
    const result = await sitemap.fetch(sitemapUrl);
    const { sites } = result;
    
    if (sites && sites.length > 0) {
      // Aplicar límite de muestreo al resultado
      const limited = sites.slice(0, SAMPLE_SIZE);
      console.log(`✅ URLs obtenidas (fallback): ${limited.length}\n`);
      return limited;
    }
    
    return [];
  }
}

// generateLabel ahora se importa desde utils.js
const generateLabel = generateLabelUtil;

/**
 * Crea un wrapper para ejecutar el recording de Puppeteer en el contexto de BackstopJS
 * @param {string} recordingFilePath - Ruta completa al archivo de recording
 * @param {string} wrapperFileName - Nombre del archivo wrapper a crear
 * @returns {string} - Ruta del wrapper creado
 */
function createRecordingWrapper(recordingFilePath, wrapperFileName) {
  const recordingContent = fs.readFileSync(recordingFilePath, 'utf8');
  const engineScriptsDir = path.join(__dirname, '..', SCRIPTS_DIR, 'puppet');
  const wrapperPath = path.join(engineScriptsDir, wrapperFileName);
  
  // Extraer solo la lógica del recording (sin el browser.launch y browser.close)
  // Mantener todo el contenido tal cual, pero adaptarlo para usar la página de BackstopJS
  let adaptedContent = recordingContent;
  
  // Reemplazar la creación del browser por el uso de la página existente
  adaptedContent = adaptedContent.replace(
    /const\s+browser\s*=\s*await\s+puppeteer\.launch\(\);[\s\S]*?const\s+page\s*=\s*await\s+browser\.newPage\(\);[\s\S]*?const\s+timeout\s*=\s*\d+;[\s\S]*?page\.setDefaultTimeout\(timeout\);[\s\S]*?/,
    ''
  );
  
  // Reemplazar browser.close() por nada (BackstopJS maneja el browser)
  adaptedContent = adaptedContent.replace(/await\s+browser\.close\(\);[\s\S]*?/g, '');
  
  // Reemplazar el bloque async inmediato por un export de módulo
  adaptedContent = adaptedContent.replace(
    /\(async\s*\(\)\s*=>\s*{/,
    'module.exports = async (page, scenario, vp) => {'
  );
  
  // Remover el cierre del bloque async y el catch
  adaptedContent = adaptedContent.replace(
    /\}\)\(\)\.catch\(err\s*=>\s*{[\s\S]*?console\.error\(err\);[\s\S]*?process\.exit\(1\);[\s\S]*?}\);?[\s\S]*$/,
    '};'
  );
  
  // Si no se pudo adaptar, usar el contenido tal cual pero envolverlo
  if (!adaptedContent.includes('module.exports')) {
    // Si el adaptado falló, crear un wrapper que ejecute el script original
    const recordingFileName = path.basename(recordingFilePath);
    adaptedContent = `const path = require('path');
const recordingPath = path.resolve(__dirname, '${recordingFileName}');
const recording = require(recordingPath);

module.exports = async (page, scenario, vp) => {
  // El recording original ya está adaptado para BackstopJS
  // Si necesita adaptación adicional, se puede hacer aquí
  console.log('Ejecutando recording: ${recordingFileName}');
  
  // Extraer la lógica del recording sin crear un nuevo browser
  // (el recording debe ser adaptado manualmente o usar eval con contexto)
  
  // Por ahora, solo navegar a la URL si existe
  const urlMatch = recording.toString().match(/\\.goto\\(['"]([^'"]+)['"]\\)/);
  if (urlMatch) {
    await page.goto(urlMatch[1], { waitUntil: 'networkidle0' });
  }
};`;
    
    // Copiar el recording original también
    const recordingDest = path.join(engineScriptsDir, recordingFileName);
    fs.copyFileSync(recordingFilePath, recordingDest);
  }
  
  // Escribir el wrapper
  fs.writeFileSync(wrapperPath, adaptedContent, 'utf8');
  
  return wrapperPath;
}

/**
 * Busca todos los archivos .js en la carpeta puppet y crea wrappers para BackstopJS
 * @returns {Object[]} - Array de información de recordings encontrados
 */
function getRecordingsFromPuppetFolder() {
  const puppetDir = path.join(__dirname, '..', 'puppet');
  const recordings = [];
  
  if (!fs.existsSync(puppetDir)) {
    return recordings;
  }
  
  try {
    const files = fs.readdirSync(puppetDir);
    const jsFiles = files.filter(file => file.endsWith('.js'));
    
    // Carpeta destino para los recordings
    const engineScriptsDir = path.join(__dirname, '..', SCRIPTS_DIR, 'puppet');
    
    // Asegurar que la carpeta destino existe
    if (!fs.existsSync(engineScriptsDir)) {
      fs.mkdirSync(engineScriptsDir, { recursive: true });
    }
    
    for (const file of jsFiles) {
      const sourcePath = path.join(puppetDir, file);
      
      try {
        // Leer el contenido para extraer la URL inicial
        const content = fs.readFileSync(sourcePath, 'utf8');
        const urlMatch = content.match(/\.goto\(['"]([^'"]+)['"]\)/);
        const url = urlMatch ? urlMatch[1] : '';
        
        // Generar un label legible desde el nombre del archivo
        let label = file.replace(/\.js$/i, '');
        label = label.replace(/Recording\s+/i, 'Recording: ');
        label = label.replace(/_/g, ' ');
        
        // Nombre del wrapper (mismo nombre pero en engine_scripts)
        const wrapperName = file;
        
        // Copiar el archivo tal cual primero
        const recordingDest = path.join(engineScriptsDir, file);
        fs.copyFileSync(sourcePath, recordingDest);
        
        // Leer el contenido del recording TAL CUAL - sin parsear
        let recordingCode = fs.readFileSync(sourcePath, 'utf8');
        
        // Extraer el timeout si existe
        const timeoutMatch = recordingCode.match(/const\s+timeout\s*=\s*(\d+);/);
        const timeoutValue = timeoutMatch ? timeoutMatch[1] : '5000';
        
        // Adaptación mínima: mantener TODO el contenido tal cual, solo cambiar estructura del módulo
        // Dividir en líneas para trabajar mejor
        let lines = recordingCode.split('\n');
        let resultLines = [];
        let skipUntilTimeout = false;
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          
          // Reemplazar require de puppeteer limpiando comentarios
          if (line.includes('require(\'puppeteer\')') || line.includes('require("puppeteer")')) {
            resultLines.push('const puppeteer = require(\'puppeteer\');');
            continue;
          }
          
          // Reemplazar async IIFE por module.exports
          if (line.includes('(async () => {')) {
            resultLines.push('module.exports = async (page, scenario, vp) => {');
            resultLines.push(`    const timeout = ${timeoutValue};`);
            skipUntilTimeout = true;
            continue;
          }
          
          // Saltar browser.launch y browser.newPage
          if (line.includes('puppeteer.launch()') || 
              line.includes('browser.newPage()') ||
              (line.includes('const browser') && line.includes('await'))) {
            continue;
          }
          
          // Saltar timeout original y setDefaultTimeout (ya lo agregamos arriba)
          if (skipUntilTimeout && (line.includes('const timeout') || line.includes('setDefaultTimeout'))) {
            skipUntilTimeout = false;
            continue;
          }
          
          // También saltar setDefaultTimeout si aparece más adelante
          if (line.includes('setDefaultTimeout')) {
            continue;
          }
          
          // Saltar browser.close
          if (line.includes('browser.close()')) {
            continue;
          }
          
          // Saltar el catch final
          if (line.includes('})().catch') || 
              (line.includes('catch') && i > lines.length - 5)) {
            break;
          }
          
          // Mantener todas las demás líneas tal cual (con indentación preservada)
          resultLines.push(line);
        }
        
        // Asegurar que termine con };
        if (!resultLines[resultLines.length - 1].trim().endsWith('};')) {
          resultLines.push('};');
        }
        
        const adaptedCode = resultLines.join('\n');
        const wrapperPath = path.join(engineScriptsDir, `wrapper_${file}`);
        fs.writeFileSync(wrapperPath, adaptedCode, 'utf8');
        
        recordings.push({
          label: label,
          url: url || 'about:blank',
          scriptFile: file,
          wrapperPath: `puppet/wrapper_${file}`, // Usar el wrapper
          originalPath: `puppet/${file}` // El original también está disponible
        });
        
        console.log(`   ✓ Copiado y wrapper creado: ${file}`);
      } catch (error) {
        console.warn(`   ⚠️  Error procesando ${file}: ${error.message}`);
      }
    }
  } catch (error) {
    console.warn(`⚠️  Error leyendo carpeta puppet: ${error.message}`);
  }
  
  return recordings;
}

/**
 * Convierte un recording en un escenario de BackstopJS que ejecuta el script completo
 * @param {Object} recording - Información del recording
 * @returns {Object} - Escenario de BackstopJS
 */
function recordingToScenario(recording) {
  return {
    label: recording.label,
    cookiePath: `${SCRIPTS_DIR}/cookies.json`,

    // ⚠️ IMPORTANTE
    // La URL es solo informativa, el script navega
    url: "about:blank",

    referenceUrl: "",
    readyEvent: "",
    readySelector: "",

    delay: 0,
    postInteractionWait: 0,

    hideSelectors: [],
    removeSelectors: [],
    hoverSelector: "",
    clickSelector: "",
    selectors: [],
    selectorExpansion: true,
    expect: 0,
    misMatchThreshold: 0.1,
    requireSameDimensions: true,

    // ✅ AQUÍ es donde debe ir
    onBeforeScript: recording.wrapperPath
  };
}


/**
 * Genera escenarios de BackstopJS desde las URLs
 * @param {string[]} urls - Array de URLs
 * @returns {Object[]} - Array de escenarios
 */
function generateScenarios(urls) {
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
      delay: SCENARIO_DELAY,
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
  let baseConfig = {};
  
  try {
    const configPath = path.join(__dirname, '..', 'backstop.json');
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

/**
 * Función principal
 */
async function main() {
  console.log('🚀 Iniciando generación de escenarios desde sitemap...\n');
  console.log(`📍 URL del sitio: ${SITE_URL}`);
  console.log(`🗺️  Sitemap URL: ${SITEMAP_URL}\n`);

  let recordings = []
  // Obtener recordings desde la carpeta puppet PRIMERO (independiente del sitemap)
  console.log(`\n📹 Buscando recordings en la carpeta puppet...`);
  if (PUPPET) {
    recordings = getRecordingsFromPuppetFolder();
  }
  
  if (recordings.length > 0) {
    console.log(`✅ Encontrados ${recordings.length} recording(s) de Puppeteer`);
    recordings.forEach(rec => {
      console.log(`   - ${rec.label} → ${rec.url}`);
    });
  } else {
    console.log(`   No se encontraron archivos .js en la carpeta puppet/`);
  }
  
  // Convertir recordings a escenarios de BackstopJS (el script se ejecutará tal cual)
  const backstopRecordingScenarios = recordings.map(recordingToScenario);
  
  // Intentar obtener URLs del sitemap (pero no fallar si no funciona)
  let sitemapScenarios = [];
  let sitemapUrls = [];
  
  try {
    if(SITEMAP){
      sitemapUrls = await getAllUrlsFromSitemap(SITEMAP_URL);
    } else{
      sitemapUrls.push(SITE_URL);
    }
    
    if (sitemapUrls.length > 0) {
      // Aplicar límite si está configurado
      let finalUrls = sitemapUrls;
      if (MAX_URLS && sitemapUrls.length > MAX_URLS) {
        console.log(`\n⚠️  Limitando a ${MAX_URLS} URLs (se encontraron ${sitemapUrls.length})`);
        finalUrls = sitemapUrls.slice(0, MAX_URLS);
      }
      
      // Generar escenarios desde el sitemap
      sitemapScenarios = generateScenarios(finalUrls);
      console.log(`✅ Generados ${sitemapScenarios.length} escenarios desde el sitemap`);
    } else {
      console.log(`⚠️  No se encontraron URLs en el sitemap, pero se agregarán los recordings`);
    }
  } catch (error) {
    console.warn(`⚠️  Error obteniendo sitemap: ${error.message}`);
    console.warn(`   Continuando solo con los recordings encontrados...`);
  }
  
  // Combinar escenarios: recordings primero, luego sitemap
  const allScenarios = [...backstopRecordingScenarios, ...sitemapScenarios];
  
  if (allScenarios.length === 0) {
    console.error('\n❌ No se encontraron escenarios (ni recordings ni sitemap)');
    process.exit(1);
  }
  
  console.log(`\n📊 Total de escenarios: ${allScenarios.length} (${backstopRecordingScenarios.length} recordings + ${sitemapScenarios.length} del sitemap)`);
  
  // Obtener configuración base
  const baseConfig = getBaseConfig();
  
  // Crear configuración final
  const finalConfig = {
    ...baseConfig,
    scenarios: allScenarios
  };
  
  // Escribir archivo de configuración
  const outputPath = OUTPUT_FILE;
  fs.writeFileSync(outputPath, JSON.stringify(finalConfig, null, 2), 'utf8');
  
  console.log(`\n✨ Configuración generada exitosamente!`);
  console.log(`📄 Archivo: ${outputPath}`);
  console.log(`📊 Total de escenarios: ${allScenarios.length}`);
  if (backstopRecordingScenarios.length > 0) {
    console.log(`   - ${backstopRecordingScenarios.length} desde recordings de Puppeteer (ejecutados tal cual)`);
  }
  if (sitemapScenarios.length > 0) {
    console.log(`   - ${sitemapScenarios.length} desde sitemap.xml`);
  }
  console.log(`\n💡 Para ejecutar las pruebas:`);
  console.log(`   npm run reference  # Primera vez: crear referencias`);
  console.log(`   npm run test       # Ejecutar pruebas visuales`);
  console.log(`\n💡 Para limitar el número de URLs:`);
  console.log(`   MAX_URLS=50 npm run generate-sitemap`);
  console.log(`\n💡 Para modo de muestreo (sitios grandes):`);
  console.log(`   SITEMAP_SAMPLE_MODE=true npm run generate-sitemap`);
  console.log(`   SITEMAP_SAMPLE_MODE=true SAMPLE_SIZE=10 npm run generate-sitemap`);
  console.log(`\n💡 Si el sitemap requiere autenticación, usa headers personalizados:`);
  console.log(`   REQUEST_HEADERS='{"Cookie":"session=xxx","Authorization":"Bearer xxx"}' npm run generate-sitemap`);
  console.log(`\n💡 Para ver más detalles durante la ejecución:`);
  console.log(`   DEBUG=true npm run generate-sitemap`);
}

// Ejecutar
main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
