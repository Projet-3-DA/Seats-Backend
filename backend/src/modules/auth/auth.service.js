const prisma = require('../../lib/prisma');

async function register(data) {
  // TODO: Hacher le mot de passe avant insertion
  return await prisma.utilisateur.create({ data });
}

async function login(email, password) {
  // TODO: Valider les identifiants et générer le token JWT
  const user = await prisma.utilisateur.findUnique({ where: { email } });
  return user;
}

module.exports = {
  register,
  login,
};
