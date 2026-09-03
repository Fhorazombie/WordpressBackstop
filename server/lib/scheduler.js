const crypto = require('crypto');
const cron = require('node-cron');
const { readJson, writeJson } = require('./store');
const { SCHEDULES_FILE } = require('./paths');
const runner = require('./runner');

const tasks = new Map();

function readSchedules() {
  return readJson(SCHEDULES_FILE, []);
}

function saveSchedules(schedules) {
  writeJson(SCHEDULES_FILE, schedules);
}

function fire(schedule) {
  console.log(`⏰ Ejecutando schedule "${schedule.name}" (${schedule.id})`);
  const { run } = runner.startPipeline({
    steps: schedule.steps,
    envOverrides: schedule.envOverrides || {},
    label: `[Agendado] ${schedule.name}`,
    scheduleId: schedule.id
  });

  const schedules = readSchedules();
  const idx = schedules.findIndex(s => s.id === schedule.id);
  if (idx !== -1) {
    schedules[idx].lastRun = { runId: run.id, at: run.startedAt, status: 'running' };
    saveSchedules(schedules);
  }

  runner.subscribe(run.id, () => {}, finished => {
    const list = readSchedules();
    const i = list.findIndex(s => s.id === schedule.id);
    if (i !== -1 && finished) {
      list[i].lastRun = { runId: finished.id, at: finished.finishedAt, status: finished.status };
      saveSchedules(list);
    }
  });

  return run;
}

function register(schedule) {
  unregister(schedule.id);
  if (!schedule.enabled) return;
  if (!cron.validate(schedule.cron)) {
    console.warn(`⚠️  Expresión cron inválida para "${schedule.name}": ${schedule.cron}`);
    return;
  }
  const task = cron.schedule(schedule.cron, () => fire(schedule), {
    timezone: schedule.timezone || undefined
  });
  tasks.set(schedule.id, task);
}

function unregister(id) {
  const task = tasks.get(id);
  if (task) {
    task.stop();
    tasks.delete(id);
  }
}

function init() {
  const schedules = readSchedules();
  schedules.forEach(register);
  console.log(`🗓️  Programador iniciado con ${schedules.filter(s => s.enabled).length} schedule(s) activo(s)`);
}

function list() {
  return readSchedules();
}

function create(data) {
  validate(data);
  const schedules = readSchedules();
  const schedule = {
    id: crypto.randomBytes(6).toString('hex'),
    name: data.name.trim(),
    cron: data.cron.trim(),
    steps: data.steps,
    envOverrides: data.envOverrides || {},
    enabled: data.enabled !== false,
    timezone: data.timezone || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastRun: null
  };
  schedules.push(schedule);
  saveSchedules(schedules);
  register(schedule);
  return schedule;
}

function update(id, data) {
  const schedules = readSchedules();
  const idx = schedules.findIndex(s => s.id === id);
  if (idx === -1) throw new Error(`No se encontró el schedule "${id}".`);

  const merged = { ...schedules[idx], ...data, id, updatedAt: new Date().toISOString() };
  validate(merged);
  schedules[idx] = merged;
  saveSchedules(schedules);
  register(merged);
  return merged;
}

function remove(id) {
  const schedules = readSchedules();
  const idx = schedules.findIndex(s => s.id === id);
  if (idx === -1) throw new Error(`No se encontró el schedule "${id}".`);
  unregister(id);
  schedules.splice(idx, 1);
  saveSchedules(schedules);
}

function runNow(id) {
  const schedules = readSchedules();
  const schedule = schedules.find(s => s.id === id);
  if (!schedule) throw new Error(`No se encontró el schedule "${id}".`);
  return fire(schedule);
}

function validate(data) {
  if (!data.name || !data.name.trim()) throw new Error('El schedule necesita un nombre.');
  if (!data.cron || !cron.validate(data.cron)) {
    throw new Error(`Expresión cron inválida: "${data.cron}"`);
  }
  if (!Array.isArray(data.steps) || data.steps.length === 0) {
    throw new Error('El schedule necesita al menos un paso (pipeline).');
  }
  const invalid = data.steps.filter(s => !runner.isValidStep(s));
  if (invalid.length > 0) {
    throw new Error(`Pasos inválidos: ${invalid.join(', ')}`);
  }
}

module.exports = { init, list, create, update, remove, runNow };
