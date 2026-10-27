const { createHash, randomBytes } = require('crypto');
const jwt = require('jsonwebtoken');
const { createRemoteJWKSet, jwtVerify } = require('jose');
const prisma = require('../../lib/prisma');
const env = require('../../config/env');
const httpError = require('../../lib/http-error');

// Connexion OpenID Connect (#114). Ajouter un fournisseur = une entrée ici + son client ID/secret.
// `lierParCourriel` : relier un compte Seats existant par courriel vérifié. Microsoft ne garantit pas
// `email_verified` pour les comptes personnels : on n'y relie que par `sub`.
const FOURNISSEURS = {
  google: {
    issuer: 'https://accounts.google.com',
    clientId: () => env.googleClientId,
    clientSecret: () => env.googleClientSecret,
    lierParCourriel: true,
  },
  microsoft: {
    issuer: 'https://login.microsoftonline.com/common/v2.0',
    clientId: () => env.microsoftClientId,
    clientSecret: () => env.microsoftClientSecret,
    lierParCourriel: false,
  },
};

const ROLE_PAR_DEFAUT = 'spectateur';

function fournisseur(nom) {
  const f = FOURNISSEURS[nom];
  if (!f) throw httpError(404, 'Fournisseur de connexion inconnu.');
  if (!f.clientId() || !f.clientSecret()) {
    throw httpError(500, `La connexion ${nom} n'est pas configurée.`);
  }
  return f;
}

// Fournisseurs dont le client ID/secret est renseigné : le frontend n'active que ceux-là.
function fournisseursDisponibles() {
  return Object.keys(FOURNISSEURS).filter((nom) => FOURNISSEURS[nom].clientId() && FOURNISSEURS[nom].clientSecret());
}

function urlCallback(nom) {
  return `${env.backendUrl}/api/auth/${nom}/callback`;
}

// Découverte OIDC : adresses d'autorisation, de token et des clés publiques, gardées en mémoire.
const decouvertes = new Map();
async function decouvrir(nom) {
  if (!decouvertes.has(nom)) {
    const promesse = fetch(`${FOURNISSEURS[nom].issuer}/.well-known/openid-configuration`).then(async (res) => {
      if (!res.ok) throw httpError(502, `Fournisseur ${nom} injoignable.`);
      const config = await res.json();
      return { ...config, jwks: createRemoteJWKSet(new URL(config.jwks_uri)) };
    });
    // Un échec ne doit pas rester en cache : on réessaiera à la prochaine connexion.
    promesse.catch(() => decouvertes.delete(nom));
    decouvertes.set(nom, promesse);
  }
  return decouvertes.get(nom);
}

const base64url = (buffer) => buffer.toString('base64url');

// Valeurs à usage unique d'une tentative de connexion, gardées côté navigateur dans un cookie httpOnly :
// state (CSRF), nonce (rejeu de l'ID token), code_verifier (PKCE, code intercepté).
function nouvelleTentative() {
  return { state: base64url(randomBytes(16)), nonce: base64url(randomBytes(16)), codeVerifier: base64url(randomBytes(32)) };
}

async function urlAutorisation(nom, { state, nonce, codeVerifier }) {
  const f = fournisseur(nom);
  const config = await decouvrir(nom);
  const params = new URLSearchParams({
    client_id: f.clientId(),
    redirect_uri: urlCallback(nom),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge: base64url(createHash('sha256').update(codeVerifier).digest()),
    code_challenge_method: 'S256',
  });
  return `${config.authorization_endpoint}?${params}`;
}

async function echangerCode(nom, f, config, code, codeVerifier) {
  const res = await fetch(config.token_endpoint, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: urlCallback(nom),
      client_id: f.clientId(),
      client_secret: f.clientSecret(),
      code_verifier: codeVerifier,
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.id_token) {
    // Le code d'erreur du fournisseur (ex. Microsoft AADSTS7000215 = secret invalide) aide à diagnostiquer.
    console.error(`[OIDC] échange du code refusé par ${nom} :`, json.error, '-', (json.error_description || '').split(/\r?\n/)[0]);
    throw httpError(401, `Connexion ${nom} refusée ou expirée, veuillez réessayer.`);
  }
  return json.id_token;
}

// Vérifie signature (clés publiques du fournisseur), audience, expiration, émetteur et nonce.
async function verifierIdToken(f, config, idToken, nonce) {
  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, config.jwks, { audience: f.clientId() }));
  } catch {
    throw httpError(401, 'Jeton d\'identité invalide.');
  }
  // Microsoft « common » annonce l'émetteur avec {tenantid} : le vrai émetteur dépend du compte (tid).
  const emetteurAttendu = config.issuer.replace('{tenantid}', payload.tid);
  if (payload.iss !== emetteurAttendu || payload.nonce !== nonce) {
    throw httpError(401, 'Jeton d\'identité invalide.');
  }
  return payload;
}

function nomComplet(claims) {
  const [prenom, ...reste] = (claims.name || '').trim().split(/\s+/);
  return {
    prenom: claims.given_name || prenom || 'Utilisateur',
    nom: claims.family_name || reste.join(' ') || 'Seats',
  };
}

// Retrouve l'utilisateur par son compte externe, sinon par courriel vérifié (si le fournisseur le
// permet), sinon le crée avec le rôle par défaut.
async function trouverOuCreerUtilisateur(nom, f, claims, role) {
  const cle = { fournisseur: nom, sujet: claims.sub };
  const identite = await prisma.identiteExterne.findUnique({
    where: { fournisseur_sujet: cle },
    include: { utilisateur: true },
  });
  if (identite) return identite.utilisateur;

  const courrielVerifie = claims.email && claims.email_verified === true ? claims.email : null;
  const existant = courrielVerifie ? await prisma.utilisateur.findUnique({ where: { email: courrielVerifie } }) : null;
  if (existant && f.lierParCourriel) {
    await prisma.identiteExterne.create({ data: { ...cle, utilisateurId: existant.id } });
    return existant;
  }

  return prisma.utilisateur.create({
    data: {
      // Le courriel est unique en base : s'il est absent, non vérifié ou déjà pris par un compte qu'on ne
      // relie pas, une adresse non routable propre à ce compte externe.
      email: courrielVerifie && !existant ? courrielVerifie : `${claims.sub}@${nom}.invalid`,
      ...nomComplet(claims),
      role,
      identitesExternes: { create: cle },
    },
  });
}

// `role` : choisi sur la page d'inscription ; ne s'applique qu'à un compte créé maintenant.
async function connexion(nom, code, { nonce, codeVerifier, role = ROLE_PAR_DEFAUT }) {
  const f = fournisseur(nom);
  if (!code) throw httpError(400, 'Code de connexion manquant.');

  const config = await decouvrir(nom);
  const idToken = await echangerCode(nom, f, config, code, codeVerifier);
  const claims = await verifierIdToken(f, config, idToken, nonce);
  const user = await trouverOuCreerUtilisateur(nom, f, claims, role);

  return jwt.sign({ userId: user.id, role: user.role }, env.jwtSecret, { expiresIn: '1h' });
}

module.exports = { FOURNISSEURS, fournisseursDisponibles, nouvelleTentative, urlAutorisation, connexion };
