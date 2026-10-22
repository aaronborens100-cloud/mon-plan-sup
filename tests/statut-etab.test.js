/*
 * tests/statut-etab.test.js : statut d'établissement inconnu (issue #26, décision du fondateur : « statut inconnu :
 * la règle ne s'applique pas »).
 *
 *   - Le statut (statut_etab) vient du seul champ tc de Parcoursup : une fiche non liée à Parcoursup a un statut
 *     null, jamais « public » par défaut ; une fiche liée a le statut que donne Parcoursup.
 *   - Une fiche dont le montant des frais n'est pas chiffré affiche son texte de frais tel quel
 *     (exemple : SKEMA, « Programme post-bac », ps-12050).
 *
 * Lancer : npm test
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { chargerSite } = require("./charger-site");
const PROFILS = require("./profils");

const TC_ETAB = { "Publics": "public", "Privés en contrat avec l’Etat / EESC": "prive_sous_contrat", "Privés": "prive" };
let site;
test.before(async () => { site = await chargerSite(); });

test("aucune fiche non liée à Parcoursup n'a de statut d'établissement", () => {
  const nonLiees = site.DATA.formations.filter((f) => !f.__tc);
  assert.ok(nonLiees.length > 500);
  const avecStatut = nonLiees.filter((f) => f.statut_etab != null);
  assert.deepEqual(avecStatut.map((f) => f.id), []);
});

test("fiche liée à Parcoursup : statut donné par le champ tc, jamais supposé", () => {
  const liees = site.DATA.formations.filter((f) => f.__tc);
  assert.ok(liees.length > 9000);
  for (const f of liees) assert.equal(f.statut_etab, TC_ETAB[f.__tc] || null, f.id);
});

test("ps-12050 (SKEMA, Programme post-bac) : statut inconnu, texte des frais affiché tel quel", async () => {
  const f = site.DATA.formations.find((x) => x.id === "ps-12050");
  assert.equal(f.statut_etab, null);
  assert.equal(f.cout.valeur_annuelle_eur, null);
  const p = PROFILS.find((x) => x.id === "fragile");
  const s = await chargerSite({}, { etat: { profil: p.profil, reponses: p.reponses, retenus: [], profilTermine: true, qIndex: 999 } });
  const html = s.afficher("#formation-ps-12050");
  assert.ok(html.includes("Frais de scolarité"), "rubrique des frais absente");
  assert.ok(html.includes("École privée : frais de scolarité élevés, non relevés (voir le site de l&#39;école).")
    || html.includes("École privée : frais de scolarité élevés, non relevés (voir le site de l'école)."), "texte des frais absent ou réécrit");
});
