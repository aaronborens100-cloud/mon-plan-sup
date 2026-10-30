/*
 * tests/bilan-competences.test.js : lecture d'un « bilan périodique » par compétences (sans note chiffrée).
 *
 * Ce format (Index Education : « Bilan périodique - Trimestre 2 ») n'a ni moyenne ni coefficient : seulement
 * les matières, leur appréciation et l'appréciation générale. Le bilan est FABRIQUÉ (élève, professeurs et
 * textes inventés, positions de colonnes du vrai format) : aucun vrai bulletin dans le dépôt.
 *
 * Lancer : npm test
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { chargerSite } = require("./charger-site");

const L = (y, items) => ({ page: 1, y, texte: items.map((i) => i[1]).join("  "), cellules: items.map((i) => i[1]), items: items.map(([x, s]) => ({ x, y, s, w: s.length * 4 })) });
const bilan = () => [
  L(800, [[110, "LYCEE EXEMPLE"], [292, "Bilan périodique - Trimestre 2"]]),
  L(781, [[133, "1 RUE DU TEST"], [292, "DUPONT Camille"]]),
  L(754, [[139, "Email : contact@exemple.fr"], [292, "1E"], [311, "(28 Élèves)"]]),
  L(727, [[28, "Année scolaire : 2025/2026"]]),
  L(708, [[55, "Matières"], [163, "Compétences évaluées"], [307, "Détail des évaluations"], [394, "Pos."], [468, "Appréciations"]]),
  L(694, [[30, "FRANCAIS"], [411, "Ensemble correct."]]),
  L(688, [[31, "Mme MARTIN"], [411, "Peut mieux faire."]]),
  L(677, [[30, "LLC ANGL.MOND.CONT."], [411, "Un bon trimestre, sérieux."]]),
  L(672, [[411, "A poursuivre."]]),
  L(667, [[31, "Mme DURAND"]]),
  L(659, [[30, "MATHEMATIQUES"], [411, "Très bon trimestre."]]),
  L(649, [[31, "M. LEROY"]]),
  L(603, [[30, "LCA LATIN"], [411, "Texte de la matière inconnue."]]),
  L(594, [[31, "Mme PETIT"]]),
  L(586, [[30, "ANGLAIS LV1"], [411, "Bon travail."]]),
  L(576, [[31, "Mme ROBERT"]]),
  L(548, [[30, "ENSEIGN. SC."]]),
  L(539, [[36, "ENSEIGN.SCIENTIFIQUE"], [411, "Très bon travail"]]),
  L(530, [[37, "Mme BLANC"]]),
  L(521, [[36, "ENSEIGN.SCIENTIFIQUE"], [411, "Assez bon trimestre"]]),
  L(425, [[28, " 4 Très bonne maîtrise  3 Maîtrise satisfaisante  2 Maîtrise fragile"]]),
  L(414, [[30, "Engagements : "]]),
  L(405, [[30, "Absences : 6 demi-journées - Aucun retard"]]),
  L(395, [[30, "Appréciation globale : "], [102, "Un trimestre sérieux."]]),
  L(388, [[36, "Continue ainsi."]]),
  L(29, [[513, "© Index Education 2026"]]),
];

test("bilan par compétences : niveau, période, matières et appréciations lus, sans note inventée", async () => {
  const { B } = await chargerSite();
  const imp = B.analyser(bilan(), "bilan.pdf");
  assert.equal(imp.label, "Première – T2");
  assert.equal(imp.effectif, "28");
  assert.equal(imp.bilanCompetences, true);
  assert.deepEqual(Object.keys(imp.notes), ["francais", "AMC", "maths", "lva", "es"]);
  assert.equal(imp.notes.francais.appreciation, "Ensemble correct. Peut mieux faire.");
  assert.equal(imp.notes.AMC.appreciation, "Un bon trimestre, sérieux. A poursuivre.", "« LLC ANGL.MOND.CONT. » = anglais monde contemporain");
  assert.equal(imp.notes.maths.appreciation, "Très bon trimestre.", "le nom du professeur n'entre pas dans l'appréciation");
  assert.equal(imp.notes.lva.appreciation, "Bon travail.", "le texte d'une matière inconnue n'est pas collé à la matière précédente");
  assert.equal(imp.notes.es.appreciation, "Très bon travail Assez bon trimestre");
  for (const x of Object.values(imp.notes)) assert.equal(x.moy, "", "aucune note chiffrée n'est inventée");
  assert.equal(imp.moyenneGenerale, "");
  assert.equal(imp.appreciationGenerale, "Un trimestre sérieux. Continue ainsi.", "le pied de page « © Index Education » n'en fait pas partie");
  assert.equal(imp.alertes.length, 1);
  assert.match(imp.alertes[0], /pas de notes chiffrées/);
});

test("bilan par compétences : le moteur le compte comme une période sans moyenne", async () => {
  const { E, B } = await chargerSite();
  const imp = B.analyser(bilan(), "bilan.pdf");
  const per = { id: imp.label, label: imp.label, moyenneGenerale: imp.moyenneGenerale, moyenneClasse: imp.moyenneClasse, rang: imp.rang, effectif: imp.effectif, notes: imp.notes, appreciationGenerale: imp.appreciationGenerale, mention: imp.mention, source: "pdf" };
  const s = E.statsProfil({ niveau: "premiere", specialites: [], periodes: [per] });
  assert.equal(s.moyenneGenerale, null);
  assert.deepEqual(s.periodesSansMoyenne, ["Première – T2"]);
  assert.ok(s.appreciations, "les appréciations sont analysées");
});
