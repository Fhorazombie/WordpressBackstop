// Rutas accesibles sin sesión: el login/registro en sí, y los estáticos que
// la propia página de login necesita para renderizarse.
const PUBLIC_PATHS = new Set(['/login.html', '/css/app.css', '/js/login.js']);
const PUBLIC_PREFIXES = ['/api/auth/'];

function isPublic(reqPath) {
  if (PUBLIC_PATHS.has(reqPath)) return true;
  return PUBLIC_PREFIXES.some(prefix => reqPath.startsWith(prefix));
}

function requireAuth(req, res, next) {
  if (isPublic(req.path)) return next();
  if (req.session && req.session.userId) return next();

  if (req.path.startsWith('/api/') || req.path.startsWith('/backstop_data/') || req.path.startsWith('/report/')) {
    return res.status(401).json({ error: 'No autenticado.' });
  }
  return res.redirect('/login.html');
}

module.exports = requireAuth;
