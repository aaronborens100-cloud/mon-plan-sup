/*
 * tests/types-parcoursup.test.js : type de formation et option ECG des fiches générées (psup-*), lus dans Parcoursup
 * (règle 2) et non plus dans les anciennes fiches maison.
 *
 *   - une MPSI générée est une prépa scientifique ;
 *   - une école d'ingénieurs post-bac est une ecole_ingenieur ;
 *   - une ECG « approfondies » a option = "appro", une ECG « appliquées » option = "appli" ;
 *   - une « Double licence » garde le type de la filière (reclassement reporté) ;
 *   - toute prépa ECG générée issue d'un intitulé approfondies / appliquées a une option.
 *
 * Lancer : npm test
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { chargerSite } = require("./charger-site");

let generees, parGta;
test.before(async () => {
  const site = await chargerSite();
  generees = site.DATA.formations.filter((f) => f.__gen && !f.__gen.modele);
  parGta = new Map(site.CAT.filter((c) => c.ps).map((c) => [c.ps.gta, c.ps]));
});
const ps = (f) => parGta.get(f.__gen.gta);
const intitule = (f) => ps(f).nm.join(" ");

test("une MPSI générée a le type prepa_scientifique", () => {
  const l = generees.filter((f) => /\bMPSI\b/.test(intitule(f)));
  assert.ok(l.length > 0, "aucune MPSI générée trouvée");
  for (const f of l) assert.equal(f.type, "prepa_scientifique", f.id);
});

test("une école d'ingénieurs post-bac générée a le type ecole_ingenieur", () => {
  const l = generees.filter((f) => ps(f).tf.includes("Formations des écoles d'ingénieurs"));
  assert.ok(l.length > 0);
  for (const f of l) assert.equal(f.type, "ecole_ingenieur", f.id);
});

test("une ECG appro a option = appro, une ECG appli option = appli", () => {
  const appro = generees.filter((f) => f.type === "prepa_ecg" && /ECG.*approfondies/.test(intitule(f)));
  const appli = generees.filter((f) => f.type === "prepa_ecg" && /ECG.*appliqu/.test(intitule(f)));
  assert.ok(appro.length > 0 && appli.length > 0, "il faut des ECG appro et appli générées");
  for (const f of appro) assert.equal(f.option, "appro", f.id);
  for (const f of appli) assert.equal(f.option, "appli", f.id);
});

test("une prépa ECG générée a une option dès que l'intitulé la précise", () => {
  for (const f of generees.filter((x) => x.type === "prepa_ecg" && /ECG/.test(intitule(x)))) {
    assert.ok(f.option === "appro" || f.option === "appli", `${f.id} : ${intitule(f)}`);
  }
});

test("doubles licences : reclassement reporté, le type de la filière est gardé (décision d'Aaron du 29/10/2026)", () => {
  const dbl = generees.filter((f) => /^Double licence/i.test(intitule(f)) && ps(f).tf.includes("Licence"));
  assert.ok(dbl.length > 0);
  for (const f of dbl) assert.equal(f.type, f.__gen.fam.type, f.id);
  assert.ok(dbl.every((f) => f.__gen.typeSansRegle));
});
