const express = require('express');
const backstopConfig = require('../lib/backstopConfig');

const router = express.Router();

router.get('/scenarios', (req, res) => {
  try {
    const config = backstopConfig.readConfig();
    res.json({ scenarios: config.scenarios || [], viewports: config.viewports || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/scenarios', (req, res) => {
  try {
    const scenarios = backstopConfig.addScenario(req.body || {});
    res.status(201).json({ scenarios });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/scenarios/:label', (req, res) => {
  try {
    const scenarios = backstopConfig.updateScenario(req.params.label, req.body || {});
    res.json({ scenarios });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/scenarios/:label', (req, res) => {
  try {
    const scenarios = backstopConfig.deleteScenario(req.params.label);
    res.json({ scenarios });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/viewports', (req, res) => {
  res.json({ viewports: backstopConfig.getViewports() });
});

router.put('/viewports', (req, res) => {
  try {
    const viewports = backstopConfig.setViewports(req.body.viewports || []);
    res.json({ viewports });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
