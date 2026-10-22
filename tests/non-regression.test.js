/*
 * tests/non-regression.test.js : vérifie que le moteur donne exactement les mêmes résultats
 * que les références enregistrées dans tests/reference/ (règle 5 de CLAUDE.md).
 *
 * Lancer : npm test   (ou : node --test tests/*.test.js)
 *
 * Si un test échoue :
 *   - le changement n'était PAS voulu : c'est une régression, corriger le code ;
 *   - le changement était voulu : régénérer la référence (node tests/generer-reference.js <profil>)
 *     et expliquer dans la pull request ce qui change, avec des exemples avant / après.
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { chargerSite } = require("./charger-site");
const { instantane } = require("./instantane");
const PROFILS = require("./profils");

const DOSSIER = path.join(__dirname, "reference");
let site;

test.before(async () => { site = await chargerSite(); });

for (const p of PROFILS) {
  test(`profil « ${p.id} » : ${p.description}`, async (t) => {
    const fichier = path.join(DOSSIER, p.id + ".json");
    assert.ok(fs.existsSync(fichier), `Pas de référence pour ce profil : lancer node tests/generer-reference.js ${p.id}`);
    const attendu = JSON.parse(fs.readFileSync(fichier, "utf8"));
    const obtenu = JSON.parse(JSON.stringify(instantane(site, p)));

    // Du plus lisible au plus complet : le premier écart signalé est le plus parlant.
    await t.test("profil de l'élève et centres d'intérêt", () => {
      assert.deepEqual(obtenu.statsEleve, attendu.statsEleve);
      assert.deepEqual(obtenu.interets, attendu.interets);
    });
    await t.test("liste des 10 vœux", () => assert.deepEqual(obtenu.voeux, attendu.voeux));
    await t.test("section « Nouvelle formation à la rentrée 2026 »", () => assert.deepEqual(obtenu.nouvelles, attendu.nouvelles));
    await t.test("propositions à l'étranger", () => assert.deepEqual(obtenu.etranger, attendu.etranger));
    await t.test("40 premières recommandations", () => assert.deepEqual(obtenu.top, attendu.top));
    await t.test("chiffres de toutes les formations", () => {
      assert.equal(obtenu.nbFormationsNotees, attendu.nbFormationsNotees, "Le nombre de formations notées a changé.");
      assert.equal(obtenu.empreintes.calculs, attendu.empreintes.calculs, "Un chiffre ou une catégorie a changé pour au moins une formation (hors des 40 premières).");
    });
    await t.test("textes d'explication de toutes les formations", () =>
      assert.equal(obtenu.empreintes.textes, attendu.empreintes.textes, "Une explication affichée à l'élève a changé pour au moins une formation."));
  });
}
