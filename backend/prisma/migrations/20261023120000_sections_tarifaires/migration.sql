-- Sections tarifaires d'une salle (#11) : chaque siège appartient à au plus une section.

-- AlterTable
ALTER TABLE "Siege" ADD COLUMN     "sectionId" INTEGER;

-- CreateTable
CREATE TABLE "Section" (
    "id" SERIAL NOT NULL,
    "salleId" INTEGER NOT NULL,
    "nom" TEXT NOT NULL,
    "prix" DECIMAL(8,2) NOT NULL,
    "couleur" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Section_salleId_nom_key" ON "Section"("salleId", "nom");

-- AddForeignKey
ALTER TABLE "Siege" ADD CONSTRAINT "Siege_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_salleId_fkey" FOREIGN KEY ("salleId") REFERENCES "Salle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
