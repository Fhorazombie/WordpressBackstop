#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Importar utilidades compartidas
const {
  detectAndConfigureSSL,
  generateScenarios,
  getBaseConfig,
  getConfigFilePath
} = require('./lib/utils');

// Configuración
const URL_LIST_FILE = process.env.URL_LIST;
const OUTPUT_FILE = getConfigFilePath();
const URL_LISTS_DIR = path.join(__dirname, '..', 'url-lists');

/**
 * Lee un archivo de texto con URLs (una por línea)
 * Ignora líneas vacías y líneas que empiezan con #
 * @param {string} filePath - Ruta al archivo .txt
 * @returns {string[]} - Array de URLs
 */
function readTxtFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  return lines
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      // Remover comentarios inline (después de la URL)
      const commentIndex = line.indexOf('#');
      if (commentIndex > 0) {
        return line.substring(0, commentIndex).trim();
      }
      return line;
    })
    .filter(line => line); // Filtrar líneas vacías después de remover comentarios
}

/**
 * Lee un archivo JSON con URLs
 * Soporta array de strings o array de objetos con propiedad 'url'
 * @param {string} filePath - Ruta al archivo .json
 * @returns {string[]} - Array de URLs
 */
function readJsonFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(content);
  
  if (!Array.isArray(data)) {
    throw new Error('El archivo JSON debe contener un array');
  }
  
  return data.map(item => {
    if (typeof item === 'string') {
      return item;
    } else if (typeof item === 'object' && item.url) {
      return item.url;
    } else {
      throw new Error('Formato de JSON inválido. Debe ser un array de strings o array de objetos con propiedad "url"');
    }
  });
}

/**
 * Lee URLs desde un archivo (txt o json)
 * @param {string} filePath - Ruta al archivo
 * @returns {string[]} - Array de URLs
 */
function readUrlsFromFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  
  if (ext === '.txt') {
    return readTxtFile(filePath);
  } else if (ext === '.json') {
    return readJsonFile(filePath);
  } else {
    throw new Error(`Formato de archivo no soportado: ${ext}. Use .txt o .json`);
  }
}

/**
 * Función principal
 */
async function main() {
  console.log('🚀 Iniciando generación de escenarios desde lista de URLs...\n');
  
  // Validar que se proporcionó la variable de entorno
  if (!URL_LIST_FILE) {
    console.error('❌ Error: Debes especificar la variable de entorno URL_LIST');
    console.error('\n💡 Uso:');
    console.error('   URL_LIST=urls.txt npm run generate-list');
    console.error('   URL_LIST=urls.json npm run generate-list');
    console.error('\n📝 Formatos soportados:');
    console.error('   .txt  - Una URL por línea (líneas que empiezan con # son ignoradas)');
    console.error('   .json - Array de strings o array de objetos con propiedad "url"');
    console.error('\n📁 Los archivos se buscan en la carpeta url-lists/');
    console.error('   Si el archivo no está en url-lists/, especifica la ruta completa');
    process.exit(1);
  }
  
  // Determinar la ruta del archivo
  // Si es una ruta relativa sin directorio, buscar en url-lists/
  let urlListPath;
  if (path.isAbsolute(URL_LIST_FILE)) {
    // Ruta absoluta, usar tal cual
    urlListPath = URL_LIST_FILE;
  } else if (URL_LIST_FILE.includes(path.sep) || URL_LIST_FILE.includes('/')) {
    // Ruta relativa con directorio, resolver desde el directorio actual
    urlListPath = path.resolve(URL_LIST_FILE);
  } else {
    // Solo nombre de archivo, buscar en url-lists/
    urlListPath = path.join(URL_LISTS_DIR, URL_LIST_FILE);
  }
  
  // Verificar que el archivo existe
  if (!fs.existsSync(urlListPath)) {
    console.error(`❌ Error: El archivo no existe: ${urlListPath}`);
    
    // Si no se encontró en url-lists/, sugerir verificar la carpeta
    if (!URL_LIST_FILE.includes(path.sep) && !URL_LIST_FILE.includes('/')) {
      console.error(`\n💡 Verifica que el archivo esté en la carpeta url-lists/`);
      console.error(`   O especifica la ruta completa: URL_LIST=ruta/al/archivo.txt`);
    }
    
    process.exit(1);
  }
  
  console.log(`📄 Leyendo URLs desde: ${urlListPath}`);
  
  try {
    // Leer URLs del archivo
    const urls = readUrlsFromFile(urlListPath);
    
    if (urls.length === 0) {
      console.error('❌ Error: No se encontraron URLs en el archivo');
      process.exit(1);
    }
    
    console.log(`✅ Se encontraron ${urls.length} URL(s)\n`);
    
    // Mostrar las URLs encontradas
    urls.forEach((url, index) => {
      console.log(`   ${index + 1}. ${url}`);
    });
    
    // Configurar SSL si alguna URL es local
    const hasLocalUrl = urls.some(url => {
      try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();
        return hostname === 'localhost' || 
               hostname.endsWith('.test') || 
               hostname.endsWith('.local') ||
               hostname.startsWith('127.') ||
               hostname.startsWith('192.168.') ||
               hostname.startsWith('10.');
      } catch {
        return false;
      }
    });
    
    if (hasLocalUrl) {
      detectAndConfigureSSL(urls[0]);
    }
    
    // Generar escenarios desde las URLs
    console.log(`\n📊 Generando escenarios de BackstopJS...`);
    const scenarios = generateScenarios(urls);
    
    // Obtener configuración base
    const baseConfig = getBaseConfig();
    
    // Crear configuración final
    const finalConfig = {
      ...baseConfig,
      scenarios
    };
    
    // Escribir archivo de configuración
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalConfig, null, 2), 'utf8');
    
    console.log(`\n✨ Configuración generada exitosamente!`);
    console.log(`📄 Archivo: ${OUTPUT_FILE}`);
    console.log(`📊 Total de escenarios: ${scenarios.length}`);
    console.log(`\n💡 Para ejecutar las pruebas:`);
    console.log(`   npm run reference  # Primera vez: crear referencias`);
    console.log(`   npm run test       # Ejecutar pruebas visuales`);
    
  } catch (error) {
    console.error(`\n❌ Error procesando el archivo: ${error.message}`);
    process.exit(1);
  }
}

// Ejecutar
main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
