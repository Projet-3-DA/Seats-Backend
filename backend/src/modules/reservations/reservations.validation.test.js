const { validateReserverSieges } = require('./reservations.validation');

function corpsValide(overrides = {}) {
  return { evenementId: 1, siegeIds: [101, 102], ...overrides };
}

describe('validateReserverSieges', () => {
  it('accepte un corps valide', () => {
    expect(validateReserverSieges(corpsValide())).toBeNull();
  });

  it('accepte un seul siège', () => {
    expect(validateReserverSieges(corpsValide({ siegeIds: [101] }))).toBeNull();
  });

  it.each([
    ['evenementId manquant', { evenementId: undefined }, /evenementId est requis/],
    ['evenementId non entier', { evenementId: 1.5 }, /evenementId est requis/],
    ['siegeIds manquant', { siegeIds: undefined }, /siegeIds est requis/],
    ['siegeIds vide', { siegeIds: [] }, /siegeIds est requis/],
    ['siegeIds non-tableau', { siegeIds: 101 }, /siegeIds est requis/],
    ['siegeIds avec un élément non entier', { siegeIds: [101, '102'] }, /que des entiers/],
    ['siegeIds avec un doublon', { siegeIds: [101, 101] }, /doublon/],
  ])('refuse : %s', (_label, overrides, messageAttendu) => {
    const erreur = validateReserverSieges(corpsValide(overrides));
    expect(erreur).toEqual(expect.stringMatching(messageAttendu));
  });
});
