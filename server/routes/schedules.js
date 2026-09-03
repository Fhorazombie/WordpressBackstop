const express = require('express');
const scheduler = require('../lib/scheduler');

const router = express.Router();

router.get('/schedules', (req, res) => {
  res.json({ schedules: scheduler.list() });
});

router.post('/schedules', (req, res) => {
  try {
    const schedule = scheduler.create(req.body || {});
    res.status(201).json({ schedule });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/schedules/:id', (req, res) => {
  try {
    const schedule = scheduler.update(req.params.id, req.body || {});
    res.json({ schedule });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/schedules/:id', (req, res) => {
  try {
    scheduler.remove(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/schedules/:id/run-now', (req, res) => {
  try {
    const run = scheduler.runNow(req.params.id);
    res.status(202).json({ ok: true, runId: run.id });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
