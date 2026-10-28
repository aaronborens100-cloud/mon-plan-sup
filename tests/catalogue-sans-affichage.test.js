/*
 * tests/catalogue-sans-affichage.test.js : js/catalogue.js ne dépend d'aucun affichage.
 *
 *   - Il se charge seul (après js/moteur.js) dans un contexte vm sans document, ni localStorage, ni fetch,
 *     et construit le même nombre de formations que le site complet (catalogue affiché).
 *   - Son source ne contient aucune balise HTML, aucun « document » et aucun « esc( ».
 *
 * Lancer : npm test
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { chargerSite } = require("./charger-site");

const RACINE = path.join(__dirname, "..");
const lire = (f) => fs.readFileSync(path.join(RACINE, f), "utf8");
const json = (nom) => JSON.parse(lire(`data/${nom}.json`));

test("catalogue.js se charge seul, sans document, et construit le même catalogue que le site", async () => {
  const fenetre = { console };
  fenetre.window = fenetre;
  const ctx = vm.createContext(fenetre);
  for (const s of ["moteur", "catalogue"]) vm.runInContext(lire(`js/${s}.js`), ctx, { filename: `js/${s}.js` });
  assert.equal(typeof fenetre.document, "undefined");
  const C = fenetre.CapCatalogue;
  assert.ok(C, "window.CapCatalogue publié");
  C.chargerLieux(json("lieux"));
  C.construireCatalogue(json("formations"), json("parcoursup"), json("anciennes-fiches"), json("stats"), json("filieres"),
    json("ajustements"), json("statuts-stats"), json("stats-manuelles"), json("frais-prives"));
  const seul = C.etat().CAT.length;
  const site = await chargerSite();
  assert.ok(seul > 0);
  assert.equal(seul, site.CAT.length);
});

test("le source de catalogue.js ne contient ni HTML, ni document, ni esc", () => {
  const src = lire("js/catalogue.js");
  assert.doesNotMatch(src, /<\/?[a-zA-Z][a-zA-Z0-9]*[\s>\/]/, "balise HTML");
  assert.doesNotMatch(src, /\bdocument\b/);
  assert.doesNotMatch(src, /\besc\s*\(/);
  assert.doesNotMatch(src, /innerHTML/);
});
