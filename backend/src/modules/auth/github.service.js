const jwt = require('jsonwebtoken');
const prisma = require('../../lib/prisma');
const env = require('../../config/env');
const httpError = require('../../lib/http-error');

// Rôle donné à un compte créé par sa première connexion GitHub (voir docs/03-conception.md).
const ROLE_PAR_DEFAUT = 'spectateur';

function verifierConfiguration() {
  if (!env.githubClientId || !env.githubClientSecret) {
    throw httpError(500, "La connexion GitHub n'est pas configurée (GITHUB_CLIENT_ID et GITHUB_CLIENT_SECRET).");
  }
}

// Adresse de la page d'autorisation GitHub. `state` est renvoyé tel quel au callback (protection CSRF).
function urlAutorisation(state) {
  verifierConfiguration();
  const params = new URLSearchParams({
    client_id: env.githubClientId,
    redirect_uri: env.githubCallbackUrl,
    scope: 'read:user user:email',
    state,
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

async function echangerCode(code) {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.githubClientId,
      client_secret: env.githubClientSecret,
      code,
      redirect_uri: env.githubCallbackUrl,
    }),
  });
  const json = await res.json();
  // GitHub répond 200 même pour un code invalide ou expiré : l'erreur est dans le corps.
  if (!res.ok || !json.access_token) {
    // Seulement le code d'erreur de GitHub (ex. bad_verification_code, incorrect_client_credentials).
    console.error('[GitHub OAuth] échange du code refusé :', json.error, '-', json.error_description);
    throw httpError(401, 'Connexion GitHub refusée ou expirée, veuillez réessayer.');
  }
  return json.access_token;
}

async function appelGithub(chemin, accessToken) {
  const res = await fetch(`https://api.github.com${chemin}`, {
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${accessToken}`, 'User-Agent': 'seats' },
  });
  if (!res.ok) {
    console.error(`[GitHub OAuth] ${chemin} refusé :`, res.status, await res.text());
    throw httpError(502, 'Impossible de lire le profil GitHub.');
  }
  return res.json();
}

// Courriel principal vérifié : seul un courriel vérifié par GitHub peut relier un compte Seats existant.
// Une GitHub App sans la permission « Email addresses » se voit refuser /user/emails : on continue alors
// sans courriel (le compte reçoit une adresse noreply et n'est jamais relié par courriel).
async function courrielVerifie(accessToken) {
  let courriels;
  try {
    courriels = await appelGithub('/user/emails', accessToken);
  } catch {
    return null;
  }
  const principal = courriels.find((c) => c.primary && c.verified) || courriels.find((c) => c.verified);
  return principal ? principal.email : null;
}

function decouperNom(profil) {
  const [prenom, ...reste] = (profil.name || '').trim().split(/\s+/);
  return { prenom: prenom || profil.login, nom: reste.join(' ') || profil.login };
}

// Retrouve l'utilisateur par son identifiant GitHub, sinon par son courriel vérifié (le compte est alors
// relié à GitHub), sinon le crée avec le rôle par défaut.
async function trouverOuCreerUtilisateur(profil, email) {
  const githubId = String(profil.id);

  const parGithub = await prisma.utilisateur.findUnique({ where: { githubId } });
  if (parGithub) return parGithub;

  const courriel = email || `${profil.id}+${profil.login}@users.noreply.github.com`;
  if (email) {
    const parCourriel = await prisma.utilisateur.findUnique({ where: { email } });
    if (parCourriel) {
      return prisma.utilisateur.update({ where: { id: parCourriel.id }, data: { githubId } });
    }
  }

  return prisma.utilisateur.create({
    data: { email: courriel, githubId, ...decouperNom(profil), role: ROLE_PAR_DEFAUT },
  });
}

// Échange le code reçu au callback contre le même JWT que la connexion par mot de passe.
async function connexion(code) {
  verifierConfiguration();
  if (!code) {
    throw httpError(400, 'Code GitHub manquant.');
  }

  const accessToken = await echangerCode(code);
  const profil = await appelGithub('/user', accessToken);
  const email = await courrielVerifie(accessToken);
  const user = await trouverOuCreerUtilisateur(profil, email);

  return jwt.sign({ userId: user.id, role: user.role }, env.jwtSecret, { expiresIn: '1h' });
}

module.exports = { ROLE_PAR_DEFAUT, urlAutorisation, connexion };
