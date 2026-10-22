/*
 * tests/perimetre.test.js : périmètre du site, BTS et BUT non proposés (data/fusion.json, perimetre.categories_masquees).
 *
 *   - Aucune fiche BUT ou BTS dans le catalogue recommandable : ni fiche Parcoursup de ces catégories, ni fiche de
 *     data/formations.json de type BUT ou BTS, ni fiche fusionnée avec une formation Parcoursup BUT ou BTS.
 *   - Pour les 14 profils types : aucun BUT ni BTS dans les recommandations, la liste de 10 vœux, la section
 *     « Nouvelles » et les propositions à l'étranger.
 *
 * Les formations qui ne sont pas des BUT ou des BTS mais dont l'intitulé en parle (double diplôme licence / BTS,
 * mise à niveau pour l'entrée en BTS, passerelle pour un BUT) restent dans le périmètre.
 *
 * Lancer : npm test
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { chargerSite } = require("./charger-site");
const PROFILS = require("./profils");

const DATE_TEST = "2026-10-01";
let site, masquees;
test.before(async () => {
  site = await chargerSite();
  masquees = require("../data/fusion.json").meta.perimetre.categories_masquees;
});

const TYPES_MASQUES = ["but", "bts"];
const estHorsPerimetre = (f) => TYPES_MASQUES.includes(f.type) || (f.__tf || []).some((t) => masquees.includes(t));

// Toutes les fiches citées dans un résultat (objets { f: fiche, … }), à n'importe quelle profondeur
function fiches(x, vues = new Set(), acc = []) {
  if (!x || typeof x !== "object" || vues.has(x)) return acc;
  vues.add(x);
  if (x.f && x.f.id) acc.push(x.f);
  for (const v of x instanceof Set ? [...x] : Object.values(x)) fiches(v, vues, acc);
  return acc;
}

test("les catégories masquées sont bien BTS et BUT", () => {
  assert.deepEqual([...masquees].sort(), ["BTS - BTSA - BTSM", "BUT"]);
});

test("aucun BUT ni BTS dans le catalogue recommandable", () => {
  const hors = site.DATA.formations.filter(estHorsPerimetre).map((f) => f.id);
  assert.deepEqual(hors, []);
  // les trois fiches BUT de data/formations.json (dont le BUT GEA de Meaux, vu dans une liste de vœux le 19/10/2026)
  for (const id of ["ps-9107", "ps-2415", "ps-11322"]) assert.ok(!site.DATA.formations.some((f) => f.id === id), id);
});

for (const p of PROFILS) {
  test(`profil ${p.id} : aucun BUT ni BTS dans les résultats`, () => {
    const { E, DATA, QUEST } = site;
    const A = E.recommander(DATA.formations, p.profil, QUEST, p.reponses);
    const W = E.wishlist(A.resultats, 10, A.interets);
    const parties = {
      recommandations: A.resultats.filter((r) => !r.exclu).map((r) => r.f),
      voeux: fiches(W),
      nouvelles: E.nouvelles(A.resultats, A.interets).map((x) => x.f),
      etranger: fiches(E.etranger(A.resultats, W, A.interets, DATE_TEST)),
    };
    for (const [nom, l] of Object.entries(parties)) assert.deepEqual(Array.from(l).filter(estHorsPerimetre).map((f) => f.id), [], nom);   // Array.from : tableau du contexte du test
  });
}
