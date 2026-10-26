-- Connexion OpenID Connect (Google, Microsoft, #114) : un utilisateur peut avoir un compte chez
-- plusieurs fournisseurs ; (fournisseur, sujet) identifie de façon unique le compte externe.

-- CreateTable
CREATE TABLE "IdentiteExterne" (
    "id" SERIAL NOT NULL,
    "fournisseur" TEXT NOT NULL,
    "sujet" TEXT NOT NULL,
    "utilisateurId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdentiteExterne_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IdentiteExterne_fournisseur_sujet_key" ON "IdentiteExterne"("fournisseur", "sujet");

-- AddForeignKey
ALTER TABLE "IdentiteExterne" ADD CONSTRAINT "IdentiteExterne_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;
