const express = require('express');
const auth = require('../lib/auth');

const router = express.Router();

router.get('/auth/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'No autenticado.' });
  res.json({ user: { id: req.session.userId, email: req.session.userEmail } });
});

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const user = await auth.verifyPassword(email, password);
    if (!user) return res.status(401).json({ error: 'Email o contraseña incorrectos.' });
    req.session.userId = user.id;
    req.session.userEmail = user.email;
    res.json({ user });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('backstop.sid');
    res.json({ ok: true });
  });
});

// El primer usuario se auto-registra (bootstrap del equipo); a partir de ahí,
// sólo alguien ya logueado puede dar de alta a un nuevo compañero — evita que
// cualquiera con el link se cree una cuenta por su cuenta.
router.post('/auth/register', async (req, res) => {
  try {
    const total = await auth.countUsers();
    if (total > 0 && !req.session.userId) {
      return res.status(403).json({ error: 'El registro está cerrado. Pedile a alguien del equipo que te cree una cuenta desde su sesión.' });
    }
    const { email, password } = req.body || {};
    const user = await auth.createUser(email, password);
    if (total === 0) {
      req.session.userId = user.id;
      req.session.userEmail = user.email;
    }
    res.status(201).json({ user });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
