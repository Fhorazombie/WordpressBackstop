const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const { readJson, writeJson } = require('./store');
const { ROOT, SCRIPTS_DIR, RUNS_DIR, RUNS_INDEX_FILE, BIN_DIR } = require('./paths');

const MAX_RUNS_KEPT = 100;
const DEFAULT_MAX_CONCURRENT_RUNS = 3;

// Mantiene el estado "en vivo" (emitter + buffer) de las corridas activas o
// recién finalizadas, para poder transmitir el log por SSE.
const activeRuns = new Map();

// Cada corrida usa su PROPIO backstop.json aislado (uno por run, ver
// configFilePath()) en lugar del backstop.json compartido de la raíz, así que
// dos corridas de PROYECTOS DISTINTOS ya no pueden pisarse entre sí y pueden
// ejecutarse en paralelo de verdad. Lo único que sigue necesitando orden es
// que dos corridas del MISMO proyecto (o dos del proyecto principal) no se
// solapen — porque ambas leen/escriben la misma configuración persistida
// (project.config / default-project.json) al terminar de generar — así que
// esas se siguen serializando entre sí con una cola por "key". Además, un
// límite global de corridas simultáneas evita que muchas personas a la vez
// disparen demasiados Chromium/Puppeteer en paralelo.
const queuesByKey = new Map(); // key -> Promise (cola serial de ese proyecto/principal)
const queueDepthByKey = new Map(); // key -> cantidad de corridas esperando en esa cola

let runningCount = 0;
const waiters = []; // resolvers esperando un cupo del límite global de concurrencia

fs.mkdirSync(RUNS_DIR, { recursive: true });

function maxConcurrentRuns() {
  const raw = parseInt(process.env.MAX_CONCURRENT_RUNS, 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_CONCURRENT_RUNS;
}

function acquireGlobalSlot() {
  if (runningCount < maxConcurrentRuns()) {
    runningCount += 1;
    return Promise.resolve();
  }
  return new Promise(resolve => waiters.push(resolve));
}

function releaseGlobalSlot() {
  runningCount -= 1;
  const next = waiters.shift();
  if (next) {
    runningCount += 1;
    next();
  }
}

function binPath(name) {
  const exe = process.platform === 'win32' ? `${name}.cmd` : name;
  return path.join(BIN_DIR, exe);
}

// Define cómo se lanza cada tipo de paso soportado por un pipeline. Los pasos
// de generación toman el archivo de config vía la variable de entorno
// BACKSTOP_CONFIG_FILE (la leen los scripts en scripts/lib/utils.js); los que
// invocan el CLI de BackstopJS directamente lo reciben como --config.
const STEP_COMMANDS = {
  'generate-sitemap': () => ({
    command: process.execPath,
    args: [path.join(SCRIPTS_DIR, 'generate-from-sitemap.js')]
  }),
  'generate-list': () => ({
    command: process.execPath,
    args: [path.join(SCRIPTS_DIR, 'generate-from-list.js')]
  }),
  'generate-design': () => ({
    command: process.execPath,
    args: [path.join(SCRIPTS_DIR, 'generate-from-design.js')]
  }),
  reference: configFile => ({ command: binPath('backstop'), args: ['reference', '--config', configFile] }),
  test: configFile => ({ command: binPath('backstop'), args: ['test', '--config', configFile] }),
  approve: configFile => ({ command: binPath('backstop'), args: ['approve', '--config', configFile] })
};

const STEP_LABELS = {
  'generate-sitemap': 'Generar escenarios desde sitemap',
  'generate-list': 'Generar escenarios desde lista de URLs',
  'generate-design': 'Generar comparación diseño vs. live',
  reference: 'Crear referencias (baseline)',
  test: 'Ejecutar pruebas visuales',
  approve: 'Aprobar cambios detectados'
};

function isValidStep(step) {
  return Object.prototype.hasOwnProperty.call(STEP_COMMANDS, step);
}

function readIndex() {
  return readJson(RUNS_INDEX_FILE, []);
}

function saveIndex(runs) {
  writeJson(RUNS_INDEX_FILE, runs.slice(0, MAX_RUNS_KEPT));
}

function logFilePath(id) {
  return path.join(RUNS_DIR, `${id}.log`);
}

/** Cada corrida tiene su propio backstop.json aislado, para no pisar a otras corridas concurrentes. */
function configFilePath(id) {
  return path.join(RUNS_DIR, `${id}.backstop.json`);
}

function listRuns(limit = 50) {
  return readIndex().slice(0, limit);
}

function getRun(id) {
  const run = readIndex().find(r => r.id === id);
  if (!run) return null;
  const logPath = logFilePath(id);
  const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
  return { ...run, log };
}

function upsertIndex(run) {
  const runs = readIndex();
  const idx = runs.findIndex(r => r.id === run.id);
  if (idx === -1) {
    runs.unshift(run);
  } else {
    runs[idx] = run;
  }
  saveIndex(runs);
}

/**
 * Ejecuta un paso individual como proceso hijo, devolviendo el código de salida.
 */
function runStep(step, env, emitter, configFile) {
  return new Promise(resolve => {
    if (!isValidStep(step)) {
      emitter.emit('log', `\n[error] Paso desconocido: ${step}\n`);
      resolve(1);
      return;
    }

    const { command, args } = STEP_COMMANDS[step](configFile);
    const stepEnv = step.startsWith('generate')
      ? { ...env, BACKSTOP_CONFIG_FILE: configFile }
      : env;
    emitter.emit('log', `\n▶ ${STEP_LABELS[step]}\n$ ${command} ${args.join(' ')}\n\n`);

    const child = spawn(command, args, {
      cwd: ROOT,
      env: stepEnv,
      shell: process.platform === 'win32'
    });

    child.stdout.on('data', d => emitter.emit('log', d.toString()));
    child.stderr.on('data', d => emitter.emit('log', d.toString()));

    child.on('close', code => {
      emitter.emit('log', `\n◀ Finalizado (código ${code})\n`);
      resolve(code === null ? 1 : code);
    });

    child.on('error', err => {
      emitter.emit('log', `\n[error] ${err.message}\n`);
      resolve(1);
    });
  });
}

/**
 * Lanza un pipeline (secuencia de pasos) de forma asíncrona.
 * Devuelve inmediatamente el id de la corrida; el trabajo continúa en segundo plano.
 *
 * `key` agrupa corridas que comparten estado persistido (un proyecto, o el
 * proyecto principal) y por lo tanto deben ejecutarse en orden entre sí —
 * corridas con `key` distinta pueden correr en paralelo (hasta el límite
 * global MAX_CONCURRENT_RUNS).
 *
 * `beforeStart(configFile)` y `afterSuccess(configFile)` reciben la ruta del
 * backstop.json aislado de ESTA corrida, para que el llamador se encargue de
 * sembrarlo con la configuración persistida del proyecto antes de arrancar, y
 * de volcar lo generado de vuelta a esa configuración persistida si el
 * pipeline generó escenarios nuevos.
 */
function startPipeline({ steps, envOverrides = {}, label, scheduleId = null, key = 'default', beforeStart = null, afterSuccess = null }) {
  const invalid = steps.filter(s => !isValidStep(s));
  if (invalid.length > 0) {
    throw new Error(`Pasos inválidos: ${invalid.join(', ')}`);
  }
  if (steps.length === 0) {
    throw new Error('El pipeline necesita al menos un paso.');
  }

  const id = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const emitter = new EventEmitter();
  emitter.setMaxListeners(50);

  const run = {
    id,
    label: label || steps.map(s => STEP_LABELS[s] || s).join(' → '),
    steps,
    scheduleId,
    status: 'queued',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null
  };
  upsertIndex(run);

  const logPath = logFilePath(id);
  fs.writeFileSync(logPath, '');
  const appendLog = chunk => {
    fs.appendFileSync(logPath, chunk);
  };
  emitter.on('log', appendLog);

  activeRuns.set(id, { emitter, done: false });

  const env = { ...process.env, ...envOverrides };
  const configFile = configFilePath(id);

  const depth = queueDepthByKey.get(key) || 0;
  if (depth > 0) {
    emitter.emit('log', `⏳ En cola: esperando a que termine otra corrida de "${key}" en curso...\n`);
  }
  queueDepthByKey.set(key, depth + 1);

  const previous = queuesByKey.get(key) || Promise.resolve();
  const next = previous.then(async () => {
    // Se ejecuta recién cuando le toca el turno dentro de su cola (no al
    // encolar), para que cualquier preparación que toque el estado
    // persistido del proyecto (sembrar el backstop.json de esta corrida, por
    // ejemplo) no pise una corrida anterior del mismo proyecto que todavía
    // esté en curso.
    await acquireGlobalSlot();

    const fail = error => {
      emitter.emit('log', `\n[error] ${error.message}\n`);
      run.status = 'failed';
      run.exitCode = 1;
      run.finishedAt = new Date().toISOString();
      upsertIndex(run);
      emitter.emit('end', run);
      const active = activeRuns.get(id);
      if (active) active.done = true;
      setTimeout(() => activeRuns.delete(id), 5000);
    };

    try {
      if (beforeStart) {
        await beforeStart(configFile);
      }

      run.status = 'running';
      upsertIndex(run);

      let finalCode = 0;
      for (const step of steps) {
        const code = await runStep(step, env, emitter, configFile);
        if (code !== 0) {
          finalCode = code;
          break;
        }
      }

      run.status = finalCode === 0 ? 'success' : 'failed';
      run.exitCode = finalCode;
      run.finishedAt = new Date().toISOString();
      upsertIndex(run);

      if (run.status === 'success' && afterSuccess) {
        try {
          await afterSuccess(configFile);
        } catch (error) {
          console.warn(`No se pudo sincronizar tras la corrida "${id}": ${error.message}`);
        }
      }

      emitter.emit('end', run);
      const active = activeRuns.get(id);
      if (active) active.done = true;
      // Deja el emitter disponible un momento para que los streams SSE
      // conectados reciban el evento 'end', luego lo libera de memoria.
      setTimeout(() => activeRuns.delete(id), 5000);
    } catch (error) {
      fail(error);
    } finally {
      queueDepthByKey.set(key, (queueDepthByKey.get(key) || 1) - 1);
      releaseGlobalSlot();
    }
  });
  queuesByKey.set(key, next);

  return { id, run };
}

/**
 * Suscribe un callback al log en vivo de una corrida.
 * Si la corrida ya finalizó, entrega el log guardado y termina inmediatamente.
 */
function subscribe(id, onData, onEnd) {
  const active = activeRuns.get(id);
  if (active && !active.done) {
    active.emitter.on('log', onData);
    active.emitter.once('end', run => onEnd(run));
    return () => {
      active.emitter.off('log', onData);
    };
  }

  // Corrida finalizada (o desconocida en memoria): servir el log guardado.
  const run = getRun(id);
  if (run) {
    if (run.log) onData(run.log);
    onEnd(run);
  } else {
    onEnd(null);
  }
  return () => {};
}

module.exports = {
  STEP_LABELS,
  isValidStep,
  startPipeline,
  subscribe,
  listRuns,
  getRun
};
