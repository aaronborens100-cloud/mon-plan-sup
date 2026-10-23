/*
 * tests/prepas-maths.test.js : prépas scientifiques et spécialité maths (issue #57).
 *
 *   - sans spécialité maths (ni maths complémentaires) : aucune MPSI, PCSI, PTSI ou MP2I, nulle part
 *     (résultats non exclus, 10 vœux, équivalents, nouvelles formations, recommandations) ;
 *   - maths complémentaires sans spécialité maths : jamais « réaliste » ni « sécurité » ;
 *   - spécialité maths : ces prépas restent proposées, règle sans effet ;
 *   - BCPST, TSI, TB et TPC ne sont pas concernées (attendus à confirmer).
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

const PERIODES = [{ id: "T1", label: "Terminale T1", moyenneGenerale: "17", moyenneClasse: "", rang: "", effectif: "", notes: {}, appreciationGenerale: "", mention: "" }];
const eleve = (extra) => Object.assign({ prenom: "", niveau: "terminale", specialites: [], specialiteAbandonnee: "", optionMaths: "aucune", autresOptions: "",
  anglaisAuto: "", periodes: PERIODES, bacFrancais: { ecrit: "", oral: "" }, certifications: [], experiences: [] }, extra);
const analyser = (profil, reponses = {}) => {
  const { E, DATA, QUEST } = site;
  const A = E.recommander(DATA.formations, profil, QUEST, reponses);
  return { A, W: E.wishlist(A.resultats, 10, A.interets), E };
};
const prepas = (E, xs) => xs.filter((x) => E.estPrepaMaths(x.f));

const SANS_MATHS = [
  eleve({ specialites: ["hggsp", "ses"] }),
  eleve({ niveau: "premiere", specialites: ["arts", "llcer", "hlp"] }),
];

test("sans spécialité maths : aucune prépa scientifique, nulle part", () => {
  for (const profil of SANS_MATHS) {
    const { A, W, E } = analyser(profil);
    const toutes = prepas(E, A.resultats);
    assert.ok(toutes.length > 100, "les prépas existent bien dans le catalogue");
    for (const x of toutes) assert.equal(x.exclu, E.MESSAGE_PREPA_SANS_MATHS);
    assert.equal(prepas(E, W.liste).length, 0, "liste de 10 vœux");
    assert.equal(prepas(E, A.resultats.filter((x) => !x.exclu).slice(0, 10)).length, 0, "recommandations");
    assert.equal(prepas(E, E.nouvelles(A.resultats, A.interets)).length, 0, "nouvelles formations");
    for (const v of W.liste) assert.equal(prepas(E, E.equivalents(A, v)).length, 0, "équivalents");
  }
});

test("le texte affiché est honnête et tutoie", () => {
  assert.equal(site.E.MESSAGE_PREPA_SANS_MATHS, "Les prépas scientifiques demandent la spécialité mathématiques en terminale : tu ne la suis pas.");
});

test("maths complémentaires : une prépa scientifique n'est jamais réaliste ni sécurité", () => {
  const { A, W, E } = analyser(eleve({ specialites: ["ses", "hggsp"], optionMaths: "complementaires" }));
  const toutes = prepas(E, A.resultats);
  assert.ok(toutes.length > 100);
  for (const x of toutes) {
    assert.ok(!x.exclu, "pas exclue : l'élève a des maths");
    assert.equal(x.categorie, "ambitieux", x.f.id);
    assert.ok(x.bloque, "point bloquant : " + x.f.id);
    assert.equal(x.crit.specialites.texte, E.MESSAGE_PREPA_COMPL);
  }
  assert.equal(prepas(E, W.liste).length, 0, "jamais dans les 10 vœux");
});

test("avec la spécialité maths : règle sans effet", () => {
  const { A, E } = analyser(eleve({ specialites: ["maths", "physique_chimie", "nsi"], optionMaths: "expertes" }));
  for (const x of prepas(E, A.resultats)) { assert.ok(!x.exclu && !x.bloque, x.f.id); }
});

test("BCPST, TSI, TB et TPC ne sont pas touchées", () => {
  const { A, E } = analyser(SANS_MATHS[0]);
  const autres = A.resultats.filter((x) => x.f.type === "prepa_scientifique" && !E.estPrepaMaths(x.f));
  assert.ok(autres.length > 0);
  for (const x of autres) assert.notEqual(x.exclu, E.MESSAGE_PREPA_SANS_MATHS);
});

test("profils types sans maths : jamais de prépa scientifique dans les 10 vœux", () => {
  for (const p of PROFILS) {
    const s = p.profil;
    if (!s.specialites.length || s.specialites.includes("maths")) continue;
    const { W, E } = analyser(s, p.reponses);
    assert.equal(prepas(E, W.liste).length, 0, p.id);
  }
});
