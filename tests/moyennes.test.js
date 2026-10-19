/*
 * tests/moyennes.test.js : calcul des moyennes du profil (CapEngine.statsProfil) et lecture de la
 * moyenne générale dans un bulletin PDF (CapBulletin.analyser).
 *
 * Règles vérifiées (docs/modele-chances.md, « Comment on calcule ta moyenne ») :
 *   - moyenne générale = moyenne simple des moyennes générales des bulletins, chaque période compte autant ;
 *   - une période sans moyenne générale n'est pas comptée et n'est pas reconstituée à partir des matières ;
 *   - aucun coefficient ;
 *   - maths et maths expertes sont séparées ;
 *   - seuils 10 et 14 de la note de maths expertes (critère « spécialités », prépas ECG maths appliquées) ;
 *   - aucune prédiction : l'ordre des bulletins (hausse ou baisse) ne change rien ;
 *   - l'import PDF et la saisie manuelle donnent la même moyenne pour un même bulletin.
 *
 * Lancer : npm test
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { chargerSite } = require("./charger-site");
const PROFILS = require("./profils");

let site;
// les objets créés dans le site (contexte vm) n'ont pas le même prototype : on les compare en JSON
const plain = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
test.before(async () => { site = await chargerSite(); });

// Une période au format du site ; notes = { matière: moyenne } ou { matière: { moy, coef } }
function periode(label, moyenne, notes = {}) {
  const n = {};
  for (const [m, v] of Object.entries(notes)) n[m] = typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, String(x)])) : { moy: String(v) };
  return { id: label, label, moyenneGenerale: moyenne === null ? "" : String(moyenne), moyenneClasse: "", rang: "", effectif: "", notes: n, appreciationGenerale: "", mention: "" };
}
const profil = (x) => Object.assign({ niveau: "terminale", specialites: ["maths", "SES"], specialiteAbandonnee: "HGGSP", optionMaths: "expertes", periodes: [], certifications: [], experiences: [] }, x);

test("moyenne générale : moyenne simple des périodes, chacune avec le même poids", () => {
  const s = site.E.statsProfil(profil({ periodes: [periode("Première – T1", 10), periode("Première – T2", 12), periode("Terminale – T1", 17)] }));
  assert.equal(site.E.POIDS_PERIODE, 1);
  assert.equal(s.moyenneGenerale, 13);
  assert.deepEqual(s.moyennePeriodes, ["Première – T1", "Première – T2", "Terminale – T1"]);
  assert.deepEqual(s.periodesSansMoyenne, []);
  // le dernier bulletin est gardé à part
  assert.deepEqual(plain(s.dernierBulletin), { moyenne: 17, periode: "Terminale – T1" });
});

test("moyenne générale : les bulletins de seconde ne comptent pas quand il y en a de première ou de terminale", () => {
  const s = site.E.statsProfil(profil({ periodes: [periode("Seconde – T3", 8), periode("Première – T3", 12), periode("Terminale – T1", 14)] }));
  assert.equal(s.moyenneGenerale, 13);
  assert.deepEqual(s.moyennePeriodes, ["Première – T3", "Terminale – T1"]);
  const seconde = site.E.statsProfil(profil({ niveau: "seconde", periodes: [periode("Seconde – T1", 11), periode("Seconde – T2", 12)] }));
  assert.equal(seconde.moyenneGenerale, 11.5);
});

test("période sans moyenne générale : non comptée, jamais reconstituée à partir des matières (maths expertes comprises)", () => {
  const s = site.E.statsProfil(profil({ periodes: [periode("Terminale – T1", 12),
    periode("Terminale – T2", null, { maths: 18, maths_expertes: 20, SES: 19, philosophie: 17 })] }));
  assert.equal(s.moyenneGenerale, 12, "la période sans moyenne générale ne doit pas compter");
  assert.deepEqual(s.moyennePeriodes, ["Terminale – T1"]);
  assert.deepEqual(s.periodesSansMoyenne, ["Terminale – T2"]);
  assert.deepEqual(plain(s.dernierBulletin), { moyenne: 12, periode: "Terminale – T1" });
  // ses notes comptent quand même dans les moyennes de maths et de maths expertes
  assert.equal(s.maths, 18);
  assert.equal(s.expertes, 20);
  assert.equal(site.E.MESSAGE_SANS_MOYENNE("Tle T2"), "Moyenne générale non renseignée pour Tle T2 : ajoute-la depuis ton bulletin.");
  // aucune moyenne générale saisie : pas de moyenne du tout
  const rien = site.E.statsProfil(profil({ periodes: [periode("Terminale – T1", null, { maths: 15, SES: 14 })] }));
  assert.equal(rien.moyenneGenerale, null);
  assert.equal(rien.dernierBulletin, null);
});

test("aucun coefficient : les coefficients saisis ne changent aucune moyenne", () => {
  const notes = (c) => ({ maths: { moy: 16, coef: c }, maths_expertes: { moy: 9, coef: c * 2 }, SES: { moy: 11, coef: 1 } });
  const a = site.E.statsProfil(profil({ periodes: [periode("Terminale – T1", 13, notes(1)), periode("Terminale – T2", null, notes(1))] }));
  const b = site.E.statsProfil(profil({ periodes: [periode("Terminale – T1", 13, notes(8)), periode("Terminale – T2", null, notes(8))] }));
  for (const k of ["moyenneGenerale", "maths", "expertes", "dernierBulletin", "periodesSansMoyenne"]) assert.deepEqual(a[k], b[k], k);
  assert.equal(a.moyenneGenerale, 13);
});

test("maths et maths expertes : deux moyennes séparées, sans mélange", () => {
  const s = site.E.statsProfil(profil({ periodes: [periode("Première – T3", 13, { maths: 12 }),
    periode("Terminale – T1", 14, { maths: 14, maths_expertes: 18 }), periode("Terminale – T2", 14, { maths: 13, maths_expertes: 17 })] }));
  assert.equal(s.maths, 13, "maths = moyenne simple de la spécialité (12, 14, 13)");
  assert.equal(s.mathsMatiere, "maths");
  assert.deepEqual(s.mathsPeriodes, ["Première – T3", "Terminale – T1", "Terminale – T2"]);
  assert.equal(s.expertes, 17.5, "maths expertes = moyenne simple des périodes où l'option est suivie");
  assert.deepEqual(s.expertesPeriodes, ["Terminale – T1", "Terminale – T2"]);
  // sans spécialité maths : les maths complémentaires, signalées comme telles
  const c = site.E.statsProfil(profil({ specialites: ["SES", "HGGSP"], specialiteAbandonnee: "maths", optionMaths: "complementaires",
    periodes: [periode("Première – T3", 11, { maths: 9 }), periode("Terminale – T1", 12, { maths_complementaires: 11.5 })] }));
  assert.equal(c.maths, 11.5);
  assert.equal(c.mathsMatiere, "maths_complementaires");
  assert.deepEqual(c.mathsPeriodes, ["Terminale – T1"]);
  assert.equal(c.expertes, null);
});

test("critère spécialités : seuils 10 et 14 de la note de maths expertes", () => {
  const { E, DATA, QUEST } = site;
  assert.equal(E.SEUIL_EXPERTES_FAIBLE, 10);
  assert.equal(E.SEUIL_EXPERTES_FORT, 14);
  const f = DATA.formations.find((x) => x.type === "prepa_ecg" && (x.specialites || {}).maths_expertes === "indispensable");
  assert.ok(f, "une prépa ECG qui demande l'option maths expertes");
  const base = PROFILS.find((x) => x.id === "ecg-expertes-fort").profil;
  const it = E.interets(QUEST, {});
  const crit = (note) => {
    const p = Object.assign({}, base, { periodes: [periode("Terminale – T1", 14, note === null ? { maths: 14 } : { maths: 14, maths_expertes: note })] });
    return E.evaluer(f, E.statsProfil(p), it).crit.specialites;
  };
  const sansNote = crit(null);
  assert.ok(!/Maths expertes :/.test(sansNote.texte));
  const c = (n) => [crit(n).niveau, crit(n).texte.match(/Maths expertes : [^.]*\./)[0]];
  assert.deepEqual(c(9.9), ["renforcer", "Maths expertes : 9,9 (à renforcer)."]);
  assert.deepEqual(c(10), [sansNote.niveau, "Maths expertes : 10 (conforme)."]);
  assert.deepEqual(c(13.9), [sansNote.niveau, "Maths expertes : 13,9 (conforme)."]);
  assert.deepEqual(c(14), ["fort", "Maths expertes : 14 (atout fort)."]);
  assert.deepEqual(c(14.5), ["fort", "Maths expertes : 14,5 (atout fort)."]);
});

test("prépa ECG maths appliquées : « tes maths te permettent l'option approfondies » seulement sans maths expertes sous 10", () => {
  const { E, DATA, QUEST } = site;
  const f = DATA.formations.find((x) => x.type === "prepa_ecg" && x.option === "appli");
  const base = PROFILS.find((x) => x.id === "ecg-expertes-faible").profil;
  const it = E.interets(QUEST, {});
  const ajust = (exp) => E.evaluer(f, E.statsProfil(Object.assign({}, base, { periodes: [periode("Terminale – T1", 14, { maths: 15, maths_expertes: exp })] })), it).ajust;
  assert.ok(ajust(12).includes("tes maths te permettent l'option approfondies"));
  assert.ok(!ajust(9.5).includes("tes maths te permettent l'option approfondies"));
});

test("aucune prédiction : un dernier bulletin en hausse ou en baisse donne la même moyenne et les mêmes catégories", () => {
  const { E, DATA, QUEST } = site;
  const hausse = profil({ periodes: [periode("Première – T3", 10), periode("Terminale – T1", 12), periode("Terminale – T2", 17)] });
  const baisse = profil({ periodes: [periode("Première – T3", 17), periode("Terminale – T1", 12), periode("Terminale – T2", 10)] });
  const sh = E.statsProfil(hausse), sb = E.statsProfil(baisse);
  assert.equal(sh.moyenneGenerale, sb.moyenneGenerale);
  assert.notDeepEqual(sh.dernierBulletin, sb.dernierBulletin);
  const cats = (p) => E.recommander(DATA.formations, p, QUEST, {}).resultats.map((r) => r.f.id + ":" + r.categorie + ":" + r.repere.percentile).sort();
  assert.deepEqual(cats(hausse), cats(baisse));
});

// Un bulletin PDF « lu » : lignes de texte avec leur position, comme les renvoie CapBulletin.lignesPdf
const ligne = (y, cellules) => ({ page: 1, y, texte: cellules.map((c) => c[1]).join("  "), cellules: cellules.map((c) => c[1]),
  items: cellules.map(([x, s]) => ({ x, y, s, w: s.length * 5 })) });
function bulletinPdf(avecMoyenne) {
  const l = [ligne(800, [[40, "Lycée Masséna - Nice"]]), ligne(780, [[40, "Bulletin du 2e trimestre - Année scolaire 2026-2027"]]), ligne(760, [[40, "Classe : Tle G2"]]),
    ligne(720, [[40, "Mathématiques"], [250, "4"], [300, "13,50"], [350, "11,20"], [400, "Bon trimestre"]]),
    ligne(700, [[40, "Mathématiques expertes"], [250, "3"], [300, "17,00"], [350, "12,00"], [400, "Très bien"]]),
    ligne(680, [[40, "Sciences économiques et sociales"], [250, "6"], [300, "14,00"], [350, "12,10"], [400, "Sérieux"]]),
    ligne(660, [[40, "Philosophie"], [250, "4"], [300, "12,00"], [350, "10,50"], [400, "Correct"]])];
  if (avecMoyenne) l.push(ligne(640, [[40, "Moyenne générale"], [300, "14,25"], [350, "11,80"]]));
  return l;
}
// même passage du bulletin importé à la période du profil que dans app.js (action « valider-import »)
const periodeImportee = (imp) => ({ id: imp.label, label: imp.label, moyenneGenerale: imp.moyenneGenerale, moyenneClasse: imp.moyenneClasse, rang: imp.rang, effectif: imp.effectif,
  notes: imp.notes, appreciationGenerale: imp.appreciationGenerale, mention: imp.mention, source: "pdf" });

test("import PDF et saisie manuelle : même moyenne pour un même bulletin", () => {
  const { E, B } = site;
  const manuel = [periode("Terminale – T1", 13), periode("Terminale – T2", 14.25, { maths: 13.5, maths_expertes: 17, SES: 14, philosophie: 12 })];
  const imp = B.analyser(bulletinPdf(true), "bulletin.pdf");
  assert.equal(imp.label, "Terminale – T2");
  assert.equal(Number(imp.moyenneGenerale), 14.25);
  const pdf = [periode("Terminale – T1", 13), periodeImportee(imp)];
  const sm = E.statsProfil(profil({ periodes: manuel })), sp = E.statsProfil(profil({ periodes: pdf }));
  for (const k of ["moyenneGenerale", "moyennePeriodes", "dernierBulletin", "maths", "expertes"]) assert.deepEqual(sp[k], sm[k], k);
  assert.equal(sp.moyenneGenerale, 13.63);
});

test("import PDF sans moyenne générale : aucune moyenne écrite, la période n'est pas comptée, comme en saisie manuelle", () => {
  const { E, B } = site;
  const imp = B.analyser(bulletinPdf(false), "bulletin.pdf");
  assert.equal(imp.moyenneGenerale, "", "l'import ne reconstitue pas de moyenne à partir des matières et des coefficients");
  assert.ok(!("moyenneCalculee" in imp));
  assert.ok(imp.alertes.some((a) => /Moyenne générale non trouvée/.test(a)));
  const manuel = [periode("Terminale – T1", 13), periode("Terminale – T2", null, { maths: 13.5, maths_expertes: 17, SES: 14, philosophie: 12 })];
  const sm = E.statsProfil(profil({ periodes: manuel })), sp = E.statsProfil(profil({ periodes: [periode("Terminale – T1", 13), periodeImportee(imp)] }));
  for (const k of ["moyenneGenerale", "moyennePeriodes", "periodesSansMoyenne", "dernierBulletin", "maths", "expertes"]) assert.deepEqual(sp[k], sm[k], k);
  assert.equal(sp.moyenneGenerale, 13);
  assert.deepEqual(sp.periodesSansMoyenne, ["Terminale – T2"]);
});

/* ---------------------------------------------------------------- corrections de la revue de la PR #12 */
const etatDe = (p) => ({ profil: Object.assign({ prenom: "Test", anglaisAuto: "B1", bacPremiere: {} }, p), reponses: {}, retenus: [], profilTermine: true, qIndex: 999 });
const sansBalises = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/\s+/g, " ");

test("correction 1 : une case vide ou faite d'espaces est absente, jamais 0", () => {
  const s = site.E.statsProfil(profil({ periodes: [periode("Première – T1", "abs"), periode("Première – T2", " "), periode("Terminale – T1", 14)] }));
  assert.equal(s.moyenneGenerale, 14, "avant : 7 (« \" \" » lu comme 0)");
  assert.deepEqual(s.moyennePeriodes, ["Terminale – T1"]);
  assert.deepEqual(s.periodesSansMoyenne, ["Première – T1", "Première – T2"]);
  // même règle pour une note de matière
  const m = site.E.statsProfil(profil({ periodes: [periode("Terminale – T1", 14, { maths: "  ", maths_expertes: "\t" }), periode("Terminale – T2", 14, { maths: 12, maths_expertes: 16 })] }));
  assert.equal(m.maths, 12);
  assert.equal(m.expertes, 16);
});

test("correction 2 : une note hors de 0 à 20 n'est pas comptée et le profil le signale", async () => {
  const { E } = site;
  const per = [periode("Première – T3", 125, { maths: 25 }), periode("Terminale – T1", -3, { maths: 14 }), periode("Terminale – T2", 12, { maths: -1 })];
  const s = E.statsProfil(profil({ periodes: per }));
  assert.equal(s.moyenneGenerale, 12, "ni 61 (125 et -3 comptés), ni 44,67");
  assert.deepEqual(s.moyennePeriodes, ["Terminale – T2"]);
  assert.deepEqual(plain(s.dernierBulletin), { moyenne: 12, periode: "Terminale – T2" });
  assert.equal(s.maths, 14);
  assert.deepEqual(s.mathsPeriodes, ["Terminale – T1"]);
  assert.equal(E.MESSAGE_NOTE_IMPOSSIBLE("Tle T1", 125), "Moyenne de Tle T1 impossible (125) : vérifie-la sur ton bulletin.");
  assert.deepEqual(plain(E.notesImpossibles(profil({ periodes: per }))).map((x) => [x.periode, x.matiere, x.valeur]),
    [["Première – T3", null, 125], ["Première – T3", "maths", 25], ["Terminale – T1", null, -3], ["Terminale – T2", "maths", -1]]);
  // bornes incluses
  assert.equal(E.statsProfil(profil({ periodes: [periode("Terminale – T1", 0), periode("Terminale – T2", 20)] })).moyenneGenerale, 10);
  // dernier bulletin impossible : jamais affiché « Dernier bulletin -3 »
  const p2 = profil({ periodes: [periode("Terminale – T1", 13), periode("Terminale – T2", -3)] });
  assert.deepEqual(plain(E.statsProfil(p2).dernierBulletin), { moyenne: 13, periode: "Terminale – T1" });
  const html = sansBalises((await chargerSite({}, { etat: etatDe(p2) })).afficher("#profil"));
  assert.match(html, /Moyenne de Tle T2 impossible \(-3\) : vérifie-la sur ton bulletin\./);
  assert.doesNotMatch(html, /Dernier bulletin -3/);
  assert.match(html, /Dernier bulletin 13 Tle T1/);
  const donnees = sansBalises((await chargerSite({}, { etat: etatDe(p2) })).afficher("#donnees"));
  assert.match(donnees, /Moyenne de Tle T2 impossible \(-3\)/);
});

test("correction 3 : « Option maths expertes : un atout » absent des points forts si la note est sous le seuil", async () => {
  const atout = "Option maths expertes : un atout pour les prépas";
  const page = async (note) => sansBalises((await chargerSite({}, { etat: etatDe(profil({ periodes: [periode("Terminale – T1", 13, { maths: 14, maths_expertes: note })] })) })).afficher("#profil"));
  assert.ok(!(await page(9.9)).includes(atout), "9,9 < SEUIL_EXPERTES_FAIBLE");
  assert.ok((await page(10)).includes(atout), "10 = SEUIL_EXPERTES_FAIBLE");
  assert.ok((await page(15)).includes(atout));
});

test("correction 4 : les maths complémentaires ne sont pas comparées au repère de maths d'une formation", () => {
  const { E, DATA, QUEST } = site;
  const it = E.interets(QUEST, {});
  const compl = E.statsProfil(profil({ specialites: ["SES", "HGGSP"], specialiteAbandonnee: "maths", optionMaths: "complementaires",
    periodes: [periode("Terminale – T1", 13, { maths_complementaires: 6 })] }));
  assert.equal(compl.mathsMatiere, "maths_complementaires");
  // une vraie licence du catalogue, avec un repère de moyenne et de maths fixé pour le test
  const lic = DATA.formations.find((x) => x.type === "licence" && x.notes && x.notes.maths_cible != null && !x.epreuves_anticipees);
  assert.ok(lic, "une licence avec un repère de maths");
  const f = Object.assign({}, lic, { specialites: {}, notes: Object.assign({}, lic.notes, { moyenne_cible: 12.5, maths_cible: 14 }) });
  const n = E.evaluer(f, compl, it).crit.notes;
  assert.equal(n.ecart, 0.5, "seule la moyenne générale (13 − 12,5) est comparée, pas 6 − 14");
  assert.equal(n.niveau, "conforme");
  assert.ok(n.texte.endsWith(" " + E.MESSAGE_MATHS_COMPL), n.texte);
  assert.equal(E.MESSAGE_MATHS_COMPL, "Repère de maths donné pour la spécialité maths : tes maths complémentaires ne sont pas comparées.");
  // repère de maths seul : rien à comparer
  assert.equal(E.evaluer(Object.assign({}, f, { notes: { maths_cible: 14 } }), compl, it).crit.notes.niveau, "inconnu");
  // la spécialité maths, elle, reste comparée
  const spe = E.statsProfil(profil({ periodes: [periode("Terminale – T1", 13, { maths: 6 })] }));
  assert.equal(E.evaluer(f, spe, it).crit.notes.ecart, -8);
  assert.ok(!E.evaluer(f, spe, it).crit.notes.texte.includes(E.MESSAGE_MATHS_COMPL));
  // action « surtout en maths » : jamais pour les maths complémentaires
  const faible = E.statsProfil(profil({ specialites: ["SES", "HGGSP"], specialiteAbandonnee: "maths", optionMaths: "complementaires",
    periodes: [periode("Terminale – T1", 11, { maths_complementaires: 9 })] }));
  const actions = (s) => E.evaluer(f, s, it).actions.map((a) => a.texte).join(" | ");
  assert.match(actions(faible), /Gagner environ 1,5 point\(s\) de moyenne d'ici/);
  assert.match(actions(E.statsProfil(profil({ periodes: [periode("Terminale – T1", 11, { maths: 9 })] }))), /\(surtout en maths\)/);
  // prépa ECG maths appliquées : l'ajustement « tes maths te permettent l'option approfondies » ne regarde que la spécialité
  const ecg = DATA.formations.find((x) => x.type === "prepa_ecg" && x.option === "appli");
  const complFort = E.statsProfil(profil({ specialites: ["SES", "HGGSP"], specialiteAbandonnee: "maths", optionMaths: "expertes",
    periodes: [periode("Terminale – T1", 14, { maths_complementaires: 18, maths_expertes: 15 })] }));
  assert.ok(!E.evaluer(ecg, complFort, it).ajust.includes("tes maths te permettent l'option approfondies"));
});

test("correction 5 : spécialité maths abandonnée en fin de première, sans maths complémentaires", async () => {
  const { E } = site;
  const p = profil({ specialites: ["SES", "HGGSP"], specialiteAbandonnee: "maths", optionMaths: "aucune",
    periodes: [periode("Première – T2", 12, { maths: 9 }), periode("Première – T3", 12, { maths: 10 }), periode("Terminale – T1", 13, { SES: 13 })] });
  const s = E.statsProfil(p);
  assert.equal(s.mathsMatiere, "maths");
  assert.equal(s.maths, 9.5);
  assert.deepEqual(s.mathsPeriodes, ["Première – T2", "Première – T3"]);
  assert.equal(E.libelleMaths(s), "Spécialité maths (première)");
  // autres cas : libellés inchangés
  assert.equal(E.libelleMaths(E.statsProfil(profil({ periodes: [periode("Première – T3", 12, { maths: 9 })] }))), "Maths");
  assert.equal(E.libelleMaths(E.statsProfil(Object.assign({}, p, { optionMaths: "complementaires",
    periodes: p.periodes.concat([periode("Terminale – T2", 13, { maths_complementaires: 11 })]) }))), "Maths complémentaires");
  const site2 = await chargerSite({}, { etat: etatDe(p) });
  const resume = sansBalises(site2.afficher("#profil")), donnees = sansBalises(site2.afficher("#donnees"));
  assert.match(resume, /Spécialité maths \(première\) 9,5 1re T2, 1re T3/, "tuile du profil");
  assert.match(donnees, /Spécialité maths \(première\) 9,5 1re T2, 1re T3/, "« Comment on calcule ta moyenne »");
});
