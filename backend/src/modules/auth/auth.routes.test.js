jest.mock('../../lib/prisma');

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../../app');
const prisma = require('../../lib/prisma');
const { jwtSecret } = require('../../config/env');

function inscriptionValide(overrides = {}) {
  return {
    email: 'a@exemple.com',
    motDePasse: 'secret123',
    nom: 'Dupont',
    prenom: 'Jean',
    role: 'spectateur',
    ...overrides,
  };
}

describe('POST /api/auth/register', () => {
  it.each(['email', 'motDePasse', 'nom', 'prenom', 'role'])('refuse si "%s" est manquant (400)', async (champ) => {
    const res = await request(app).post('/api/auth/register').send(inscriptionValide({ [champ]: undefined }));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(new RegExp(champ));
    expect(prisma.utilisateur.create).not.toHaveBeenCalled();
  });

  it('hache le mot de passe avant de l\'enregistrer, et ne le renvoie jamais', async () => {
    prisma.utilisateur.create.mockImplementation(async ({ data }) => ({ id: 1, ...data }));

    const res = await request(app).post('/api/auth/register').send(inscriptionValide());

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.motDePasse).toBeUndefined();

    const donneesEnvoyees = prisma.utilisateur.create.mock.calls[0][0].data;
    expect(donneesEnvoyees.motDePasse).not.toBe('secret123');
    expect(await bcrypt.compare('secret123', donneesEnvoyees.motDePasse)).toBe(true);
  });

  it('traduit un email déjà utilisé en 409, sans exposer de détail interne', async () => {
    prisma.utilisateur.create.mockRejectedValue(Object.assign(new Error('unique constraint'), { code: 'P2002' }));

    const res = await request(app).post('/api/auth/register').send(inscriptionValide());

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/existe déjà/);
  });

  it('renvoie 500 pour une erreur inattendue de la base', async () => {
    prisma.utilisateur.create.mockRejectedValue(new Error('boum'));

    const res = await request(app).post('/api/auth/register').send(inscriptionValide());

    expect(res.status).toBe(500);
  });
});

describe('POST /api/auth/login', () => {
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
