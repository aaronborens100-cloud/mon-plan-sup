/*
 * tests/frais-releve.test.js : issue #49 (contrôle des tarifs du 22/10/2026).
 *
 *   - phrase affichée sous les frais d'une fiche relevée sur Parcoursup, avec et sans année des tarifs ;
 *   - année des tarifs exportée dans data/frais-prives.json (seulement quand la fiche la donne) ;
 *   - montant mensuel avec nombre de mois (3346, 6392) : affiché tel quel, jamais multiplié, aucune exclusion ;
 *   - 1re année seule, années suivantes gratuites en apprentissage (GOBELINS 37012) : exclue d'un budget serré ;
 *   - montant unique « suivant les revenus » : libellé « jusqu'à X € (selon les revenus) » ;
 *   - règles du script (année, mensuel, 1re année, revenus).
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
const AVANT = `Ces frais viennent de la fiche Parcoursup de la formation (relevée en ${FP.meta.releve_mois})`;
const APRES = ". Ils ne correspondent pas forcément à ta rentrée : les écoles privées les revoient souvent chaque année. Vérifie le montant sur le site de l'école avant de t'engager.";
test("le mois du relevé vient de la donnée", () => assert.equal(FP.meta.releve_mois, "octobre 2026"));
const phrase = (annee) => AVANT + (annee ? ` et datent de l'année ${annee}` : "") + APRES;
// le HTML échappe l'apostrophe
const brut = (html) => html.replace(/&#39;/g, "'").replace(/&#x27;/g, "'");

let site;
test.before(async () => { site = await chargerSite(); });
const profil = (id) => PROFILS.find((x) => x.id === id);
const fiche = (gta) => site.DATA.formations.find((f) => String(f.__gta) === String(gta));
const page = async (gta) => {
  const p = profil("fragile");
  const s = await chargerSite({}, { etat: { profil: p.profil, reponses: p.reponses, retenus: [], profilTermine: true, qIndex: 999 } });
  return brut(s.afficher("#formation-" + s.DATA.formations.find((f) => String(f.__gta) === String(gta)).id));
};
const evaluer = (p, reponses, f) => {
  const { E, QUEST } = site;
  const r = Object.assign({}, p.reponses, reponses);
  const A = E.recommander([], p.profil, QUEST, r);
  return E.evaluer(f, A.stats, A.interets);
};

test("année des tarifs : exportée seulement quand la fiche la donne", () => {
  const annees = Object.values(FP.formations).map((x) => x.annee_tarifs).filter(Boolean);
  assert.ok(annees.length > 400 && annees.length < Object.keys(FP.formations).length, "une partie seulement des fiches donne l'année");
  for (const a of annees) assert.match(a, /^20\d\d-20\d\d$/);
  assert.deepEqual(FP.meta.annees_tarifs, { "2024-2025": 3, "2025-2026": 444, "2026-2027": 39 });
  assert.equal(FP.formations["32304"].annee_tarifs, "2025-2026");
});

test("phrase sous les frais : avec l'année quand elle est connue, sans sinon, mot pour mot", async () => {
  const avec = Object.entries(FP.formations).find(([, x]) => x.annee_tarifs === "2025-2026" && x.libelle === "cout" && !x.selon_revenus);
  const sans = Object.entries(FP.formations).find(([, x]) => !x.annee_tarifs && x.libelle === "cout" && !x.selon_revenus);
  const h1 = await page(avec[0]);
  assert.ok(h1.includes(phrase("2025-2026")), "phrase avec année absente");
  const h2 = await page(sans[0]);
  assert.ok(h2.includes(phrase(null)), "phrase sans année absente");
  assert.ok(!h2.includes("datent de l'année"), "pas d'année inventée");
});

test("frais publics ou non relevés : pas de phrase", async () => {
  const p = profil("fragile");
  const f = site.DATA.formations.find((x) => x.__tc === "Publics" && x.cout && x.cout.statut !== "releve_parcoursup");
  const s = await chargerSite({}, { etat: { profil: p.profil, reponses: p.reponses, retenus: [], profilTermine: true, qIndex: 999 } });
  assert.ok(!s.afficher("#formation-" + f.id).includes("Ces frais viennent de la fiche Parcoursup"));
});

test("montant mensuel (3346, 6392) : « 110 € par mois » tel quel, jamais multiplié, jamais d'exclusion", async () => {
  assert.deepEqual(Object.keys(FP.par_mois).sort(), ["3346", "6392"]);
  assert.equal(FP.par_mois["3346"].montant, 110);
  assert.equal(FP.par_mois["3346"].mois, 10);
  assert.equal(FP.par_mois["6392"].montant, 165);
  const f = fiche("3346");
  assert.equal(f.cout.valeur_annuelle_eur, null, "aucun total annuel inventé");
  assert.match(f.cout.texte, /^110 € par mois \(sur 10 mois\)\.$/);
  assert.equal(fiche("6392").cout.texte.replace(/ | /g, " "), "165 € par mois (sur 10 mois).");
  const p = profil("fragile");
  for (const budget of ["gratuit", "faible", "moyen"]) {
    const ev = evaluer(p, { budget, mobilite: "partout" }, f);
    assert.ok(!/budget/.test(ev.exclu || ""), `${budget} : pas d'exclusion pour les frais`);
  }
  assert.equal(evaluer(p, { mobilite: "partout" }, f).repere.priveFraisInconnus, true, "budget serré : règle « frais inconnus »");
  const h = await page("3346");
  assert.ok(h.includes("110 € par mois"), "montant mensuel absent de la fiche");
  assert.ok(h.includes(phrase("2025-2026")));
});

test("1re année seule (GOBELINS 37012, 10 400 €, 2e et 3e années gratuites en apprentissage) : exclue d'un budget serré", async () => {
  assert.deepEqual(Object.keys(FP.premiere_annee), ["37012"]);
  assert.equal(FP.premiere_annee["37012"].montant, 10400);
  const f = fiche("37012");
  assert.equal(f.cout.a_partir_de, 10400);
  assert.equal(f.cout.valeur_annuelle_eur, null, "pas présenté comme le coût de tout le cursus");
  const p = profil("fragile");
  for (const budget of ["gratuit", "faible"]) {
    assert.match(evaluer(p, { budget, mobilite: "partout" }, f).exclu || "", /au-delà de ton budget/, `budget ${budget}`);
  }
  const h = await page("37012");
  assert.ok(h.includes("10") && h.includes("la 1re année."), "texte de la 1re année");
  assert.ok(h.includes("En contrat d'apprentissage (avec un employeur) : 2e et 3e années gratuites (apprentissage)."), "apprentissage contextualisé");
  assert.ok(h.includes(phrase(null)), "année non précisée sur la fiche : phrase sans année");
});

test("montant unique « suivant revenus » : « jusqu'à X € (selon les revenus) » sur la fiche", async () => {
  assert.equal(FP.meta.selon_revenus.length, 17);
  for (const g of ["24654", "26005", "31374", "47937"]) assert.equal(FP.formations[g].selon_revenus, true, g);
  const h = await page("24654");
  assert.ok(h.includes("Jusqu'à 4") && h.includes("par an (selon les revenus)"), "texte « jusqu'à » absent");
  assert.ok(!h.includes("De 4"), "pas présenté comme une fourchette");
});

test("script : règles année, mensuel, 1re année, revenus", () => {
  const ligne = (o) => JSON.stringify(Object.assign({ gta: "1", formation: "Licence - Droit", statut_releve: "trouvé", par_an_ou_cursus: "par an", precision: "", boursiers_eur: "", apprentissage: "non mentionné", annee: "", frais_min_eur: "1000", frais_max_eur: "1000" }, o));
  const cas = [
    ["annee", "2025/2026", "2025-2026"], ["annee", "2026-2027", "2026-2027"], ["annee", "non précisée", null],
    ["annee", "2026", null], ["annee", "2025/2027", null], ["annee", "", null],
    ["mois", ligne({ par_an_ou_cursus: "par an (110 €/mois sur 10 mois)" }), { montant: 110, mois: 10 }],
    ["mois", ligne({ par_an_ou_cursus: "par mois (128 €/mois sans la demi-pension; nombre de mois non précisé)" }), null],
    ["mois", ligne({ par_an_ou_cursus: "par mois (« à partir de 449 €/mois »)" }), null],
    ["premiere", ligne({ par_an_ou_cursus: "1re année seulement", apprentissage: "2e et 3e années gratuites (apprentissage)", frais_min_eur: "10400", frais_max_eur: "10400" }), { montant: 10400 }],
    ["premiere", ligne({ par_an_ou_cursus: "1re année seulement", frais_min_eur: "10400", frais_max_eur: "10400" }), null],
    ["premiere", ligne({ par_an_ou_cursus: "par an (1re année)", apprentissage: "gratuite en 2e année", frais_min_eur: "7900", frais_max_eur: "7900" }), null],
    ["revenus", "« 4500 €/an suivant revenus familiaux »", true], ["revenus", "modulation des frais selon le quotient familial", true],
    ["revenus", "« 2390 avec prise en compte du quotient familial »", true], ["revenus", "dégressifs en fonction du revenu fiscal de référence", true],
    ["revenus", "8840 € de scolarité; ressources matérielles à prévoir", false], ["revenus", "repas cantine 6,75 €", false],
  ];
  const code = `cas=json.loads(sys.stdin.read())\nout=[]\nfor t,a,att in cas:\n  v={'annee':lambda:m['annee_tarifs'](a),'mois':lambda:m['par_mois'](json.loads(a)),'premiere':lambda:m['premiere_annee'](json.loads(a)),'revenus':lambda:bool(m['SELON_REVENUS'].search(a))}[t]()\n  out.append([t,a,v,att])\nprint(json.dumps(out))`;
  const res = JSON.parse(execFileSync("python3", ["-I", "-c", `import runpy,json,sys\nm=runpy.run_path(${JSON.stringify(path.join(RACINE, "scripts/construire-frais-prives.py"))})\n${code}`], { input: JSON.stringify(cas), encoding: "utf8" }));
  for (const [t, a, v, att] of res) assert.deepEqual(v, att, `${t} : ${a}`);
});
