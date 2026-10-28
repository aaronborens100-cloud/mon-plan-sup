/*
 * tests/fiches-sans-lien.test.js : retrait des fiches maison françaises (règle 2) et sort des vœux enregistrés.
 *
 * Depuis la PR I, data/fusion.json est remplacé par data/anciennes-fiches.json : les fiches maison françaises (fusionnées avec
 * Parcoursup ou non) ont toutes disparu de data/formations.json ; redirections = ancien identifiant -> psup-<code>,
 * retirees = anciens identifiants sans formation Parcoursup de remplacement.
 *
 * Vœux enregistrés : un identifiant retiré reste valide.
 *   - ancien identifiant avec cible affichée : redirigé vers la formation Parcoursup ;
 *   - ancien identifiant sans cible : le vœu est retiré de la liste, avec un message à l'élève.
 *
 * Lancer : npm test
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { chargerSite } = require("./charger-site");
const PROFILS = require("./profils");

const AN = require("../data/anciennes-fiches.json");
const MESSAGE = "Une formation de ta liste n'est plus proposée par Mon Plan Sup (fiche sans correspondance Parcoursup). Elle a été retirée de ta liste.";
const P = PROFILS[0];
const ETAT = (retenus) => ({ profil: P.profil, reponses: P.reponses, retenus, profilTermine: true, qIndex: 999 });

let site;
test.before(async () => { site = await chargerSite(); });


test("un vœu sur une ancienne fiche à correspondance probable (P) est redirigé vers psup-<code>", async () => {
  const ids = new Set(site.CAT.map((e) => e.id));
  const [id, cible] = Object.entries(AN.redirections).find(([i, c]) => i.startsWith("ps-") && ids.has(c) && !site.CAT.some((e) => e.id === i));
  const s = await chargerSite({}, { etat: ETAT([id]) });
  assert.deepEqual(s.etatEnregistre().retenus, [cible]);
  // le lien #formation-<ancien id> mène à la même fiche
  assert.match(s.afficher("#formation-" + id), new RegExp(site.CAT.find((e) => e.id === cible).nom.slice(0, 20).replace(/[()[\].*+?^${}|\\]/g, "\\$&")));
});

test("un vœu sur une ancienne fiche sans formation Parcoursup de remplacement est retiré, avec un message affiché une seule fois", async () => {
  const id = AN.retirees.find((i) => i.startsWith("ps-"));
  const s = await chargerSite({}, { etat: ETAT([id]) });
  assert.deepEqual(s.etatEnregistre().retenus, []);
  const page = s.afficher("#liste");
  assert.ok(page.includes(MESSAGE), "message absent");
  assert.ok(!s.afficher("#liste").includes(MESSAGE), "message répété");
});

test("un vœu sur une fiche à l'étranger conservée n'est pas touché, sans message", async () => {
  const id = require("../data/formations.json").formations[0].id;
  const s = await chargerSite({}, { etat: ETAT([id]) });
  assert.ok(!s.afficher("#liste").includes(MESSAGE));
  assert.ok(!s.etatEnregistre() || s.etatEnregistre().retenus.join() === id);
});

test("à l'étranger : le même nombre de fiches qu'avant (519), et ce sont les seules de data/formations.json", () => {
  const toutes = require("../data/formations.json").formations;
  assert.equal(toutes.length, 519);
  assert.ok(toutes.every((f) => f.pays !== "France"));
  assert.equal(site.DATA.formations.filter((f) => toutes.some((g) => g.id === f.id)).length, 519);
});
