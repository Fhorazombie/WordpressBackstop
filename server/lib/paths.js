const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

module.exports = {
  ROOT,
  BACKSTOP_JSON: path.join(ROOT, 'backstop.json'),
  ENV_FILE: path.join(ROOT, '.env'),
  URL_LISTS_DIR: path.join(ROOT, 'url-lists'),
  SCRIPTS_DIR: path.join(ROOT, 'scripts'),
  DATA_DIR: path.join(ROOT, 'data'),
  RUNS_DIR: path.join(ROOT, 'data', 'runs'),
  SCHEDULES_FILE: path.join(ROOT, 'data', 'schedules.json'),
  RUNS_INDEX_FILE: path.join(ROOT, 'data', 'runs.json'),
  PROJECTS_FILE: path.join(ROOT, 'data', 'projects.json'),
  UPLOADS_DIR: path.join(ROOT, 'data', 'uploads'),
  BACKSTOP_DATA_ROOT: path.join(ROOT, 'backstop_data'),
  BIN_DIR: path.join(ROOT, 'node_modules', '.bin')
};
