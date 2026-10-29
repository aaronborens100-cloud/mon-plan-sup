/*
 * tests/profil-officiel.test.js : PR R, profil des formations Parcoursup ajusté par leurs statistiques officielles.
 *
 * Règle (js/catalogue.js, ajusterProfilOfficiel) : pour une école d'ingénieurs ou une prépa scientifique d'une filière
 * scientifique, une formation dont la moyenne au bac estimée des admis (répartition officielle des mentions, Parcoursup
 * 2025) atteint 16 reçoit un niveau de maths attendu d'un cran plus haut que sa filière, et « maths » dans ses domaines.
 * Elle porte alors un texte « estimation » avec la méthode et la source. Sans mentions publiées, ou sous le seuil, ou
 * hors de ces types, la valeur de la filière est gardée. data/filieres.json n'est jamais modifié.
 *
 * Lancer : npm test
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { chargerSite } = require("./charger-site");

let site, gen;
test.before(async () => { site = await chargerSite(); gen = site.DATA.formations.filter((f) => f.__gen); });

const moy = (f) => (f.notes ? f.notes.moyenne_cible : null);
const ajustee = (f) => !!f.__gen.profilOfficiel;
const TEXTE = /Niveau de maths attendu et domaines relevés d'un cran.*estimation/;

test("avec mentions officielles à 16 ou plus : maths relevé d'un cran, « maths » dans les domaines, texte « estimation »", () => {
  const L = gen.filter((f) => ["ecole_ingenieur", "prepa_scientifique"].includes(f.type) && f.__gen.fam.profil.maths === 2 && f.__gen.fam.domaines[0] === "ingenierie_tech" && moy(f) >= 16);
  assert.ok(L.length > 10, "formations d'ingénieurs à 16 ou plus");
  for (const f of L) {
    assert.equal(f.profil.maths, 3, f.id);
    assert.ok(f.domaines.includes("maths"), f.id);
    assert.ok(f.domaines.includes(f.__gen.fam.domaines[0]), f.id);
    const t = f.incertitudes.find((x) => TEXTE.test(x));
    assert.ok(t, f.id);
    assert.match(t, /Méthode : .*mentions/, f.id);
    assert.match(t, /Source : statistiques Parcoursup 2025, consultées le \d{4}-\d{2}-\d{2} \(https?:\/\//, f.id);
    assert.equal(f.__gen.profilOfficiel.maths, 3);
  }
});

test("INSA Toulouse (psup-59) : moyenne estimée 17, profil maths 3 et domaines ingénierie + maths", () => {
  const f = site.DATA.formations.find((x) => x.id === "psup-59");
  assert.equal(moy(f), 17);
  assert.equal(f.profil.maths, 3);
  assert.deepEqual([...f.domaines.slice(0, 2)], ["ingenierie_tech", "maths"]);
});

test("sans statistiques (pas de mentions) : la valeur de la filière est gardée, sans texte d'estimation", () => {
  const L = gen.filter((f) => ["ecole_ingenieur", "prepa_scientifique"].includes(f.type) && f.__gen.fam.profil.maths >= 2 && moy(f) == null);
  assert.ok(L.length > 10, "formations sans mentions");
  for (const f of L) {
    assert.equal(f.profil, f.__gen.fam.profil, f.id);
    assert.equal(f.domaines, f.__gen.fam.domaines, f.id);
    assert.ok(!f.incertitudes.some((x) => TEXTE.test(x)), f.id);
    assert.equal(f.__gen.profilOfficiel, null, f.id);
  }
});

test("sous le seuil de 16 ou hors écoles d'ingénieurs et prépas scientifiques : valeur de la filière gardée", () => {
  for (const f of gen) {
    const dedans = ["ecole_ingenieur", "prepa_scientifique"].includes(f.type);
    if (dedans && moy(f) != null && moy(f) >= 16 && ajustee(f)) continue;
    if (dedans && moy(f) != null && moy(f) >= 16 && f.profil.maths === 3 && f.__gen.fam.profil.maths === 3 && f.domaines.includes("maths")) continue;   // déjà au plus haut : rien à relever
    assert.equal(f.profil, f.__gen.fam.profil, f.id);
    assert.equal(f.domaines, f.__gen.fam.domaines, f.id);
  }
});

test("la table des filières n'est pas modifiée par l'ajustement (maths 2 pour les écoles d'ingénieurs)", () => {
  const f = site.DATA.formations.find((x) => x.id === "psup-59");
  assert.equal(f.__gen.fam.profil.maths, 2);
  assert.deepEqual([...f.__gen.fam.domaines], ["ingenierie_tech"]);
});
