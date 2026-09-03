#!/usr/bin/env node

const path = require('path');
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
require('dotenv').config();

const { ROOT } = require('./lib/paths');
const backstopConfig = require('./lib/backstopConfig');
const scheduler = require('./lib/scheduler');
const db = require('./lib/db');
const auth = require('./lib/auth');
const requireAuth = require('./middleware/requireAuth');

const authRoutes = require('./routes/auth');
const scenariosRoutes = require('./routes/scenarios');
const generateRoutes = require('./routes/generate');
const runsRoutes = require('./routes/runs');
const urlListsRoutes = require('./routes/urlLists');
const schedulesRoutes = require('./routes/schedules');
const settingsRoutes = require('./routes/settings');
const projectsRoutes = require('./routes/projects');

const PORT = process.env.UI_PORT ? parseInt(process.env.UI_PORT, 10) : 4780;
const HOST = process.env.UI_HOST || '0.0.0.0';

if (!process.env.DATABASE_URL) {
  console.error('❌ Falta DATABASE_URL en el .env — el panel necesita Postgres para el login.');
  console.error('   Ejemplo: DATABASE_URL=postgres://usuario:password@localhost:5432/backstop_ui');
  process.exit(1);
}
if (!process.env.SESSION_SECRET) {
  console.warn('⚠️  SESSION_SECRET no está definido en el .env — usando uno generado al vuelo (las sesiones no sobreviven un reinicio del servidor). Definilo antes de usar el panel en producción.');
}

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(session({
  store: new PgSession({ pool: db.getPool(), tableName: 'session', createTableIfMissing: true }),
  name: 'backstop.sid',
  secret: process.env.SESSION_SECRET || require('crypto').randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000, sameSite: 'lax' }
}));

app.use('/api', authRoutes);
app.use(requireAuth);

app.use('/api', scenariosRoutes);
app.use('/api', generateRoutes);
app.use('/api', runsRoutes);
app.use('/api', urlListsRoutes);
app.use('/api', schedulesRoutes);
app.use('/api', settingsRoutes);
app.use('/api', projectsRoutes);

// Sirve el último reporte HTML generado por BackstopJS (rutas resueltas
// dinámicamente por si el usuario cambia BACKSTOP_DATA_DIR/PROJECT_ID).
app.use('/report', (req, res, next) => {
  const config = backstopConfig.readDefaultConfig();
  const reportDir = config.paths && config.paths.html_report
    ? path.join(ROOT, config.paths.html_report)
    : path.join(ROOT, 'backstop_data', 'html_report');
  express.static(reportDir)(req, res, next);
});

// Acceso directo a los reportes de cualquier proyecto adicional:
// /backstop_data/<projectId>/html_report/index.html
app.use('/backstop_data', express.static(path.join(ROOT, 'backstop_data')));

app.use(express.static(path.join(__dirname, 'public')));

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).json({ error: err.message || 'Error interno del servidor.' });
});

async function start() {
  try {
    await auth.ensureSchema();
  } catch (error) {
    console.error(`❌ No se pudo conectar a Postgres (DATABASE_URL): ${error.message}`);
    process.exit(1);
  }

  scheduler.init();

  app.listen(PORT, HOST, () => {
    console.log('');
    console.log('🖥️  BackstopJS Dashboard');
    console.log(`   → http://localhost:${PORT}`);
    console.log('');
  });
}

start();
