#!/usr/bin/env node

/**
 * BackstopJS Progress Wrapper
 * 
 * Este script ejecuta BackstopJS y muestra el progreso en tiempo real
 * con número de pruebas completadas, pendientes y porcentaje.
 * 
 * Uso:
 *   node scripts/backstop-progress.js [test|reference] [--filter=<pattern>]
 * 
 * Ejemplos:
 *   node scripts/backstop-progress.js test
 *   node scripts/backstop-progress.js reference
 *   node scripts/backstop-progress.js test --filter="Homepage"
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// Colores ANSI para la consola
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m'
};

// Símbolos para la interfaz
const symbols = {
  check: '✓',
  cross: '✗',
  arrow: '→',
  bullet: '•',
  progress: '█',
  progressEmpty: '░'
};

/**
 * Elimina códigos ANSI de una cadena
 */
function stripAnsi(str) {
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

/**
 * Carga la configuración de BackstopJS
 */
function loadConfig() {
  const configPath = path.join(process.cwd(), 'backstop.json');
  
  if (!fs.existsSync(configPath)) {
    console.error(`${colors.red}Error: No se encontró backstop.json${colors.reset}`);
    process.exit(1);
  }
  
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    console.error(`${colors.red}Error al leer backstop.json: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

/**
 * Calcula el total de pruebas (escenarios × viewports)
 */
function calculateTotalTests(config, filter = null) {
  let scenarios = config.scenarios || [];
  
  if (filter) {
    const filterRegex = new RegExp(filter, 'i');
    scenarios = scenarios.filter(s => filterRegex.test(s.label));
  }
  
  const viewports = config.viewports || [];
  return {
    scenarios: scenarios.length,
    viewports: viewports.length,
    // Multiplicamos por 2 porque hay dos fases: Captura y Comparación
    total: scenarios.length * viewports.length * 2,
    scenarioLabels: scenarios.map(s => s.label)
  };
}

/**
 * Genera una barra de progreso visual
 */
function createProgressBar(current, total, width = 30) {
  const percentage = total > 0 ? current / total : 0;
  const filled = Math.round(width * percentage);
  const empty = width - filled;
  
  const bar = symbols.progress.repeat(filled) + symbols.progressEmpty.repeat(empty);
  const percent = Math.round(percentage * 100);
  
  return { bar, percent };
}

/**
 * Formatea el tiempo transcurrido
 */
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Limpia la línea actual de la consola
 */
function clearLine() {
  process.stdout.write('\r\x1b[K');
}

/**
 * Muestra el encabezado del progreso
 */
function showHeader(command, testInfo) {
  console.log('');
  console.log(`${colors.cyan}${colors.bright}╔════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}║${colors.reset}       ${colors.magenta}🔍 BackstopJS Progress Monitor${colors.reset}                     ${colors.cyan}${colors.bright}║${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}╠════════════════════════════════════════════════════════════╣${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}║${colors.reset} Comando: ${colors.yellow}backstop ${command}${colors.reset}                                   ${colors.cyan}${colors.bright}║${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}║${colors.reset} Escenarios: ${colors.green}${testInfo.scenarios}${colors.reset} | Viewports: ${colors.green}${testInfo.viewports}${colors.reset} | Total: ${colors.green}${testInfo.total}${colors.reset} pruebas  ${colors.cyan}${colors.bright}║${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}╚════════════════════════════════════════════════════════════╝${colors.reset}`);
  console.log('');
}

/**
 * Muestra el estado actual del progreso
 */
function showProgress(state) {
  const { bar, percent } = createProgressBar(state.completed, state.total);
  const timeStr = formatTime(state.elapsedTime);
  
  // Estimar tiempo restante
  let etaStr = '--:--';
  if (state.completed > 0 && percent < 100) {
    const avgTimePerTest = state.elapsedTime / state.completed;
    const remaining = (state.total - state.completed) * avgTimePerTest;
    etaStr = formatTime(remaining);
  }
  
  clearLine();
  
  // Color de la barra según el progreso
  let barColor = colors.yellow;
  if (percent >= 100) barColor = colors.green;
  else if (percent >= 50) barColor = colors.cyan;
  
  process.stdout.write(
    `${colors.bright}[${barColor}${bar}${colors.reset}${colors.bright}]${colors.reset} ` +
    `${colors.bright}${percent}%${colors.reset} | ` +
    `${colors.green}${state.completed}${colors.reset}/${colors.dim}${state.total}${colors.reset} | ` +
    `⏱ ${timeStr} | ETA: ${etaStr}`
  );
}

/**
 * Muestra información del escenario actual
 */
function showCurrentScenario(scenarioName, viewport) {
  console.log('');
  const shortName = scenarioName.length > 50 
    ? scenarioName.substring(0, 47) + '...' 
    : scenarioName;
  console.log(`${colors.dim}${symbols.arrow} ${shortName} [${viewport}]${colors.reset}`);
}

/**
 * Muestra el resumen final
 */
function showSummary(state, exitCode) {
  console.log('');
  console.log('');
  console.log(`${colors.cyan}${colors.bright}╔════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}║${colors.reset}                    ${colors.bright}📊 RESUMEN FINAL${colors.reset}                       ${colors.cyan}${colors.bright}║${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}╠════════════════════════════════════════════════════════════╣${colors.reset}`);
  
  const statusIcon = exitCode === 0 ? `${colors.green}${symbols.check}` : `${colors.red}${symbols.cross}`;
  const statusText = exitCode === 0 ? `${colors.green}COMPLETADO` : `${colors.red}FALLIDO`;
  
  console.log(`${colors.cyan}${colors.bright}║${colors.reset} Estado: ${statusIcon} ${statusText}${colors.reset}                                       ${colors.cyan}${colors.bright}║${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}║${colors.reset} Pruebas ejecutadas: ${colors.green}${state.completed}${colors.reset} de ${colors.dim}${state.total}${colors.reset}                          ${colors.cyan}${colors.bright}║${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}║${colors.reset} Tiempo total: ${colors.yellow}${formatTime(state.elapsedTime)}${colors.reset}                                    ${colors.cyan}${colors.bright}║${colors.reset}`);
  
  if (state.passed > 0 || state.failed > 0) {
    console.log(`${colors.cyan}${colors.bright}║${colors.reset} Pasaron: ${colors.green}${state.passed}${colors.reset} | Fallaron: ${colors.red}${state.failed}${colors.reset}                              ${colors.cyan}${colors.bright}║${colors.reset}`);
  }
  
  console.log(`${colors.cyan}${colors.bright}╚════════════════════════════════════════════════════════════╝${colors.reset}`);
  console.log('');
}

/**
 * Parsea los argumentos de línea de comandos
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    command: 'test',
    filter: null,
    debug: false,
    extraArgs: []
  };
  
  for (const arg of args) {
    if (arg === 'test' || arg === 'reference' || arg === 'approve') {
      result.command = arg;
    } else if (arg.startsWith('--filter=')) {
      result.filter = arg.split('=')[1];
      result.extraArgs.push(arg);
    } else if (arg === '--debug') {
      result.debug = true;
    } else {
      result.extraArgs.push(arg);
    }
  }
  
  return result;
}

/**
 * Función principal
 */
async function main() {
  const { command, filter, debug, extraArgs } = parseArgs();
  const config = loadConfig();
  const testInfo = calculateTotalTests(config, filter);
  
  if (debug) {
    console.log(`${colors.yellow}Modo debug activado: guardando salida en backstop-debug.log${colors.reset}`);
    try {
      fs.writeFileSync('backstop-debug.log', '');
    } catch (e) {
      console.error(`${colors.red}No se pudo crear el archivo de log: ${e.message}${colors.reset}`);
    }
  }
  
  if (testInfo.total === 0) {
    console.error(`${colors.red}Error: No se encontraron escenarios para ejecutar${colors.reset}`);
    process.exit(1);
  }
  
  // Estado del progreso
  const state = {
    completed: 0,
    total: testInfo.total,
    passed: 0,
    failed: 0,
    currentScenario: '',
    currentViewport: '',
    elapsedTime: 0,
    startTime: Date.now()
  };
  
  showHeader(command, testInfo);
  
  // Construir argumentos para BackstopJS
  const backstopArgs = [command, ...extraArgs];
  
  // Determinar el comando correcto según el sistema operativo
  const isWindows = process.platform === 'win32';
  const npxCommand = isWindows ? 'npx.cmd' : 'npx';
  
  // Ejecutar BackstopJS
  const backstop = spawn(npxCommand, ['backstop', ...backstopArgs], {
    cwd: process.cwd(),
    shell: isWindows
  });
  
  // Timer para actualizar el tiempo transcurrido
  const timer = setInterval(() => {
    state.elapsedTime = (Date.now() - state.startTime) / 1000;
    showProgress(state);
  }, 1000);
  
  // Patrones para detectar progreso en la salida de BackstopJS
  const patterns = {
    // Detecta cuando se inicia la captura de un escenario
    scenarioStart: /SCENARIO\s*[:\|]\s*(.+)/i,
    // Detecta el viewport actual
    viewport: /\[(\d+x\d+|\w+)\]/i,
    // Detecta cuando se completa una captura (usando logs del navegador como proxy)
    captureStep: /Close Browser|BackstopTools have been installed/i,
    // Detecta cuando se completa una comparación
    compareComplete: /compare|bitmap|captured|rendered/i,
    // Detecta resultados de pruebas
    passed: /passed|✓|PASS/i,
    failed: /failed|✗|FAIL|mismatch/i
  };
  
  let outputBuffer = '';
  let lastScenarioIndex = -1;
  
  backstop.stdout.on('data', (data) => {
    if (debug) {
      try {
        fs.appendFileSync('backstop-debug.log', data);
      } catch (e) {
        // Ignorar errores de escritura en log
      }
    }
    outputBuffer += data.toString();
    
    // Procesar líneas completas
    const lines = outputBuffer.split('\n');
    // Guardar el último fragmento (posiblemente incompleto) para el siguiente chunk
    outputBuffer = lines.pop();
    
    for (const rawLine of lines) {
      const line = stripAnsi(rawLine).trim();
      if (!line) continue;

      // Detectar inicio de escenario
      const scenarioMatch = line.match(patterns.scenarioStart);
      if (scenarioMatch) {
        state.currentScenario = scenarioMatch[1].trim();
        
        // Buscar el índice del escenario actual
        const scenarioIndex = testInfo.scenarioLabels.findIndex(
          label => state.currentScenario.includes(label.substring(0, 30))
        );
        
        if (scenarioIndex !== -1 && scenarioIndex !== lastScenarioIndex) {
          lastScenarioIndex = scenarioIndex;
        }
      }
      
      // Detectar viewport
      const viewportMatch = line.match(patterns.viewport);
      if (viewportMatch) {
        state.currentViewport = viewportMatch[1];
      }
      
      // Detectar completación de paso (Captura o Comparación)
      let stepCompleted = false;

      // 1. Fase de Captura
      if (patterns.captureStep.test(line)) {
        stepCompleted = true;
      }
      
      // 2. Fase de Comparación
      if (patterns.compareComplete.test(line)) {
        // Incrementar contador solo si detectamos una nueva captura/comparación real
        if (line.toLowerCase().includes('bitmap') || 
            line.toLowerCase().includes('captured') ||
            line.toLowerCase().includes('compare')) {
          stepCompleted = true;
        }
      }

      if (stepCompleted) {
        // Evitar contar múltiples veces la misma prueba
        const newCompleted = Math.min(state.completed + 1, state.total);
        if (newCompleted > state.completed) {
          state.completed = newCompleted;
          state.elapsedTime = (Date.now() - state.startTime) / 1000;
          showProgress(state);
        }
      }
      
      // Detectar resultados
      if (patterns.passed.test(line) && !patterns.failed.test(line)) {
        // Solo contar si parece ser un resultado de prueba
        if (line.toLowerCase().includes('scenario') || line.includes('✓')) {
          state.passed++;
        }
      }
      
      if (patterns.failed.test(line)) {
        if (line.toLowerCase().includes('scenario') || line.includes('✗') || line.toLowerCase().includes('mismatch')) {
          state.failed++;
        }
      }
    }
  });
  
  backstop.stderr.on('data', (data) => {
    if (debug) {
      try {
        fs.appendFileSync('backstop-debug.log', '[STDERR] ' + data);
      } catch (e) {}
    }
    // Algunos mensajes de BackstopJS van a stderr
    const output = data.toString();
    
    // Detectar errores críticos
    if (output.toLowerCase().includes('error') && !output.toLowerCase().includes('mismatch')) {
      console.log('');
      console.log(`${colors.red}${symbols.cross} Error: ${output.trim()}${colors.reset}`);
      
      if (output.includes('ENOENT')) {
        console.log(`${colors.yellow}${symbols.bullet} Advertencia: Se detectó un error ENOENT. Esto suele ocurrir en Windows cuando las rutas de archivo son demasiado largas.`);
        console.log(`  Intente acortar los nombres de los escenarios en backstop.json o mueva el proyecto a una ruta más corta.${colors.reset}`);
      }
    }
  });
  
  backstop.on('close', (code) => {
    clearInterval(timer);
    
    // Asegurar que el progreso muestre 100% si terminó exitosamente
    if (code === 0) {
      state.completed = state.total;
    }
    
    state.elapsedTime = (Date.now() - state.startTime) / 1000;
    showProgress(state);
    showSummary(state, code);
    
    const finish = () => process.exit(code);

    if (command === 'test') {
      const reportDir = (config.paths && config.paths.html_report) || path.join('backstop_data', 'html_report');
      const reportPath = path.join(reportDir, 'index.html');
      
      let openCommand = '';
      if (process.platform === 'win32') {
        openCommand = `start "" "${reportPath}"`;
      } else if (process.platform === 'darwin') {
        openCommand = `open "${reportPath}"`;
      } else {
        openCommand = `xdg-open "${reportPath}"`;
      }

      console.log(`${colors.cyan}Abriendo reporte: ${reportPath}${colors.reset}`);
      
      exec(openCommand, (error) => {
        if (error) {
          console.log(`${colors.yellow}No se pudo abrir el reporte automáticamente: ${error.message}${colors.reset}`);
          console.log(`${colors.cyan}Puede abrirlo manualmente en: ${path.resolve(reportPath)}${colors.reset}`);
        }
        finish();
      });
    } else {
      finish();
    }
  });
  
  backstop.on('error', (error) => {
    clearInterval(timer);
    console.log('');
    console.error(`${colors.red}Error al ejecutar BackstopJS: ${error.message}${colors.reset}`);
    process.exit(1);
  });
}

// Ejecutar
main().catch(error => {
  console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
  process.exit(1);
});
