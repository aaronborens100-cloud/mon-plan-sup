/*
 * tests/fiches-fusionnees.test.js : retrait des fiches maison fusionnées avec Parcoursup (PR I, règle 2).
 *
 * Toutes les formations françaises viennent de Parcoursup (identifiants « psup-<code> ») ; data/formations.json ne garde
 * que les fiches à l'étranger. Les anciens identifiants sont redirigés (data/anciennes-fiches.json).
 *
 * Lancer : npm test
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { chargerSite } = require("./charger-site");
const PROFILS = require("./profils");

const AN = require("../data/anciennes-fiches.json");
const P = PROFILS[0];
const ETAT = (retenus) => ({ profil: P.profil, reponses: P.reponses, retenus, profilTermine: true, qIndex: 999 });

let site;
test.before(async () => { site = await chargerSite(); });

test("aucune fiche France hors psup-* dans le catalogue", () => {
  const intrus = site.DATA.formations.filter((f) => f.pays === "France" && !f.id.startsWith("psup-") && !f.__campusEtranger);
  assert.deepEqual(Array.from(intrus.map((f) => f.id)), []);
  assert.deepEqual(Array.from(site.CAT.filter((e) => e.pays === "France" && !e.id.startsWith("psup-")).map((e) => e.id)), []);
});

test("un ancien id fusionné est redirigé vers son psup (vœu enregistré et lien)", async () => {
  const visibles = new Set(site.CAT.map((e) => e.id));
  const [id, cible] = Object.entries(AN.redirections).find(([i, c]) => i === "ps-7917" && visibles.has(c));
  assert.equal(cible, "psup-31351");
  const s = await chargerSite({}, { etat: ETAT([id]) });
  assert.deepEqual(s.etatEnregistre().retenus, [cible]);
  const nom = site.CAT.find((e) => e.id === cible).nom;
  assert.ok(s.afficher("#formation-" + id).includes(nom.replace(/&/g, "&amp;")) || s.afficher("#formation-" + id).length > 500);
  // les 811 + 15 modèles ont une redirection
  assert.ok(Object.values(AN.redirections).length >= 826);
  assert.equal(AN.redirections["prepa-lycee-louis-le-grand-appro"], "psup-31359");
});

test("BTS et BUT absents du catalogue, même fusionnés avant (ex. BUT redirigés sans cible)", () => {
  assert.ok(site.CAT.every((e) => !(e.ps && e.ps.tf.some((t) => AN.meta.perimetre.categories_masquees.includes(t)))));
  assert.ok(site.DATA.formations.every((f) => f.type !== "but" && f.type !== "bts"));
  // 6314 (BUT-Informatique) était une fiche fusionnée : sa redirection ne mène à rien, le vœu est retiré
  const ancien = Object.entries(AN.redirections).find(([, c]) => c === "psup-6314");
  assert.ok(ancien, "redirection vers psup-6314 attendue");
  assert.ok(!site.CAT.some((e) => e.id === "psup-6314"));
});

test("une prépa ECG approfondies générée garde option = \"appro\" (et appliquées \"appli\")", () => {
  const ecg = site.DATA.formations.filter((f) => f.type === "prepa_ecg" && f.__gen);
  assert.ok(ecg.length > 50, `prépas ECG générées : ${ecg.length}`);
  const appro = ecg.filter((f) => /approfondies/.test(f.nom)), appli = ecg.filter((f) => /appliqu/.test(f.nom));
  assert.ok(appro.length > 20 && appli.length > 10);
  assert.ok(appro.every((f) => f.option === "appro"));
  assert.ok(appli.every((f) => f.option === "appli"));
  // exemple : ancien modèle « Louis-le-Grand approfondies » -> psup-31359
  assert.equal(site.DATA.formations.find((f) => f.id === "psup-31359").option, "appro");
});
