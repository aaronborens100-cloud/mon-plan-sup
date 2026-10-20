/*
 * tests/distance-academie.test.js : académie du lycée, distance continue, note avec décimales, départage.
 *
 * Règles vérifiées (docs/modele-chances.md, section 8) :
 *   - correspondance département → académie : 3 académies en Île-de-France, une seule en Normandie, Corse, DROM ;
 *   - un campus enregistré « France » mais situé à l'étranger (Dauphine Londres) est traité comme étranger ;
 *   - la Corse est loin (traversée) pour un élève de Nice, même à 200 km à vol d'oiseau ;
 *   - pénalité de distance progressive, plus forte pour « domicile » que pour « proche », légère pour « partout » ;
 *   - aucun vœu « sécurité » au-delà de la distance acceptée (45 km, 250 km, aucune limite), pour tous les profils ;
 *   - recommander() et la liste de 10 vœux ne dépendent pas de l'ordre du catalogue ; NaN en dernier ;
 *   - à note égale, la formation de l'académie de l'élève passe devant, puis la plus proche, etc. ;
 *   - sans lycée : ni distance ni académie, et Ma liste affiche MESSAGE_SANS_LYCEE ;
 *   - licence non sélective du secteur de l'élève : règle « licence_secteur » (texte selon la mobilité) ;
 *   - règle « domicile » : avec un lycée, une formation à plus de 45 km (traversée comprise) est exclue ;
 *   - règle « territoires » (question « pays ») : zone du lycée, plus Corse, outre-mer, continent si cochés ; sinon jamais « sécurité ».
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

const NICE = { nom: "Lycée Masséna (Nice)", lat: 43.6985, lon: 7.2737 };
const analyser = (p, formations = site.DATA.formations) => {
  const { E, QUEST } = site;
  const A = E.recommander(formations, p.profil, QUEST, p.reponses);
  return { A, W: E.wishlist(A.resultats, 10, A.interets) };
};
const avecProfil = (p, modif) => Object.assign({}, p, { profil: Object.assign({}, p.profil, modif) });
const avecReponses = (p, modif) => Object.assign({}, p, { reponses: Object.assign({}, p.reponses, modif) });

test("académies : Île-de-France (3), Normandie (1), Corse, DROM", () => {
  const E = site.E;
  assert.equal(E.academieDe("Paris"), "Paris");
  for (const d of ["Seine-et-Marne", "Seine-Saint-Denis", "Val-de-Marne"]) assert.equal(E.academieDe(d), "Créteil", d);
  for (const d of ["Yvelines", "Essonne", "Hauts-de-Seine", "Val-d'Oise", "Val-d'oise"]) assert.equal(E.academieDe(d), "Versailles", d);
  for (const d of ["Calvados", "Eure", "Manche", "Orne", "Seine-Maritime"]) assert.equal(E.academieDe(d), "Normandie", d);
  assert.equal(E.academieDe("Corse-du-Sud"), "Corse");
  assert.equal(E.academieDe("Corse du Sud"), "Corse");
  assert.equal(E.academieDe("Haute-Corse"), "Corse");
  for (const d of ["Guadeloupe", "Martinique", "Guyane", "La Réunion", "Mayotte"]) assert.equal(E.academieDe(d), d);
  assert.equal(E.academieDe("Polynésie française"), null, "vice-rectorat : pas d'académie");
  // Saint-Martin et Saint-Barthélemy relèvent du recteur de l'académie de la Guadeloupe (article D. 271-1)
  assert.equal(E.academieDe("Saint-Martin"), "Guadeloupe");
  assert.equal(E.academieDe("Saint-Barthélemy"), "Guadeloupe");
  assert.equal(E.statsProfil({ periodes: [], lycee: { type: "lycee", uai: "9711252J", nom: "Lycée Robert Weinum", lat: 18.097, lon: -63.0659 } }).academie, "Guadeloupe");
  assert.equal(E.academieDe("Alpes-Maritimes"), "Nice");
  assert.equal(E.academieDe("Bouches-du-Rhône"), "Aix-Marseille");
  // 30 académies, 101 départements (+ Saint-Martin et Saint-Barthélemy), chacun dans une seule académie
  assert.equal(Object.keys(E.ACADEMIES).length, 30);
  const deps = Object.values(E.ACADEMIES).flat();
  assert.equal(deps.length, 103);
  assert.equal(new Set(deps).size, 103);
  // les trois académies d'Île-de-France forment un seul secteur de recrutement des licences
  assert.equal(E.secteurDe("Créteil"), "Île-de-France");
  assert.equal(E.secteurDe("Versailles"), E.secteurDe("Paris"));
  assert.equal(E.secteurDe("Normandie"), "Normandie");
});

test("académie du lycée de l'élève : saisie, code UAI ou coordonnées", () => {
  const E = site.E;
  const s = (lycee) => E.statsProfil({ periodes: [], lycee });
  assert.equal(s(NICE).academie, "Nice", "profil de test (sans département enregistré) : par les coordonnées");
  assert.equal(s({ type: "lycee", uai: "0750654D", nom: "Lycée Henri-IV", lat: 48.8459, lon: 2.3477 }).academie, "Paris");
  assert.equal(s({ type: "commune", nom: "Créteil", lat: 48.7904, lon: 2.4556 }).academie, "Créteil");
  assert.equal(s({ type: "commune", nom: "Versailles", lat: 48.8049, lon: 2.1204 }).academie, "Versailles");
  assert.equal(s({ type: "commune", nom: "Caen", lat: 49.1829, lon: -0.3707 }).academie, "Normandie");
  assert.equal(s({ type: "lycee", nom: "Lycée Fesch", dep: "Corse-du-Sud", lat: 41.9192, lon: 8.7386 }).zone, "Corse");
  const sans = s(null);
  assert.equal(sans.geo, null);
  assert.equal(sans.academie, null);
  assert.equal(sans.zone, null);
});

test("formations : académie d'après le département Parcoursup ; campus à l'étranger enregistrés « France »", () => {
  const { E, DATA } = site;
  const F = (id) => DATA.formations.find((f) => f.id === id);
  const londres = F("ps-12025");   // Dauphine, campus de Londres (fiche éditoriale, ville « Londres »)
  assert.ok(londres && londres.pays === "France");
  assert.equal(E.situer(londres).etranger, true);
  const londresPs = F("psup-25819");   // même campus, fiche Parcoursup (département vide, coordonnées à Londres)
  assert.equal(E.situer(londresPs).etranger, true);
  for (const id of ["psup-25818", "psup-28455", "psup-31816"]) assert.equal(E.situer(F(id)).etranger, true, id);   // Madrid, Singapour, Casablanca
  // un élève qui veut rester chez ses parents : Dauphine Londres est hors de ses critères, jamais à « x km »
  const fragile = PROFILS.find((p) => p.id === "fragile");
  const { A } = analyser(fragile);
  for (const id of ["ps-12025", "psup-25819"]) {
    const x = A.resultats.find((r) => r.f.id === id);
    assert.equal(x.dist, null, id);
    assert.equal(x.exclu, "Tu as indiqué vouloir rester chez tes parents.", id);
    assert.notEqual(x.categorie, "securite");
  }
  // des formations de chaque académie d'Île-de-France sont bien reconnues
  const aca = new Set(DATA.formations.filter((f) => f.pays === "France").map((f) => E.situer(f).academie));
  for (const a of ["Paris", "Créteil", "Versailles", "Normandie", "Corse", "La Réunion"]) assert.ok(aca.has(a), a);
});

test("Corse loin pour un élève de Nice, et inversement", () => {
  const { E, DATA } = site;
  const corte = DATA.formations.find((f) => f.pays === "France" && E.situer(f).zone === "Corse" && f.__gps);
  assert.ok(corte, "aucune formation en Corse");
  const p = avecReponses(PROFILS.find((x) => x.id === "eco-moyen"), { mobilite: "proche" });
  const s = E.statsProfil(p.profil), it = E.interets(site.QUEST, p.reponses);
  const x = E.evaluer(corte, s, it);
  assert.ok(x.dist < 250, `Corse à ${x.dist} km de Nice à vol d'oiseau : test sans portée`);
  assert.equal(x.traversee, true);
  assert.equal(x.horsDistance, true, "au-delà de la distance acceptée malgré moins de 250 km");
  assert.notEqual(x.categorie, "securite");
  assert.ok(x.ajust.some((a) => /de l'autre côté de la mer/.test(a)));
  // pénalité progressive : celle de la distance allongée du surcoût de traversée
  assert.equal(E.penaliteDistance(x.dist, 1, true), E.penaliteDistance(x.dist + E.SURCOUT_TRAVERSEE_KM, 1, false));
  assert.ok(E.penaliteDistance(x.dist, 1, true) < E.PENALITE_DISTANCE[1].plafond, "Corte n'est pas pénalisé comme le bout de la France");
  // et inversement : un élève d'Ajaccio, une formation à Nice
  const ajaccio = Object.assign({}, p.profil, { lycee: { type: "lycee", nom: "Lycée Fesch", dep: "Corse-du-Sud", lat: 41.9192, lon: 8.7386 } });
  const nice = DATA.formations.find((f) => f.pays === "France" && E.situer(f).academie === "Nice" && f.__gps);
  assert.equal(E.evaluer(nice, E.statsProfil(ajaccio), it).traversee, true);
  // pas de traversée sur le continent
  assert.equal(E.evaluer(nice, s, it).traversee, false);
});

test("pénalité de distance progressive selon la mobilité", () => {
  const E = site.E;
  const pen = (d, m) => E.penaliteDistance(d, m, false);
  assert.deepEqual(JSON.parse(JSON.stringify(E.DISTANCE_ACCEPTEE_KM)), { 0: 45, 1: 250, 2: null }, "Infinity devient null en JSON");
  assert.equal(E.DISTANCE_ACCEPTEE_KM[2], Infinity);
  for (const m of [0, 1, 2]) {
    assert.equal(pen(0, m), 0);
    let avant = 0;
    for (let d = 1; d <= 1500; d += 7) { const v = pen(d, m); assert.ok(v >= avant, `mobilité ${m}, ${d} km : pénalité décroissante`); avant = v; }
    assert.ok(pen(100000, m) <= E.PENALITE_DISTANCE[m].plafond);
  }
  // continue : pas de saut à la distance acceptée
  for (const m of [0, 1]) { const L = E.DISTANCE_ACCEPTEE_KM[m]; assert.ok(pen(L + 0.01, m) - pen(L, m) < 0.01); }
  // plus forte pour « domicile » que pour « proche », légère pour « partout »
  for (const d of [30, 100, 200, 400, 700]) assert.ok(pen(d, 0) > pen(d, 1) && pen(d, 1) > pen(d, 2), `${d} km`);
  assert.ok(pen(700, 2) <= 6);
  assert.equal(pen(null, 0), 0, "sans distance, pas de pénalité");
  assert.equal(E.penaliteDistance(100, undefined, false), 0, "sans réponse à la question « mobilite »");
});

for (const p of PROFILS) {
  test(`profil « ${p.id} » : aucun vœu « sécurité » au-delà de la distance acceptée`, () => {
    const { E } = site;
    const { A, W } = analyser(p);
    const mob = A.interets.prefs.mobilite, L = E.DISTANCE_ACCEPTEE_KM[mob];
    const loin = (x) => !!A.stats.geo && (mob === 0 || mob === 1) && (x.traversee || x.dist === null || x.dist > L);
    for (const x of [...W.liste, ...A.resultats]) if (loin(x)) assert.notEqual(x.categorie, "securite", `${x.f.id} : ${x.dist} km`);
    assert.equal(W.protection.nbSecurite, W.liste.filter((x) => x.categorie === "securite" && !loin(x)).length, "protection() ne compte que des vœux à distance acceptée");
    // les mêmes réponses avec chacune des trois mobilités
    for (const m of ["domicile", "proche", "partout"]) {
      const q = avecReponses(p, { mobilite: m }), r = analyser(q);
      const mm = r.A.interets.prefs.mobilite, LL = E.DISTANCE_ACCEPTEE_KM[mm];
      for (const x of r.W.liste) {
        if (!r.A.stats.geo || mm === 2 || x.categorie !== "securite") continue;
        assert.ok(!x.traversee && x.dist !== null && x.dist <= LL, `${m} : ${x.f.id} à ${x.dist} km en « sécurité »`);
      }
    }
  });
}

test("recommander() et la liste de 10 vœux ne dépendent pas de l'ordre du catalogue", () => {
  const { DATA } = site;
  // mélange déterministe (générateur congruentiel), deux graines
  const melanger = (t, graine) => { const a = t.slice(); let g = graine; for (let i = a.length - 1; i > 0; i--) { g = (g * 1103515245 + 12345) % 2147483648; const j = g % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const cle = (x) => [x.f.id, x.pertinence, x.categorie];
  for (const id of ["vide", "eco-moyen", "fragile", "indecis", "droit-sciencespo"]) {
    const p = PROFILS.find((x) => x.id === id);
    const ref = analyser(p);
    for (const graine of [1, 42]) {
      const autre = analyser(p, melanger(DATA.formations, graine));
      assert.deepEqual(autre.A.resultats.map(cle), ref.A.resultats.map(cle), `${id} : recommandations`);
      assert.deepEqual(autre.W.liste.map((x) => x.f.id), ref.W.liste.map((x) => x.f.id), `${id} : liste de 10 vœux`);
    }
    // inversé aussi
    const inv = analyser(p, DATA.formations.slice().reverse());
    assert.deepEqual(inv.W.liste.map((x) => x.f.id), ref.W.liste.map((x) => x.f.id), `${id} : catalogue inversé`);
  }
});

test("note avec décimales, NaN en dernier", () => {
  const { A } = analyser(PROFILS.find((x) => x.id === "eco-moyen"));
  const R = A.resultats;
  assert.ok(R.some((x) => !Number.isInteger(x.pertinence)), "la pertinence n'est plus arrondie");
  assert.ok(R.some((x) => !Number.isInteger(x.interet)) && R.some((x) => !Number.isInteger(x.faisabilite)));
  const premierNaN = R.findIndex((x) => Number.isNaN(x.pertinence));
  assert.ok(premierNaN > 0, "des notes NaN existent aujourd'hui (formations canadiennes) : voir l'issue ouverte");
  assert.ok(R.slice(premierNaN).every((x) => Number.isNaN(x.pertinence)), "toutes les notes NaN sont à la fin");
  for (let i = 1; i < premierNaN; i++) assert.ok(R[i - 1].pertinence >= R[i].pertinence, `ordre décroissant (rang ${i})`);
});

test("départage à note égale : académie, distance, taux, bacheliers généraux, places, code", () => {
  const E = site.E;
  const x = (o) => Object.assign({ pertinence: 70, memeAcademie: false, distTri: 100, repere: { taux: 60 }, f: { id: o.id || "a", __pctBG: 80, __capa: 100, __gta: 10 } }, o, { f: Object.assign({ id: o.id || "a", __pctBG: 80, __capa: 100, __gta: 10 }, o.f || {}) });
  const premier = (a, b) => [a, b].sort(E.comparer)[0].f.id;
  const A = x({ id: "A", memeAcademie: true, distTri: 300 }), B = x({ id: "B", distTri: 5 });
  assert.equal(premier(B, A), "A", "académie de l'élève d'abord, même plus loin");
  assert.equal(premier(x({ id: "A", distTri: 50 }), x({ id: "B", distTri: 40 })), "B", "puis la plus proche");
  assert.equal(premier(x({ id: "A", repere: { taux: 60 } }), x({ id: "B", repere: { taux: 80 } })), "B", "puis le taux d'accès le plus favorable");
  assert.equal(premier(x({ id: "A", f: { __pctBG: 50 } }), x({ id: "B", f: { __pctBG: 90 } })), "B", "puis la part de bacheliers généraux");
  assert.equal(premier(x({ id: "A", f: { __capa: 30 } }), x({ id: "B", f: { __capa: 300 } })), "B", "puis le nombre de places");
  assert.equal(premier(x({ id: "B", f: { __gta: 20 } }), x({ id: "A", f: { __gta: 3 } })), "A", "puis le code Parcoursup");
  assert.equal(premier(x({ id: "B", f: { __gta: null } }), x({ id: "A", f: { __gta: null } })), "A", "puis l'identifiant de la fiche");
  assert.equal(premier(x({ id: "A", distTri: null }), x({ id: "B", distTri: 400 })), "B", "distance inconnue après");
  assert.equal(premier(x({ id: "A", pertinence: NaN }), x({ id: "B", pertinence: 1 })), "B", "NaN en dernier");
  assert.equal(premier(x({ id: "A", pertinence: 70.4 }), x({ id: "B", pertinence: 70.5, memeAcademie: false })), "B", "décimales avant le départage");
  // une traversée passe après toute formation du même côté de la mer
  assert.equal(E.distanceEquivalente(200, true), 200 + E.SURCOUT_TRAVERSEE_KM);
  assert.equal(E.distanceEquivalente(200, false), 200);
});

test("à note égale, la formation de l'académie de l'élève passe devant (vrai catalogue)", () => {
  const { A } = analyser(PROFILS.find((x) => x.id === "eco-moyen"));
  let paires = 0;
  for (let i = 1; i < A.resultats.length; i++) {
    const a = A.resultats[i - 1], b = A.resultats[i];
    if (a.pertinence !== b.pertinence) continue;
    paires++;
    assert.ok(a.memeAcademie || !b.memeAcademie, `${b.f.id} (académie de l'élève) après ${a.f.id}`);
    if (a.memeAcademie === b.memeAcademie && a.distTri !== null && b.distTri !== null) assert.ok(a.distTri <= b.distTri, `${a.f.id} plus loin que ${b.f.id}`);
  }
  assert.ok(paires > 0, "aucune égalité de note : test sans portée");
  assert.equal(A.stats.academie, "Nice");
});

test("sans lycée : ni distance ni académie, message dans Ma liste", async () => {
  const E = site.E;
  assert.equal(E.MESSAGE_SANS_LYCEE, "Indique ton lycée : sans lui, on ne peut pas tenir compte de ton académie ni de la distance.");
  const base = avecReponses(PROFILS.find((x) => x.id === "eco-moyen"), { mobilite: "domicile" });
  const sans = avecProfil(base, { lycee: null });
  const { A, W } = analyser(sans);
  assert.equal(A.stats.academie, null);
  for (const x of A.resultats) {
    assert.equal(x.dist, null); assert.equal(x.memeAcademie, false); assert.equal(x.horsDistance, false);
    assert.ok(!x.ajust.some((a) => /km de chez toi|autre côté de la mer/.test(a)), x.f.id);
  }
  // la règle « au-delà de la distance acceptée » ne s'applique pas : des formations lointaines peuvent rester « sécurité »
  const avec = analyser(base).A;
  assert.ok(A.resultats.filter((x) => x.categorie === "securite").length > avec.resultats.filter((x) => x.categorie === "securite").length);
  assert.equal(W.protection.nbSecurite, W.liste.filter((x) => x.categorie === "securite").length);
  const msg = E.MESSAGE_SANS_LYCEE.replace(/'/g, "&#39;");
  const page = async (p) => (await chargerSite({}, { etat: { profil: p.profil, reponses: p.reponses, retenus: [], profilTermine: true, qIndex: 999 } })).afficher("#liste");
  assert.ok((await page(sans)).includes(msg), "message absent sans lycée");
  assert.ok(!(await page(base)).includes(msg), "message affiché alors que le lycée est renseigné");
});

test("licence non sélective du secteur de l'élève : « dans la moyenne » suffit dès 50 % de taux d'accès", () => {
  const { E, DATA, QUEST } = site;
  const regle = E.REGLES_CATEGORIE.find((g) => g.cle === "licence_secteur");
  assert.ok(regle, "règle licence_secteur absente");
  const ordre = E.REGLES_CATEGORIE.map((g) => g.cle);
  for (const avant of ["nouvelle", "bloquant", "sans_notes_ouverte", "sans_notes", "taux_bas"]) assert.ok(ordre.indexOf(avant) < ordre.indexOf("licence_secteur"), avant);
  const cat = (r) => E.REGLES_CATEGORIE.find((g) => g.si(Object.assign({ taux: null, position: "inconnue", sansNotes: false, secteur: false }, r), false)).categorie;
  assert.equal(cat({ taux: 60, position: "moyenne", secteur: true }), "securite");
  assert.equal(cat({ taux: 60, position: "moyenne", secteur: false }), "realiste");
  assert.equal(cat({ taux: 49, position: "moyenne", secteur: true }), "realiste");
  assert.equal(cat({ taux: 60, position: "en_dessous", secteur: true }), "ambitieux");
  assert.equal(cat({ taux: 60, position: "inconnue", secteur: true }), "realiste");
  assert.match(E.SOURCE_SECTEUR.source, /^https:\/\/www\.parcoursup\.gouv\.fr\//);
  // vrai catalogue : une licence non sélective de l'académie de Nice et une d'ailleurs, mêmes chiffres
  const p = PROFILS.find((x) => x.id === "eco-moyen");
  const s = E.statsProfil(p.profil), it = E.interets(QUEST, p.reponses);
  const lic = DATA.formations.find((f) => f.__selectForm === "formation non sélective" && (f.__tf || []).includes("Licence") && E.situer(f).academie === "Nice" && f.mentions_admis);
  assert.ok(lic, "aucune licence non sélective dans l'académie de Nice");
  const ailleurs = Object.assign(Object.create(Object.getPrototypeOf(lic)), lic, { __dep: "Rhône", __lieu: undefined, __gps: { lat: 45.75, lon: 4.84 } });
  const r1 = E.evaluer(lic, s, it).repere, r2 = E.evaluer(ailleurs, s, it).repere;
  assert.equal(r1.secteur, true);
  assert.equal(r2.secteur, false);
  // une formation sélective n'est jamais « du secteur » : l'académie ne sert qu'à départager
  const sel = DATA.formations.find((f) => f.__selectForm === "formation sélective" && E.situer(f).academie === "Nice");
  assert.equal(E.evaluer(sel, s, it).repere.secteur, false);
  // Île-de-France : un élève de Créteil est du secteur d'une licence de Paris
  const sCreteil = E.statsProfil(Object.assign({}, p.profil, { lycee: { type: "commune", nom: "Créteil", lat: 48.7904, lon: 2.4556 } }));
  const licParis = DATA.formations.find((f) => f.__selectForm === "formation non sélective" && (f.__tf || []).includes("Licence") && E.situer(f).academie === "Paris");
  assert.equal(E.evaluer(licParis, sCreteil, it).repere.secteur, true);
  // sans lycée, jamais
  assert.equal(E.evaluer(lic, E.statsProfil(Object.assign({}, p.profil, { lycee: null })), it).repere.secteur, false);
});

// Traversée progressive : un élève de Corse ou d'outre-mer retrouve d'abord les formations les plus proches de l'autre côté
// de la mer. Même formation (copie), seules les coordonnées et le département changent : seule la distance joue.
for (const [nom, lycee, proches, loin] of [
  ["Ajaccio", { type: "lycee", nom: "Lycée Fesch", dep: "Corse-du-Sud", lat: 41.9177, lon: 8.7337 },
    [["Nice", "Alpes-Maritimes", 43.7, 7.27], ["Marseille", "Bouches-du-Rhône", 43.3, 5.37]], ["Lille", "Nord", 50.63, 3.06]],
  ["Saint-Denis (La Réunion)", { type: "commune", nom: "Saint-Denis", dep: "La Réunion", lat: -20.9, lon: 55.48 },
    [["Mayotte", "Mayotte", -12.78, 45.23]], ["Lille", "Nord", 50.63, 3.06]],
  ["Pointe-à-Pitre", { type: "commune", nom: "Pointe-à-Pitre", dep: "Guadeloupe", lat: 16.24, lon: -61.53 },
    [["Fort-de-France", "Martinique", 14.6, -61.07], ["Bordeaux", "Gironde", 44.84, -0.58]], ["Strasbourg", "Bas-Rhin", 48.58, 7.75]],
]) {
  test(`élève de ${nom} : la traversée est progressive (${proches.map((p) => p[0]).join(", ")} avant ${loin[0]})`, () => {
    const { E, DATA, QUEST } = site;
    // sans réponse à « lieu » ni à « pays » : seule la distance joue (la règle « territoires » est testée à part)
    const p = avecReponses(PROFILS.find((x) => x.id === "sante-svt"), { mobilite: "proche", lieu: [], pays: [] });
    const s = E.statsProfil(Object.assign({}, p.profil, { lycee })), it = E.interets(QUEST, p.reponses);
    const modele = DATA.formations.find((f) => f.id === "psup-8820") || DATA.formations.find((f) => f.pays === "France" && f.__gps && f.mentions_admis);
    const copie = ([ville, dep, lat, lon]) => Object.assign(Object.create(Object.getPrototypeOf(modele)), modele, { id: "test-" + ville, ville, __dep: dep, __gps: { lat, lon }, __lieu: undefined });
    const xs = [...proches, loin].map((l) => E.evaluer(copie(l), s, it));
    const xl = xs[xs.length - 1];
    for (const x of xs.slice(0, -1)) {
      assert.equal(x.traversee || x.f.__dep === lycee.dep, true);
      // au-delà du plafond (outre-mer : toute traversée dépasse 1 000 km), la note est la même et c'est le départage qui joue
      const auPlafond = E.penaliteDistance(x.dist, 1, x.traversee) === E.PENALITE_DISTANCE[1].plafond;
      if (auPlafond) assert.ok(x.interet >= xl.interet, `${x.f.ville} moins bien notée que ${xl.f.ville}`);
      else assert.ok(x.interet > xl.interet, `${x.f.ville} (${Math.round(x.dist)} km) pas mieux notée que ${xl.f.ville} (${Math.round(xl.dist)} km)`);
      assert.ok(x.distTri < xl.distTri, `${x.f.ville} après ${xl.f.ville} au départage`);
      assert.ok([x, xl].sort(E.comparer)[0] === x, `${x.f.ville} classée après ${xl.f.ville}`);
      if (x.traversee) assert.notEqual(x.categorie, "securite", "traversée : jamais « sécurité » pour « proche »");
    }
  });
}

/* ---------------------------------------------------------------- décisions du fondateur du 19-20/10/2026 */

test("licence de secteur : priorité expliquée, jamais « sûre » à cause du secteur (texte selon la mobilité)", async () => {
  const { E, DATA, QUEST } = site;
  const BASE = "Au moins 50 % des candidats ont reçu une proposition et ta moyenne est dans celle des admis. Licence de ton secteur : les candidats de ton académie y sont prioritaires (règle Parcoursup).";
  const PARTIR = `${BASE} Même si tu veux partir, garder ce vœu te protège.`;
  assert.equal(E.REGLES_CATEGORIE.find((g) => g.cle === "licence_secteur").texte, BASE);
  assert.equal(E.texteLicenceSecteur(0), BASE);
  assert.equal(E.texteLicenceSecteur(1), BASE);
  assert.equal(E.texteLicenceSecteur(2), PARTIR);
  // sante-svt (Nice, mobilité « proche ») : Licence de Biologie, Université de Toulon (La Garde)
  const p = PROFILS.find((x) => x.id === "sante-svt");
  const { A, W } = analyser(p);
  const toulon = A.resultats.find((x) => x.f.id === "psup-10369");
  assert.ok(toulon && /Biologie/.test(toulon.f.nom) && toulon.f.ville === "La Garde");
  assert.equal(toulon.repere.regle, "licence_secteur");
  assert.equal(toulon.repere.pourquoi, BASE);
  assert.ok(toulon.repere.pourquoi.startsWith(`Au moins ${E.SEUIL_TAUX_SECURITE} % des candidats ont reçu une proposition`), "le texte commence par la condition");
  assert.deepEqual(toulon.repere.sourceRegle, E.SOURCE_SECTEUR);
  // la fiche affiche la source de la règle (FAQ Parcoursup), dans la forme des autres sources du site
  const s = await chargerSite({}, { etat: { profil: p.profil, reponses: p.reponses, retenus: [], profilTermine: true, qIndex: 999 } });
  const fiche = s.afficher("#formation-" + toulon.f.id);
  assert.ok(fiche.includes(`href="${E.SOURCE_SECTEUR.source}"`), "la fiche contient l'URL de la FAQ Parcoursup");
  assert.match(fiche, /prise-en-compte-du-secteur-geographique" target="_blank" rel="noopener">[^<]+<\/a> · consulté le 19 octobre 2026/);
  assert.ok(W.liste.includes(toulon), "la licence de Toulon sort de la liste de sante-svt");
  for (const t of [toulon.repere.pourquoi, toulon.repere.texte, ...toulon.raisons, ...toulon.ajust]) assert.doesNotMatch(String(t), /sûre/i);
  // aucun texte « licence_secteur » ne dit « sûre », quelle que soit la mobilité
  for (const m of ["domicile", "proche", "partout"]) {
    const q = avecReponses(p, { mobilite: m });
    const xs = E.recommander(DATA.formations, q.profil, QUEST, q.reponses).resultats.filter((x) => x.repere.regle === "licence_secteur");
    for (const x of xs) {
      assert.equal(x.repere.pourquoi, m === "partout" ? PARTIR : BASE);
      assert.doesNotMatch(x.repere.pourquoi, /sûre/i);
    }
  }
});

test("règle « domicile » : avec un lycée, rien à plus de 45 km (fragile) ; sans lycée, les vœux restent", () => {
  const E = site.E;
  const fragile = PROFILS.find((x) => x.id === "fragile");
  assert.equal(fragile.reponses.mobilite, "domicile");
  const { A, W } = analyser(fragile);
  assert.ok(W.liste.length > 0);
  for (const x of W.liste) assert.ok(x.dist !== null && E.distanceEquivalente(x.dist, x.traversee) <= E.DISTANCE_ACCEPTEE_KM[0], `${x.f.ville} à ${x.dist} km`);
  // toute formation au-delà de 45 km (traversée comprise) est exclue, avec la distance dans le message
  for (const x of A.resultats) {
    if (x.dist === null || E.distanceEquivalente(x.dist, x.traversee) <= 45) continue;
    assert.ok(x.exclu, `${x.f.id} (${Math.round(x.dist)} km) non exclue`);
    if (!/^Frais/.test(x.exclu)) assert.equal(x.exclu, `Tu as indiqué vouloir rester chez tes parents : cette formation est à ${Math.round(x.dist)} km de ton lycée.`);
  }
  // la Corse (traversée) est exclue même à moins de 250 km
  const corse = A.resultats.find((x) => x.traversee && x.dist < 250);
  assert.ok(corse && corse.exclu, "Corse non exclue pour « domicile »");
  // sans lycée : aucune exclusion par la distance, la liste reste complète
  const sans = avecProfil(fragile, { lycee: null });
  const B = analyser(sans);
  assert.ok(!B.A.resultats.some((x) => /cette formation est à/.test(x.exclu || "")));
  assert.equal(B.W.liste.length, 10);
});

/* ---------------------------------------------------------------- règle « territoires » (question « pays ») */
// Décision du fondateur du 20/10/2026 : la question « lieu » est celle de main ; la Corse, l'outre-mer et la France
// continentale se cochent dans « Si tu partais, où ? » (question « pays »).

const AJACCIO = { type: "lycee", nom: "Lycée Fesch", dep: "Corse-du-Sud", lat: 41.9192, lon: 8.7386 };
const BASE_NICE = () => PROFILS.find((x) => x.id === "baisse-dernier-trimestre");   // Nice, 10 vœux avec des « sécurité »
const terr = (x) => site.E.territoireDe(x.f);
const SECU = (A, t) => A.resultats.filter((x) => x.categorie === "securite" && x.f.pays === "France" && terr(x) === t);

test("territoires : la question « lieu » est identique à main", () => {
  const q = site.QUEST.questions.find((x) => x.id === "lieu");
  assert.deepEqual(q, {
    id: "lieu", theme: "Budget et lieu", type: "multi", question: "Où aimerais-tu étudier en France ? (plusieurs choix)",
    options: [{ label: "Paris et Île-de-France", value: "idf" }, { label: "Lyon", value: "lyon" }, { label: "Autres régions", value: "regions" }, { label: "Peu importe", value: "partout" }],
    max: 4, aide: null,
  });
  // lieuDe() : la Corse et l'outre-mer comptent dans « regions », comme sur main
  const { E, DATA } = site;
  const une = (zone) => DATA.formations.find((f) => f.pays === "France" && E.situer(f).zone === zone);
  for (const z of ["Corse", "Guadeloupe", "La Réunion"]) assert.equal(E.lieuDe(une(z)), "regions", z);
});

test("territoires : options corse, outremer, continent dans « pays », après Canada et avant « aucun »", () => {
  const q = site.QUEST.questions.find((x) => x.id === "pays");
  const vals = q.options.map((o) => o.value);
  assert.deepEqual(vals.slice(vals.indexOf("Canada")), ["Canada", "corse", "outremer", "continent", "aucun"]);
  const label = (v) => q.options.find((o) => o.value === v).label;
  assert.equal(label("corse"), "Corse");
  assert.equal(label("outremer"), "Outre-mer (Guadeloupe, Martinique, Guyane, La Réunion, Mayotte…)");
  assert.equal(label("continent"), "La France continentale (si tu vis en Corse ou outre-mer)");
  // « Rien d'autre que ce que j'ai coché » se combine avec les autres cases (js/app.js) : toutes peuvent être cochées
  assert.equal(q.max, q.options.length);
  assert.deepEqual([...site.E.TERRITOIRES], ["corse", "outremer", "continent"]);
});

test("territoires : élève de Nice, mobilité et lieu « partout », sans corse ni outremer → aucun « sécurité » en Corse ni outre-mer", () => {
  const p = avecReponses(BASE_NICE(), { lieu: ["partout"], mobilite: "partout", pays: ["Espagne"] });
  const { A, W } = analyser(p);
  assert.equal(SECU(A, "corse").length + SECU(A, "outremer").length, 0);
  assert.ok(!W.liste.some((x) => x.categorie === "securite" && terr(x) !== "continent"));
  const pap = A.resultats.find((x) => x.f.id === "psup-29038");   // Licence de science politique, Pointe-à-Pitre
  assert.equal(pap.categorie, "realiste");
  assert.equal(pap.repere.regle, "hors_territoire");
  assert.equal(pap.repere.pourquoi, "Tu n'as pas coché l'outre-mer dans « Si tu partais, où ? » : ce vœu ne compte pas comme sûr.");
  assert.ok(pap.ajust.includes("ville hors de tes choix"));
  const corse = A.resultats.find((x) => terr(x) === "corse" && x.repere.regle === "hors_territoire");
  if (corse) assert.equal(corse.repere.pourquoi, "Tu n'as pas coché la Corse dans « Si tu partais, où ? » : ce vœu ne compte pas comme sûr.");
  // protection() ne compte que les vœux « sécurité » restants
  assert.equal(W.protection.nbSecurite, W.liste.filter((x) => x.categorie === "securite").length);
  // tous les profils types répondent à « pays » sans ces cases : aucun « sécurité » en Corse ou outre-mer
  for (const q of PROFILS) { const B = analyser(q).A; assert.equal(SECU(B, "corse").length + SECU(B, "outremer").length, 0, q.id); }
});

test("territoires : même élève avec « outremer » coché → Pointe-à-Pitre peut être « sécurité »", () => {
  const p = avecReponses(BASE_NICE(), { lieu: ["partout"], mobilite: "partout", pays: ["outremer"] });
  const pap = analyser(p).A.resultats.find((x) => x.f.id === "psup-29038");
  assert.equal(pap.categorie, "securite");
  assert.equal(pap.horsTerritoire, false);
  assert.ok(!pap.ajust.includes("ville hors de tes choix"));
});

test("territoires : sans réponse à « pays », aucune restriction", () => {
  const p = avecReponses(BASE_NICE(), { lieu: ["partout"], mobilite: "partout", pays: [] });
  const { A } = analyser(p);
  assert.ok(!A.resultats.some((x) => x.horsTerritoire || x.ajust.includes("ville hors de tes choix")));
  assert.equal(A.resultats.find((x) => x.f.id === "psup-29038").categorie, "securite");
  const q = Object.assign({}, p, { reponses: Object.assign({}, p.reponses) }); delete q.reponses.pays;
  assert.deepEqual(analyser(q).A.resultats.map((x) => [x.f.id, x.categorie, x.pertinence]), A.resultats.map((x) => [x.f.id, x.categorie, x.pertinence]));
});

test("territoires : élève d'Ajaccio, pays [Espagne] → aucun « sécurité » sur le continent, la Corse oui ; avec « continent », le continent aussi", () => {
  const base = avecProfil(BASE_NICE(), { lycee: AJACCIO });
  const { A, W } = analyser(avecReponses(base, { lieu: ["partout"], mobilite: "partout", pays: ["Espagne"] }));
  assert.equal(SECU(A, "continent").length, 0);
  assert.ok(SECU(A, "corse").length > 0, "aucune formation corse « sécurité » pour un élève d'Ajaccio");
  assert.ok(!W.liste.some((x) => x.categorie === "securite" && terr(x) === "continent"));
  assert.ok(A.resultats.some((x) => terr(x) === "corse" && !x.horsTerritoire));
  const r = A.resultats.find((x) => terr(x) === "continent" && x.repere.regle === "hors_territoire");
  assert.ok(r, "aucune formation du continent rétrogradée");
  assert.equal(r.repere.pourquoi, "Tu n'as pas coché la France continentale dans « Si tu partais, où ? » : ce vœu ne compte pas comme sûr.");
  assert.ok(r.ajust.includes("ville hors de tes choix"));
  // l'outre-mer reste hors de ses choix
  assert.equal(SECU(A, "outremer").length, 0);
  const B = analyser(avecReponses(base, { lieu: ["partout"], mobilite: "partout", pays: ["Espagne", "continent"] })).A;
  assert.ok(SECU(B, "continent").length > 0, "le continent reste interdit avec « continent » coché");
  assert.ok(!B.resultats.some((x) => terr(x) === "continent" && x.horsTerritoire));
});

test("territoires : un élève de La Réunion garde son territoire, pas les autres territoires d'outre-mer", () => {
  const { E, DATA, QUEST } = site;
  const base = PROFILS.find((x) => x.id === "sante-svt");
  const reunion = E.statsProfil(Object.assign({}, base.profil, { lycee: { type: "commune", nom: "Saint-Denis", dep: "La Réunion", lat: -20.9, lon: 55.48 } }));
  const dans = (zone) => DATA.formations.find((f) => f.pays === "France" && E.situer(f).zone === zone && f.__gps);
  const it = E.interets(QUEST, Object.assign({}, base.reponses, { mobilite: "partout", pays: ["Espagne"] }));
  assert.equal(E.evaluer(dans("La Réunion"), reunion, it).horsTerritoire, false);
  assert.equal(E.evaluer(dans("Mayotte"), reunion, it).horsTerritoire, true);
  assert.equal(E.evaluer(DATA.formations.find((f) => f.id === "psup-10369"), reunion, it).horsTerritoire, true);
  const it2 = E.interets(QUEST, Object.assign({}, base.reponses, { mobilite: "partout", pays: ["outremer", "continent"] }));
  assert.equal(E.evaluer(dans("Mayotte"), reunion, it2).horsTerritoire, false);
  assert.equal(E.evaluer(DATA.formations.find((f) => f.id === "psup-10369"), reunion, it2).horsTerritoire, false);
});

test("territoires : corse, outremer, continent ne sont pas des pays (malus étranger et etranger() inchangés)", () => {
  const { E, QUEST } = site;
  const etr = (A) => A.resultats.filter((x) => x.f.pays !== "France").map((x) => [x.f.id, x.interet, x.exclu, x.ajust.join("|")]);
  // élève qui veut partir, avec des pays cochés : ajouter des territoires ne change rien aux formations étrangères
  const intl = PROFILS.find((x) => x.id === "international-langues");
  const avant = analyser(intl);
  for (const ajout of [["corse"], ["outremer"], ["continent"], ["corse", "outremer", "continent"]]) {
    const apres = analyser(avecReponses(intl, { pays: intl.reponses.pays.concat(ajout) }));
    assert.deepEqual(etr(apres.A), etr(avant.A), ajout.join("+"));
  }
  // élève qui coche seulement « corse » : comme sans réponse à « pays » (pas de « pays non choisi »)
  const sansPays = avecReponses(intl, { pays: [] });
  const A0 = analyser(sansPays), A1 = analyser(avecReponses(intl, { pays: ["corse"] }));
  assert.deepEqual(etr(A1.A), etr(A0.A));
  assert.ok(!A1.A.resultats.some((x) => x.ajust.includes("pays non choisi")));
  // propositions à l'étranger : mêmes résultats d'entrée (vœux français fixes), même sortie
  const it0 = E.interets(QUEST, sansPays.reponses), it1 = E.interets(QUEST, Object.assign({}, intl.reponses, { pays: ["corse"] }));
  const fixe = A0.A.resultats.map((x) => x.f.pays === "France" ? x : A1.A.resultats.find((y) => y.f.id === x.f.id));
  const e0 = E.etranger(fixe, A0.W, it0, "2026-10-20"), e1 = E.etranger(fixe, A0.W, it1, "2026-10-20");
  const resume = (e) => [e.mode, e.liste.map((c) => c.x.f.id)];
  assert.deepEqual(resume(e1), resume(e0));
  assert.notEqual(e1.mode, "non");
  // et sur les vrais calculs (vœux recalculés) : l'élève de Nice garde les mêmes propositions à l'étranger
  const p0 = E.etranger(A0.A.resultats, A0.W, it0, "2026-10-20"), p1 = E.etranger(A1.A.resultats, A1.W, it1, "2026-10-20");
  assert.deepEqual(resume(p1), resume(p0));
});

/* ---------------------------------------------------------------- « Rien d'autre que ce que j'ai coché » (value « aucun »)
   Décision du fondateur du 20/10/2026 : la case se combine avec les autres cases de « pays » et veut dire « aucun autre
   endroit que ce que j'ai coché ». Élève de Nice qui veut partir (« plutot »), mobilité et lieu « partout ». */
const RIEN_D_AUTRE = "Rien d'autre que ce que j'ai coché";
const niceVeutPartir = (pays) => avecReponses(BASE_NICE(), { lieu: ["partout"], mobilite: "partout", etranger: "plutot", pays });
const etudier = (p) => {
  const { A, W } = analyser(p);
  const e = site.E.etranger(A.resultats, W, site.E.interets(site.QUEST, p.reponses), "2026-10-20");
  return { A, W, e, etr: A.resultats.filter((x) => x.f.pays !== "France") };
};

test("« aucun » : libellé « Rien d'autre que ce que j'ai coché », value inchangée, ligne d'aide", () => {
  const q = site.QUEST.questions.find((x) => x.id === "pays");
  const o = q.options[q.options.length - 1];
  assert.deepEqual(o, { label: RIEN_D_AUTRE, value: "aucun" });
  assert.ok(!q.options.some((x) => x.label === "Aucun"));
  assert.equal(q.aide, `Coche « ${RIEN_D_AUTRE} » pour exclure tout le reste.`);
  // aucun texte affiché à l'élève par le moteur ne cite l'ancien libellé « Aucun »
  for (const p of [niceVeutPartir(["aucun"]), niceVeutPartir(["aucun", "Espagne"])]) {
    const { A } = etudier(p);
    assert.ok(!A.resultats.some((x) => /« Aucun »/.test([x.exclu, x.repere && x.repere.pourquoi, ...(x.ajust || [])].join(" "))));
  }
});

test("« aucun » + « outremer » (Nice) : aucune formation étrangère, etranger() « non », outre-mer possible en « sécurité »", () => {
  const { A, e, etr } = etudier(niceVeutPartir(["aucun", "outremer"]));
  assert.ok(etr.length > 0);
  for (const x of etr) assert.equal(x.exclu, "Tu as indiqué vouloir rester en France.", x.f.id);
  assert.equal(e.mode, "non"); assert.equal(e.liste.length, 0);
  const pap = A.resultats.find((x) => x.f.id === "psup-29038");   // Licence de science politique, Pointe-à-Pitre
  assert.equal(pap.categorie, "securite");
  assert.equal(pap.horsTerritoire, false);
  // côté France, « aucun » ne change rien : mêmes résultats qu'avec « outremer » seul
  const B = etudier(niceVeutPartir(["outremer"])).A;
  const fr = (R) => R.resultats.filter((x) => x.f.pays === "France").map((x) => [x.f.id, x.categorie, x.pertinence, x.exclu || null]);
  assert.deepEqual(fr(A), fr(B));
});

test("« outremer » seul (Nice) : l'étranger reste proposé, comme avant", () => {
  const { e, etr } = etudier(niceVeutPartir(["outremer"]));
  assert.ok(!etr.some((x) => x.exclu === "Tu as indiqué vouloir rester en France." || x.exclu === site.E.MESSAGE_AUCUN_AUTRE_PAYS));
  assert.ok(!etr.some((x) => x.ajust.includes("pays non choisi")));
  assert.equal(e.mode, "decouverte");
  assert.equal(e.liste.length, 3);
  // identique à une réponse sans aucun pays (les territoires ne sont pas des pays)
  const e0 = etudier(niceVeutPartir([])).e;
  assert.deepEqual(e.liste.map((c) => c.x.f.id), e0.liste.map((c) => c.x.f.id));
});

test("« aucun » + « Espagne » (Nice) : seule l'Espagne à l'étranger, etranger() limité à l'Espagne", () => {
  const { e, etr } = etudier(niceVeutPartir(["aucun", "Espagne"]));
  const espagne = etr.filter((x) => x.f.pays === "Espagne"), autres = etr.filter((x) => x.f.pays !== "Espagne");
  assert.ok(espagne.length > 0 && autres.length > 0);
  for (const x of autres) assert.equal(x.exclu, "Tu as indiqué ne vouloir aucun autre pays que ceux que tu as cochés.", x.f.id);
  assert.ok(espagne.some((x) => !x.exclu));
  // un pays coché garde le comportement actuel : mêmes calculs qu'avec « Espagne » seul
  const sans = etudier(niceVeutPartir(["Espagne"]));
  const calc = (L) => L.filter((x) => x.f.pays === "Espagne").map((x) => [x.f.id, x.interet, x.exclu || null, x.ajust.join("|")]);
  assert.deepEqual(calc(etr), calc(sans.etr));
  assert.equal(e.mode, "decouverte");
  assert.ok(e.liste.length > 0);
  for (const c of e.liste) assert.equal(c.x.f.pays, "Espagne", c.x.f.id);
  // sans « aucun », etranger() propose aussi d'autres pays
  assert.ok(sans.e.liste.some((c) => c.x.f.pays !== "Espagne"));
  // etranger() filtre aussi seul, même sur des résultats où les autres pays ne seraient pas exclus
  const it = site.E.interets(site.QUEST, niceVeutPartir(["aucun", "Espagne"]).reponses);
  const e2 = site.E.etranger(sans.A.resultats, sans.W, it, "2026-10-20");
  assert.ok(e2.liste.length > 0 && e2.liste.every((c) => c.x.f.pays === "Espagne"));
});

test("« aucun » seul : identique à aujourd'hui (tout l'étranger exclu, etranger() « non »)", () => {
  const { e, etr } = etudier(niceVeutPartir(["aucun"]));
  for (const x of etr) assert.equal(x.exclu, "Tu as indiqué vouloir rester en France.", x.f.id);
  assert.equal(e.mode, "non"); assert.equal(e.liste.length, 0);
  // « aucun » avec les trois territoires : même chose pour l'étranger
  const T = etudier(niceVeutPartir(["aucun", "corse", "outremer", "continent"]));
  assert.deepEqual(T.etr.map((x) => [x.f.id, x.exclu]), etr.map((x) => [x.f.id, x.exclu]));
  assert.equal(T.e.mode, "non");
  // les profils types qui répondent « aucun » le cochent seul (références inchangées)
  for (const p of PROFILS) if ((p.reponses.pays || []).includes("aucun")) assert.deepEqual(p.reponses.pays, ["aucun"], p.id);
});

test("interface : « Rien d'autre que ce que j'ai coché » puis « Outre-mer » garde les deux ; « Peu importe » (lieu) reste exclusif", async () => {
  const base = BASE_NICE();
  const qs = site.QUEST.questions, iPays = qs.findIndex((x) => x.id === "pays"), iLieu = qs.findIndex((x) => x.id === "lieu");
  const reponses = Object.assign({}, base.reponses, { pays: [], lieu: ["idf"] });
  const s = await chargerSite({}, { etat: { profil: base.profil, reponses, retenus: [], profilTermine: false, qIndex: iPays } });
  const coche = (html, q, v) => new RegExp(`value="${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" data-q="${q}" checked`).test(html);
  let html = s.afficher("#questionnaire");
  const echappe = (t) => t.replace(/'/g, "&#39;");   // esc() de js/app.js
  assert.ok(html.includes(echappe(`Coche « ${RIEN_D_AUTRE} » pour exclure tout le reste.`)));
  assert.ok(html.includes(`data-q="pays" >${echappe(RIEN_D_AUTRE)}</label>`));
  html = s.changer({ q: "pays" }, { value: "aucun", checked: true });
  html = s.changer({ q: "pays" }, { value: "outremer", checked: true });
  assert.ok(coche(html, "pays", "aucun") && coche(html, "pays", "outremer"));
  // dans l'autre ordre aussi, et toutes les cases peuvent être cochées ensemble (max = nombre de cases)
  for (const o of qs[iPays].options) if (o.value !== "aucun" && o.value !== "outremer") html = s.changer({ q: "pays" }, { value: o.value, checked: true });
  for (const o of qs[iPays].options) assert.ok(coche(html, "pays", o.value), o.value);
  html = s.changer({ q: "pays" }, { value: "outremer", checked: false });
  assert.ok(coche(html, "pays", "aucun") && !coche(html, "pays", "outremer"));
  // question « lieu » : « Peu importe » décoche toujours les autres cases, et inversement
  html = s.cliquer({ action: "q-aller", i: String(iLieu) });
  assert.ok(coche(html, "lieu", "idf"));
  html = s.changer({ q: "lieu" }, { value: "partout", checked: true });
  assert.ok(coche(html, "lieu", "partout") && !coche(html, "lieu", "idf"));
  html = s.changer({ q: "lieu" }, { value: "lyon", checked: true });
  assert.ok(coche(html, "lieu", "lyon") && !coche(html, "lieu", "partout"));
});
