const { Pool } = require('pg');

let pool = null;

/**
 * Pool compartido de Postgres. Se crea recién al primer uso (no al importar
 * el módulo) para que server/index.js pueda validar DATABASE_URL y fallar
 * con un mensaje claro antes de intentar conectar.
 */
function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('Falta DATABASE_URL en el .env — necesaria para el login del panel.');
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

function query(text, params) {
  return getPool().query(text, params);
}

module.exports = { getPool, query };
