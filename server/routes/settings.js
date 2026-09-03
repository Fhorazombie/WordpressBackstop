const express = require('express');
const envFile = require('../lib/envFile');

const router = express.Router();

router.get('/settings', (req, res) => {
  res.json({ env: envFile.readEnv(), keys: envFile.KNOWN_KEYS });
});

router.put('/settings', (req, res) => {
  try {
    const updates = req.body && req.body.env ? req.body.env : {};
    const env = envFile.writeEnv(updates);
    res.json({ env });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
