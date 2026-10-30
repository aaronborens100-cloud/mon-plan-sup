/*
 * tests/repartition-343.test.js : la liste de 10 vœux vise 3 « sécurité », 4 « réalistes », 3 « ambitieux »
 * en élargissant sans jamais mentir (décision d'Aaron du 30/10/2026).
 *
 * Quand une catégorie manque : (1) plancher de pertinence et diversité assouplis pour cette catégorie ; (2) pour les
 * ambitieux, puis les réalistes, formations au-delà de la zone de mobilité (dites « Hors de ta zone de mobilité » sur
 * le vœu) ; (3) jamais de faux « sécurité » : la catégorie d'un vœu ne change pas et aucune règle de catégorie
 * n'est assouplie. Sans lycée, aucun « sécurité » (message « Indique ton lycée »).
 *
 * Lancer : npm test
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { chargerSite } = require("./charger-site");
const PROFILS = require("./profils");
const { genererProfils } = require("./profils-aleatoires");

let site;
test.before(async () => { site = await chargerSite(); });

const analyser = (p) => {
  const A = site.E.recommander(site.DATA.formations, p.profil, site.QUEST, p.reponses);
  return { A, W: site.E.wishlist(A.resultats, 10, A.interets) };
};
const compte = (liste, cat) => liste.filter((x) => x.categorie === cat).length;
const HORS_ZONE = /Hors de ta zone de mobilité/;

test("profil avec lycée : exactement 3 sécurité, 4 réalistes, 3 ambitieux", () => {
  const eco = PROFILS.find((x) => x.id === "eco-moyen");
  const { W } = analyser(eco);
  assert.equal(W.liste.length, 10);
  assert.deepEqual([compte(W.liste, "securite"), compte(W.liste, "realiste"), compte(W.liste, "ambitieux")], [3, 4, 3]);
});

test("profil « domicile » dont tous les ambitieux sont hors zone : 3 ambitieux quand même, marqués « hors de ta zone de mobilité »", () => {
  const p = genererProfils(300).find((x) => x.id === "alea-113");
  const { A, W } = analyser(p);
  const { E } = site;
  assert.equal(A.interets.prefs.mobilite, 0, "profil « domicile »");
  const ambitieuxDansLaZone = A.resultats.filter((x) => x.categorie === "ambitieux" && !x.exclu && !x.bloque && E.voeuParcoursup(x.f) && !E.reglesHorsListe(x.f).length);
  assert.equal(ambitieuxDansLaZone.length, 0, "aucun ambitieux dans la zone (sinon le profil ne teste rien)");
  const amb = W.liste.filter((x) => x.categorie === "ambitieux");
  assert.equal(amb.length, 3);
  for (const x of amb) {
    assert.ok(x.horsZone && HORS_ZONE.test(x.repere.pourquoi), `${x.f.id} : mention « hors de ta zone de mobilité » absente`);
    assert.equal(A.resultats.find((y) => y.f.id === x.f.id).categorie, "ambitieux", "la catégorie du vœu n'a pas changé");
  }
  // le résultat de recommander() n'est pas modifié (le vœu hors zone reste une formation exclue pour la distance)
  for (const x of amb) assert.ok(A.resultats.find((y) => y.f.id === x.f.id).exclu, `${x.f.id} : exclusion de recommander() modifiée`);
  // jamais de « sécurité » hors zone
  assert.ok(W.liste.every((x) => !(x.horsZone && x.categorie === "securite")));
});

for (const mob of ["domicile", "proche"]) {
  test(`profil sans lycée (${mob}) : aucun « sécurité », message « Indique ton lycée » conservé`, () => {
    const eco = PROFILS.find((x) => x.id === "eco-moyen");
    const p = { profil: Object.assign({}, eco.profil, { lycee: null }), reponses: Object.assign({}, eco.reponses, { mobilite: mob }) };
    const { W } = analyser(p);
    assert.equal(compte(W.liste, "securite"), 0);
    assert.equal(W.protection.niveau, "sans_lycee");
    assert.ok(W.liste.length > 0);
  });
}
