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
  BIN_DIR: path.join(ROOT, 'node_modules', '.bin')
};
