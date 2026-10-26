-- Connexion avec GitHub (OAuth 2, #101).
-- Un compte créé par GitHub n'a pas de mot de passe ; githubId relie le compte à l'utilisateur GitHub.

-- AlterTable
ALTER TABLE "Utilisateur" ALTER COLUMN "motDePasse" DROP NOT NULL,
ADD COLUMN     "githubId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Utilisateur_githubId_key" ON "Utilisateur"("githubId");
