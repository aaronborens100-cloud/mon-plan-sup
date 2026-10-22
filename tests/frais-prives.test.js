/*
 * tests/frais-prives.test.js : frais réels des formations privées (relevé des fiches Parcoursup, 21-22/10/2026,
 * data/frais-prives.json construit par scripts/construire-frais-prives.py).
 *
 *   - frais connus sous le budget : plus de malus ni de message « frais inconnus » ;
 *   - fourchette (min ≤ budget < max) : pas de malus, jamais « sécurité », message « Les frais vont de X € à Y € » ;
 *   - budget < min : budget ≤ 5 000 : exclusion (décision du fondateur du 22/10/2026), y compris « à partir de X € » ;
 *     budget plus haut : malus de 18 ;
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
  for (const g of ["3346", "6392"]) assert.ok(E.par_mois_ou_trimestre.includes(g), `${g} : montant mensuel × 10, jamais multiplié`);
  for (const g of ["12043", "12051", "27159", "35153"]) assert.ok(E.an_ou_cursus_incertain.includes(g), `${g} : « par an (sur 3 ans) »`);
  assert.ok(E.a_reverifier.includes("26091"), "26091 : psychomotricien à 230 €, non revérifié");
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

test("« maximum non indiqué » (48177, ICES : part fixe 3 975 € + part variable) : règle « frais inconnus » sur données réelles", () => {
  assert.ok(FP.meta.exclus.maximum_non_indique.includes("48177"));
  assert.equal(FP.formations["48177"], undefined);
  const f = fiche("48177");
  assert.ok(f, "48177 dans le catalogue");
  assert.notEqual(f.__tc, "Publics");
  assert.equal(f.cout.valeur_annuelle_eur, null, "aucun montant : ni la part fixe, ni une estimation");
  // budget « faible » (5 000 €) : « à partir de 3 975 € » ne dépasse pas le budget → frais inconnus
  const p = avecReponses(profil("fragile"), { budget: "faible", mobilite: "partout" });
  const x = evaluer(p, f);
  assert.equal(x.exclu, null);
  assert.equal(x.repere.priveFraisInconnus, true);
  assert.equal(x.repere.alerteFrais, MESSAGE_INCONNUS);
  assert.ok(x.ajust.includes("établissement privé aux frais non relevés"));
  assert.notEqual(x.categorie, "securite");
  assert.equal(x.repere.fraisFourchette, false);
  // budget « moyen » : la règle ne joue pas
  assert.equal(evaluer(avecReponses(p, { budget: "moyen" }), f).repere.priveFraisInconnus, false);
});

test("corrections tirées du relevé : tarif d'une autre population ou d'un semestre en apprentissage retiré", () => {
  // TBS Paris 39147 : 12 700 € = tarif des candidats des lycées français de l'étranger
  assert.deepEqual([FP.formations["39147"].min, FP.formations["39147"].max, FP.formations["39147"].nature_fourchette], [10900, 11100, "annee"]);
  assert.match(FP.formations["39147"].correction, /L\.F\.E/);
  // 43500, 43502 : 4 450 € = 2e année avec un semestre en apprentissage → montant unique sous statut étudiant
  for (const g of ["43500", "43502"]) assert.deepEqual([FP.formations[g].min, FP.formations[g].max, FP.formations[g].nature_fourchette], [7500, 7500, null], g);
  assert.deepEqual(Object.keys(FP.meta.corrections), ["39147", "43500", "43502"]);
  assert.equal(fiche("39147").cout.valeur_annuelle_eur, 11100);
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
  assert.equal(dedans.repere.alerteFrais, "Les frais vont de 500 € à 5 665 € par an selon les revenus de ta famille : vérifie ce que tu paierais avant de le mettre dans tes vœux.".replace(/ /g, " ").replace(/(\d) (\d)/g, "$1 $2"));
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

test("budget serré (≤ 5 000) < min : exclusion (décision du fondateur du 22/10/2026) ; budget plus haut : malus", () => {
  const { E } = site;
  assert.equal(E.EXCLUSION_FRAIS_AU_DELA_DU_BUDGET, true);
  const p = profil("fragile"), f = base();   // budget « gratuit » = 1 000
  const ref = evaluer(p, f, { cout: cout(500, 500) });
  // budget = min : pas d'exclusion (frais connus sous le budget, ou fourchette)
  assert.equal(evaluer(p, f, { cout: cout(1000, 1000) }).exclu, null);
  assert.equal(evaluer(p, f, { cout: cout(1000, 1000) }).interet, ref.interet);
  const egalMin = evaluer(p, f, { cout: cout(1000, 4000) });
  assert.equal(egalMin.exclu, null);
  assert.equal(egalMin.repere.fraisFourchette, true, "budget = min : dans la fourchette");
  // budget + 1 € : exclusion, montant unique ou fourchette
  assert.equal(evaluer(p, f, { cout: cout(1001, 1001) }).exclu, "Frais (≈ 1\u202f001 €/an) au-delà de ton budget.");
  assert.equal(evaluer(p, f, { cout: cout(1001, 6000) }).exclu, "Frais (au moins 1\u202f001 €/an) au-delà de ton budget.");
  assert.match(evaluer(p, f, { cout: cout(1500, 6000) }).exclu, /^Frais \(au moins 1.500 €\/an\) au-delà de ton budget\.$/, "avant : malus seulement (pas au-delà de 2 × budget)");
  // budget « faible » (5 000) : 5 000 → rien ; 5 001 → exclu (avant : malus jusqu'à 10 000)
  const q = avecReponses(p, { budget: "faible" });
  assert.equal(evaluer(q, f, { cout: cout(5000, 5000) }).exclu, null);
  assert.ok(evaluer(q, f, { cout: cout(5001, 5001) }).exclu);
  assert.ok(evaluer(q, f, { cout: cout(9000, 9000) }).exclu);
  // budget « moyen » (20 000) : jamais d'exclusion par les frais, malus de 18 (règle inchangée)
  const m = avecReponses(p, { budget: "moyen" });
  const refM = evaluer(m, f, { cout: cout(500, 500) });
  const dessus = evaluer(m, f, { cout: cout(25000, 25000) });
  assert.equal(dessus.exclu, null);
  assert.ok(dessus.ajust.includes("frais au-dessus de ton budget"));
  assert.equal(dessus.interet, Math.max(0, refM.interet - 18));
  assert.equal(evaluer(m, f, { cout: cout(50000, 50000) }).exclu, null, "même au-delà de 2 × budget");
  void ref;
});

test("« à partir de X € » (maximum non indiqué) : exclusion si X > budget serré, sinon règle « frais inconnus »", () => {
  const ap = FP.a_partir_de;
  assert.equal(Object.keys(ap).length, 30);
  assert.deepEqual(Object.keys(ap).sort(), [...FP.meta.exclus.maximum_non_indique].sort());
  // fragile ouvert à toute la France (sinon la règle « domicile » exclut ces formations lointaines)
  const p = avecReponses(profil("fragile"), { mobilite: "partout" });   // 1 000 €
  // 48177 (ICES) : à partir de 3 975 € → exclue pour 1 000 € et pour 5 000 € ? 3 975 ≤ 5 000 : frais inconnus
  const f = fiche("48177");
  assert.equal(f.cout.valeur_annuelle_eur, null, "toujours aucun montant");
  assert.equal(f.cout.a_partir_de, 3975);
  assert.match(f.cout.texte, /^À partir de 3.975 € par an/);
  const gratuit = evaluer(p, f);
  assert.equal(gratuit.exclu, "Frais (au moins 3\u202f975 €/an) au-delà de ton budget.");
  const faible = evaluer(avecReponses(p, { budget: "faible" }), f);
  assert.equal(faible.exclu, null);
  assert.equal(faible.repere.priveFraisInconnus, true, "X ≤ budget : la règle « frais inconnus » reste");
  assert.equal(faible.repere.alerteFrais, MESSAGE_INCONNUS);
  // 15653 (5 925 €) : exclue avec le budget « faible »
  assert.match(evaluer(avecReponses(p, { budget: "faible" }), fiche("15653")).exclu, /^Frais \(au moins 5.925 €\/an\) au-delà de ton budget\.$/);
  // budget « moyen » : ni exclusion ni règle des frais inconnus
  const moyen = evaluer(avecReponses(p, { budget: "moyen" }), fiche("15653"));
  assert.equal(moyen.exclu, null);
  assert.equal(moyen.repere.priveFraisInconnus, false);
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
  // droits d'inscription, CVEC, contribution ou participation forfaitaire seulement
  for (const g of ["23064", "23101", "23174", "23390", "24813", "25090", "36282"]) assert.equal(FP.formations[g].libelle, "droits_inscription", g);
  // relecture de la PR #46 : frais pédagogiques, scolarité, gestion, montant sans détail ou au-dessus du seuil → « Coût »
  for (const g of ["23135", "23163", "23143", "23142", "49579", "24814", "23677", "23730", "23701", "25298", "26058", "26071"]) assert.equal(FP.formations[g].libelle, "cout", g);
  assert.equal(FP.formations["26091"], undefined, "26091 : laissé inconnu (non revérifié)");
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
  // 76 : « gratuité totale en apprentissage », frais de 4 100 à 9 100 € par an : le mot « gratuit » n'est affiché
  // qu'avec son contexte (contrat d'apprentissage avec un employeur)
  const f = fiche("76");
  assert.match(f.cout.apprentissage, /gratuit/);
  const p = profil("sciences-ingenieur");
  const s = await chargerSite({}, { etat: { profil: p.profil, reponses: p.reponses, retenus: [], profilTermine: true, qIndex: 999 } });
  const html = s.afficher("#formation-" + f.id);
  assert.ok(html.includes("En contrat d&#39;apprentissage (avec un employeur) : année 5 gratuite en alternance (gratuité totale en apprentissage).")
    || html.includes("En contrat d'apprentissage (avec un employeur) : année 5 gratuite en alternance (gratuité totale en apprentissage)."), "texte d'apprentissage absent ou sans contexte");
  for (const m of html.matchAll(/gratuit/gi)) {
    const avant = html.slice(Math.max(0, m.index - 160), m.index);
    assert.ok(/En contrat d(&#39;|')apprentissage \(avec un employeur\) : /.test(avant), `« gratuit » sans contexte : …${avant.slice(-80)}`);
  }
  assert.ok(/4.100 € à 9.100 €/.test(html), "fourchette absente de la fiche");
  assert.ok(!/Coût annuel<\/span><span class="tuile-v">0 €|tuile-s">gratuit/.test(html), "jamais « gratuit »");
  // un seul « relevé sur Parcoursup » : le badge de la rubrique des frais (plus de doublon sur la tuile)
  assert.equal(html.split("relevé sur Parcoursup").length - 1, 1, "badge « relevé sur Parcoursup » en double");
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
  assert.ok(/Les frais vont de 500 € à 5.665 € par an selon les revenus de ta famille : vérifie ce que tu paierais avant de le mettre dans tes vœux\./.test(html), "message de fourchette absent de la fiche");
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
    ["nature", ligne({ par_an_ou_cursus: "par an (7100 € années 1-2, 9100 € années 3-5, 9300 € sur le campus de Nantes)" }), 7100, 9300, "autre"],
    ["nature", ligne({ par_an_ou_cursus: "par an (4500 € suivant revenus familiaux, 9700 € en cycle ingénieur étudiant)" }), 4500, 9700, "autre"],
    ["nature", ligne({ par_an_ou_cursus: "par an (1re année : 4600 € parcours Commerce, 5800 € parcours International, + 172 € de droits d'inscription)" }), 4772, 5972, "autre"],
    ["nature", ligne({ precision: "3500 € (mineures histoire de l'art, géographie, philosophie) ou 4100 € (mineure sciences politiques)" }), 3500, 4100, "autre"],
    ["nature", ligne({ precision: "3500 € (Lettres classiques) ou 4100 € (Lettres, cultures et patrimoine)", boursiers_eur: "3150 € ou 3900 € selon le parcours" }), 3500, 4100, "autre"],
    ["nature", ligne({ par_an_ou_cursus: "par an (10900 € L1, 11000 € L2, 11100 € L3; 12700 €/an candidats des L.F.E.)" }), 10900, 12700, "autre"],
    ["nature", ligne({ precision: "selon revenus; internationaux hors Schengen 8020 €/an" }), 4075, 7280, "revenus"],
    ["nature", ligne({ precision: "vérif. fiche Parcoursup", par_an_ou_cursus: "par an (8000 € en 1re année, 9000 € ensuite)" }), 8000, 9000, "annee"],
    ["libelle", ligne({ formation: "D.E Infirmier", precision: "178 € de droits d'inscription + 105 € de CVEC; formation continue 7100 €" }), 0, 283, "droits_inscription"],
    ["libelle", ligne({ formation: "D.E Infirmier", precision: "178 € d'inscription universitaire + 800 € de contribution forfaitaire; formation continue 9100 € + 178 €" }), 0, 978, "droits_inscription"],
    ["libelle", ligne({ formation: "D.E Infirmier", precision: "1995 € de frais pédagogiques + 250 € de frais de gestion (prévision); formation continue 8000 € + 250 €" }), 0, 2245, "cout"],
    ["libelle", ligne({ formation: "D.E Infirmier", precision: "2198 € + 178 € (droit légal) + 105 € de CVEC; formation continue 8300 €" }), 0, 2481, "cout"],
    ["libelle", ligne({ formation: "D.E Infirmier", precision: "2095 € de scolarité + frais d'inscription universitaire (non chiffrés); formation continue 8400 €" }), 0, 2095, "cout"],
    ["libelle", ligne({ formation: "D.E Infirmier", precision: "selon revenus; formation continue 7942 €" }), 1872, 2772, "cout"],
    ["libelle", ligne({ formation: "D.E manipulateur/trice en électroradiologie médicale", precision: "formation continue 7100 €" }), 0, 785, "cout"],
    ["libelle", ligne({ formation: "D.E Educateur Spécialisé", precision: "170 € de droits d'inscription + 540 € de frais de scolarité" }), 0, 710, "cout"],
    ["libelle", ligne({ formation: "D.E Educateur Spécialisé", precision: "720 € + 105 € de CVEC" }), 0, 825, "cout"],
    ["libelle", ligne({ formation: "D.E Educateur de Jeunes Enfants", precision: "dont 175 € de frais d'inscription; formation continue 15,50 €/heure" }), 0, 836, "cout"],
    ["libelle", ligne({ formation: "D.E Assistant de Service Social", precision: "vérif. fiche 2026-10-22 (autre) : frais réduits de formation sociale (591 €, contenu non détaillé)" }), 0, 591, "cout"],
    ["libelle", ligne({ formation: "D.E Infirmier", precision: "formation continue 9100 €; vérif. fiche 2026-10-22 (seulement droits d'inscription/CVEC) : droits d'inscription seulement" }), 0, 178, "droits_inscription"],
    ["libelle", ligne({ formation: "D.E Infirmier", precision: "178 € de droits d'inscription + 1200 € de contribution" }), 0, 1378, "cout"],
    ["libelle", ligne({ formation: "D.E Infirmier", precision: "8200 € de frais de formation" }), 0, 8470, "cout"],
    ["libelle", ligne({ formation: "D.E Pédicure-Podologue" }), 0, 9855, "cout"],
    ["libelle", ligne({ formation: "Licence - Droit", precision: "178 € de droits d'inscription" }), 0, 178, "cout"],
    ["motif", ligne({ par_an_ou_cursus: "par an (110 €/mois sur 10 mois)", frais_min_eur: "1100", frais_max_eur: "1100" }), 0, 0, "par_mois_ou_trimestre"],
    ["motif", ligne({ par_an_ou_cursus: "par an (sur 3 ans)", frais_min_eur: "6100", frais_max_eur: "6100" }), 0, 0, "an_ou_cursus_incertain"],
    ["motif", ligne({ gta: "26091", frais_min_eur: "230", frais_max_eur: "230" }), 0, 0, "a_reverifier"],
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

test("relecture PR #46 : codes réels (nature et libellé)", () => {
  const nat = { 39147: "annee", 46033: "autre", 46036: "autre", 475: "autre", 476: "autre", 30944: "autre", 39001: "autre", 47277: "autre",
    24653: "autre", 24656: "autre", 39321: "autre", 39322: "autre", 9553: "autre", 17415: "autre" };
  for (const [g, n] of Object.entries(nat)) assert.equal(FP.formations[g].nature_fourchette, n, g);
});

test("script : data/frais-prives.json est à jour (relancer le script sinon)", { skip: !python && "python3 absent" }, () => {
  const out = execFileSync("python3", ["-I", path.join(RACINE, "scripts/construire-frais-prives.py"), "--verifier"], { encoding: "utf8" });
  assert.match(out, /à jour/);
  void PY;
});
