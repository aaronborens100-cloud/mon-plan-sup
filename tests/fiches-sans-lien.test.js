/*
 * tests/fiches-sans-lien.test.js : retrait des fiches maison françaises sans lien Parcoursup (règle 2).
 *
 * Décision du fondateur : les fiches de data/formations.json dont le pays est la France et dont la correspondance
 * Parcoursup n'est pas certaine (data/anciennes-fiches.json, anciennes[id].m = "P" probable ou "N" aucune) ne sont plus proposées.
 * (Depuis I2, les fiches fusionnées avec certitude, m = "C", et les 15 modèles ECG sont retirées aussi : voir
 * tests/i2-retrait.test.js. Il ne reste que les fiches à l'étranger.)
 *
 * Vœux enregistrés : un identifiant retiré reste valide.
 *   - m = "P" : redirigé vers la première candidate de anciennes[id].c présente dans le catalogue ;
 *   - m = "N" (ou aucune candidate affichée) : le vœu est retiré de la liste, avec un message à l'élève.
 *
 * Lancer : npm test
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { chargerSite } = require("./charger-site");
const PROFILS = require("./profils");

const ANCIENNES = require("../data/anciennes-fiches.json").anciennes;
const MODELES = new Set(Object.entries(ANCIENNES).filter(([, x]) => x.remplacee_par).map(([id]) => id));   // les 15 modèles ECG
const MESSAGE = "Une formation de ta liste n'est plus proposée par Mon Plan Sup (fiche sans correspondance Parcoursup). Elle a été retirée de ta liste.";
const P = PROFILS[0];
const ETAT = (retenus) => ({ profil: P.profil, reponses: P.reponses, retenus, profilTermine: true, qIndex: 999 });

let site;
test.before(async () => { site = await chargerSite(); });

test("aucune fiche France hors Parcoursup dans le catalogue (ni m = C, ni modèle ECG)", () => {
  assert.equal(MODELES.size, 15);
  const intrus = site.DATA.formations.filter((f) => f.pays === "France" && !f.id.startsWith("psup-"));
  assert.deepEqual(intrus.map((f) => f.id), []);
});

test("un vœu sur une fiche P à candidate unique est redirigé vers psup-<code>", async () => {
  const ids = new Set(site.CAT.map((e) => e.id));
  const retiree = Object.entries(ANCIENNES).find(([id, x]) => x.m === "P" && id.startsWith("ps-") && !MODELES.has(id) && (x.c || []).length === 1 && ids.has("psup-" + x.c[0]) && !site.CAT.some((e) => e.id === id));
  assert.ok(retiree, "aucune fiche P à candidate unique trouvée");
  const [id, x] = retiree;
  const s = await chargerSite({}, { etat: ETAT([id]) });
  assert.deepEqual(s.etatEnregistre().retenus, ["psup-" + x.c[0]]);
  // le lien #formation-<ancien id> mène à la même fiche
  assert.match(s.afficher("#formation-" + id), new RegExp(site.CAT.find((e) => e.id === "psup-" + x.c[0]).nom.slice(0, 20).replace(/[()[\].*+?^${}|\\]/g, "\\$&")));
});

test("un vœu sur une fiche N est retiré, avec un message affiché une seule fois", async () => {
  const [id] = Object.entries(ANCIENNES).find(([i, x]) => x.m === "N" && i.startsWith("ps-") && !MODELES.has(i));
  const s = await chargerSite({}, { etat: ETAT([id]) });
  assert.deepEqual(s.etatEnregistre().retenus, []);
  const page = s.afficher("#liste");
  assert.ok(page.includes(MESSAGE), "message absent");
  assert.ok(!s.afficher("#liste").includes(MESSAGE), "message répété");
});

// Décision d'Aaron (I2) : les fiches fusionnées (m = C) sont retirées aussi ; le vœu suit vers psup-<code>, sans message.
// (Avant I2, ce test attendait un vœu « non touché » sur une fiche m = C, qui existait encore.)
test("un vœu sur une ancienne fiche fusionnée (m = C) est redirigé vers sa formation Parcoursup, sans message", async () => {
  const [id, x] = Object.entries(ANCIENNES).find(([, y]) => y.m === "C" && site.CAT.some((e) => e.id === "psup-" + y.g));
  const s = await chargerSite({}, { etat: ETAT([id]) });
  assert.ok(!s.afficher("#liste").includes(MESSAGE));
  assert.deepEqual(s.etatEnregistre().retenus, ["psup-" + x.g]);
});

test("à l'étranger : le même nombre de fiches qu'avant (519)", () => {
  const etranger = require("../data/formations.json").formations.filter((f) => f.pays !== "France");
  assert.equal(etranger.length, 519);
  assert.equal(site.DATA.formations.filter((f) => etranger.some((g) => g.id === f.id)).length, 519);
});
