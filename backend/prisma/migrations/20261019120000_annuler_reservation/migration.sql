-- Annulation d'une réservation par l'organisateur (#14).
-- La réservation annulée reste en base (historique du spectateur) mais ne doit plus bloquer le siège :
-- la contrainte unique passe de (siegeId, evenementId) à (siegeId, evenementId, actif), avec
-- actif = true pour une réservation en cours et NULL une fois annulée.

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "actif" BOOLEAN DEFAULT true,
ADD COLUMN     "dateAnnulation" TIMESTAMP(3),
ADD COLUMN     "motifAnnulation" TEXT;

-- Une réservation déjà annulée ne doit pas occuper le siège.
UPDATE "Reservation" SET "actif" = NULL WHERE "statut" = 'annulee';

-- DropIndex
DROP INDEX "Reservation_siegeId_evenementId_key";

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_siegeId_evenementId_actif_key" ON "Reservation"("siegeId", "evenementId", "actif");
