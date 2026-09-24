const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../../lib/prisma');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '7d';

function toPublicUser(user) {
  const { motDePasse, ...rest } = user;
  return rest;
}

async function register({ email, motDePasse, nom, prenom, role }) {
  const motDePasseHache = await bcrypt.hash(motDePasse, 10);
  const user = await prisma.utilisateur.create({
    data: { email, motDePasse: motDePasseHache, nom, prenom, role },
  });
  return toPublicUser(user);
}

async function login(email, motDePasse) {
  const user = await prisma.utilisateur.findUnique({ where: { email } });
  // Message volontairement identique dans les deux cas (email inconnu / mot de passe faux)
  if (!user) throw Object.assign(new Error('Email ou mot de passe incorrect.'), { status: 401 });

  const motDePasseValide = await bcrypt.compare(motDePasse, user.motDePasse);
  if (!motDePasseValide) throw Object.assign(new Error('Email ou mot de passe incorrect.'), { status: 401 });

  const token = jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

  return { token, user: toPublicUser(user) };
}

async function getUserById(id) {
  const user = await prisma.utilisateur.findUnique({ where: { id } });
  return user ? toPublicUser(user) : null;
}

module.exports = { register, login, getUserById };