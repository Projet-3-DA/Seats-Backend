const { randomBytes } = require('crypto');
const authService = require('./auth.service');
const githubService = require('./github.service');
const { frontendUrl } = require('../../config/env');

// Le `state` envoyé à GitHub est aussi gardé dans un cookie httpOnly : au callback, les deux doivent
// correspondre, sinon la requête ne vient pas de ce navigateur (CSRF).
const COOKIE_STATE = 'github_state';
const OPTIONS_COOKIE = { httpOnly: true, sameSite: 'lax', path: '/api/auth/github', maxAge: 10 * 60 * 1000 };

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    res.json({ success: true, data: result });
  } catch (error) {
    if (error.status === 401) {
      return res.status(401).json({ success: false, error: error.message });
    }
    next(error);
  }
}

async function me(req, res, next) {
  try {
    const user = await authService.getUserById(req.user.id);
    if (!user) return res.status(404).json({ success: false, error: 'Utilisateur introuvable.' });
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}

function github(req, res, next) {
  try {
    const state = randomBytes(16).toString('hex');
    const url = githubService.urlAutorisation(state);
    res.cookie(COOKIE_STATE, state, OPTIONS_COOKIE);
    res.redirect(url);
  } catch (error) {
    next(error);
  }
}

function lireCookie(req, nom) {
  const paire = (req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).find(([cle]) => cle === nom);
  return paire ? decodeURIComponent(paire.slice(1).join('=')) : null;
}

// Le navigateur arrive ici depuis GitHub : on le renvoie toujours vers le frontend, avec le token ou
// l'erreur dans le fragment (#), qui n'est jamais envoyé à un serveur ni gardé dans les logs.
async function githubCallback(req, res) {
  const stateAttendu = lireCookie(req, COOKIE_STATE);
  res.clearCookie(COOKIE_STATE, { path: OPTIONS_COOKIE.path });

  try {
    if (!stateAttendu || req.query.state !== stateAttendu) {
      throw Object.assign(new Error('Session de connexion GitHub invalide, veuillez réessayer.'), { status: 400 });
    }
    if (req.query.error) {
      throw Object.assign(new Error('Connexion GitHub annulée.'), { status: 401 });
    }
    const token = await githubService.connexion(req.query.code);
    res.redirect(`${frontendUrl}/connexion-externe#token=${encodeURIComponent(token)}`);
  } catch (error) {
    if (!error.status) console.error('[GitHub OAuth]:', error);
    const message = error.status ? error.message : 'Erreur lors de la connexion GitHub.';
    res.redirect(`${frontendUrl}/connexion-externe#erreur=${encodeURIComponent(message)}`);
  }
}

module.exports = { login, me, github, githubCallback };