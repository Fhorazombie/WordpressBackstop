const runner = require('./runner');
const projects = require('./projects');

/**
 * Ejecuta un pipeline de pasos para un proyecto adicional, encargándose de:
 *  - escribir su archivo de lista de URLs si corresponde (modo "url"),
 *  - inyectar las variables de entorno propias del proyecto (PROJECT_ID,
 *    BACKSTOP_DATA_DIR, y las de su modo: sitemap, lista o diseño),
 *  - "activar" su configuración guardada en el backstop.json de la raíz
 *    antes de invocar el CLI cuando el pipeline no incluye un paso de
 *    generación (reference/test/approve leen ese archivo directamente),
 *  - y volver a guardar la configuración generada en el proyecto cuando el
 *    pipeline sí generó escenarios nuevos.
 */
function runPipeline(project, steps, { label, scheduleId } = {}) {
  const hasGenerateStep = steps.some(step => step.startsWith('generate'));

  if (project.mode === 'url' && steps.includes('generate-list')) {
    projects.writeUrlListFile(project);
  }

  if (!hasGenerateStep) {
    projects.syncToDisk(project.id);
  }

  const envOverrides = projects.envFor(project);
  const defaultLabel = `[${project.name}] ${steps.map(s => runner.STEP_LABELS[s] || s).join(' → ')}`;

  const { run } = runner.startPipeline({
    steps,
    envOverrides,
    label: label || defaultLabel,
    scheduleId
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
