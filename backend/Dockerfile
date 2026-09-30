# Image de l'API Seats. Contexte de construction : backend/ (ce dossier).
FROM node:24-alpine
WORKDIR /app

# Manifestes d'abord : tant qu'ils ne changent pas, npm ci reste en cache.
# --ignore-scripts : le postinstall ("prisma generate") échouerait ici, prisma/schema.prisma n'étant
# copié que juste en dessous. La vraie génération se fait explicitement une fois le schéma copié.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY prisma ./prisma
COPY prisma.config.ts ./
# DIRECT_URL n'est lu ici que pour charger prisma.config.ts : aucune connexion
# n'est faite, `generate` ne fait que lire prisma/schema.prisma.
RUN DIRECT_URL=postgresql://build:build@localhost:5432/build npx prisma generate

COPY src ./src
COPY docker-entrypoint.sh ./

ENV PORT=3000
EXPOSE 3000
# Applique les migrations et crée les comptes de démonstration avant de démarrer l'API.
CMD ["sh", "docker-entrypoint.sh"]
