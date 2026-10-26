jest.mock('../../lib/prisma');
jest.mock('./oidc.service');

const request = require('supertest');
const app = require('../../app');
const oidcService = require('./oidc.service');
const env = require('../../config/env');

const FRONTEND = 'http://localhost:5173/connexion-externe';
const TENTATIVE = { state: 's1', nonce: 'n1', codeVerifier: 'v1' };

function cookieTentative(valeur) {
  return `oidc_tentative=${encodeURIComponent(JSON.stringify(valeur))}`;
}

describe('GET /api/auth/fournisseurs', () => {
  const githubOriginal = { githubClientId: env.githubClientId, githubClientSecret: env.githubClientSecret };
  afterEach(() => Object.assign(env, githubOriginal));

  it('liste GitHub et les fournisseurs OIDC configurés', async () => {
    Object.assign(env, { githubClientId: 'id', githubClientSecret: 'secret' });
    oidcService.fournisseursDisponibles.mockReturnValue(['google']);

    const res = await request(app).get('/api/auth/fournisseurs');

    expect(res.body).toEqual({ success: true, data: ['github', 'google'] });
  });

  it("n'annonce pas GitHub s'il n'est pas configuré", async () => {
    Object.assign(env, { githubClientId: '', githubClientSecret: '' });
    oidcService.fournisseursDisponibles.mockReturnValue([]);

    const res = await request(app).get('/api/auth/fournisseurs');

    expect(res.body.data).toEqual([]);
  });
});

describe('GET /api/auth/:fournisseur', () => {
  it('redirige vers le fournisseur et garde state, nonce et code_verifier dans un cookie httpOnly', async () => {
    oidcService.nouvelleTentative.mockReturnValue(TENTATIVE);
    oidcService.urlAutorisation.mockResolvedValue('https://auth.google.test/authorize?state=s1');

    const res = await request(app).get('/api/auth/google');

    expect(oidcService.urlAutorisation).toHaveBeenCalledWith('google', TENTATIVE);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://auth.google.test/authorize?state=s1');
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toContain(cookieTentative({ ...TENTATIVE, fournisseur: 'google' }));
    expect(cookie).toMatch(/HttpOnly/);
  });

  it('n\'intercepte pas la route GitHub', async () => {
    const res = await request(app).get('/api/auth/github');

    expect(oidcService.urlAutorisation).not.toHaveBeenCalled();
    expect(res.headers.location || '').not.toContain('auth.google.test');
  });

  it('répond 404 pour un fournisseur inconnu', async () => {
    oidcService.nouvelleTentative.mockReturnValue(TENTATIVE);
    oidcService.urlAutorisation.mockRejectedValue(Object.assign(new Error('Fournisseur inconnu.'), { status: 404 }));

    const res = await request(app).get('/api/auth/inconnu');

    expect(res.status).toBe(404);
  });
});

describe('GET /api/auth/:fournisseur/callback', () => {
  it('renvoie le token au frontend quand le state correspond', async () => {
    oidcService.connexion.mockResolvedValue('jwt-abc');

    const res = await request(app)
      .get('/api/auth/google/callback?code=c1&state=s1')
      .set('Cookie', cookieTentative({ ...TENTATIVE, fournisseur: 'google' }));

    expect(oidcService.connexion).toHaveBeenCalledWith('google', 'c1', expect.objectContaining(TENTATIVE));
    expect(res.headers.location).toBe(`${FRONTEND}#token=jwt-abc`);
  });

  it.each([
    ['sans cookie', 'google', 's1', null],
    ['avec un state différent', 'google', 'pirate', { ...TENTATIVE, fournisseur: 'google' }],
    ['commencé chez un autre fournisseur', 'microsoft', 's1', { ...TENTATIVE, fournisseur: 'google' }],
  ])('refuse un callback %s sans contacter le fournisseur', async (_cas, nom, state, tentative) => {
    const req = request(app).get(`/api/auth/${nom}/callback?code=c1&state=${state}`);
    const res = await (tentative ? req.set('Cookie', cookieTentative(tentative)) : req);

    expect(oidcService.connexion).not.toHaveBeenCalled();
    expect(res.headers.location).toMatch(new RegExp(`^${FRONTEND}#erreur=`));
  });

  it('renvoie l\'erreur au frontend si l\'utilisateur refuse chez le fournisseur', async () => {
    const res = await request(app)
      .get('/api/auth/google/callback?error=access_denied&state=s1')
      .set('Cookie', cookieTentative({ ...TENTATIVE, fournisseur: 'google' }));

    expect(oidcService.connexion).not.toHaveBeenCalled();
    expect(decodeURIComponent(res.headers.location)).toMatch(/#erreur=Connexion annulée/);
  });
});
