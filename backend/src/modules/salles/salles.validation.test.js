const { validateCreateSalle } = require('./salles.validation');

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
