jest.mock('../../lib/prisma');
jest.mock('../../config/env', () => ({
  jwtSecret: 'secret-test',
  googleClientId: 'google-id',
  googleClientSecret: 'google-secret',
  microsoftClientId: 'ms-id',
  microsoftClientSecret: 'ms-secret',
  backendUrl: 'http://localhost:3000',
}));
// Les vrais ID tokens de test sont signés avec une clé locale : on remplace seulement le téléchargement
// des clés publiques du fournisseur (JWKS), la vérification elle-même reste celle de jose.
let mockJwks;
jest.mock('jose', () => ({ ...jest.requireActual('jose'), createRemoteJWKSet: () => mockJwks }));

const { createHash } = require('crypto');
const jwt = require('jsonwebtoken');
const { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } = require('jose');
const prisma = require('../../lib/prisma');
const env = require('../../config/env');
const { fournisseursDisponibles, nouvelleTentative, urlAutorisation, connexion } = require('./oidc.service');

const ISSUERS = {
  google: { issuer: 'https://accounts.google.com', clientId: 'google-id' },
  microsoft: { issuer: 'https://login.microsoftonline.com/{tenantid}/v2.0', clientId: 'ms-id' },
};
const TENANT = '9188040d-6c67-4c5b-b112-36a304b66dad';
const TENTATIVE = { state: 's1', nonce: 'n1', codeVerifier: 'v1' };

let clePrivee;
beforeAll(async () => {
  const paire = await generateKeyPair('RS256');
  clePrivee = paire.privateKey;
  mockJwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(paire.publicKey)), alg: 'RS256' }] });
});

const fetchOriginal = global.fetch;
afterAll(() => {
  global.fetch = fetchOriginal;
});
afterEach(() => {
  Object.assign(env, { googleClientId: 'google-id', googleClientSecret: 'google-secret' });
});

async function idToken(nom, claims = {}, { audience = ISSUERS[nom].clientId } = {}) {
  const issuer = ISSUERS[nom].issuer.replace('{tenantid}', TENANT);
  return new SignJWT({ nonce: 'n1', tid: nom === 'microsoft' ? TENANT : undefined, ...claims })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(claims.iss || issuer)
    .setAudience(audience)
    .setSubject(claims.sub || 'sujet-1')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(clePrivee);
}

// Simule la découverte OIDC et l'échange du code ; `reponseToken` est la réponse du token endpoint.
function simulerFournisseur(nom, reponseToken) {
  const { issuer } = ISSUERS[nom];
  global.fetch = jest.fn(async (url) => {
    if (url.endsWith('/.well-known/openid-configuration')) {
      return Response.json({
        issuer,
        authorization_endpoint: `https://auth.${nom}.test/authorize`,
        token_endpoint: `https://auth.${nom}.test/token`,
        jwks_uri: `https://auth.${nom}.test/keys`,
      });
    }
    if (url === `https://auth.${nom}.test/token`) return Response.json(reponseToken);
    throw new Error(`URL inattendue : ${url}`);
  });
}

describe('fournisseursDisponibles', () => {
  it('ne liste que les fournisseurs configurés', () => {
    expect(fournisseursDisponibles()).toEqual(['google', 'microsoft']);
    Object.assign(env, { googleClientSecret: '' });
    expect(fournisseursDisponibles()).toEqual(['microsoft']);
  });
});

describe('nouvelleTentative', () => {
  it('génère des valeurs aléatoires différentes à chaque tentative', () => {
    const a = nouvelleTentative();
    const b = nouvelleTentative();
    expect(a.state).not.toBe(b.state);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.codeVerifier.length).toBeGreaterThanOrEqual(43);
  });
});

describe('urlAutorisation', () => {
  it('envoie client_id, callback, scopes OIDC, state, nonce et défi PKCE (jamais le secret)', async () => {
    simulerFournisseur('google', {});

    const url = new URL(await urlAutorisation('google', TENTATIVE));

    expect(url.origin + url.pathname).toBe('https://auth.google.test/authorize');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'google-id',
      redirect_uri: 'http://localhost:3000/api/auth/google/callback',
      response_type: 'code',
      scope: 'openid email profile',
      state: 's1',
      nonce: 'n1',
      code_challenge: createHash('sha256').update('v1').digest('base64url'),
      code_challenge_method: 'S256',
    });
    expect(url.toString()).not.toContain('google-secret');
  });

  it('refuse un fournisseur inconnu (404)', async () => {
    await expect(urlAutorisation('apple', TENTATIVE)).rejects.toMatchObject({ status: 404 });
  });

  it('refuse un fournisseur non configuré (500)', async () => {
    Object.assign(env, { googleClientId: '' });
    await expect(urlAutorisation('google', TENTATIVE)).rejects.toMatchObject({ status: 500 });
  });
});

describe('connexion', () => {
  it('crée un utilisateur Google inconnu avec le rôle par défaut et son identité externe', async () => {
    simulerFournisseur('google', {
      id_token: await idToken('google', { email: 'mona@gmail.com', email_verified: true, given_name: 'Mona', family_name: 'Lisa' }),
    });
    prisma.identiteExterne.findUnique.mockResolvedValue(null);
    prisma.utilisateur.findUnique.mockResolvedValue(null);
    prisma.utilisateur.create.mockImplementation(async ({ data }) => ({ id: 7, role: data.role }));

    const token = await connexion('google', 'code-1', TENTATIVE);

    expect(prisma.utilisateur.create).toHaveBeenCalledWith({
      data: {
        email: 'mona@gmail.com',
        prenom: 'Mona',
        nom: 'Lisa',
        role: 'spectateur',
        identitesExternes: { create: { fournisseur: 'google', sujet: 'sujet-1' } },
      },
    });
    expect(jwt.verify(token, 'secret-test')).toMatchObject({ userId: 7, role: 'spectateur' });
  });

  it('envoie le code_verifier PKCE et le secret au token endpoint', async () => {
    simulerFournisseur('google', { id_token: await idToken('google') });
    prisma.identiteExterne.findUnique.mockResolvedValue({ utilisateur: { id: 1, role: 'spectateur' } });

    await connexion('google', 'code-1', TENTATIVE);

    const [, options] = global.fetch.mock.calls.find(([url]) => url.endsWith('/token'));
    expect(Object.fromEntries(options.body)).toMatchObject({
      grant_type: 'authorization_code',
      code: 'code-1',
      code_verifier: 'v1',
      client_secret: 'google-secret',
    });
  });

  it('retrouve un utilisateur déjà relié et garde son rôle', async () => {
    simulerFournisseur('google', { id_token: await idToken('google') });
    prisma.identiteExterne.findUnique.mockResolvedValue({ utilisateur: { id: 3, role: 'organisateur' } });

    const token = await connexion('google', 'code-1', TENTATIVE);

    expect(prisma.identiteExterne.findUnique).toHaveBeenCalledWith({
      where: { fournisseur_sujet: { fournisseur: 'google', sujet: 'sujet-1' } },
      include: { utilisateur: true },
    });
    expect(prisma.utilisateur.create).not.toHaveBeenCalled();
    expect(jwt.verify(token, 'secret-test')).toMatchObject({ userId: 3, role: 'organisateur' });
  });

  it('relie un compte existant par courriel vérifié (Google)', async () => {
    simulerFournisseur('google', { id_token: await idToken('google', { email: 'a@seats.demo', email_verified: true }) });
    prisma.identiteExterne.findUnique.mockResolvedValue(null);
    prisma.utilisateur.findUnique.mockResolvedValue({ id: 5, role: 'organisateur' });

    await connexion('google', 'code-1', TENTATIVE);

    expect(prisma.identiteExterne.create).toHaveBeenCalledWith({
      data: { fournisseur: 'google', sujet: 'sujet-1', utilisateurId: 5 },
    });
    expect(prisma.utilisateur.create).not.toHaveBeenCalled();
  });

  it('ne relie pas par courriel non vérifié', async () => {
    simulerFournisseur('google', { id_token: await idToken('google', { email: 'admin@seats.demo', email_verified: false }) });
    prisma.identiteExterne.findUnique.mockResolvedValue(null);
    prisma.utilisateur.create.mockImplementation(async ({ data }) => ({ id: 8, role: data.role }));

    await connexion('google', 'code-1', TENTATIVE);

    expect(prisma.utilisateur.findUnique).not.toHaveBeenCalled();
    expect(prisma.utilisateur.create.mock.calls[0][0].data.email).toBe('sujet-1@google.invalid');
  });

  it('ne relie jamais par courriel chez Microsoft, même vérifié, et accepte l\'émetteur du tenant', async () => {
    simulerFournisseur('microsoft', {
      id_token: await idToken('microsoft', { email: 'a@seats.demo', email_verified: true, name: 'Ada Lovelace' }),
    });
    prisma.identiteExterne.findUnique.mockResolvedValue(null);
    prisma.utilisateur.findUnique.mockResolvedValue({ id: 5, role: 'administrateur' });
    prisma.utilisateur.create.mockImplementation(async ({ data }) => ({ id: 9, role: data.role }));

    const token = await connexion('microsoft', 'code-1', TENTATIVE);

    expect(prisma.identiteExterne.create).not.toHaveBeenCalled();
    expect(prisma.utilisateur.create.mock.calls[0][0].data).toMatchObject({
      email: 'sujet-1@microsoft.invalid',
      prenom: 'Ada',
      nom: 'Lovelace',
    });
    expect(jwt.verify(token, 'secret-test')).toMatchObject({ userId: 9, role: 'spectateur' });
  });

  it.each([
    ['un nonce différent (rejeu)', { nonce: 'autre' }, {}],
    ['un autre émetteur', { iss: 'https://pirate.test' }, {}],
    ['une autre audience', {}, { audience: 'autre-app' }],
  ])('rejette un ID token avec %s (401)', async (_cas, claims, options) => {
    simulerFournisseur('google', { id_token: await idToken('google', claims, options) });

    await expect(connexion('google', 'code-1', TENTATIVE)).rejects.toMatchObject({ status: 401 });
    expect(prisma.utilisateur.create).not.toHaveBeenCalled();
  });

  it('rejette un ID token signé par une autre clé (401)', async () => {
    const { privateKey } = await generateKeyPair('RS256');
    const faux = await new SignJWT({ nonce: 'n1' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer('https://accounts.google.com')
      .setAudience('google-id')
      .setSubject('sujet-1')
      .setExpirationTime('5m')
      .sign(privateKey);
    simulerFournisseur('google', { id_token: faux });

    await expect(connexion('google', 'code-1', TENTATIVE)).rejects.toMatchObject({ status: 401 });
  });

  it('rejette un code refusé par le fournisseur (401)', async () => {
    simulerFournisseur('google', { error: 'invalid_grant' });

    await expect(connexion('google', 'code-1', TENTATIVE)).rejects.toMatchObject({ status: 401 });
  });

  it('rejette un code manquant (400)', async () => {
    await expect(connexion('google', undefined, TENTATIVE)).rejects.toMatchObject({ status: 400 });
  });
});
