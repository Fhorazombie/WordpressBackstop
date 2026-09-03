const fs = require('fs');
const path = require('path');
const { BACKSTOP_JSON, DEFAULT_PROJECT_FILE, PROJECTS_FILE } = require('./paths');
const { getBaseConfig } = require('../../scripts/lib/utils');

/* ------------------------------------------------------------------------
 * backstop.json (raíz): el archivo de trabajo que lee/escribe directamente
 * el CLI de BackstopJS. El proyecto principal Y cada proyecto adicional lo
 * usan por turnos como "área de staging" para invocar los scripts —  nunca
 * hay que asumir que su contenido en un instante dado pertenece a un
 * proyecto en particular; para eso existe el almacenamiento persistente de
 * cada uno (más abajo, y project.config en server/lib/projects.js).
 * ------------------------------------------------------------------------ */

function readRootConfig() {
  if (fs.existsSync(BACKSTOP_JSON)) {
    return JSON.parse(fs.readFileSync(BACKSTOP_JSON, 'utf8'));
  }
  return emptyConfig();
}

function writeRootConfig(config) {
  fs.writeFileSync(BACKSTOP_JSON, JSON.stringify(config, null, 2), 'utf8');
}

/** Configuración base sin escenarios, para un proyecto que todavía no generó nada. */
function emptyConfig() {
  const base = getBaseConfig();
  return { ...base, scenarios: [] };
}

/* ------------------------------------------------------------------------
 * Almacenamiento persistente del proyecto principal — independiente del
 * backstop.json de la raíz, igual que project.config lo es para cada
 * proyecto adicional. Así, editar un escenario del proyecto principal (o
 * generar sus scenarios) nunca se pierde ni se mezcla con lo que haya
 * quedado en la raíz por la última corrida de otro proyecto.
 * ------------------------------------------------------------------------ */

function readDefaultConfig() {
  if (fs.existsSync(DEFAULT_PROJECT_FILE)) {
    return JSON.parse(fs.readFileSync(DEFAULT_PROJECT_FILE, 'utf8'));
  }
  // Migración: sólo adoptamos un backstop.json preexistente como punto de
  // partida si el sistema de proyectos múltiples nunca se usó (no existe
  // data/projects.json). Si ya existe, el backstop.json de la raíz puede
  // ser perfectamente el "área de staging" que dejó la última corrida de
  // OTRO proyecto — adoptarlo igual mezclaría ese proyecto con el principal.
  if (!fs.existsSync(PROJECTS_FILE) && fs.existsSync(BACKSTOP_JSON)) {
    const migrated = readRootConfig();
    writeDefaultConfig(migrated);
    return migrated;
  }
  return emptyConfig();
}

function writeDefaultConfig(config) {
  fs.mkdirSync(path.dirname(DEFAULT_PROJECT_FILE), { recursive: true });
  fs.writeFileSync(DEFAULT_PROJECT_FILE, JSON.stringify(config, null, 2), 'utf8');
}

/** "Activa" la config guardada del proyecto principal en backstop.json, para que el CLI la use. */
function syncDefaultToDisk() {
  writeRootConfig(readDefaultConfig());
}

/** Vuelca lo que haya en backstop.json (recién generado) al almacenamiento persistente. */
function syncDefaultFromDisk() {
  const config = readRootConfig();
  writeDefaultConfig(config);
  return config;
}

function findScenarioIndex(config, label) {
  return (config.scenarios || []).findIndex(s => s.label === label);
}

function normalizeScenario(scenario) {
  const csv = value => {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === 'string') {
      return value.split(',').map(v => v.trim()).filter(Boolean);
    }
    return [];
  };

  return {
    label: String(scenario.label).trim(),
    cookiePath: scenario.cookiePath || 'backstop_data/engine_scripts/cookies.json',
    url: String(scenario.url).trim(),
    referenceUrl: scenario.referenceUrl || '',
    readySelector: scenario.readySelector || 'body',
    delay: Number.isFinite(Number(scenario.delay)) ? Number(scenario.delay) : 5000,
    hideSelectors: csv(scenario.hideSelectors),
    removeSelectors: csv(scenario.removeSelectors),
    selectors: csv(scenario.selectors),
    misMatchThreshold: Number.isFinite(Number(scenario.misMatchThreshold))
      ? Number(scenario.misMatchThreshold)
      : 0.1,
    requireSameDimensions: scenario.requireSameDimensions !== false
  };
}

/* ------------------------------------------------------------------------
 * Funciones puras: operan sobre un objeto `config` en memoria (mutándolo y
 * devolviéndolo) sin tocar el filesystem. Las reutilizan tanto el proyecto
 * principal (más abajo) como los proyectos adicionales gestionados por
 * server/lib/projects.js.
 * ------------------------------------------------------------------------ */

function addScenarioToConfig(config, scenario) {
  config.scenarios = config.scenarios || [];

  if (!scenario.label || !scenario.label.trim()) {
    throw new Error('El escenario necesita un "label".');
  }
  if (!scenario.url || !scenario.url.trim()) {
    throw new Error('El escenario necesita una "url".');
  }
  if (findScenarioIndex(config, scenario.label) !== -1) {
    throw new Error(`Ya existe un escenario con el label "${scenario.label}".`);
  }

  config.scenarios.push(normalizeScenario(scenario));
  return config;
}

function updateScenarioInConfig(config, label, updates) {
  const index = findScenarioIndex(config, label);
  if (index === -1) {
    throw new Error(`No se encontró el escenario "${label}".`);
  }

  const newLabel = updates.label && updates.label.trim() ? updates.label.trim() : label;
  if (newLabel !== label && findScenarioIndex(config, newLabel) !== -1) {
    throw new Error(`Ya existe un escenario con el label "${newLabel}".`);
  }

  config.scenarios[index] = normalizeScenario({
    ...config.scenarios[index],
    ...updates,
    label: newLabel
  });
  return config;
}

function deleteScenarioFromConfig(config, label) {
  const index = findScenarioIndex(config, label);
  if (index === -1) {
    throw new Error(`No se encontró el escenario "${label}".`);
  }
  config.scenarios.splice(index, 1);
  return config;
}

function setViewportsInConfig(config, viewports) {
  if (!Array.isArray(viewports) || viewports.length === 0) {
    throw new Error('Se requiere al menos un viewport.');
  }
  config.viewports = viewports.map(vp => ({
    label: String(vp.label).trim(),
    width: parseInt(vp.width, 10),
    height: parseInt(vp.height, 10)
  }));
  return config;
}

/* ------------------------------------------------------------------------
 * Wrappers para el proyecto principal: leen/escriben su almacenamiento
 * persistente (no el backstop.json de la raíz, que es compartido).
 * ------------------------------------------------------------------------ */

function listScenarios() {
  const config = readDefaultConfig();
  return config.scenarios || [];
}

function addScenario(scenario) {
  const config = readDefaultConfig();
  addScenarioToConfig(config, scenario);
  writeDefaultConfig(config);
  return config.scenarios;
}

function updateScenario(label, updates) {
  const config = readDefaultConfig();
  updateScenarioInConfig(config, label, updates);
  writeDefaultConfig(config);
  return config.scenarios;
}

function deleteScenario(label) {
  const config = readDefaultConfig();
  deleteScenarioFromConfig(config, label);
  writeDefaultConfig(config);
  return config.scenarios;
}

function getViewports() {
  const config = readDefaultConfig();
  return config.viewports || [];
}

function setViewports(viewports) {
  const config = readDefaultConfig();
  setViewportsInConfig(config, viewports);
  writeDefaultConfig(config);
  return config.viewports;
}

module.exports = {
  readRootConfig,
  writeRootConfig,
  readDefaultConfig,
  writeDefaultConfig,
  syncDefaultToDisk,
  syncDefaultFromDisk,
  emptyConfig,
  normalizeScenario,
  addScenarioToConfig,
  updateScenarioInConfig,
  deleteScenarioFromConfig,
  setViewportsInConfig,
  listScenarios,
  addScenario,
  updateScenario,
  deleteScenario,
  getViewports,
  setViewports
};
