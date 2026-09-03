const fs = require('fs');
const path = require('path');
const { readJson, writeJson } = require('./store');
const { PROJECTS_FILE, URL_LISTS_DIR, UPLOADS_DIR, BACKSTOP_DATA_ROOT, ROOT } = require('./paths');
const backstopConfig = require('./backstopConfig');

const MODES = ['sitemap', 'url', 'design'];

const MODE_LABELS = {
  sitemap: 'Sitemap',
  url: 'URL / Lista',
  design: 'Diseño vs. Live'
};

function slugify(name) {
  const slug = String(name)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'proyecto';
}

function readAll() {
  return readJson(PROJECTS_FILE, []);
}

function saveAll(list) {
  writeJson(PROJECTS_FILE, list);
}

function uniqueId(base, existing) {
  const ids = new Set(existing.map(p => p.id));
  if (!ids.has(base) && base !== 'default') return base;
  let n = 2;
  let id = `${base}-${n}`;
  while (ids.has(id) || id === 'default') {
    n += 1;
    id = `${base}-${n}`;
  }
  return id;
}

function list() {
  return readAll();
}

function get(id) {
  const project = readAll().find(p => p.id === id);
  if (!project) throw new Error(`No se encontró el proyecto "${id}".`);
  return project;
}

function validateSettings(mode, settings = {}) {
  if (!MODES.includes(mode)) {
    throw new Error(`Modo inválido: "${mode}". Usa sitemap, url o design.`);
  }
  if (mode === 'sitemap' && !settings.SITE_URL) {
    throw new Error('El modo Sitemap necesita SITE_URL.');
  }
  if (mode === 'url' && (!settings.urls || !settings.urls.trim())) {
    throw new Error('El modo URL necesita al menos una URL (una por línea).');
  }
  if (mode === 'design' && !settings.DESIGN_URL) {
    throw new Error('El modo Diseño necesita DESIGN_URL (la URL a comparar).');
  }
}

function create({ name, mode, settings }) {
  if (!name || !name.trim()) throw new Error('El proyecto necesita un nombre.');
  validateSettings(mode, settings);

  const all = readAll();
  const id = uniqueId(slugify(name), all);
  const project = {
    id,
    name: name.trim(),
    mode,
    settings: settings || {},
    config: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastGeneratedAt: null
  };
  all.push(project);
  saveAll(all);
  return project;
}

function update(id, data) {
  const all = readAll();
  const idx = all.findIndex(p => p.id === id);
  if (idx === -1) throw new Error(`No se encontró el proyecto "${id}".`);

  const merged = { ...all[idx] };
  if (data.name !== undefined && data.name.trim()) merged.name = data.name.trim();
  if (data.mode !== undefined) merged.mode = data.mode;
  if (data.settings !== undefined) merged.settings = { ...merged.settings, ...data.settings };
  validateSettings(merged.mode, merged.settings);

  merged.updatedAt = new Date().toISOString();
  all[idx] = merged;
  saveAll(all);
  return merged;
}

function remove(id) {
  const all = readAll();
  const idx = all.findIndex(p => p.id === id);
  if (idx === -1) throw new Error(`No se encontró el proyecto "${id}".`);
  const [project] = all.splice(idx, 1);
  saveAll(all);

  const dataDir = path.join(BACKSTOP_DATA_ROOT, project.id);
  if (fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true });

  const urlListFile = path.join(URL_LISTS_DIR, `${project.id}.txt`);
  if (fs.existsSync(urlListFile)) fs.unlinkSync(urlListFile);

  const uploadDir = path.join(UPLOADS_DIR, project.id);
  if (fs.existsSync(uploadDir)) fs.rmSync(uploadDir, { recursive: true, force: true });

  return project;
}

/* ------------------------------ escenarios ------------------------------ */

function ensureConfig(project) {
  if (!project.config) project.config = backstopConfig.emptyConfig();
  return project.config;
}

function withProject(id, mutator) {
  const all = readAll();
  const idx = all.findIndex(p => p.id === id);
  if (idx === -1) throw new Error(`No se encontró el proyecto "${id}".`);
  const config = ensureConfig(all[idx]);
  const result = mutator(config);
  all[idx].updatedAt = new Date().toISOString();
  saveAll(all);
  return result;
}

function listScenarios(id) {
  const project = get(id);
  const config = project.config || { scenarios: [], viewports: [] };
  return { scenarios: config.scenarios || [], viewports: config.viewports || [] };
}

function addScenario(id, scenario) {
  return withProject(id, config => backstopConfig.addScenarioToConfig(config, scenario).scenarios);
}

function updateScenario(id, label, updates) {
  return withProject(id, config => backstopConfig.updateScenarioInConfig(config, label, updates).scenarios);
}

function deleteScenario(id, label) {
  return withProject(id, config => backstopConfig.deleteScenarioFromConfig(config, label).scenarios);
}

function setViewports(id, viewports) {
  return withProject(id, config => backstopConfig.setViewportsInConfig(config, viewports).viewports);
}

/* ------------------------- config generada por corrida -------------------- */
/* Cada corrida de un proyecto usa su propio backstop.json aislado (ver
 * server/lib/runner.js), así que no hay un archivo compartido que "activar":
 * simplemente se guarda de vuelta lo que la corrida generó. */

function saveGeneratedConfig(id, config) {
  const all = readAll();
  const idx = all.findIndex(p => p.id === id);
  if (idx === -1) throw new Error(`No se encontró el proyecto "${id}".`);
  all[idx].config = config;
  all[idx].updatedAt = new Date().toISOString();
  all[idx].lastGeneratedAt = new Date().toISOString();
  saveAll(all);
  return config;
}

/* ------------------------- entorno para los spawns ------------------------ */

function envFor(project) {
  const env = { PROJECT_ID: project.id, BACKSTOP_DATA_DIR: project.id };
  const s = project.settings || {};

  if (project.mode === 'sitemap') {
    ['SITE_URL', 'SITEMAP_URL', 'SAMPLE_SIZE', 'MAX_URLS', 'TIMEOUT', 'REQUEST_HEADERS', 'REJECT_UNAUTHORIZED', 'SCENARIO_DELAY', 'SCENARIO_HIDE', 'SCENARIO_REMOVE']
      .forEach(key => { if (s[key]) env[key] = String(s[key]); });
    env.SITEMAP_SAMPLE_MODE = s.SITEMAP_SAMPLE_MODE ? 'true' : '0';
  } else if (project.mode === 'url') {
    env.URL_LIST = `${project.id}.txt`;
    ['SCENARIO_DELAY', 'SCENARIO_HIDE', 'SCENARIO_REMOVE']
      .forEach(key => { if (s[key]) env[key] = String(s[key]); });
  } else if (project.mode === 'design') {
    ['DESIGN_URL', 'DESIGN_LABEL', 'DESIGN_THRESHOLD', 'DESIGN_HIDE', 'DESIGN_REMOVE', 'DESIGN_VIEWPORT_HEIGHT', 'SCENARIO_DELAY']
      .forEach(key => { if (s[key]) env[key] = String(s[key]); });
    if (s.DESIGN_IMAGE) env.DESIGN_IMAGE = s.DESIGN_IMAGE;
  }

  return env;
}

function generateStepFor(project) {
  if (project.mode === 'sitemap') return 'generate-sitemap';
  if (project.mode === 'url') return 'generate-list';
  if (project.mode === 'design') return 'generate-design';
  throw new Error(`Modo inválido: "${project.mode}".`);
}

/** Antes de generar en modo "url", persiste las URLs del proyecto a su propio archivo en url-lists/. */
function writeUrlListFile(project) {
  if (project.mode !== 'url') return;
  fs.mkdirSync(URL_LISTS_DIR, { recursive: true });
  const filePath = path.join(URL_LISTS_DIR, `${project.id}.txt`);
  fs.writeFileSync(filePath, project.settings.urls || '', 'utf8');
}

function uploadsDirFor(id) {
  const dir = path.join(UPLOADS_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function setDesignImage(id, absolutePath) {
  const all = readAll();
  const idx = all.findIndex(p => p.id === id);
  if (idx === -1) throw new Error(`No se encontró el proyecto "${id}".`);
  const relative = path.relative(ROOT, absolutePath);
  all[idx].settings = { ...all[idx].settings, DESIGN_IMAGE: relative };
  all[idx].updatedAt = new Date().toISOString();
  saveAll(all);
  return all[idx];
}

module.exports = {
  MODES,
  MODE_LABELS,
  list,
  get,
  create,
  update,
  remove,
  listScenarios,
  addScenario,
  updateScenario,
  deleteScenario,
  setViewports,
  saveGeneratedConfig,
  envFor,
  generateStepFor,
  writeUrlListFile,
  uploadsDirFor,
  setDesignImage
};
