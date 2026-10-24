const { validateCreateSalle, validateSections } = require('./salles.validation');

function corpsValide(overrides = {}) {
  return {
    organisateurId: 1,
    nom: 'Salle du Cégep',
    nombreRangees: 10,
    siegesParRangee: 15,
    ...overrides,
  };
}

describe('validateCreateSalle', () => {
  it('accepte un corps complet et valide', () => {
    expect(validateCreateSalle(corpsValide())).toBeNull();
  });

  it.each([
    ['organisateurId manquant', { organisateurId: undefined }, /organisateurId est requis/],
    ['organisateurId non entier', { organisateurId: '1' }, /organisateurId est requis/],
    ['nom manquant', { nom: undefined }, /nom est requis/],
    ['nom vide (espaces)', { nom: '   ' }, /nom est requis/],
    ['nombreRangees manquant', { nombreRangees: undefined }, /nombreRangees doit être/],
    ['nombreRangees à zéro', { nombreRangees: 0 }, /nombreRangees doit être/],
    ['nombreRangees négatif', { nombreRangees: -3 }, /nombreRangees doit être/],
    ['nombreRangees non entier', { nombreRangees: 2.5 }, /nombreRangees doit être/],
    ['siegesParRangee manquant', { siegesParRangee: undefined }, /siegesParRangee doit être/],
    ['siegesParRangee à zéro', { siegesParRangee: 0 }, /siegesParRangee doit être/],
  ])('refuse : %s', (_label, overrides, messageAttendu) => {
    const erreur = validateCreateSalle(corpsValide(overrides));
    expect(erreur).toEqual(expect.stringMatching(messageAttendu));
  });
});

describe('validateSections (#11)', () => {
  const section = (overrides = {}) => ({ nom: 'Parterre', prix: 45, couleur: '#2563eb', siegeIds: [1, 2], ...overrides });

  it('accepte des sections valides', () => {
    expect(validateSections({ sections: [section(), section({ nom: 'Balcon', prix: 25.5, siegeIds: [3] })] })).toBeNull();
  });

  it('accepte une liste vide (retour au tarif unique de l\'événement)', () => {
    expect(validateSections({ sections: [] })).toBeNull();
  });

  it('refuse un corps sans liste de sections', () => {
    expect(validateSections({})).toMatch(/sections est requis/);
    expect(validateSections(undefined)).toMatch(/sections est requis/);
  });

  it("refuse un siège assigné à deux sections : un siège n'appartient qu'à une seule section", () => {
    const erreur = validateSections({ sections: [section({ siegeIds: [1, 2] }), section({ nom: 'Balcon', siegeIds: [2, 3] })] });
    expect(erreur).toMatch(/siège 2 est assigné à plusieurs sections/);
  });

  it('refuse deux sections du même nom, sans tenir compte des majuscules', () => {
    expect(validateSections({ sections: [section(), section({ nom: ' parterre ', siegeIds: [3] })] })).toMatch(/Deux sections/);
  });

  it.each([
    ['nom vide', { nom: '  ' }, /nom est requis/],
    ['nom trop long', { nom: 'x'.repeat(51) }, /dépasse 50/],
    ['prix négatif', { prix: -1 }, /prix doit être un montant/],
    ['prix en texte', { prix: '45' }, /prix doit être un montant/],
    ['prix avec 3 décimales', { prix: 10.123 }, /2 décimales/],
    ['prix trop élevé', { prix: 1_000_000 }, /prix doit être un montant/],
    ['couleur invalide', { couleur: 'bleu' }, /#RRGGBB/],
    ['section sans siège', { siegeIds: [] }, /ne contient aucun siège/],
    ['siegeIds non entiers', { siegeIds: [1.5] }, /entiers/],
  ])('refuse : %s', (_cas, overrides, attendu) => {
    expect(validateSections({ sections: [section(overrides)] })).toMatch(attendu);
  });

  it('accepte une section gratuite et un prix à 2 décimales', () => {
    expect(validateSections({ sections: [section({ prix: 0 }), section({ nom: 'Loge', prix: 19.99, siegeIds: [5] })] })).toBeNull();
  });

  it('refuse plus de 20 sections', () => {
    const sections = Array.from({ length: 21 }, (_, i) => section({ nom: `S${i}`, siegeIds: [i + 1] }));
    expect(validateSections({ sections })).toMatch(/au plus 20/);
  });
});
