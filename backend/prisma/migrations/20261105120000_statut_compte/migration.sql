-- Suspension d'un compte par un administrateur (#20).
-- Le compte n'est pas supprimé : il passe au statut « suspendu », avec une raison optionnelle et la date
-- de suspension. Les comptes existants restent actifs.

-- CreateEnum
CREATE TYPE "StatutCompte" AS ENUM ('actif', 'suspendu');

-- AlterTable
ALTER TABLE "Utilisateur" ADD COLUMN     "raisonSuspension" TEXT,
ADD COLUMN     "statut" "StatutCompte" NOT NULL DEFAULT 'actif',
ADD COLUMN     "suspenduLe" TIMESTAMP(3);
