const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isUrlHttp, isTarifValide, validateCreateEvenement } = require('./evenements.validation');

const futur = () => new Date(Date.now() + 7 * 86400_000).toISOString();
const passe = () => new Date(Date.now() - 86400_000).toISOString();

function corpsValide(overrides = {}) {
  return {
    organisateurId: 1,
    salleId: 19,
    titre: 'Festival de Jazz',
    dateHeure: futur(),
    tarif: 25,
    ...overrides,
  };
}

const casUrlHttp = [
  ['https://exemple.com/affiche.png', true],
  ['http://exemple.com/affiche.png', true],
  ['ftp://exemple.com/affiche.png', false],
  ['javascript:alert(1)', false],
  ['pas un lien', false],
  ['', false],
];
for (const [valeur, attendu] of casUrlHttp) {
  test(`isUrlHttp(${JSON.stringify(valeur)}) -> ${attendu}`, () => {
    assert.equal(isUrlHttp(valeur), attendu);
  });
}

const casTarifValide = [
  [25, true],
  [0, true],
  [19.99, true],
  [999999.99, true],
  [-1, false],
  [1000000, false],
  [25.999, false],
  ['25', false],
  [null, false],
  [undefined, false],
  [NaN, false],
  [Infinity, false],
];
for (const [valeur, attendu] of casTarifValide) {
  test(`isTarifValide(${JSON.stringify(valeur)}) -> ${attendu}`, () => {
    assert.equal(isTarifValide(valeur), attendu);
  });
}

test('validateCreateEvenement() accepte un corps complet et valide', () => {
  assert.equal(validateCreateEvenement(corpsValide()), null);
});

test('validateCreateEvenement() accepte un tarif à 0 (événement gratuit)', () => {
  assert.equal(validateCreateEvenement(corpsValide({ tarif: 0 })), null);
});

test('validateCreateEvenement() accepte une description et une afficheUrl absentes', () => {
  assert.equal(validateCreateEvenement(corpsValide({ description: undefined, afficheUrl: undefined })), null);
});

test('validateCreateEvenement() accepte une afficheUrl vide', () => {
  assert.equal(validateCreateEvenement(corpsValide({ afficheUrl: '' })), null);
});

test('validateCreateEvenement() accepte une afficheUrl http(s) valide', () => {
  assert.equal(validateCreateEvenement(corpsValide({ afficheUrl: '  https://exemple.com/a.png  ' })), null);
});

const casInvalides = [
  ['organisateurId manquant', { organisateurId: undefined }, /organisateurId est requis/],
  ['organisateurId non entier', { organisateurId: 1.5 }, /organisateurId est requis/],
  ['salleId manquant', { salleId: undefined }, /salle doit être attribuée/],
  ['titre manquant', { titre: undefined }, /titre est requis/],
  ['titre vide', { titre: '   ' }, /titre est requis/],
  ['description non-chaîne', { description: 42 }, /description doit être une chaîne/],
  ['dateHeure manquante', { dateHeure: undefined }, /dateHeure est requis/],
  ['dateHeure invalide', { dateHeure: 'pas-une-date' }, /dateHeure est requis/],
  ['dateHeure passée', { dateHeure: passe() }, /déjà passée/],
  ['tarif manquant', { tarif: undefined }, /tarif est requis/],
  ['tarif négatif', { tarif: -1 }, /tarif doit être un montant positif/],
  ['tarif en texte', { tarif: '25' }, /tarif doit être un montant positif/],
  ['tarif à 3 décimales', { tarif: 25.999 }, /tarif doit être un montant positif/],
  ['afficheUrl non http', { afficheUrl: 'ftp://exemple.com/a.png' }, /afficheUrl doit être un lien/],
  ['afficheUrl trop longue', { afficheUrl: `https://exemple.com/${'a'.repeat(2048)}` }, /afficheUrl doit être un lien/],
];
for (const [label, overrides, messageAttendu] of casInvalides) {
  test(`validateCreateEvenement() refuse : ${label}`, () => {
    const erreur = validateCreateEvenement(corpsValide(overrides));
    assert.match(erreur, messageAttendu);
  });
}
