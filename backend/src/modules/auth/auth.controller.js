const authService = require('./auth.service');

async function register(req, res, next) {
  try {
    const user = await authService.register(req.body);
    res.status(201).json({ success: true, data: user });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ success: false, error: 'Ce courriel est déjà utilisé.' });
    }
    next(error);
  }
}

async function login(req, res, next) {
  try {
    const { email, motDePasse } = req.body;
    const result = await authService.login(email, motDePasse);
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
    const user = await authService.getUserById(req.user.sub);
    if (!user) return res.status(404).json({ success: false, error: 'Utilisateur introuvable.' });
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}

module.exports = { register, login, me };