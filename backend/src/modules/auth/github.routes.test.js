jest.mock('../../lib/prisma');
jest.mock('./github.service');

const request = require('supertest');
const app = require('../../app');
const prisma = require('../../lib/prisma');
const githubService = require('./github.service');

const FRONTEND = 'http://localhost:5173/connexion-externe';

describe('GET /api/auth/github', () => {
  it('redirige vers GitHub et garde le state dans un cookie httpOnly', async () => {
    githubService.urlAutorisation.mockImplementation((state) => `https://github.com/login/oauth/authorize?state=${state}`);

    const res = await request(app).get('/api/auth/github');

    expect(res.status).toBe(302);
    const state = new URL(res.headers.location).searchParams.get('state');
    expect(state).toMatch(/^[0-9a-f]{32}$/);
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toContain(`github_state=${state}`);
    expect(cookie).toMatch(/HttpOnly/);
  });

  it('répond 500 si l\'OAuth App n\'est pas configurée', async () => {
    githubService.urlAutorisation.mockImplementation(() => {
      throw Object.assign(new Error("La connexion GitHub n'est pas configurée"), { status: 500 });
    });

    const res = await request(app).get('/api/auth/github');

    expect(res.status).toBe(500);
  });
});

describe('GET /api/auth/github/callback', () => {
  it('renvoie le token au frontend quand le state correspond', async () => {
    githubService.connexion.mockResolvedValue('jwt-abc');

    const res = await request(app)
      .get('/api/auth/github/callback?code=c1&state=s1')
      .set('Cookie', 'github_state=s1');

    expect(githubService.connexion).toHaveBeenCalledWith('c1');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${FRONTEND}#token=jwt-abc`);
  });

  it.each([
    ['sans cookie', '/api/auth/github/callback?code=c1&state=s1', null],
    ['state différent', '/api/auth/github/callback?code=c1&state=pirate', 'github_state=s1'],
  ])('refuse un callback %s (CSRF) sans contacter GitHub', async (_cas, url, cookie) => {
    const req = request(app).get(url);
    const res = await (cookie ? req.set('Cookie', cookie) : req);

    expect(githubService.connexion).not.toHaveBeenCalled();
    expect(res.headers.location).toMatch(new RegExp(`^${FRONTEND}#erreur=`));
  });

  it('renvoie l\'erreur au frontend si l\'utilisateur refuse sur GitHub', async () => {
    const res = await request(app)
      .get('/api/auth/github/callback?error=access_denied&state=s1')
      .set('Cookie', 'github_state=s1');

    expect(githubService.connexion).not.toHaveBeenCalled();
    expect(decodeURIComponent(res.headers.location)).toMatch(/#erreur=Connexion GitHub annulée/);
  });

  it('renvoie un message générique pour une erreur inattendue', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    githubService.connexion.mockRejectedValue(new Error('base indisponible'));

    const res = await request(app)
      .get('/api/auth/github/callback?code=c1&state=s1')
      .set('Cookie', 'github_state=s1');

    expect(decodeURIComponent(res.headers.location)).toBe(`${FRONTEND}#erreur=Erreur lors de la connexion GitHub.`);
  });
});

describe('POST /api/auth/login (compte GitHub)', () => {
  it('refuse la connexion par mot de passe d\'un compte créé par GitHub (401)', async () => {
    prisma.utilisateur.findUnique.mockResolvedValue({ id: 1, email: 'mona@exemple.com', motDePasse: null, role: 'spectateur' });

    const res = await request(app).post('/api/auth/login').send({ email: 'mona@exemple.com', password: 'x' });

    expect(res.status).toBe(401);
  });
});
