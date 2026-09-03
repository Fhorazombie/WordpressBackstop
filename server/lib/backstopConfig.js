const fs = require('fs');
const { BACKSTOP_JSON } = require('./paths');
const { getBaseConfig } = require('../../scripts/lib/utils');

/**
 * Lee backstop.json. Si no existe, genera una configuración base vacía
 * (sin escenarios) usando la misma lógica que los scripts de generación.
 */
function readConfig() {
  if (fs.existsSync(BACKSTOP_JSON)) {
    const raw = fs.readFileSync(BACKSTOP_JSON, 'utf8');
    return JSON.parse(raw);
  }
  return emptyConfig();
}

function writeConfig(config) {
  fs.writeFileSync(BACKSTOP_JSON, JSON.stringify(config, null, 2), 'utf8');
}

/** Configuración base sin escenarios, para un proyecto que todavía no generó nada. */
function emptyConfig() {
  const base = getBaseConfig();
  return { ...base, scenarios: [] };
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
 * "principal" (backstop.json en la raíz, más abajo) como los proyectos
 * adicionales gestionados por server/lib/projects.js.
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
 * Wrappers para el proyecto "principal": leen/escriben directamente el
 * backstop.json de la raíz del repo (comportamiento histórico, sin cambios).
 * ------------------------------------------------------------------------ */

function listScenarios() {
  const config = readConfig();
  return config.scenarios || [];
}

function addScenario(scenario) {
  const config = readConfig();
  addScenarioToConfig(config, scenario);
  writeConfig(config);
  return config.scenarios;
}

function updateScenario(label, updates) {
  const config = readConfig();
  updateScenarioInConfig(config, label, updates);
  writeConfig(config);
  return config.scenarios;
}

function deleteScenario(label) {
  const config = readConfig();
  deleteScenarioFromConfig(config, label);
  writeConfig(config);
  return config.scenarios;
}

function getViewports() {
  const config = readConfig();
  return config.viewports || [];
}

function setViewports(viewports) {
  const config = readConfig();
  setViewportsInConfig(config, viewports);
  writeConfig(config);
  return config.viewports;
}

module.exports = {
  readConfig,
  writeConfig,
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
