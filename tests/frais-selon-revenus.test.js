/*
 * tests/frais-selon-revenus.test.js : les 17 fiches « selon les revenus » (champ selon_revenus de data/frais-prives.json)
 * restent proposées, avec « jusqu'à X € », mais comptent comme « frais inconnus » pour le budget : jamais d'exclusion
 * (décision du fondateur, PR A2 de l'issue #49). Une fiche aux frais chiffrés trop chers reste exclue.
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

const profil = (id) => PROFILS.find((x) => x.id === id);
const fiche = (gta) => site.DATA.formations.find((f) => String(f.__gta) === String(gta));
const evaluer = (p, reponses, f) => {
  const { E, QUEST } = site;
  const A = E.recommander([], p.profil, QUEST, Object.assign({}, p.reponses, reponses));
  return E.evaluer(f, A.stats, A.interets);
};
const AU_DELA = /au-delà de ton budget/;

test("fiche « selon les revenus » : jamais exclue par un budget serré (24654 jusqu'à 4 500 € / gratuit, 26005 jusqu'à 14 470 € / faible)", () => {
  const p = profil("fragile");
  for (const [gta, max, budget] of [["24654", 4500, "gratuit"], ["26005", 14470, "gratuit"], ["26005", 14470, "faible"]]) {
    const f = fiche(gta);
    assert.equal(f.cout.selon_revenus, true);
    assert.equal(f.cout.valeur_annuelle_eur, max);
    const ev = evaluer(p, { budget, mobilite: "partout" }, f);
    assert.ok(!AU_DELA.test(ev.exclu || ""), `${gta} budget ${budget} : exclue (${ev.exclu})`);
  }
});

test("les 17 fiches « selon les revenus » : aucune exclusion par les frais, quel que soit le budget", () => {
  const fiches = site.DATA.formations.filter((f) => f.cout && f.cout.selon_revenus === true);
  assert.equal(fiches.length, 17);
  const p = profil("fragile");
  for (const f of fiches) for (const budget of ["gratuit", "faible", "moyen", "eleve"]) {
    const ev = evaluer(p, { budget, mobilite: "partout" }, f);
    assert.ok(!AU_DELA.test(ev.exclu || ""), `${f.__gta} budget ${budget} : exclue (${ev.exclu})`);
  }
});

test("même fiche sans l'indicateur selon_revenus : toujours exclue du budget serré (le comportement vient bien du champ)", () => {
  const f = fiche("26005");
  const g =Object.assign(Object.create(Object.getPrototypeOf(f)), f, { cout: Object.assign({}, f.cout, { selon_revenus: false }) });
  const ev = evaluer(profil("fragile"), { budget: "faible", mobilite: "partout" }, g);
  assert.match(ev.exclu || "", AU_DELA);
});

test("fiche normale chère (frais chiffrés, pas selon les revenus) : toujours exclue d'un budget serré", () => {
  const f = fiche("100");   // 8 890 € par an, montant unique
  assert.ok(f && f.cout && !f.cout.selon_revenus && f.cout.valeur_annuelle_eur === 8890, "fiche de test introuvable");
  const p = profil("fragile");
  for (const budget of ["gratuit", "faible"]) {
    assert.match(evaluer(p, { budget, mobilite: "partout" }, f).exclu || "", AU_DELA, `budget ${budget}`);
  }
});

test("GOBELINS 37012 (« à partir de 10 400 € », 1re année) : toujours exclue d'un budget serré", () => {
  const f = fiche("37012");
  assert.ok(!f.cout.selon_revenus);
  const p = profil("fragile");
  for (const budget of ["gratuit", "faible"]) {
    assert.match(evaluer(p, { budget, mobilite: "partout" }, f).exclu || "", AU_DELA, `budget ${budget}`);
  }
});
