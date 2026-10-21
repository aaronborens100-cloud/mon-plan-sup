/*
 * tests/notes-nan.test.js : garde-fou de l'issue #13 (notes NaN).
 *
 * Pour les 14 profils types (tests/profils.js), aucune formation notée (France et étranger) ne doit avoir
 * un intérêt, une faisabilité ou une pertinence qui ne soit pas un nombre fini (NaN, Infinity, absent).
 * Une fiche sans domaines (liste vide) est notée sans le terme « domaines » (compté 0) et l'élève voit
 * l'ajustement « domaines de la formation non renseignés ».
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

const NOTES = ["interet", "faisabilite", "pertinence"];

for (const p of PROFILS) {
  test(`profil « ${p.id} » : aucune note NaN, en France comme à l'étranger`, () => {
    const { E, DATA, QUEST } = site;
    const A = E.recommander(DATA.formations, p.profil, QUEST, p.reponses);
    assert.ok(A.resultats.some((x) => x.f.pays !== "France"), "Le jeu de test doit contenir des formations à l'étranger.");
    const fautives = [];
    for (const x of A.resultats) for (const k of NOTES) if (!Number.isFinite(x[k])) fautives.push(`${x.f.id} (${k} = ${x[k]})`);
    assert.deepEqual(fautives.slice(0, 20), [], `${fautives.length} note(s) non numérique(s)`);
  });
}

test("fiche sans domaines : notée sans le terme « domaines », avec un ajustement visible", () => {
  const { E, DATA, QUEST } = site;
  const p = PROFILS[0];
  const A = E.recommander(DATA.formations, p.profil, QUEST, p.reponses);
  const sans = A.resultats.filter((x) => !(x.f.domaines || []).length);
  assert.ok(sans.length > 0, "Aucune fiche sans domaines dans le catalogue : test à revoir.");
  for (const x of sans) {
    assert.ok(Number.isFinite(x.pertinence), x.f.id);
    assert.ok(x.ajust.includes("domaines de la formation non renseignés"), x.f.id);
  }
});
