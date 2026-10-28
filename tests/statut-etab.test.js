/*
 * tests/statut-etab.test.js : statut d'établissement inconnu (issue #26, décision du fondateur : « statut inconnu :
 * la règle ne s'applique pas »).
 *
 *   - Le statut (statut_etab) vient du seul champ tc de Parcoursup : une fiche non liée à Parcoursup a un statut
 *     null, jamais « public » par défaut ; une fiche liée a le statut que donne Parcoursup.
 *   - Une fiche dont le montant des frais n'est pas chiffré affiche son texte de frais tel quel
 *     (exemple : Católica Lisbon, catolica-economics ; la fiche SKEMA ps-12050 a été retirée avec les fiches sans lien Parcoursup).
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

test("catolica-economics (Católica Lisbon) : statut inconnu, texte des frais affiché tel quel", async () => {
  const f = site.DATA.formations.find((x) => x.id === "catolica-economics");
  assert.equal(f.statut_etab, null);
  assert.equal(f.cout.valeur_annuelle_eur, null);
  const p = PROFILS.find((x) => x.id === "fragile");
  const s = await chargerSite({}, { etat: { profil: p.profil, reponses: p.reponses, retenus: [], profilTermine: true, qIndex: 999 } });
  const html = s.afficher("#formation-catolica-economics");
  assert.ok(html.includes("Frais de scolarité"), "rubrique des frais absente");
  assert.ok(html.includes("École privée : frais propres au programme, non relevés."), "texte des frais absent ou réécrit");
});
