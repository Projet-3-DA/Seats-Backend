-- CreateEnum
CREATE TYPE "Role" AS ENUM ('spectateur', 'organisateur', 'administrateur');

-- CreateEnum
CREATE TYPE "StatutReservation" AS ENUM ('en_selection', 'confirmee', 'annulee');

-- CreateTable
CREATE TABLE "Utilisateur" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "motDePasse" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Utilisateur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Salle" (
    "id" SERIAL NOT NULL,
    "organisateurId" INTEGER NOT NULL,
    "nom" TEXT NOT NULL,
    "nombreRangees" INTEGER NOT NULL,
    "siegesParRangee" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Salle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Siege" (
    "id" SERIAL NOT NULL,
    "salleId" INTEGER NOT NULL,
    "numeroRangee" INTEGER NOT NULL,
    "numeroColonne" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Siege_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evenement" (
    "id" SERIAL NOT NULL,
    "organisateurId" INTEGER NOT NULL,
    "salleId" INTEGER NOT NULL,
    "titre" TEXT NOT NULL,
    "description" TEXT,
    "dateHeure" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evenement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" SERIAL NOT NULL,
    "spectateurId" INTEGER NOT NULL,
    "siegeId" INTEGER NOT NULL,
    "evenementId" INTEGER NOT NULL,
    "statut" "StatutReservation" NOT NULL,
    "dateSelection" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateConfirmation" TIMESTAMP(3),
    "delaiExpiration" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Utilisateur_email_key" ON "Utilisateur"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Salle_organisateurId_nom_key" ON "Salle"("organisateurId", "nom");

-- CreateIndex
CREATE UNIQUE INDEX "Siege_salleId_numeroRangee_numeroColonne_key" ON "Siege"("salleId", "numeroRangee", "numeroColonne");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_siegeId_evenementId_key" ON "Reservation"("siegeId", "evenementId");

-- AddForeignKey
ALTER TABLE "Salle" ADD CONSTRAINT "Salle_organisateurId_fkey" FOREIGN KEY ("organisateurId") REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Siege" ADD CONSTRAINT "Siege_salleId_fkey" FOREIGN KEY ("salleId") REFERENCES "Salle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evenement" ADD CONSTRAINT "Evenement_organisateurId_fkey" FOREIGN KEY ("organisateurId") REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evenement" ADD CONSTRAINT "Evenement_salleId_fkey" FOREIGN KEY ("salleId") REFERENCES "Salle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_spectateurId_fkey" FOREIGN KEY ("spectateurId") REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_siegeId_fkey" FOREIGN KEY ("siegeId") REFERENCES "Siege"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_evenementId_fkey" FOREIGN KEY ("evenementId") REFERENCES "Evenement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
