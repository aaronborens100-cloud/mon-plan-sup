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
 *   - licence non sélective du secteur de l'élève : règle « licence_secteur ».
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
  assert.match(E.SOURCE_SECTEUR.url, /^https:\/\/www\.parcoursup\.gouv\.fr\//);
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
    const p = avecReponses(PROFILS.find((x) => x.id === "sante-svt"), { mobilite: "proche" });
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
