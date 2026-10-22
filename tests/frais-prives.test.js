/*
 * tests/frais-prives.test.js : frais réels des formations privées (relevé des fiches Parcoursup, 21-22/10/2026,
 * data/frais-prives.json construit par scripts/construire-frais-prives.py).
 *
 *   - frais connus sous le budget : plus de malus ni de message « frais inconnus » ;
 *   - fourchette (min ≤ budget < max) : pas de malus, jamais « sécurité », message « Les frais vont de X € à Y € » ;
 *   - budget < min : règle normale sur le min (malus, exclusion si min > 2 × budget avec un budget ≤ 5 000) ;
 *   - formation privée absente du relevé : règle « prive_frais_inconnus » inchangée ;
 *   - IFSI et travail social : libellé « Droits d'inscription et participation annuelle » ;
 *   - francs CFP, dirhams, montants par mois : jamais retenus (frais inconnus) ;
 *   - apprentissage : texte affiché, jamais « gratuit » ni 0 € ;
 *   - « Formation publique quasi gratuite » jamais pour un établissement privé ;
 *   - règles de détection du script (nature de la fourchette, libellé, exclusions) et fichier à jour.
 *
 * Lancer : npm test
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");
const { chargerSite } = require("./charger-site");
const PROFILS = require("./profils");

const RACINE = path.join(__dirname, "..");
const FP = JSON.parse(fs.readFileSync(path.join(RACINE, "data/frais-prives.json"), "utf8"));
const MESSAGE_INCONNUS = "Établissement privé : vérifie les frais avant de le mettre dans tes vœux, ils peuvent dépasser ton budget.";
const QUASI_GRATUITE = "Formation publique quasi gratuite.";

let site;
test.before(async () => { site = await chargerSite(); });

const profil = (id) => PROFILS.find((x) => x.id === id);
const avecReponses = (p, modif) => Object.assign({}, p, { reponses: Object.assign({}, p.reponses, modif) });
const fiche = (gta) => site.DATA.formations.find((f) => String(f.__gta) === String(gta));
// fiche réelle évaluée pour un profil, avec des modifications éventuelles (frais, statut)
const evaluer = (p, f, modif = {}) => {
  const { E, QUEST } = site;
  const A = E.recommander([], p.profil, QUEST, p.reponses);
  const g = Object.assign(Object.create(Object.getPrototypeOf(f)), f, modif);
  return E.evaluer(g, A.stats, A.interets);
};
const cout = (min, max, autres = {}) => Object.assign({ valeur_annuelle_eur: max, min, max, statut: "releve_parcoursup", nature_fourchette: min < max ? "revenus" : null, libelle: "cout" }, autres);
// une formation privée liée à Parcoursup, notée normalement, pour comparer à elle-même
const base = () => {
  const p = profil("fragile");
  const { E, DATA, QUEST } = site;
  const A = E.recommander(DATA.formations, p.profil, QUEST, p.reponses);
  return A.resultats.find((x) => x.f.cout && x.f.cout.statut === "releve_parcoursup" && x.f.__tc !== "Publics" && !x.exclu && x.interet > 30 && x.interet < 80
    && x.f.selectivite && x.repere.taux !== null).f;
};

test("fichier : source, date, une entrée par gta retenu, montants en euros par an", () => {
  assert.match(FP.meta.source, /Parcoursup/);
  assert.equal(FP.meta.consulte_le, "2026-10-22");
  assert.equal(FP.meta.nb_lignes, 1241);
  const n = Object.keys(FP.formations).length;
  assert.equal(n, FP.meta.nb_retenues);
  const exclus = Object.values(FP.meta.exclus).reduce((a, l) => a + l.length, 0);
  assert.equal(n + exclus, 1241, "chaque ligne est retenue ou exclue avec un motif");
  for (const [g, x] of Object.entries(FP.formations)) {
    assert.ok(typeof x.min === "number" && typeof x.max === "number" && x.min <= x.max && x.min > 0, g);
    assert.ok(x.par.startsWith("par an"), `${g} : ${x.par}`);
    assert.ok(/^https:\/\/dossierappel\.parcoursup\.fr\//.test(x.source) && /^\d{4}-\d{2}-\d{2}$/.test(x.consulte_le), g);
    assert.ok(["cout", "droits_inscription"].includes(x.libelle), g);
    assert.equal(x.nature_fourchette === null, x.min === x.max, g);
  }
});

test("CFP, dirhams, par mois, non trouvé, à vérifier : frais inconnus (règle actuelle)", () => {
  const E = FP.meta.exclus;
  for (const g of ["12017", "19457", "19503", "49108", "39137"]) assert.ok(E.autre_monnaie.includes(g), `${g} : francs CFP`);
  for (const g of ["31987", "43117"]) assert.ok(E.autre_monnaie.includes(g), `${g} : dirhams`);
  for (const g of ["2997", "8884", "25358", "35928", "8312", "12041"]) assert.ok(E.par_mois_ou_trimestre.includes(g), `${g} : par mois ou par trimestre`);
  assert.ok(E.cursus.includes("37012"), "coût du cursus de 3 ans");
  assert.equal(E.non_trouve.length, 14);
  assert.equal(E.a_verifier.length, 4);
  for (const l of Object.values(E)) for (const g of l) {
    assert.equal(FP.formations[g], undefined, g);
    const f = fiche(g);
    if (f) assert.equal(f.cout.valeur_annuelle_eur, null, `${g} : aucun montant inventé ni converti`);
  }
  // une formation exclue reste « privée aux frais inconnus » pour un budget serré
  const p = profil("fragile"), f = fiche("19457");
  assert.ok(f && f.__tc !== "Publics");
  assert.equal(evaluer(p, f).repere.priveFraisInconnus, true);
});

test("catalogue : chaque formation du relevé reçoit son montant (fiche générée ou fusionnée), relevé prioritaire", () => {
  const parG = new Map(site.DATA.formations.filter((f) => f.__gta !== undefined).map((f) => [String(f.__gta), f]));
  for (const [g, x] of Object.entries(FP.formations)) {
    const f = parG.get(g);
    assert.ok(f, `${g} absent du catalogue`);
    assert.notEqual(f.__tc, "Publics", g);
    assert.equal(f.cout.statut, "releve_parcoursup", g);
    assert.equal(f.cout.valeur_annuelle_eur, x.max, `${g} : un seul nombre = le max`);
    assert.equal(f.cout.min, x.min, g);
    assert.equal(f.cout.source, x.source, g);
    assert.ok(!f.incertitudes.includes("Frais non relevés."), g);
  }
});

test("frais connus sous le budget : ni malus, ni message, la règle « frais inconnus » ne joue plus", () => {
  const p = profil("fragile"), f = base();   // budget « gratuit » = 1 000
  const sous = evaluer(p, f, { cout: cout(800, 800) });
  const inconnu = evaluer(p, f, { cout: { valeur_annuelle_eur: null, statut: "non_communique" } });
  const pub = evaluer(p, f, { cout: cout(800, 800), __tc: "Publics" });
  assert.equal(sous.repere.priveFraisInconnus, false);
  assert.equal(sous.repere.alerteFrais, null);
  assert.ok(!sous.ajust.some((a) => /frais/.test(a)));
  assert.ok(!String(sous.repere.pourquoi).includes(MESSAGE_INCONNUS));
  assert.equal(sous.interet, pub.interet, "même intérêt qu'une formation publique aux mêmes frais");
  assert.equal(sous.categorie, pub.categorie);
  assert.equal(inconnu.repere.priveFraisInconnus, true);
  assert.equal(inconnu.interet, sous.interet - site.E.MALUS_PRIVE_FRAIS_INCONNUS, "le malus ne reste que pour les frais inconnus");
});

test("fourchette (min ≤ budget < max) : pas de malus, jamais « sécurité », message avec la fourchette", () => {
  const { E } = site;
  const p = profil("fragile"), f = base();
  const dedans = evaluer(p, f, { cout: cout(500, 5665) });
  const sous = evaluer(p, f, { cout: cout(500, 500) });
  assert.equal(dedans.interet, sous.interet, "aucun malus dans la fourchette");
  assert.equal(E.REGLE_BUDGET_FOURCHETTE.malus, 0);
  assert.equal(dedans.repere.fraisFourchette, true);
  assert.equal(dedans.repere.priveFraisInconnus, false);
  assert.equal(dedans.repere.alerteFrais, "Les frais vont de 500 € à 5 665 € par an selon tes revenus : vérifie ce que tu paierais avant de le mettre dans tes vœux.".replace(/ /g, " ").replace(/(\d) (\d)/g, "$1 $2"));
  assert.ok(dedans.repere.pourquoi.includes("Les frais vont de"));
  // fourchette selon l'année d'études
  const annee = evaluer(p, f, { cout: cout(500, 1500, { nature_fourchette: "annee" }) });
  assert.match(annee.repere.alerteFrais, /par an selon l'année d'études : vérifie/);
  // « autre » : pas de critère affiché
  const autre = evaluer(p, f, { cout: cout(500, 1500, { nature_fourchette: "autre" }) });
  assert.match(autre.repere.alerteFrais, /par an : vérifie ce que tu paierais/);
  // aucune mention des bourses (décision du fondateur encore ouverte)
  for (const x of [dedans, annee, autre]) assert.ok(!/bours/i.test(x.repere.alerteFrais + x.repere.pourquoi));
  // jamais « sécurité » : sur une formation qui serait « sécurité » avec des frais sous le budget
  // (droit-sciencespo, budget « faible » = 5 000)
  const { DATA, QUEST } = site;
  const q = profil("droit-sciencespo");
  const A = E.recommander(DATA.formations, q.profil, QUEST, q.reponses);
  const sec = A.resultats.find((x) => x.categorie === "securite");
  assert.ok(sec, "cas de test : un vœu « sécurité »");
  const y = evaluer(q, sec.f, { cout: cout(500, 5665), __tc: "Privés" });
  assert.notEqual(y.categorie, "securite");
  assert.equal(y.repere.regle, "frais_fourchette");
  assert.match(y.repere.pourquoi, /^Les frais vont de/);
  // budget au-dessus du max : règle normale, sans message
  const riche = evaluer(avecReponses(q, { budget: "moyen" }), sec.f, { cout: cout(500, 5665), __tc: "Privés" });
  assert.equal(riche.repere.fraisFourchette, false);
  assert.equal(riche.repere.alerteFrais, null);
});

test("budget < min : règle normale appliquée au min (malus 18, ou exclusion si min > 2 × budget)", () => {
  const p = profil("fragile"), f = base();   // budget 1 000
  const ref = evaluer(p, f, { cout: cout(500, 500) });
  const malus = evaluer(p, f, { cout: cout(1500, 6000) });
  assert.equal(malus.exclu, null);
  assert.ok(malus.ajust.includes("frais au-dessus de ton budget"));
  assert.equal(malus.interet, Math.max(0, ref.interet - 18));
  assert.equal(malus.repere.fraisFourchette, false);
  const exclu = evaluer(p, f, { cout: cout(2500, 6000) });
  assert.match(exclu.exclu, /^Frais \(au moins 2.500 €\/an\) au-delà de ton budget\.$/);
  const unique = evaluer(p, f, { cout: cout(2500, 2500) });
  assert.match(unique.exclu, /^Frais \(≈ 2.500 €\/an\) au-delà de ton budget\.$/);
  // budget « faible » (5 000) : min de 9 000 > 2 × 5 000 ? non → malus ; 10 500 → exclu
  const q = avecReponses(p, { budget: "faible" });
  assert.equal(evaluer(q, f, { cout: cout(9000, 9000) }).exclu, null);
  assert.ok(evaluer(q, f, { cout: cout(10500, 12000) }).exclu);
});

test("droits d'inscription : IFSI et travail social, libellé affiché sur la fiche", async () => {
  const droits = Object.entries(FP.formations).filter(([, x]) => x.libelle === "droits_inscription");
  assert.equal(droits.length, FP.meta.nb_droits_inscription);
  const CSV = fs.readFileSync(path.join(RACINE, "docs/releves/frais-formations-privees-2026-10-22.csv"), "utf8");
  for (const [g] of droits) {
    const f = fiche(g);
    assert.ok(new RegExp(`^${g},[^\n]*,D\\.E `, "m").test(CSV), `${g} : intitulé Parcoursup « D.E »`);
    assert.match(f.cout.texte, /^Droits d'inscription et participation annuelle : /, g);
  }
  for (const g of ["23064", "24813", "24814"]) assert.equal(FP.formations[g].libelle, "droits_inscription", g);
  // pédicure-podologue, psychomotricien à plusieurs milliers d'euros : « Coût »
  for (const g of ["26058", "26071"]) assert.equal(FP.formations[g].libelle, "cout", g);
  const p = profil("fragile"), f = fiche("24813");
  const s = await chargerSite({}, { etat: { profil: p.profil, reponses: p.reponses, retenus: [], profilTermine: true, qIndex: 999 } });
  const html = s.afficher("#formation-" + f.id);
  assert.ok(html.includes("Droits d&#39;inscription et participation annuelle : 270") || html.includes("Droits d'inscription et participation annuelle : 270"), "libellé absent de la fiche");
  assert.ok(html.includes("relevé sur Parcoursup"), "badge absent");
  assert.ok(html.includes("dossierappel.parcoursup.fr"), "source absente");
  assert.ok(!html.includes(QUASI_GRATUITE));
});

test("« Formation publique quasi gratuite » : jamais pour un établissement privé", () => {
  const { E, DATA, QUEST } = site;
  for (const p of PROFILS) {
    const A = E.recommander(DATA.formations, p.profil, QUEST, p.reponses);
    for (const x of A.resultats) if (x.raisons.includes(QUASI_GRATUITE)) assert.ok(x.f.__tc === "Publics" || x.f.__tc === undefined || x.f.__tc === null, `${p.id} : ${x.f.id}`);
  }
  const p = profil("fragile"), f = fiche("24813");
  const priv = evaluer(p, f), pub = evaluer(p, f, { __tc: "Publics" });
  assert.ok(!priv.raisons.includes(QUASI_GRATUITE));
  assert.ok(pub.raisons.includes(QUASI_GRATUITE), "règle inchangée pour le public");
});

test("apprentissage : texte affiché, jamais « gratuit » ni 0 €", async () => {
  const avec = Object.entries(FP.formations).filter(([, x]) => x.apprentissage);
  assert.ok(avec.length > 200);
  for (const [g, x] of avec) {
    const f = fiche(g);
    assert.ok(f.cout.valeur_annuelle_eur > 0, g);
    assert.equal(f.cout.valeur_annuelle_eur, x.max, g);
    assert.equal(f.cout.apprentissage, x.apprentissage, g);
  }
  // 76 : « gratuité totale en apprentissage », frais de 4 100 à 9 100 € par an
  const f = fiche("76");
  assert.match(f.cout.apprentissage, /gratuit/);
  const p = profil("sciences-ingenieur");
  const s = await chargerSite({}, { etat: { profil: p.profil, reponses: p.reponses, retenus: [], profilTermine: true, qIndex: 999 } });
  const html = s.afficher("#formation-" + f.id);
  assert.ok(html.includes("Apprentissage : année 5 gratuite en alternance (gratuité totale en apprentissage)."), "texte d'apprentissage absent");
  assert.ok(/4.100 € à 9.100 €/.test(html), "fourchette absente de la fiche");
  assert.ok(!/Coût annuel<\/span><span class="tuile-v">0 €|tuile-s">gratuit/.test(html), "jamais « gratuit »");
});

test("fiche en fourchette et Ma liste du profil fragile : message affiché (liste, section « Nouvelle formation », fiche)", async () => {
  const p = profil("fragile");
  const s = await chargerSite({}, { etat: { profil: p.profil, reponses: p.reponses, retenus: [], profilTermine: true, qIndex: 999 } });
  const { E, DATA, QUEST } = s;
  const A = E.recommander(DATA.formations, p.profil, QUEST, p.reponses);
  const N = E.nouvelles(A.resultats, A.interets);
  assert.equal(N.length, 1);
  assert.equal(N[0].f.id, "psup-51307", "ISG Nice");
  assert.equal(N[0].repere.priveFraisInconnus, true, "ISG Nice : absent du relevé, frais inconnus");
  s.afficher("#liste");
  const voeux = s.cliquer({ action: "onglet-liste", o: "voeux" });
  const sec = voeux.slice(voeux.indexOf("nouv-titre"));
  assert.ok(sec.includes(MESSAGE_INCONNUS), "message absent de la section « Nouvelle formation »");
  // fiche en fourchette (31876, CPGE ECG à Balma : 500 à 5 665 € selon les revenus), budget « gratuit » (1 000 €)
  const f = fiche("31876");
  const html = s.afficher("#formation-" + f.id);
  assert.ok(/Les frais vont de 500 € à 5.665 € par an selon tes revenus : vérifie ce que tu paierais avant de le mettre dans tes vœux\./.test(html), "message de fourchette absent de la fiche");
  assert.ok(html.includes("relevé sur Parcoursup"));
  assert.ok(/500 € à 5.665 €/.test(html), "fourchette absente de la tuile");
  // 9450 (2 200 à 7 780 €) : min > 2 × budget, exclue comme un montant connu trop élevé
  const y = A.resultats.find((r) => r.f.id === fiche("9450").id);
  assert.match(y.exclu, /^Frais \(au moins 2.200 €\/an\) au-delà de ton budget\.$/);
  const x = A.resultats.find((r) => r.f.id === f.id);
  assert.ok(x.repere.fraisFourchette);
});

test("profils : aucun « sécurité » en fourchette ni privé aux frais inconnus avec un budget serré", () => {
  const { E, DATA, QUEST } = site;
  for (const p of PROFILS) {
    const A = E.recommander(DATA.formations, p.profil, QUEST, p.reponses);
    const W = E.wishlist(A.resultats, 10, A.interets);
    for (const x of A.resultats) {
      if (x.repere.fraisFourchette) assert.notEqual(x.categorie, "securite", `${p.id} : ${x.f.id}`);
      if (x.repere.priveFraisInconnus) assert.equal(x.f.cout.valeur_annuelle_eur, null, `${p.id} : ${x.f.id}`);
    }
    assert.equal(W.protection.nbSecurite, W.liste.filter((x) => x.categorie === "securite").length);
  }
});

// Règles du script (Python) : nature de la fourchette, libellé, exclusions ; fichier à jour
const PY = (code) => execFileSync("python3", ["-I", "-c", `import runpy,json,sys\nm=runpy.run_path(${JSON.stringify(path.join(RACINE, "scripts/construire-frais-prives.py"))})\n${code}`], { encoding: "utf8" });
let python = true;
try { execFileSync("python3", ["--version"]); } catch (e) { python = false; }

test("script : règles de détection", { skip: !python && "python3 absent" }, () => {
  const ligne = (o) => JSON.stringify(Object.assign({ gta: "1", formation: "Licence - Droit", statut_releve: "trouvé", par_an_ou_cursus: "par an", precision: "", boursiers_eur: "", frais_min_eur: "1000", frais_max_eur: "1000" }, o));
  const cas = [
    ["nature", ligne({ par_an_ou_cursus: "par an (7700 € années 1-2, 8750 € année 3, 9500 € années 4-5)" }), 7700, 9500, "annee"],
    ["nature", ligne({ par_an_ou_cursus: "par an (9000 € prépa CII, 10500 € cycle ingénieur)" }), 9000, 10500, "annee"],
    ["nature", ligne({ par_an_ou_cursus: "par an (DTS1 1959 €, DTS2 1820 €, DTS3 1222 €)" }), 1222, 1959, "annee"],
    ["nature", ligne({ par_an_ou_cursus: "par an (1re année)", precision: "selon les revenus des familles" }), 4000, 7870, "revenus"],
    ["nature", ligne({ precision: "selon le quotient familial" }), 3470, 6600, "revenus"],
    ["nature", ligne({ boursiers_eur: "3150-7100 € selon revenus" }), 3950, 7900, "revenus"],
    ["nature", ligne({ precision: "fourchette (critère non précisé sur la fiche)" }), 4828, 6857, "autre"],
    ["nature", ligne({ par_an_ou_cursus: "par an (6150 € en 1 ou 2 versements, 6250 € en 4, 6450 € en 8)" }), 6150, 6450, "autre"],
    ["nature", ligne({}), 1000, 1000, null],
    ["libelle", ligne({ formation: "D.E Infirmier" }), 0, 783, "droits_inscription"],
    ["libelle", ligne({ formation: "D.E Educateur Spécialisé" }), 0, 710, "droits_inscription"],
    ["libelle", ligne({ formation: "D.E Assistant de Service Social" }), 0, 638, "droits_inscription"],
    ["libelle", ligne({ formation: "D.E Educateur de Jeunes Enfants" }), 0, 928, "droits_inscription"],
    ["libelle", ligne({ formation: "D.E Infirmier", precision: "8200 € de frais de formation" }), 0, 8470, "cout"],
    ["libelle", ligne({ formation: "D.E Ergothérapeute", precision: "600 € + 105 € de CVEC" }), 0, 705, "droits_inscription"],
    ["libelle", ligne({ formation: "D.E Pédicure-Podologue" }), 0, 9855, "cout"],
    ["libelle", ligne({ formation: "Licence - Droit" }), 0, 500, "cout"],
    ["motif", ligne({ precision: "montant en francs CFP : 470700 CFP (non converti en euros)", frais_min_eur: "", frais_max_eur: "" }), 0, 0, "autre_monnaie"],
    ["motif", ligne({ precision: "montant en dirhams : 186500 MAD", frais_min_eur: "", frais_max_eur: "" }), 0, 0, "autre_monnaie"],
    ["motif", ligne({ precision: "formation initiale financée par la Région Île-de-France" }), 0, 0, null],
    ["motif", ligne({ par_an_ou_cursus: "par mois (« à partir de 449 €/mois »)", frais_min_eur: "", frais_max_eur: "" }), 0, 0, "par_mois_ou_trimestre"],
    ["motif", ligne({ par_an_ou_cursus: "non précisé" }), 0, 0, "non_precise"],
    ["motif", ligne({ par_an_ou_cursus: "1re année seulement", precision: "coût du cursus de 3 ans : 10400 € selon la fiche" }), 0, 0, "cursus"],
    ["motif", ligne({ precision: "formation continue 21092,50 € pour toute la formation" }), 0, 0, null],
    ["motif", ligne({ frais_max_eur: "", precision: "« à partir de 1407 euros »" }), 0, 0, "maximum_non_indique"],
    ["motif", ligne({ statut_releve: "non trouvé" }), 0, 0, "non_trouve"],
    ["motif", ligne({ statut_releve: "a_verifier" }), 0, 0, "a_verifier"],
  ];
  const code = `cas=json.loads(sys.stdin.read())\nout=[]\nfor t,l,a,b,att in cas:\n  l=json.loads(l)\n  v={'nature':lambda:m['nature'](l,a,b),'libelle':lambda:m['libelle'](l,b),'motif':lambda:m['motif_exclusion'](l)}[t]()\n  out.append([t,l['formation']+' | '+l['par_an_ou_cursus']+' | '+l['precision'],v,att])\nprint(json.dumps(out))`;
  const res = JSON.parse(execFileSync("python3", ["-I", "-c", `import runpy,json,sys\nm=runpy.run_path(${JSON.stringify(path.join(RACINE, "scripts/construire-frais-prives.py"))})\n${code}`], { input: JSON.stringify(cas), encoding: "utf8" }));
  for (const [t, ctx, v, att] of res) assert.equal(v, att, `${t} : ${ctx}`);
});

test("script : data/frais-prives.json est à jour (relancer le script sinon)", { skip: !python && "python3 absent" }, () => {
  const out = execFileSync("python3", ["-I", path.join(RACINE, "scripts/construire-frais-prives.py"), "--verifier"], { encoding: "utf8" });
  assert.match(out, /à jour/);
  void PY;
});
