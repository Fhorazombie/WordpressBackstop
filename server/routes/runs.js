const express = require('express');
const runner = require('../lib/runner');
const backstopConfig = require('../lib/backstopConfig');

const router = express.Router();

const SINGLE_ACTIONS = ['reference', 'test', 'approve'];

router.post('/run', (req, res) => {
  try {
    const body = req.body || {};
    let steps;

    if (Array.isArray(body.steps) && body.steps.length > 0) {
      steps = body.steps;
    } else if (body.action && SINGLE_ACTIONS.includes(body.action)) {
      steps = [body.action];
    } else {
      return res.status(400).json({
        error: `Debes indicar "action" (${SINGLE_ACTIONS.join('|')}) o un array "steps".`
      });
    }

    const hasGenerateStep = steps.some(step => step.startsWith('generate'));

    const { run } = runner.startPipeline({
      steps,
      envOverrides: body.env || {},
      label: body.label,
      // Activa la config guardada del proyecto principal en backstop.json
      // recién cuando le toca el turno (no antes), para que reference/test/
      // approve nunca lean lo que haya quedado ahí de otro proyecto.
      beforeStart: () => backstopConfig.syncDefaultToDisk()
    });

    if (hasGenerateStep) {
      runner.subscribe(run.id, () => {}, finished => {
        if (finished && finished.status === 'success') {
          try {
            backstopConfig.syncDefaultFromDisk();
          } catch (error) {
            console.warn(`No se pudo sincronizar el proyecto principal tras generar: ${error.message}`);
          }
        }
      });
    }

    res.status(202).json({ runId: run.id });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/runs', (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
  res.json({ runs: runner.listRuns(limit) });
});

router.get('/runs/:id', (req, res) => {
  const run = runner.getRun(req.params.id);
  if (!run) return res.status(404).json({ error: 'Corrida no encontrada.' });
  res.json({ run });
});

router.get('/runs/:id/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write(': connected\n\n');

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const onData = chunk => send('log', { chunk });
  const onEnd = run => {
    send('end', { run });
    res.end();
  };

  const unsubscribe = runner.subscribe(req.params.id, onData, onEnd);

  req.on('close', () => {
    unsubscribe();
  });
});

module.exports = router;
