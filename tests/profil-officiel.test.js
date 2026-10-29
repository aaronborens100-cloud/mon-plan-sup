/*
 * tests/profil-officiel.test.js : PR R, profil des formations scientifiques ajusté à partir des statistiques officielles.
 *
 * Règle (js/catalogue.js, ajusterProfilOfficiel) : dans une filière à dominante scientifique, une formation dont la
 * moyenne au bac estimée des admis (répartition officielle des mentions, Parcoursup 2025) atteint 16 reçoit un niveau
 * de maths attendu d'un cran plus haut que sa filière, et « maths » dans ses domaines. Estimation, jamais un fait.
 *
 * Lancer : npm test
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { chargerSite } = require("./charger-site");

let site;
test.before(async () => { site = await chargerSite(); });

const generees = () => site.DATA.formations.filter((f) => f.__gen && f.__gen.fam.nmc === "FI-BAC5" && f.notes && f.notes.moyenne_cible != null);

test("filière d'ingénieurs : une formation très sélective a un profil maths plus élevé qu'une peu sélective", () => {
  const L = generees();
  const haute = L.filter((f) => f.notes.moyenne_cible >= 16), basse = L.filter((f) => f.notes.moyenne_cible < 14);
  assert.ok(haute.length > 0 && basse.length > 0);
  for (const f of haute) assert.equal(f.profil.maths, 3, f.id);
  for (const f of basse) assert.equal(f.profil.maths, 2, f.id);
  assert.ok(haute[0].profil.maths > basse[0].profil.maths);
  assert.ok(haute.every((f) => f.domaines.includes("maths")));
});

test("la table des filières n'est pas modifiée et l'ajustement est signalé comme estimation", () => {
  const f = generees().find((x) => x.notes.moyenne_cible >= 16);
  assert.equal(f.__gen.fam.profil.maths, 2);
  assert.ok(f.incertitudes.some((t) => /estimation calculée à partir des statistiques officielles Parcoursup 2025/.test(t)));
  assert.ok(f.__gen.profilOfficiel && f.__gen.profilOfficiel.maths === 3);
});

test("sans moyenne officielle ou hors filière scientifique : profil de la filière, inchangé", () => {
  for (const f of site.DATA.formations.filter((x) => x.__gen)) {
    const m = f.notes && f.notes.moyenne_cible;
    if (m == null || m < 16 || !f.__gen.profilOfficiel) assert.equal(f.profil, f.__gen.fam.profil, f.id);
  }
});
