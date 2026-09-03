const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const { readJson, writeJson } = require('./store');
const { ROOT, SCRIPTS_DIR, RUNS_DIR, RUNS_INDEX_FILE, BIN_DIR } = require('./paths');

const MAX_RUNS_KEPT = 100;

// Mantiene el estado "en vivo" (emitter + buffer) de las corridas activas o
// recién finalizadas, para poder transmitir el log por SSE.
const activeRuns = new Map();

fs.mkdirSync(RUNS_DIR, { recursive: true });

function binPath(name) {
  const exe = process.platform === 'win32' ? `${name}.cmd` : name;
  return path.join(BIN_DIR, exe);
}

// Define cómo se lanza cada tipo de paso soportado por un pipeline.
const STEP_COMMANDS = {
  'generate-sitemap': () => ({
    command: process.execPath,
    args: [path.join(SCRIPTS_DIR, 'generate-from-sitemap.js')]
  }),
  'generate-list': () => ({
    command: process.execPath,
    args: [path.join(SCRIPTS_DIR, 'generate-from-list.js')]
  }),
  reference: () => ({ command: binPath('backstop'), args: ['reference'] }),
  test: () => ({ command: binPath('backstop'), args: ['test'] }),
  approve: () => ({ command: binPath('backstop'), args: ['approve'] })
};

const STEP_LABELS = {
  'generate-sitemap': 'Generar escenarios desde sitemap',
  'generate-list': 'Generar escenarios desde lista de URLs',
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
function runStep(step, env, emitter) {
  return new Promise(resolve => {
    if (!isValidStep(step)) {
      emitter.emit('log', `\n[error] Paso desconocido: ${step}\n`);
      resolve(1);
      return;
    }

    const { command, args } = STEP_COMMANDS[step]();
    emitter.emit('log', `\n▶ ${STEP_LABELS[step]}\n$ ${command} ${args.join(' ')}\n\n`);

    const child = spawn(command, args, {
      cwd: ROOT,
      env,
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
 */
function startPipeline({ steps, envOverrides = {}, label, scheduleId = null }) {
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
    status: 'running',
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

  (async () => {
    let finalCode = 0;
    for (const step of steps) {
      const code = await runStep(step, env, emitter);
      if (code !== 0) {
        finalCode = code;
        break;
      }
    }

    run.status = finalCode === 0 ? 'success' : 'failed';
    run.exitCode = finalCode;
    run.finishedAt = new Date().toISOString();
    upsertIndex(run);

    emitter.emit('end', run);
    const active = activeRuns.get(id);
    if (active) active.done = true;
    // Deja el emitter disponible un momento para que los streams SSE conectados
    // reciban el evento 'end', luego lo libera de memoria.
    setTimeout(() => activeRuns.delete(id), 5000);
  })();

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
