const express = require('express');
const fs = require('fs');
const path = require('path');
const { URL_LISTS_DIR } = require('../lib/paths');

const router = express.Router();

fs.mkdirSync(URL_LISTS_DIR, { recursive: true });

const SAFE_NAME = /^[a-zA-Z0-9_.-]+\.(txt|json)$/;

function safePath(name) {
  if (!SAFE_NAME.test(name)) {
    throw new Error('Nombre de archivo inválido. Usa letras, números, "-", "_" y extensión .txt o .json.');
  }
  return path.join(URL_LISTS_DIR, name);
}

router.get('/url-lists', (req, res) => {
  const files = fs
    .readdirSync(URL_LISTS_DIR)
    .filter(f => SAFE_NAME.test(f))
    .map(name => {
      const stat = fs.statSync(path.join(URL_LISTS_DIR, name));
      return { name, size: stat.size, modifiedAt: stat.mtime.toISOString() };
    });
  res.json({ files });
});

router.get('/url-lists/:name', (req, res) => {
  try {
    const filePath = safePath(req.params.name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado.' });
    res.json({ name: req.params.name, content: fs.readFileSync(filePath, 'utf8') });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/url-lists/:name', (req, res) => {
  try {
    const filePath = safePath(req.params.name);
    const content = typeof req.body.content === 'string' ? req.body.content : '';
    fs.writeFileSync(filePath, content, 'utf8');
    res.json({ name: req.params.name, content });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/url-lists/:name', (req, res) => {
  try {
    const filePath = safePath(req.params.name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado.' });
    fs.unlinkSync(filePath);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
