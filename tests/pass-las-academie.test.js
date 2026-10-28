/*
 * tests/pass-las-academie.test.js : projet médecine / santé, PASS et LAS de l'académie (issue #42, relecture E05).
 *
 * Décision d'Aaron (22/10) : pour un élève dont le projet est la santé, le PASS ou une LAS de son secteur figure
 * toujours dans la liste de 10 vœux, jamais en « sécurité » (entrée en 2e année très sélective), avec un message
 * honnête. Les règles existantes (exclusion, distance, territoire) s'appliquent ensuite. Aucun changement pour les
 * élèves sans projet santé.
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

const sante = PROFILS.find((x) => x.id === "sante-svt");
const eco = PROFILS.find((x) => x.id === "eco-moyen");
const REUNION = { type: "lycee", uai: "x", nom: "Lycée Leconte de Lisle", commune: "Saint-Denis", dep: "La Réunion", lat: -20.88, lon: 55.45 };
const AUBERVILLIERS = { type: "lycee", uai: "0930116W", nom: "Lycée Henri Wallon", commune: "Aubervilliers", dep: "Seine-Saint-Denis", lat: 48.9114, lon: 2.3883 };
// E05 : Saint-Denis de La Réunion, 14,15, SVT + PC, médecine, métropole acceptée, budget faible
const e05 = (reponses = {}, lycee = REUNION) => ({
  profil: Object.assign({}, sante.profil, { lycee, periodes: [Object.assign({}, sante.profil.periodes[0], { moyenneGenerale: "14.15" })] }),
  reponses: Object.assign({}, sante.reponses, { budget: "faible", mobilite: "partout", lieu: ["partout"] }, reponses),
});
const analyser = (p) => {
  const A = site.E.recommander(site.DATA.formations, p.profil, site.QUEST, p.reponses);
  return { A, W: site.E.wishlist(A.resultats, 10, A.interets) };
};
const passLas = (l) => l.filter((x) => site.E.estPassLas(x.f));
const duSecteur = (l) => passLas(l).filter((x) => x.memeSecteur);

test("E05 : le PASS de l'université de La Réunion figure dans la liste, jamais en « sécurité »", () => {
  const { A, W } = analyser(e05());
  assert.ok(site.E.projetSante(A.interets));
  const pass = duSecteur(W.liste);
  assert.ok(pass.length >= 1, "aucun PASS / LAS de l'académie dans la liste");
  for (const x of pass) {
    assert.equal(x.academie, "La Réunion");
    assert.notEqual(x.categorie, "securite");
    assert.ok(!x.exclu && !x.horsDistance);
    assert.match(x.repere.pourquoi, /très sélective/);
  }
  assert.equal(W.liste.length, 10);
});

test("projet santé : aucun PASS ni LAS n'est « sécurité », dans les résultats comme dans la liste", () => {
  for (const p of [e05(), e05({}, AUBERVILLIERS), e05({ mobilite: "domicile" })]) {
    const { A, W } = analyser(p);
    for (const x of passLas(A.resultats)) assert.notEqual(x.categorie, "securite", x.f.nom);
    assert.ok(duSecteur(W.liste).length >= 1);
  }
});

test("projet santé en Île-de-France : un secteur (Créteil, Paris, Versailles) ; le PASS / la LAS de ce secteur est dans la liste", () => {
  const { W } = analyser(e05({}, AUBERVILLIERS));
  const x = duSecteur(W.liste);
  assert.ok(x.length >= 1);
  for (const y of x) assert.equal(site.E.secteurDe(y.academie), "Île-de-France");
});

test("les règles existantes passent avant : domicile + lycée hors d'atteinte de tout PASS ne force rien d'exclu", () => {
  const { W } = analyser(e05({ mobilite: "domicile" }));
  for (const x of W.liste) assert.ok(!x.exclu && !x.bloque);
});

test("élève sans projet santé : PASS / LAS non modifiés (catégorie et message), liste inchangée par la règle", () => {
  const p = { profil: eco.profil, reponses: eco.reponses };
  const { A, W } = analyser(p);
  assert.ok(!site.E.projetSante(A.interets));
  for (const x of passLas(A.resultats)) {
    assert.notEqual(x.repere.regle, "sante_selective");
    assert.doesNotMatch(x.repere.pourquoi, /études de santé/);
  }
  assert.equal(duSecteur(W.liste).length, 0);
});

test("sans réponse au questionnaire : pas de projet santé", () => {
  assert.equal(site.E.projetSante(null), false);
  const A = site.E.recommander(site.DATA.formations, sante.profil, site.QUEST, {});
  assert.equal(site.E.projetSante(A.interets), false);
});
