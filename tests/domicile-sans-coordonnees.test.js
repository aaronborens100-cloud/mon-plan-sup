/*
 * tests/domicile-sans-coordonnees.test.js : mobilité « domicile » et formation sans coordonnées (issue #41).
 *
 * Règle (docs/modele-chances.md, section 8.3, « Règle domicile ») : pour un élève qui a indiqué son lycée et répondu
 * « Non, je veux rester chez mes parents », une formation dont la distance est inconnue (pas de coordonnées) est
 * exclue, comme une formation à plus de 45 km : jamais dans la liste de 10 vœux, ni dans ses équivalents, ni dans la
 * section « Nouvelle formation à la rentrée 2026 », ni en « découverte ».
 * Sans changement : mobilité « proche » (jamais « sécurité », pas d'exclusion), « partout », élève sans lycée.
 *
 * Profil réel de la relecture du 22/10 (issue #41) : terminale au lycée polyvalent de Mauriac (Cantal, UAI 0150747F,
 * data/lieux.json), 11,25 de moyenne, SVT + SES, veut devenir infirmier, « rester chez mes parents », budget gratuit.
 * Sur main cf9846e, le Programme Grande École IÉSEG « Paris-La Défense » (ps-12929, fiche de data/formations.json non
 * liée à Parcoursup) n'avait pas de coordonnées et entrait dans sa liste. Depuis l'issue #48, « Paris-La Défense » est
 * localisée : on rejoue le cas en retirant cette commune de data/lieux.json.
 *
 * Lancer : npm test
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { chargerSite } = require("./charger-site");

function periode(label, moyenne, notes = {}) {
  const n = {};
  for (const [m, v] of Object.entries(notes)) n[m] = { moy: String(v) };
  return { id: label, label, moyenneGenerale: String(moyenne), moyenneClasse: "", rang: "", effectif: "", notes: n, appreciationGenerale: "", mention: "" };
}
// lycée réel, tel que le site l'enregistre quand l'élève le choisit (js/app.js, action « lycee »)
const LIEUX = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "lieux.json"), "utf8"));
const L = LIEUX.lycees.find((l) => l[0] === "0150747F");
const MAURIAC = { type: "lycee", uai: L[0], nom: L[1], commune: L[2], dep: L[3], lat: L[4], lon: L[5] };
const MAURIAC_PROFIL = {
  prenom: "", niveau: "terminale", specialites: ["SVT", "SES"], specialiteAbandonnee: "", optionMaths: "aucune", autresOptions: "",
  anglaisAuto: "B1", periodes: [periode("Terminale – T1", 11.25, { SVT: 11.5, SES: 11 })], bacFrancais: { ecrit: "", oral: "" },
  certifications: [], experiences: [], lycee: MAURIAC,
};
const MAURIAC_REPONSES = { matieres: ["svt"], soigner: 5, vivant: 4, societe: 4, secteurs: ["sante"], concret: 5, maths_niv: "0", ecrit_niv: "1",
  charge: "moyenne", ambition: 2, long: 2, etranger: "non", pays: ["aucun"], budget: "gratuit", lieu: ["regions"], mobilite: "domicile" };
const PGE = "ps-12929";
const MESSAGE = "Tu as indiqué vouloir rester chez tes parents : on ne connaît pas l'adresse de cette formation, on ne peut donc pas vérifier qu'elle est à moins de 45 km de ton lycée.";

// data/lieux.json de main cf9846e : sans la commune « Paris-La Défense » (ajoutée par l'issue #48)
const LIEUX_SANS_LA_DEFENSE = Object.assign({}, LIEUX, { communes: LIEUX.communes.filter((c) => c[0] !== "Paris-La Défense") });

let site, siteAncien;
test.before(async () => {
  site = await chargerSite();
  siteAncien = await chargerSite({ "data/lieux.json": LIEUX_SANS_LA_DEFENSE });
});

const analyser = (s, profil, reponses) => {
  const A = s.E.recommander(s.DATA.formations, profil, s.QUEST, reponses);
  return { A, W: s.E.wishlist(A.resultats, 10, A.interets) };
};
// tout ce que Ma liste propose : la liste, les équivalents de chaque vœu, la section « Nouvelles », les découvertes
function proposees(s, A, W) {
  const eq = [...s.E.equivalentsListe(A.resultats, W).values()].flat();
  const nv = s.E.nouvelles(A.resultats, A.interets);
  const dec = W.liste.filter((x) => W.decouvertes.has(x.f.id));
  return { liste: W.liste, equivalents: eq, nouvelles: nv, decouvertes: dec };
}
const ids = (l) => Array.from(l, (x) => x.f.id);
// copie d'une fiche du catalogue, sans coordonnées (et sans département, pour qu'aucune distance ne soit déduite)
const sansCoordonnees = (f, extra = {}) => Object.assign(Object.create(Object.getPrototypeOf(f)), f, { id: "test-sans-gps-" + f.id, __gps: null, __dep: undefined, __lieu: undefined }, extra);

test("lycée de Mauriac : lycée réel de data/lieux.json", () => {
  assert.equal(MAURIAC.commune, "Mauriac");
  assert.equal(MAURIAC.dep, "Cantal");
  const { A } = analyser(site, MAURIAC_PROFIL, MAURIAC_REPONSES);
  assert.ok(A.stats.geo, "le lycée donne une position");
  assert.equal(A.stats.academie, "Clermont-Ferrand");
  assert.equal(A.interets.prefs.mobilite, 0);
});

test("issue #41 : le PGE de Paris-La Défense sans coordonnées n'entre plus dans la liste de l'élève de Mauriac", () => {
  const { E } = siteAncien;
  const { A, W } = analyser(siteAncien, MAURIAC_PROFIL, MAURIAC_REPONSES);
  const pge = A.resultats.find((x) => x.f.id === PGE);
  assert.ok(pge, "PGE IÉSEG noté");
  assert.equal(pge.dist, null, "sans « Paris-La Défense », la fiche n'a pas de distance (état de main cf9846e)");
  assert.equal(pge.exclu, MESSAGE);
  assert.ok(!ids(W.liste).includes(PGE), "PGE dans la liste");
  for (const [nom, l] of Object.entries(proposees(siteAncien, A, W))) {
    for (const x of l) {
      assert.notEqual(x.dist, null, `${nom} : ${x.f.id} à distance inconnue`);
      assert.ok(E.distanceEquivalente(x.dist, x.traversee) <= 45, `${nom} : ${x.f.id} à ${Math.round(x.dist)} km`);
    }
  }
});

test("élève de Mauriac (données actuelles) : liste après correction, rien à distance inconnue ni à plus de 45 km", () => {
  const { E } = site;
  const { A, W } = analyser(site, MAURIAC_PROFIL, MAURIAC_REPONSES);
  // la liste après correction (3 vœux, 0 « sécurité ») : le rayon de 45 km autour de Mauriac ne laisse pas plus
  assert.deepEqual(ids(W.liste), [
    "dnmade-materiaux-lycee-de-la-communication-saint-geraud-aurillac",
    "psup-23106",
    "dnmade-graphisme-lycee-de-la-communication-saint-geraud-aurillac",
  ]);
  assert.equal(W.protection.nbSecurite, 0);
  for (const [nom, l] of Object.entries(proposees(site, A, W))) {
    for (const x of l) {
      assert.notEqual(x.dist, null, `${nom} : ${x.f.id} à distance inconnue`);
      assert.ok(E.distanceEquivalente(x.dist, x.traversee) <= 45, `${nom} : ${x.f.id} à ${Math.round(x.dist)} km`);
    }
  }
  // toute formation française sans distance est exclue avec le message de la règle (ou un message de frais d'abord)
  for (const x of A.resultats) {
    if (x.dist !== null || x.f.pays !== "France" || E.situer(x.f).etranger) continue;
    assert.ok(x.exclu, `${x.f.id} sans coordonnées non exclue`);
    if (!/^Frais/.test(x.exclu)) assert.equal(x.exclu, MESSAGE, x.f.id);
  }
});

test("fiche construite sans coordonnées : exclue pour « domicile » avec lycée, jamais proposée (liste, équivalents, nouvelles)", () => {
  const { E, DATA, QUEST } = site;
  const s = E.statsProfil(MAURIAC_PROFIL), it = E.interets(QUEST, MAURIAC_REPONSES);
  // une formation de la liste (IFSI Aurillac) et une « nouvelle 2026 » d'une catégorie admise dans la section
  const ifsi = DATA.formations.find((f) => f.id === "psup-23106");
  const nouvelle = DATA.formations.find((f) => f.stats === "nouvelle_2026" && E.reglesHorsListe(f).every((r) => r === "nouvelle_2026") && f.__gps && f.pays === "France");
  assert.ok(ifsi && nouvelle);
  const x1 = E.evaluer(sansCoordonnees(ifsi), s, it);
  const x2 = E.evaluer(sansCoordonnees(nouvelle), s, it);
  for (const x of [x1, x2]) {
    assert.equal(x.dist, null);
    assert.equal(x.exclu, MESSAGE, x.f.id);
  }
  // la même fiche avec ses coordonnées (33 km) reste proposable : seule la distance inconnue est en cause
  assert.equal(E.evaluer(ifsi, s, it).exclu, null);
  // liste et nouvelles : rien de ce qui est exclu
  const { A, W } = analyser(site, MAURIAC_PROFIL, MAURIAC_REPONSES);
  const res = [x1, x2, ...A.resultats];
  const W2 = E.wishlist(res, 10, A.interets);
  assert.ok(!ids(W2.liste).some((id) => id.startsWith("test-sans-gps-")));
  assert.ok(!ids(E.nouvelles(res, A.interets)).some((id) => id.startsWith("test-sans-gps-")));
  // équivalents : même filière et même catégorie que le vœu IFSI, mais exclue
  const voeu = W2.liste.find((x) => x.f.id === "psup-23106");
  assert.ok(voeu);
  assert.ok(!ids(E.equivalents(res, voeu, 10, W2)).some((id) => id.startsWith("test-sans-gps-")));
  assert.deepEqual(ids(W2.liste), ids(W.liste), "la liste ne change pas");
});

test("sans changement : « partout » et élève sans lycée", () => {
  const { E, DATA, QUEST } = site;
  const ifsi = DATA.formations.find((f) => f.id === "psup-23106");
  const f = sansCoordonnees(ifsi);
  // « partout » : pas d'exclusion
  const it = E.interets(QUEST, Object.assign({}, MAURIAC_REPONSES, { mobilite: "partout" }));
  assert.equal(E.evaluer(f, E.statsProfil(MAURIAC_PROFIL), it).exclu, null, "partout");
  // sans lycée : aucune exclusion par la distance
  const sansLycee = Object.assign({}, MAURIAC_PROFIL, { lycee: null });
  const x = E.evaluer(f, E.statsProfil(sansLycee), E.interets(QUEST, MAURIAC_REPONSES));
  assert.equal(x.exclu, null);
});

test("« proche » avec lycée : fiche sans coordonnées exclue (MESSAGE_PROCHE_DISTANCE_INCONNUE), jamais dans les 10 vœux", () => {
  const { E, DATA, QUEST } = site;
  const ifsi = DATA.formations.find((f) => f.id === "psup-23106");
  const reponses = Object.assign({}, MAURIAC_REPONSES, { mobilite: "proche" });
  const x = E.evaluer(sansCoordonnees(ifsi), E.statsProfil(MAURIAC_PROFIL), E.interets(QUEST, reponses));
  assert.equal(x.dist, null);
  assert.equal(x.exclu, E.MESSAGE_PROCHE_DISTANCE_INCONNUE);
  assert.match(x.exclu, /250 km/);
  assert.equal(E.evaluer(ifsi, E.statsProfil(MAURIAC_PROFIL), E.interets(QUEST, reponses)).exclu, null);
  const { A, W } = analyser(site, MAURIAC_PROFIL, reponses);
  assert.equal(W.liste.length, 10);
  for (const r of A.resultats) {
    if (r.dist !== null || r.f.pays !== "France" || E.situer(r.f).etranger) continue;
    assert.ok(r.exclu, `${r.f.id} sans coordonnées non exclue`);
  }
});
