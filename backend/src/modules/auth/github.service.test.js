jest.mock('../../lib/prisma');
jest.mock('../../config/env', () => ({
  jwtSecret: 'secret-test',
  githubClientId: 'client-id',
  githubClientSecret: 'client-secret',
  githubCallbackUrl: 'http://localhost:3000/api/auth/github/callback',
  frontendUrl: 'http://localhost:5173',
}));

const jwt = require('jsonwebtoken');
const prisma = require('../../lib/prisma');
const env = require('../../config/env');
const { urlAutorisation, connexion, ROLE_PAR_DEFAUT } = require('./github.service');

const fetchOriginal = global.fetch;
afterAll(() => {
  global.fetch = fetchOriginal;
});
afterEach(() => {
  Object.assign(env, { githubClientId: 'client-id', githubClientSecret: 'client-secret' });
});

const PROFIL = { id: 42, login: 'octocat', name: 'Mona Lisa Octocat' };

// Simule les trois appels à GitHub : échange du code, profil, courriels.
function simulerGithub({ token = { access_token: 'gho_test' }, profil = PROFIL, courriels } = {}) {
  global.fetch = jest.fn(async (url) => {
    if (url.startsWith('https://github.com/login/oauth/access_token')) return Response.json(token);
    if (url === 'https://api.github.com/user') return Response.json(profil);
    if (url === 'https://api.github.com/user/emails') {
      return Response.json(courriels ?? [{ email: 'mona@exemple.com', primary: true, verified: true }]);
    }
    throw new Error(`URL inattendue : ${url}`);
  });
}

describe('urlAutorisation', () => {
  it('pointe vers GitHub avec le client_id, le callback et le state, sans le secret', () => {
    const url = new URL(urlAutorisation('abc'));

    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/api/auth/github/callback');
    expect(url.searchParams.get('state')).toBe('abc');
    expect(url.toString()).not.toContain('client-secret');
  });

  it('refuse si l\'OAuth App n\'est pas configurée', () => {
    Object.assign(env, { githubClientSecret: '' });
    expect(() => urlAutorisation('abc')).toThrow(/pas configurée/);
  });
});

describe('connexion', () => {
  it('crée un utilisateur inconnu avec le rôle par défaut et renvoie un JWT', async () => {
    simulerGithub();
    prisma.utilisateur.findUnique.mockResolvedValue(null);
    prisma.utilisateur.create.mockImplementation(async ({ data }) => ({ id: 7, ...data }));

    const token = await connexion('code-123');

    expect(prisma.utilisateur.create).toHaveBeenCalledWith({
      data: { email: 'mona@exemple.com', githubId: '42', prenom: 'Mona', nom: 'Lisa Octocat', role: ROLE_PAR_DEFAUT },
    });
    expect(jwt.verify(token, 'secret-test')).toMatchObject({ userId: 7, role: 'spectateur' });
  });

  it('envoie le secret à GitHub uniquement pour échanger le code', async () => {
    simulerGithub();
    prisma.utilisateur.findUnique.mockResolvedValue({ id: 1, role: 'spectateur' });

    await connexion('code-123');

    const [, options] = global.fetch.mock.calls[0];
    expect(JSON.parse(options.body)).toMatchObject({ client_secret: 'client-secret', code: 'code-123' });
  });

  it('retrouve un utilisateur déjà connu par son githubId et garde son rôle', async () => {
    simulerGithub();
    prisma.utilisateur.findUnique.mockImplementation(async ({ where }) =>
      where.githubId === '42' ? { id: 3, role: 'organisateur' } : null,
    );

    const token = await connexion('code-123');

    expect(prisma.utilisateur.create).not.toHaveBeenCalled();
    expect(jwt.verify(token, 'secret-test')).toMatchObject({ userId: 3, role: 'organisateur' });
  });

  it('relie à GitHub un compte existant ayant le même courriel vérifié', async () => {
    simulerGithub();
    prisma.utilisateur.findUnique.mockImplementation(async ({ where }) =>
      where.email === 'mona@exemple.com' ? { id: 5, role: 'organisateur' } : null,
    );
    prisma.utilisateur.update.mockImplementation(async ({ where, data }) => ({ id: where.id, role: 'organisateur', ...data }));

    const token = await connexion('code-123');

    expect(prisma.utilisateur.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { githubId: '42' } });
    expect(jwt.verify(token, 'secret-test')).toMatchObject({ userId: 5, role: 'organisateur' });
  });

  it('ne relie jamais un compte par un courriel non vérifié', async () => {
    simulerGithub({ courriels: [{ email: 'admin@seats.demo', primary: true, verified: false }] });
    prisma.utilisateur.findUnique.mockResolvedValue(null);
    prisma.utilisateur.create.mockImplementation(async ({ data }) => ({ id: 8, ...data }));

    await connexion('code-123');

    expect(prisma.utilisateur.findUnique).not.toHaveBeenCalledWith({ where: { email: 'admin@seats.demo' } });
    expect(prisma.utilisateur.create.mock.calls[0][0].data.email).toBe('42+octocat@users.noreply.github.com');
  });

  it('utilise le login GitHub quand le profil n\'a pas de nom', async () => {
    simulerGithub({ profil: { id: 42, login: 'octocat', name: null } });
    prisma.utilisateur.findUnique.mockResolvedValue(null);
    prisma.utilisateur.create.mockImplementation(async ({ data }) => ({ id: 9, ...data }));

    await connexion('code-123');

    expect(prisma.utilisateur.create.mock.calls[0][0].data).toMatchObject({ prenom: 'octocat', nom: 'octocat' });
  });

  it('rejette un code refusé ou expiré par GitHub (401)', async () => {
    simulerGithub({ token: { error: 'bad_verification_code' } });

    await expect(connexion('code-expire')).rejects.toMatchObject({ status: 401 });
    expect(prisma.utilisateur.create).not.toHaveBeenCalled();
  });

  it('rejette un code manquant (400)', async () => {
    await expect(connexion(undefined)).rejects.toMatchObject({ status: 400 });
  });
});

describe('connexion avec un rôle choisi à l\'inscription', () => {
  it('crée un nouveau compte avec le rôle choisi', async () => {
    simulerGithub();
    prisma.utilisateur.findUnique.mockResolvedValue(null);
    prisma.utilisateur.create.mockImplementation(async ({ data }) => ({ id: 11, ...data }));

    const token = await connexion('code-123', 'organisateur');

    expect(prisma.utilisateur.create.mock.calls[0][0].data.role).toBe('organisateur');
    expect(jwt.verify(token, 'secret-test')).toMatchObject({ userId: 11, role: 'organisateur' });
  });

  it('ne change pas le rôle d\'un compte existant', async () => {
    simulerGithub();
    prisma.utilisateur.findUnique.mockImplementation(async ({ where }) =>
      where.githubId === '42' ? { id: 3, role: 'spectateur' } : null,
    );

    const token = await connexion('code-123', 'organisateur');

    expect(prisma.utilisateur.create).not.toHaveBeenCalled();
    expect(jwt.verify(token, 'secret-test')).toMatchObject({ userId: 3, role: 'spectateur' });
  });
});

describe('connexion avec une GitHub App sans permission « Email addresses »', () => {
  it('continue sans courriel quand /user/emails est refusé', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = jest.fn(async (url) => {
      if (url.startsWith('https://github.com/login/oauth/access_token')) return Response.json({ access_token: 'ghu_test' });
      if (url === 'https://api.github.com/user') return Response.json(PROFIL);
      return new Response('Resource not accessible by integration', { status: 403 });
    });
    prisma.utilisateur.findUnique.mockResolvedValue(null);
    prisma.utilisateur.create.mockImplementation(async ({ data }) => ({ id: 10, ...data }));

    const token = await connexion('code-123');

    expect(prisma.utilisateur.create.mock.calls[0][0].data.email).toBe('42+octocat@users.noreply.github.com');
    expect(jwt.verify(token, 'secret-test')).toMatchObject({ userId: 10, role: 'spectateur' });
  });
});
