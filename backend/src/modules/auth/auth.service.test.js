jest.mock('../../lib/prisma');

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../../lib/prisma');
const { jwtSecret } = require('../../config/env');
const { login } = require('./auth.service');

describe('login', () => {
  it('génère un token JWT à la connexion réussie, sans le mot de passe', async () => {
    const hash = await bcrypt.hash('secret', 4);
    prisma.utilisateur.findUnique.mockImplementation(async (args) => {
      expect(args).toEqual({ where: { email: 'a@b.com' } });
      return { id: 1, email: 'a@b.com', motDePasse: hash, role: 'spectateur' };
    });

    const resultat = await login('a@b.com', 'secret');

    expect(resultat.user.motDePasse).toBeUndefined();
    const payload = jwt.verify(resultat.token, jwtSecret); // lève si signature/expiration invalide
    expect(payload.userId).toBe(1);
    expect(payload.role).toBe('spectateur');
    expect(payload.exp - payload.iat).toBe(3600); // expiresIn: '1h'
  });

  it("rejette (401 générique) un courriel qui n'existe pas", async () => {
    prisma.utilisateur.findUnique.mockResolvedValue(null);

    await expect(login('inconnu@b.com', 'x')).rejects.toMatchObject({
      status: 401,
      message: expect.stringMatching(/invalide/),
    });
  });

  it('rejette (même 401 générique) un mot de passe incorrect, sans révéler que le courriel existe', async () => {
    const hash = await bcrypt.hash('secret', 4);
    prisma.utilisateur.findUnique.mockResolvedValue({ id: 1, email: 'a@b.com', motDePasse: hash });

    await expect(login('a@b.com', 'mauvais')).rejects.toMatchObject({
      status: 401,
      message: expect.stringMatching(/invalide/),
    });
  });
});
