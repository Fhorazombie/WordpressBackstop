const express = require('express');
const runner = require('../lib/runner');

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
      label: mode === 'sitemap' ? 'Generar desde sitemap' : 'Generar desde lista'
    });
    res.status(202).json({ runId: run.id });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
