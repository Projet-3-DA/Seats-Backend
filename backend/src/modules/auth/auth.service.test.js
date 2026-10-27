jest.mock('../../lib/prisma');

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../../lib/prisma');
const { jwtSecret } = require('../../config/env');
const { register, login } = require('./auth.service');

describe('register', () => {
  it('hache le mot de passe avant de le stocker, et ne le renvoie jamais', async () => {
    const data = { email: 'a@b.com', motDePasse: 'secret', nom: 'D', prenom: 'J', role: 'spectateur' };
    prisma.utilisateur.create.mockImplementation(async (args) => ({ id: 1, ...args.data }));

    const cree = await register(data);

    expect(cree.motDePasse).toBeUndefined();
    const donneesEnvoyees = prisma.utilisateur.create.mock.calls[0][0].data;
    expect(donneesEnvoyees.motDePasse).not.toBe('secret');
    expect(await bcrypt.compare('secret', donneesEnvoyees.motDePasse)).toBe(true);
  });

  it('rejette un champ requis manquant', async () => {
    await expect(register({ email: 'a@b.com', nom: 'D', prenom: 'J', role: 'spectateur' })).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/motDePasse/),
    });
  });

  it('rejette un courriel déjà utilisé, avec un message clair', async () => {
    prisma.utilisateur.create.mockRejectedValue(Object.assign(new Error('unique constraint'), { code: 'P2002' }));

    await expect(
      register({ email: 'a@b.com', motDePasse: 'secret', nom: 'D', prenom: 'J', role: 'spectateur' }),
    ).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/existe déjà/) });
  });
});

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
