# Image de l'API Seats. Contexte de construction : backend/ (ce dossier).
FROM node:24-alpine
WORKDIR /app

# Manifestes d'abord : tant qu'ils ne changent pas, npm ci reste en cache.
COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts ./
# DIRECT_URL n'est lu ici que pour charger prisma.config.ts : aucune connexion
# n'est faite, `generate` ne fait que lire prisma/schema.prisma.
RUN DIRECT_URL=postgresql://build:build@localhost:5432/build npx prisma generate

COPY src ./src

ENV PORT=3000
EXPOSE 3000
CMD ["node", "src/server.js"]
