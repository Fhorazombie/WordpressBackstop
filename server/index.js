#!/usr/bin/env node

const path = require('path');
const express = require('express');
require('dotenv').config();

const { ROOT } = require('./lib/paths');
const backstopConfig = require('./lib/backstopConfig');
const scheduler = require('./lib/scheduler');

const scenariosRoutes = require('./routes/scenarios');
const generateRoutes = require('./routes/generate');
const runsRoutes = require('./routes/runs');
const urlListsRoutes = require('./routes/urlLists');
const schedulesRoutes = require('./routes/schedules');
const settingsRoutes = require('./routes/settings');

const PORT = process.env.UI_PORT ? parseInt(process.env.UI_PORT, 10) : 4780;
const HOST = process.env.UI_HOST || '0.0.0.0';

const app = express();
app.use(express.json({ limit: '2mb' }));

app.use('/api', scenariosRoutes);
app.use('/api', generateRoutes);
app.use('/api', runsRoutes);
app.use('/api', urlListsRoutes);
app.use('/api', schedulesRoutes);
app.use('/api', settingsRoutes);

// Sirve el último reporte HTML generado por BackstopJS (rutas resueltas
// dinámicamente por si el usuario cambia BACKSTOP_DATA_DIR/PROJECT_ID).
app.use('/report', (req, res, next) => {
  const config = backstopConfig.readConfig();
  const reportDir = config.paths && config.paths.html_report
    ? path.join(ROOT, config.paths.html_report)
    : path.join(ROOT, 'backstop_data', 'html_report');
  express.static(reportDir)(req, res, next);
});

app.use(express.static(path.join(__dirname, 'public')));

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).json({ error: err.message || 'Error interno del servidor.' });
});

scheduler.init();

app.listen(PORT, HOST, () => {
  console.log('');
  console.log('🖥️  BackstopJS Dashboard');
  console.log(`   → http://localhost:${PORT}`);
  console.log('');
});
