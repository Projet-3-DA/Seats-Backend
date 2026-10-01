# Seats-Backend

API REST du projet **Seats**, une application de réservation de places pour des projections et des événements.
Elle gère les comptes (spectateur, organisateur, administrateur), les salles et leurs sièges, les événements et les réservations.

> Présentation du projet, équipe et documentation (vision, backlog, conception, sprints) :
> voir le [README du frontend](https://github.com/Projet-3-DA/Seats-Frontend#readme).

## Stack

- Node.js 24, Express 5
- PostgreSQL (hébergé sur Supabase) via Prisma 7
- Authentification JWT (`jsonwebtoken`, `bcryptjs`)
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
| POST | `/api/auth/register` | Créer un compte |
| POST | `/api/auth/login` | Se connecter (renvoie un JWT valable 1 h) |
| GET | `/api/auth/me` | Utilisateur courant (JWT requis) |
| GET | `/api/salles` | Lister les salles |
| POST | `/api/salles` | Créer une salle (JWT requis, rôle `organisateur`) |
| GET | `/api/salles/:id` | Détail d'une salle |
| GET | `/api/evenements` | Lister les événements |
| POST | `/api/evenements` | Créer un événement (JWT requis, rôle `organisateur`) |
| GET | `/api/evenements/:id/plan` | Plan de la salle avec la disponibilité des sièges |
| POST | `/api/evenements/affiche` | Envoyer une affiche (image brute, 5 Mo max ; JWT requis, rôle `organisateur`) |
| GET | `/api/reservations` | Lister les réservations |
| POST | `/api/reservations` | Réserver des sièges (JWT requis, rôle `spectateur`) |

Les routes protégées attendent l'en-tête `Authorization: Bearer <token>`. L'organisateur ou le spectateur concerné est toujours déduit du token, jamais du corps de la requête.

## Intégration continue et Docker

La CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) lance les tests unitaires et d'intégration à chaque push.
Quand le tag `latest` est poussé, elle construit l'image Docker et la publie sur `ghcr.io/<owner>/seats-backend`.

Construire l'image en local :

```bash
docker build -t seats-backend backend
docker run --env-file backend/.env -p 3000:3000 seats-backend
```
