/*
 * tests/securite-sans-lycee.test.js : élève sans lycée renseigné (issue #43, décision d'Aaron du 22/10).
 *
 * Règle : sans lycée, avec la mobilité « domicile » ou « proche », aucun vœu n'est « sécurité » (distance inconnue) ;
 * le message « Indique ton lycée » est en tête de Ma liste, sans alerte « moins de 3 sûrs » contradictoire.
 * Sans changement : « partout » sans lycée, et tout élève avec lycée.
 *
 * Lancer : npm test
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { chargerSite } = require("./charger-site");
const PROFILS = require("./profils");

let site;
test.before(async () => { site = await chargerSite(); });

const eco = PROFILS.find((x) => x.id === "eco-moyen");
const variante = (lycee, mobilite) => ({ profil: Object.assign({}, eco.profil, { lycee }), reponses: Object.assign({}, eco.reponses, { mobilite }) });
const analyser = (p) => {
  const A = site.E.recommander(site.DATA.formations, p.profil, site.QUEST, p.reponses);
  return { A, W: site.E.wishlist(A.resultats, 10, A.interets) };
};
const nbSecurite = (l) => l.filter((x) => x.categorie === "securite").length;
const avecRegle = (A) => A.resultats.filter((x) => x.repere.regle === "sans_lycee");

for (const mob of ["domicile", "proche"]) {
  test(`sans lycée + ${mob} : aucun vœu « sécurité », ni dans les résultats ni dans la liste`, () => {
    const { A, W } = analyser(variante(null, mob));
    assert.ok(avecRegle(A).length > 0, "des formations auraient été sûres sans la règle");
    assert.equal(nbSecurite(A.resultats), 0);
    assert.equal(nbSecurite(W.liste), 0);
    assert.equal(W.protection.nbSecurite, 0);
    for (const x of avecRegle(A)) assert.equal(x.categorie, "realiste");
  });

  test(`sans lycée + ${mob} : un seul message sur les vœux sûrs, sans alerte contradictoire`, async () => {
    const E = site.E;
    const p = variante(null, mob);
    const { W } = analyser(p);
    assert.equal(W.protection.niveau, "sans_lycee");
    assert.equal(W.protection.message, E.MESSAGE_PROTECTION_SANS_LYCEE);
    assert.ok(!W.alertes.some((a) => /sûrs|sûr/.test(a)), "alerte « pas assez de vœux sûrs » en double");
    assert.ok(!/ton académie/.test(W.protection.message));
    const s = await chargerSite({}, { etat: { profil: p.profil, reponses: p.reponses, retenus: [], profilTermine: true, qIndex: 999 } });
    const page = s.afficher("#liste");
    const msg = E.MESSAGE_SANS_LYCEE.replace(/'/g, "&#39;");
    assert.ok(page.includes(msg), "message « Indique ton lycée » absent");
    assert.ok(!page.includes("n&#39;a aucun vœu vraiment sûr"), "alerte « aucun vœu sûr » affichée en plus");
    // le message est en tête : avant les onglets
    assert.ok(page.indexOf(msg) < page.indexOf("onglet-liste"));
  });
}

test("sans lycée + partout : inchangé (des vœux « sécurité » restent possibles, aucune règle sans_lycee)", () => {
  const { A, W } = analyser(variante(null, "partout"));
  assert.equal(avecRegle(A).length, 0);
  assert.ok(nbSecurite(A.resultats) > 0);
  assert.notEqual(W.protection.niveau, "sans_lycee");
});

test("avec lycée : inchangé (domicile, proche, partout), aucune règle sans_lycee", () => {
  const NICE = eco.profil.lycee;
  assert.ok(NICE, "le profil de référence a un lycée");
  for (const mob of ["domicile", "proche", "partout"]) {
    const { A, W } = analyser(variante(NICE, mob));
    assert.equal(avecRegle(A).length, 0, mob);
    assert.notEqual(W.protection.niveau, "sans_lycee", mob);
  }
  // « partout » avec ou sans lycée : mêmes catégories pour les formations sans lieu connu à vérifier
  const a = analyser(variante(NICE, "partout")).A, b = analyser(variante(null, "partout")).A;
  assert.ok(nbSecurite(a.resultats) > 0 && nbSecurite(b.resultats) > 0);
});
