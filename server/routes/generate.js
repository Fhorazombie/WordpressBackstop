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
      key: 'default',
      // Siembra el backstop.json AISLADO de esta corrida con la config
      // guardada del proyecto principal recién cuando le toca el turno (no
      // antes), para que el script no herede lo que haya quedado en la
      // config de otra corrida en curso.
      beforeStart: configFile => backstopConfig.writeConfigFile(configFile, backstopConfig.readDefaultConfig()),
      afterSuccess: configFile => backstopConfig.writeDefaultConfig(backstopConfig.readConfigFile(configFile))
    });

    res.status(202).json({ runId: run.id });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
