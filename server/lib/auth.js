const bcrypt = require('bcryptjs');
const db = require('./db');

const SALT_ROUNDS = 10;

/** Crea la tabla de usuarios si no existe. Se llama al arrancar el servidor. */
async function ensureSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function countUsers() {
  const { rows } = await db.query('SELECT COUNT(*)::int AS count FROM users');
  return rows[0].count;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function findByEmail(email) {
  const { rows } = await db.query('SELECT id, email, password_hash FROM users WHERE email = $1', [normalizeEmail(email)]);
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await db.query('SELECT id, email FROM users WHERE id = $1', [id]);
  return rows[0] || null;
}

async function createUser(email, password) {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes('@')) {
    throw new Error('Ingresá un email válido.');
  }
  if (!password || password.length < 8) {
    throw new Error('La contraseña necesita al menos 8 caracteres.');
  }
  const existing = await findByEmail(normalized);
  if (existing) {
    throw new Error('Ya existe un usuario con ese email.');
  }
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const { rows } = await db.query(
    'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
    [normalized, passwordHash]
  );
  return rows[0];
}

async function verifyPassword(email, password) {
  const user = await findByEmail(email);
  if (!user) return null;
  const ok = await bcrypt.compare(password || '', user.password_hash);
  if (!ok) return null;
  return { id: user.id, email: user.email };
}

module.exports = { ensureSchema, countUsers, findByEmail, findById, createUser, verifyPassword };
