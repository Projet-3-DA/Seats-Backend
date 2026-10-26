jest.mock('../../lib/prisma');

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../../app');
const prisma = require('../../lib/prisma');
const { jwtSecret } = require('../../config/env');

async function utilisateurAvecMotDePasse(motDePasse, overrides = {}) {
  return {
    id: 1,
    email: 'a@exemple.com',
    motDePasse: await bcrypt.hash(motDePasse, 4),
    nom: 'Dupont',
    prenom: 'Jean',
    role: 'spectateur',
    ...overrides,
  };
}

describe('POST /api/auth/login', () => {
  it('connecte avec les bons identifiants : token JWT valide, mot de passe absent de la réponse', async () => {
    prisma.utilisateur.findUnique.mockResolvedValue(await utilisateurAvecMotDePasse('secret123'));

    const res = await request(app).post('/api/auth/login').send({ email: 'a@exemple.com', password: 'secret123' });

    expect(res.status).toBe(200);
    expect(res.body.data.user).toEqual(expect.objectContaining({ id: 1, email: 'a@exemple.com' }));
    expect(res.body.data.user.motDePasse).toBeUndefined();

    const payload = jwt.verify(res.body.data.token, jwtSecret);
    expect(payload).toMatchObject({ userId: 1, role: 'spectateur' });
  });

  it('refuse avec 401 (message générique) un email inconnu', async () => {
    prisma.utilisateur.findUnique.mockResolvedValue(null);

    const res = await request(app).post('/api/auth/login').send({ email: 'inconnu@exemple.com', password: 'x' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalide/);
  });

  it('refuse avec 401 (même message générique) un mauvais mot de passe', async () => {
    prisma.utilisateur.findUnique.mockResolvedValue(await utilisateurAvecMotDePasse('secret123'));

    const res = await request(app).post('/api/auth/login').send({ email: 'a@exemple.com', password: 'mauvais' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalide/);
  });
});
