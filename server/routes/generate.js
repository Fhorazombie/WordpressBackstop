const express = require('express');
const runner = require('../lib/runner');
const backstopConfig = require('../lib/backstopConfig');

const router = express.Router();

router.post('/generate/:mode', (req, res) => {
  const { mode } = req.params;
  if (mode !== 'sitemap' && mode !== 'list') {
    return res.status(400).json({ error: 'Modo inválido. Usa "sitemap" o "list".' });
  }

  try {
    const envOverrides = req.body && req.body.env ? req.body.env : {};
    const { run } = runner.startPipeline({
      steps: [mode === 'sitemap' ? 'generate-sitemap' : 'generate-list'],
      envOverrides,
      label: mode === 'sitemap' ? 'Generar desde sitemap' : 'Generar desde lista',
      // Activa la config guardada del proyecto principal en backstop.json
      // recién cuando le toca el turno (no antes), para que el script no
      // herede lo que haya quedado ahí de la corrida de otro proyecto.
      beforeStart: () => backstopConfig.syncDefaultToDisk()
    });

    runner.subscribe(run.id, () => {}, finished => {
      if (finished && finished.status === 'success') {
        try {
          backstopConfig.syncDefaultFromDisk();
        } catch (error) {
          console.warn(`No se pudo sincronizar el proyecto principal tras generar: ${error.message}`);
        }
      }
    });

    res.status(202).json({ runId: run.id });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
