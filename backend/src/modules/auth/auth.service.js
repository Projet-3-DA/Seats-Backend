const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const prisma = require('../../lib/prisma');
const { jwtSecret } = require('../../config/env');

const SALT_ROUNDS = 10;

function sansMotDePasse(user) {
  const { motDePasse, ...reste } = user;
  return reste;
}

const CHAMPS_REQUIS = ['email', 'motDePasse', 'nom', 'prenom', 'role'];

async function register(data) {
  const champManquant = CHAMPS_REQUIS.find((champ) => !data[champ] || !String(data[champ]).trim());
  if (champManquant) {
    throw Object.assign(new Error(`Le champ "${champManquant}" est requis`), { status: 400 });
  }

  const motDePasseHash = await bcrypt.hash(data.motDePasse, SALT_ROUNDS);
  const user = await prisma.utilisateur.create({
    data: { ...data, motDePasse: motDePasseHash },
  });

  return sansMotDePasse(user);
}

async function login(email, password) {
  const user = await prisma.utilisateur.findUnique({ where: { email } });
  const erreurIdentifiants = Object.assign(new Error('Email ou mot de passe invalide'), { status: 401 });
  if (!user) {
    throw erreurIdentifiants;
  }

  const motDePasseValide = await bcrypt.compare(password, user.motDePasse);
  if (!motDePasseValide) {
    throw erreurIdentifiants;
  }

  const token = jwt.sign({ userId: user.id, role: user.role }, jwtSecret, { expiresIn: '1h' });

  return { token, user: sansMotDePasse(user) };
}

module.exports = {
  register,
  login,
};
