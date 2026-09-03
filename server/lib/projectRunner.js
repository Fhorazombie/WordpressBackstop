const runner = require('./runner');
const projects = require('./projects');
const backstopConfig = require('./backstopConfig');

/**
 * Ejecuta un pipeline de pasos para un proyecto adicional, encargándose de:
 *  - escribir su archivo de lista de URLs si corresponde (modo "url"),
 *  - inyectar las variables de entorno propias del proyecto (PROJECT_ID,
 *    BACKSTOP_DATA_DIR, y las de su modo: sitemap, lista o diseño),
 *  - sembrar la configuración guardada del proyecto (escenarios, viewports,
 *    etc.) en el backstop.json AISLADO de esta corrida antes de invocar el
 *    CLI (los scripts de generación preservan viewports/engine/etc. de lo
 *    que ya esté ahí, así que si no se siembra primero perderían, por
 *    ejemplo, un viewport agregado a mano que todavía no pasó por una
 *    generación),
 *  - y volver a guardar la configuración generada en el proyecto cuando el
 *    pipeline sí generó escenarios nuevos.
 *
 * Cada corrida usa su propio archivo de config (ver server/lib/runner.js),
 * así que dos proyectos distintos pueden generar/probar en paralelo sin
 * pisarse. Corridas del MISMO proyecto se siguen sirviendo en orden (misma
 * `key`) porque comparten la config persistida a la que hay que leer y
 * escribir de vuelta.
 */
function runPipeline(project, steps, { label, scheduleId } = {}) {
  const hasGenerateStep = steps.some(step => step.startsWith('generate'));
  const envOverrides = projects.envFor(project);
  const defaultLabel = `[${project.name}] ${steps.map(s => runner.STEP_LABELS[s] || s).join(' → ')}`;

  const { run } = runner.startPipeline({
    steps,
    envOverrides,
    label: label || defaultLabel,
    scheduleId,
    key: `project:${project.id}`,
    beforeStart: configFile => {
      const fresh = projects.get(project.id);
      if (fresh.mode === 'url' && steps.includes('generate-list')) {
        projects.writeUrlListFile(fresh);
      }
      backstopConfig.writeConfigFile(configFile, fresh.config || backstopConfig.emptyConfig());
    },
    afterSuccess: hasGenerateStep
      ? configFile => {
          const config = backstopConfig.readConfigFile(configFile);
          projects.saveGeneratedConfig(project.id, config);
        }
      : null
  });

  return run;
}

module.exports = { runPipeline };
