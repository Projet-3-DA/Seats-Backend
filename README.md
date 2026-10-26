# Seats-Backend

API REST du projet **Seats**, une application de réservation de places pour des projections et des événements.
Elle gère les comptes (spectateur, organisateur, administrateur), les salles et leurs sièges, les événements et les réservations.

> Présentation du projet, équipe et documentation (vision, backlog, conception, sprints) :
> voir le [README du frontend](https://github.com/Projet-3-DA/Seats-Frontend#readme).

## Stack

- Node.js 24, Express 5
- PostgreSQL (hébergé sur Supabase) via Prisma 7
- Authentification JWT (`jsonwebtoken`, `bcryptjs`) et connexion GitHub (OAuth 2), Google et Microsoft (OpenID Connect, `jose`)
- Supabase Storage pour les affiches d'événements
- Jest + Supertest pour les tests

## Structure

```
Seats-Backend/
├── .github/workflows/ci.yml   # CI : tests unitaires, tests d'intégration, image Docker
├── docker-compose.yml         # Postgres local pour les tests d'intégration
└── backend/
    ├── prisma/                # schéma et migrations
    ├── src/
    │   ├── app.js / server.js # application Express et point d'entrée
    │   ├── config/            # variables d'environnement
    │   ├── lib/               # client Prisma, stockage, erreurs HTTP
    │   ├── middlewares/       # auth (JWT), rôles, gestion d'erreurs
    │   └── modules/           # auth, salles, evenements, reservations
    └── Dockerfile
```

## Installation

```bash
cd backend
npm install          # lance aussi `prisma generate`
cp .env.example .env # puis remplir les valeurs
npx prisma migrate deploy
npm start            # http://localhost:3000
```

### Variables d'environnement (`backend/.env`)

| Variable | Rôle |
| --- | --- |
| `DATABASE_URL` | URL de connexion Postgres utilisée par l'application |
| `DIRECT_URL` | URL directe utilisée par Prisma pour les migrations |
| `JWT_SECRET` | Clé de signature des tokens (à définir absolument hors développement) |
| `PORT` | Port d'écoute (défaut : `3000`) |
| `SUPABASE_URL` | URL du projet Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé `service_role` — secrète, jamais côté frontend |
| `SUPABASE_BUCKET` | Bucket public des affiches (défaut : `affiches`) |
| `GITHUB_CLIENT_ID` | Client ID de l'OAuth App GitHub |
| `GITHUB_CLIENT_SECRET` | Secret de l'OAuth App GitHub — jamais côté frontend |
| `GITHUB_CALLBACK_URL` | Callback déclaré dans l'OAuth App (défaut : `http://localhost:3000/api/auth/github/callback`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Client OAuth Google (OpenID Connect) — facultatif |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | Application Microsoft Entra ID (OpenID Connect) — facultatif |
| `BACKEND_URL` | Adresse publique de l'API pour les callbacks OIDC (défaut : `http://localhost:3000`) |
| `FRONTEND_URL` | Adresse du frontend, où revenir après la connexion GitHub (défaut : `http://localhost:5173`) |

## Tests

Depuis le dossier `backend/` :

```bash
npm test               # tests unitaires (Prisma est simulé, aucune base requise)
npm run test:watch     # mode watch
```

Tests d'intégration (`*.integration.test.js`), contre un vrai Postgres :

```bash
# depuis la racine du dépôt
docker compose up -d

# depuis backend/
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/seats_test
export DIRECT_URL=$DATABASE_URL
npx prisma migrate deploy
npm run test:integration
```

## API

Toutes les routes sont préfixées par `/api`. `GET /` renvoie un simple statut de santé.

| Méthode | Route | Description |
| --- | --- | --- |
| POST | `/api/auth/register` | Créer un compte (courriel, mot de passe, rôle `spectateur` ou `organisateur`) |
| POST | `/api/auth/login` | Se connecter (renvoie un JWT valable 1 h) |
| GET | `/api/auth/me` | Utilisateur courant (JWT requis) |
| GET | `/api/auth/github` | Redirige vers GitHub pour se connecter (OAuth 2) |
| GET | `/api/auth/github/callback` | Retour de GitHub : crée le compte au besoin (rôle `spectateur`) puis redirige vers `FRONTEND_URL/connexion-externe#token=<JWT>` (ou `#erreur=<message>`) |
| GET | `/api/auth/fournisseurs` | Fournisseurs de connexion externe configurés (ex. `["github", "google"]`) |
| GET | `/api/auth/:fournisseur` | Connexion OpenID Connect (`google`, `microsoft`) : redirige vers le fournisseur (PKCE, nonce, state) |
| GET | `/api/auth/:fournisseur/callback` | Retour du fournisseur : vérifie l'ID token, crée ou retrouve le compte, puis redirige comme pour GitHub |
| GET | `/api/salles` | Lister les salles de l'organisateur connecté (JWT requis) |
| POST | `/api/salles` | Créer une salle (JWT requis, rôle `organisateur`) |
| GET | `/api/salles/:id` | Détail d'une salle, avec ses sièges et ses sections tarifaires |
| PUT | `/api/salles/:id/sections` | Remplacer les sections tarifaires de la salle (nom, prix, couleur, sièges) ; un siège appartient à une seule section, hors section il est vendu au tarif de l'événement. Impossible si un événement utilise la salle (JWT requis, rôle `organisateur`) |
| GET | `/api/evenements` | Lister les événements |
| POST | `/api/evenements` | Créer un événement (JWT requis, rôle `organisateur`) |
| GET | `/api/evenements/:id/plan` | Plan de la salle avec la disponibilité des sièges |
| GET | `/api/evenements/:id/ventes` | Tableau de bord des ventes : vendus, en sélection, libres, recette et état de chaque siège (JWT requis, rôle `organisateur`, uniquement ses propres événements) |
| POST | `/api/evenements/affiche` | Envoyer une affiche (image brute, 5 Mo max ; JWT requis, rôle `organisateur`) |
| GET | `/api/reservations` | Lister les réservations du spectateur connecté (JWT requis) |
| POST | `/api/reservations` | Réserver des sièges (JWT requis, rôle `spectateur`) |
| POST | `/api/reservations/:id/annulation` | Annuler une réservation d'un de ses événements, avec un `motif` facultatif ; le siège redevient libre (JWT requis, rôle `organisateur`) |

Les routes protégées attendent l'en-tête `Authorization: Bearer <token>`. L'organisateur ou le spectateur concerné est toujours déduit du token, jamais du corps de la requête.

## Intégration continue et Docker

La CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) lance les tests unitaires et d'intégration à chaque push.
Quand le tag `latest` est poussé, elle construit l'image Docker et la publie sur `ghcr.io/<owner>/seats-backend`.

Construire l'image en local :

```bash
docker build -t seats-backend backend
docker run --env-file backend/.env -p 3000:3000 seats-backend
```
