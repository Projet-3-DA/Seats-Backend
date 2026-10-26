const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../../lib/prisma');
const { jwtSecret } = require('../../config/env');

function sansMotDePasse(user) {
  const { motDePasse, ...reste } = user;
  return reste;
}

async function login(email, password) {
  const user = await prisma.utilisateur.findUnique({ where: { email } });
  const erreurIdentifiants = Object.assign(new Error('Email ou mot de passe invalide'), { status: 401 });
  // Un compte créé par GitHub n'a pas de mot de passe : il ne se connecte que par GitHub (#101).
  if (!user || !user.motDePasse) {
    throw erreurIdentifiants;
  }

  const motDePasseValide = await bcrypt.compare(password, user.motDePasse);
  if (!motDePasseValide) {
    throw erreurIdentifiants;
  }

  const token = jwt.sign({ userId: user.id, role: user.role }, jwtSecret, { expiresIn: '1h' });

  return { token, user: sansMotDePasse(user) };
}

async function getUserById(id) {
  const user = await prisma.utilisateur.findUnique({ where: { id } });
  return user ? sansMotDePasse(user) : null;
}

module.exports = { login, getUserById };