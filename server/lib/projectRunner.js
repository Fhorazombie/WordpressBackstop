const runner = require('./runner');
const projects = require('./projects');

/**
 * Ejecuta un pipeline de pasos para un proyecto adicional, encargándose de:
 *  - escribir su archivo de lista de URLs si corresponde (modo "url"),
 *  - inyectar las variables de entorno propias del proyecto (PROJECT_ID,
 *    BACKSTOP_DATA_DIR, y las de su modo: sitemap, lista o diseño),
 *  - "activar" su configuración guardada (escenarios, viewports, etc.) en
 *    el backstop.json de la raíz antes de invocar el CLI, siempre — tanto
 *    para reference/test/approve (que lo leen tal cual) como para un paso
 *    de generación (los scripts preservan viewports/engine/etc. de lo que
 *    ya esté en el archivo, así que si no se sincroniza primero heredarían
 *    lo que haya quedado ahí de otra corrida y se perdería, por ejemplo,
 *    un viewport agregado a mano que todavía no pasó por una generación),
 *  - y volver a guardar la configuración generada en el proyecto cuando el
 *    pipeline sí generó escenarios nuevos.
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
    // Se ejecuta recién cuando esta corrida sale de la cola, nunca antes:
    // así una generación no pisa el backstop.json compartido mientras otra
    // corrida (de este proyecto o de otro) todavía lo está usando. También
    // relee el proyecto por si su configuración cambió mientras esperaba.
    beforeStart: () => {
      const fresh = projects.get(project.id);
      if (fresh.mode === 'url' && steps.includes('generate-list')) {
        projects.writeUrlListFile(fresh);
      }
      // Siempre activamos la config guardada del proyecto antes de tocar el
      // CLI: para reference/test/approve porque la leen tal cual, y para un
      // paso de generación porque los scripts preservan viewports/engine/etc.
      // de lo que ya haya en backstop.json — si no lo sincronizamos primero,
      // heredarían lo que haya quedado ahí de otra corrida.
      projects.syncToDisk(fresh.id);
    }
  });

  if (hasGenerateStep) {
    runner.subscribe(run.id, () => {}, finished => {
      if (finished && finished.status === 'success') {
        try {
          projects.syncFromDisk(project.id);
        } catch (error) {
          console.warn(`No se pudo sincronizar el proyecto "${project.id}" tras generar: ${error.message}`);
        }
      }
    });
  }

  return run;
}

module.exports = { runPipeline };
