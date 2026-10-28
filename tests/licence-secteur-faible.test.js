/*
 * tests/licence-secteur-faible.test.js : élève faible, mobilité « domicile », lycée renseigné (issue #45, relecture E01).
 *
 * Décision d'Aaron : une licence non sélective du secteur de l'élève, à 100 % d'accès en 2025 et avec au moins 50
 * candidats, peut être « sécurité » même sous la moyenne des admis (règle « licence_secteur_ouverte »). Les autres
 * règles (distance, budget, territoire, lycée manquant) s'appliquent ensuite comme pour toute « sécurité ».
 * Sans changement : l'élève sans lycée (issue #43), l'élève fort.
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

const eco = PROFILS.find((x) => x.id === "eco-moyen");
const AUBERVILLIERS = { type: "lycee", uai: "0930116W", nom: "Lycée Henri Wallon", commune: "Aubervilliers", dep: "Seine-Saint-Denis", lat: 48.9114, lon: 2.3883 };
// E01 (relecture du 22/10) : Aubervilliers, académie de Créteil, 9,05 de moyenne, SES + HGGSP, commerce, « rester chez mes parents », gratuit, Île-de-France
const e01 = (lycee = AUBERVILLIERS, mobilite = "domicile") => ({
  profil: Object.assign({}, eco.profil, { lycee, periodes: [Object.assign({}, eco.profil.periodes[1], { moyenneGenerale: "9.05" })] }),
  reponses: Object.assign({}, eco.reponses, { budget: "gratuit", lieu: ["idf"], mobilite }),
});
const analyser = (p) => {
  const A = site.E.recommander(site.DATA.formations, p.profil, site.QUEST, p.reponses);
  return { A, W: site.E.wishlist(A.resultats, 10, A.interets) };
};
const nbSecurite = (l) => l.filter((x) => x.categorie === "securite").length;
const OUVERTE = "licence_secteur_ouverte";

test("E01 : la liste de 10 vœux contient au moins une licence de secteur de son domaine, en « sécurité »", () => {
  const { A, W } = analyser(e01());
  const sures = W.liste.filter((x) => x.repere.regle === OUVERTE);
  assert.ok(sures.length >= 1, "aucune licence de secteur sûre");
  assert.ok(nbSecurite(W.liste) >= 1);
  for (const x of sures) {
    assert.equal(x.categorie, "securite");
    assert.equal(x.repere.secteur, true);
    assert.equal(x.repere.taux, 100);
    assert.ok(x.f.admission.candidats >= 50);
    assert.equal(x.repere.position, "en_dessous", "le cas testé est bien celui d'un élève sous la moyenne des admis");
    assert.ok(!x.exclu && !x.horsDistance);
    assert.deepEqual(x.repere.sourceRegle, site.E.SOURCE_SECTEUR);
    assert.doesNotMatch(x.repere.pourquoi, /sûre/i);
    assert.match(x.repere.pourquoi, /en dessous de celle des admis/);
  }
  assert.ok(sures.some((x) => x.f.domaines.includes("gestion_commerce")), "aucune licence de secteur sûre du domaine commerce");
  assert.ok(A.resultats.some((x) => x.repere.regle === OUVERTE));
});

test("élève faible + domicile + lycée : au moins une licence de secteur sûre dans la liste, avec les lycées d'Île-de-France", () => {
  const { ACADEMIES_IDF } = { ACADEMIES_IDF: ["Paris", "Créteil", "Versailles"] };
  for (const lycee of [AUBERVILLIERS, { type: "lycee", uai: "x", nom: "Lycée de Versailles", commune: "Versailles", dep: "Yvelines", lat: 48.8049, lon: 2.1204 }]) {
    const { W } = analyser(e01(lycee));
    const sures = W.liste.filter((x) => x.repere.regle === OUVERTE);
    assert.ok(sures.length >= 1, `${lycee.commune} : aucune licence de secteur sûre`);
    for (const x of sures) assert.ok(ACADEMIES_IDF.includes(site.E.situer(x.f).academie));
  }
});

test("plancher de 50 candidats : à 49 candidats la licence n'est plus « sécurité », à 50 elle l'est", () => {
  const { E, QUEST } = site;
  const p = e01();
  const { A } = analyser(p);
  const lic = A.resultats.find((x) => x.repere.regle === OUVERTE && !x.exclu).f;
  const s = E.statsProfil(p.profil), it = E.interets(QUEST, p.reponses);
  const avec = (candidats) => {
    const f = Object.assign(Object.create(Object.getPrototypeOf(lic)), lic, { admission: Object.assign({}, lic.admission, { candidats }) });
    return E.evaluer(f, s, it);
  };
  assert.equal(avec(50).categorie, "securite");
  assert.equal(avec(49).categorie, "realiste");
  assert.equal(avec(49).repere.regle, "tres_ouverte_en_dessous");
  // 100 % obligatoire : à 99 % la règle ne joue pas
  const f99 = Object.assign(Object.create(Object.getPrototypeOf(lic)), lic, { admission: Object.assign({}, lic.admission, { taux: 99 }) });
  assert.notEqual(E.evaluer(f99, s, it).repere.regle, OUVERTE);
});

test("règle dans la table : après « licence_secteur », avant « tres_ouverte_en_dessous » ; ni hors secteur, ni sans notes, ni au-dessus", () => {
  const { E } = site;
  const ordre = E.REGLES_CATEGORIE.map((g) => g.cle);
  for (const avant of ["nouvelle", "bloquant", "sans_notes_ouverte", "sans_notes", "taux_bas", "licence_secteur"]) assert.ok(ordre.indexOf(avant) < ordre.indexOf(OUVERTE), avant);
  assert.ok(ordre.indexOf(OUVERTE) < ordre.indexOf("tres_ouverte_en_dessous"));
  const f = { admission: { candidats: 60 } };
  const cat = (r, fiche = f) => E.REGLES_CATEGORIE.find((g) => g.si(Object.assign({ taux: null, position: "inconnue", sansNotes: false, secteur: false }, r), false, fiche)).categorie;
  assert.equal(cat({ taux: 100, position: "en_dessous", secteur: true }), "securite");
  assert.equal(cat({ taux: 100, position: "en_dessous", secteur: false }), "realiste");
  assert.equal(cat({ taux: 100, position: "en_dessous", secteur: true }, { admission: { candidats: 49 } }), "realiste");
  assert.equal(cat({ taux: 100, position: "en_dessous", secteur: true }, null), "realiste");
  assert.equal(cat({ taux: 100, position: "inconnue", secteur: true }), "realiste");
  assert.equal(cat({ taux: 99, position: "en_dessous", secteur: true }), "realiste");
  assert.equal(cat({ taux: 100, position: "en_dessous", secteur: true, sansNotes: true }), "realiste");
});

test("lycée renseigné mais licence trop loin pour « domicile » : jamais « sécurité » (les règles de distance passent après)", () => {
  const { A } = analyser(e01());
  for (const x of A.resultats.filter((y) => y.repere.regle === OUVERTE)) assert.ok(!x.horsDistance);
  // en mobilité « proche », une licence à plus de 250 km n'est jamais sûre
  const q = analyser(e01(AUBERVILLIERS, "proche"));
  for (const x of q.A.resultats.filter((y) => y.repere.regle === OUVERTE)) assert.ok(!x.horsDistance);
});

test("sans lycée + domicile : toujours aucun vœu « sécurité » (issue #43 inchangée)", () => {
  const { A, W } = analyser(e01(null));
  assert.equal(nbSecurite(A.resultats), 0);
  assert.equal(nbSecurite(W.liste), 0);
  assert.equal(A.resultats.filter((x) => x.repere.regle === OUVERTE).length, 0);
});

test("élève fort : la règle ne s'applique à aucune formation (position au-dessus ou dans la moyenne)", () => {
  for (const id of ["eco-excellent-decide", "sciences-ingenieur", "droit-sciencespo"]) {
    const p = PROFILS.find((x) => x.id === id);
    const { A } = analyser(p);
    assert.equal(A.resultats.filter((x) => x.repere.regle === OUVERTE).length, 0, id);
  }
});
