const express = require('express');
const multer = require('multer');
const path = require('path');
const projects = require('../lib/projects');
const projectRunner = require('../lib/projectRunner');

const router = express.Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        cb(null, projects.uploadsDirFor(req.params.id));
      } catch (error) {
        cb(error);
      }
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `design${ext}`);
    }
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.png', '.jpg', '.jpeg'].includes(ext)) {
      return cb(new Error('Formato no soportado. Usa PNG, JPG o JPEG.'));
    }
    cb(null, true);
  }
});

router.get('/projects', (req, res) => {
  res.json({ projects: projects.list(), modes: projects.MODES, modeLabels: projects.MODE_LABELS });
});

router.get('/projects/:id', (req, res) => {
  try {
    res.json({ project: projects.get(req.params.id) });
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

router.post('/projects', (req, res) => {
  try {
    const project = projects.create(req.body || {});
    res.status(201).json({ project });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/projects/:id', (req, res) => {
  try {
    const project = projects.update(req.params.id, req.body || {});
    res.json({ project });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/projects/:id', (req, res) => {
  try {
    projects.remove(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/projects/:id/design-image', (req, res) => {
  try {
    projects.get(req.params.id);
  } catch (error) {
    return res.status(404).json({ error: error.message });
  }

  upload.single('image')(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen.' });
    try {
      const project = projects.setDesignImage(req.params.id, req.file.path);
      res.json({ project });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
});

router.get('/projects/:id/scenarios', (req, res) => {
  try {
    res.json(projects.listScenarios(req.params.id));
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

router.post('/projects/:id/scenarios', (req, res) => {
  try {
    const scenarios = projects.addScenario(req.params.id, req.body || {});
    res.status(201).json({ scenarios });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/projects/:id/scenarios/:label', (req, res) => {
  try {
    const scenarios = projects.updateScenario(req.params.id, req.params.label, req.body || {});
    res.json({ scenarios });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/projects/:id/scenarios/:label', (req, res) => {
  try {
    const scenarios = projects.deleteScenario(req.params.id, req.params.label);
    res.json({ scenarios });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/projects/:id/viewports', (req, res) => {
  try {
    const viewports = projects.setViewports(req.params.id, req.body.viewports || []);
    res.json({ viewports });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/projects/:id/generate', (req, res) => {
  try {
    const project = projects.get(req.params.id);
    const run = projectRunner.runPipeline(project, [projects.generateStepFor(project)]);
    res.status(202).json({ runId: run.id });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

const RUN_ACTIONS = ['reference', 'test', 'approve'];

router.post('/projects/:id/run', (req, res) => {
  try {
    const project = projects.get(req.params.id);
    const body = req.body || {};
    let steps;
    if (Array.isArray(body.steps) && body.steps.length > 0) {
      steps = body.steps;
    } else if (body.action && RUN_ACTIONS.includes(body.action)) {
      steps = [body.action];
    } else {
      return res.status(400).json({
        error: `Debes indicar "action" (${RUN_ACTIONS.join('|')}) o un array "steps".`
      });
    }

    const run = projectRunner.runPipeline(project, steps);
    res.status(202).json({ runId: run.id });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
