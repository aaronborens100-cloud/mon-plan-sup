/*
 * tests/profils-aleatoires.js : élèves fictifs tirés au hasard, à graine fixe (même graine = mêmes profils).
 *
 * Sert aux outils de vérification (scripts/comparer-versions.js, scripts/controles.js), pas à npm test.
 * Chaque profil a la même forme que ceux de tests/profils.js (état enregistré par le site, CapStore) :
 * { id, description, profil, reponses }.
 *
 * Variété voulue :
 *   - première et terminale ; moyennes de 6 à 19 ; spécialités variées, avec et sans maths, option maths
 *     expertes ou complémentaires ;
 *   - lycées réels de data/lieux.json, pris dans tous les départements (donc toutes les académies, Corse et
 *     outre-mer compris), quelques communes à la place d'un lycée, et des profils sans lycée ;
 *   - toutes les valeurs de chaque question de data/questionnaire.json (échelles 1 à 5, « je ne sais pas »,
 *     budgets, mobilités, pays et territoires, « Rien d'autre que ce que j'ai coché ») : les valeurs sont
 *     distribuées en tourniquet, chacune apparaît dès que le nombre de profils le permet ;
 *   - profils vides, partiels (bulletins sans moyenne générale, notes avec virgule, note impossible, questionnaire
 *     à moitié rempli) et contradictoires (ingénieur + « le moins de maths possible », etc.).
 *
 * Utilisation : const { genererProfils } = require("./profils-aleatoires"); genererProfils(300, graine).
 * En ligne de commande : node tests/profils-aleatoires.js [n] [graine] (résumé de la couverture).
 */
"use strict";
const fs = require("fs");
const path = require("path");

const RACINE = path.join(__dirname, "..");
const GRAINE_DEFAUT = 20261022;
const N_DEFAUT = 300;

// Générateur pseudo-aléatoire mulberry32 : rapide, déterministe, sans dépendance.
function aleatoire(graine) {
  let a = graine >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.entier = (min, max) => min + Math.floor(r() * (max - min + 1));
  r.choix = (l) => l[Math.floor(r() * l.length)];
  r.melange = (l) => { const c = l.slice(); for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; } return c; };
  r.sousEnsemble = (l, k) => r.melange(l).slice(0, k);
  return r;
}

// Même forme que tests/profils.js
function periode(label, moyenne, notes = {}, extra = {}) {
  const n = {};
  for (const [mat, moy] of Object.entries(notes)) n[mat] = { moy: String(moy) };
  return { id: label, label, moyenneGenerale: moyenne === null ? "" : String(moyenne), moyenneClasse: extra.classe != null ? String(extra.classe) : "", rang: "", effectif: "",
    notes: n, appreciationGenerale: extra.appreciation || "", mention: extra.mention || "" };
}
function profilBase(x) {
  return Object.assign({ prenom: "", niveau: "terminale", specialites: [], specialiteAbandonnee: "", optionMaths: "aucune", autresOptions: "",
    anglaisAuto: "", periodes: [], bacFrancais: { ecrit: "", oral: "" }, certifications: [], experiences: [] }, x);
}

// Triplettes de spécialités de première (on garde les deux premières en terminale, la troisième est abandonnée).
// Avec et sans maths ; les combinaisons courantes et quelques rares.
const TRIPLETTES = [
  ["maths", "physique_chimie", "SVT"], ["maths", "physique_chimie", "NSI"], ["maths", "SES", "HGGSP"], ["maths", "NSI", "SI"],
  ["maths", "physique_chimie", "SI"], ["maths", "SES", "LLCER_anglais"], ["maths", "SVT", "SES"], ["SES", "HGGSP", "maths"],
  ["SVT", "physique_chimie", "maths"], ["SES", "maths", "AMC"], ["SES", "HGGSP", "HLP"], ["HGGSP", "HLP", "LLCER_anglais"],
  ["SES", "SVT", "HGGSP"], ["LLCER_anglais", "HGGSP", "SES"], ["HLP", "LLCER_autre", "arts"], ["arts", "HLP", "SES"],
  ["SVT", "bio_eco", "physique_chimie"], ["AMC", "SES", "HGGSP"], ["LLCA", "HLP", "HGGSP"], ["EPPCS", "SVT", "SES"],
  ["physique_chimie", "SVT", "SES"], ["NSI", "SES", "maths"], ["arts", "LLCER_anglais", "HLP"], ["SES", "HGGSP", "SVT"],
];
const APPRECIATIONS = ["", "", "Excellent trimestre, élève brillante et investie.", "Bon trimestre, travail sérieux.", "Ensemble correct, des efforts à poursuivre.",
  "Trimestre insuffisant, manque de travail et de sérieux.", "Très net progrès, travail sérieux et régulier.", "Trimestre décevant, des efforts à fournir."];
const MENTIONS = ["", "", "", "Félicitations", "Compliments", "Encouragements", "Avertissement travail"];
const CERTIFS = [["Cambridge", ["150", "172", "185", "205"]], ["IELTS", ["5", "6.5", "7.5"]], ["TOEFL", ["70", "90", "110"]], ["TOEIC", ["600", "850", "950"]]];
const EXPERIENCES = ["competition", "responsabilite", "projet", "stage", "benevolat", "association", "autre"];
const CECRL = ["", "A2", "B1", "B2", "C1", "C2"];

const arrondi = (x) => Math.round(x * 10) / 10;
const borne = (x) => Math.max(0, Math.min(20, x));

// Lycées : tous les départements présents dans data/lieux.json, en tourniquet (département tiré dans l'ordre d'une
// liste mélangée, lycée tiré au hasard dans le département) : chaque département, donc chaque académie, la Corse et
// chaque territoire d'outre-mer, apparaît dès 105 profils avec lycée.
function preparerLieux(r) {
  const lieux = JSON.parse(fs.readFileSync(path.join(RACINE, "data", "lieux.json"), "utf8"));
  const parDep = new Map();
  for (const l of lieux.lycees) { if (!parDep.has(l[3])) parDep.set(l[3], []); parDep.get(l[3]).push(l); }
  const deps = r.melange([...parDep.keys()].sort());
  let i = 0;
  const lycee = () => {
    const dep = deps[i++ % deps.length];
    const [uai, nom, commune, d, lat, lon] = r.choix(parDep.get(dep));
    return { type: "lycee", uai, nom, commune, dep: d, lat, lon };
  };
  const commune = () => {
    const [nom, dep, lat, lon] = r.choix(lieux.communes);
    return { type: "commune", nom, commune: nom, dep: dep || undefined, lat, lon };
  };
  return { lycee, commune, nbDepartements: deps.length };
}

// Réponses au questionnaire : chaque valeur de chaque question en tourniquet (décalage propre à chaque question),
// « je ne sais pas » (nsp) de temps en temps, sous-ensembles variés pour les questions à choix multiple.
function preparerReponses(r, questions) {
  const compteurs = new Map(questions.map((q, k) => [q.id, k * 7]));
  const suivant = (q, n) => { const c = compteurs.get(q.id); compteurs.set(q.id, c + 1); return c % n; };
  return function reponses({ taux = 1, nsp = 0.04 } = {}) {
    const out = {};
    for (const q of questions) {
      if (r() >= taux) continue;
      if (r() < nsp) { out[q.id] = "nsp"; continue; }
      if (q.type === "scale") out[q.id] = 1 + suivant(q, 5);
      else if (q.type === "single") out[q.id] = q.options[suivant(q, q.options.length)].value;
      else {
        const vals = q.options.map((o) => o.value);
        const premier = vals[suivant(q, vals.length)];
        const max = q.max || vals.length;
        const k = r.entier(1, Math.min(max, q.id === "pays" ? 4 : max));
        const autres = r.sousEnsemble(vals.filter((v) => v !== premier), k - 1);
        let choix = [premier, ...autres];
        // comme sur le site : « Peu importe » (lieu = partout) décoche les autres villes
        if (q.id === "lieu" && choix.includes("partout")) choix = ["partout"];
        out[q.id] = choix;
      }
    }
    return out;
  };
}

// Bulletins : moyenne visée m (6 à 19), notes de matières autour de m
function bulletins(r, niveau, specialites, abandonnee, optionMaths, m, { partiel = false } = {}) {
  const labels = niveau === "premiere"
    ? r.choix([["Première – T1"], ["Première – T1", "Première – T2"], ["Première – S1"]])
    : r.choix([["Terminale – T1"], ["Première – T3", "Terminale – T1"], ["Première – T1", "Première – T2", "Première – T3", "Terminale – T1"],
      ["Première – S1", "Première – S2", "Terminale – S1"], ["Première – T3", "Terminale – T1", "Terminale – T2"]]);
  const tendance = r.choix([0, 0, 0, 1.5, -1.5]);
  return labels.map((label, k) => {
    const terminale = label.startsWith("Terminale");
    const mg = arrondi(borne(m + (k - (labels.length - 1) / 2) * tendance / Math.max(1, labels.length - 1) + (r() - 0.5)));
    const notes = {};
    const mats = terminale ? specialites.slice(0, 2) : [...specialites.slice(0, 2), abandonnee].filter(Boolean);
    for (const s of mats) notes[s] = arrondi(borne(mg + (r() - 0.5) * 4));
    if (terminale && optionMaths === "expertes") notes.maths_expertes = arrondi(borne(mg + (r() - 0.5) * 8));
    if (terminale && optionMaths === "complementaires") notes.maths_complementaires = arrondi(borne(mg + (r() - 0.5) * 4));
    if (r() < 0.3) notes.philosophie = arrondi(borne(mg + (r() - 0.5) * 3));
    let moyenne = mg;
    if (partiel) {
      const t = r();
      if (t < 0.35) moyenne = null;                                      // période sans moyenne générale
      else if (t < 0.5) moyenne = String(mg).replace(".", ",");          // virgule décimale
      else if (t < 0.6) moyenne = "  ";                                  // case faite d'espaces
      else if (t < 0.68) moyenne = r.choix(["125", "-3", "21"]);         // note impossible
    }
    return periode(label, moyenne, notes, { classe: arrondi(11 + r() * 2), appreciation: r.choix(APPRECIATIONS), mention: r.choix(MENTIONS) });
  });
}

// Profils contradictoires : réponses qui se contredisent (ou contredisent le dossier), appliquées par-dessus
const CONTRADICTIONS = [
  ["ingénieur, mais le moins de maths possible", { secteurs: ["ingenierie", "data", "recherche"], technique: 5, data: 5, maths_defi: 1, maths_niv: "0", matieres: ["pc", "nsi"] }],
  ["médecine, mais sans SVT et des études courtes", { soigner: 5, vivant: 5, secteurs: ["sante"], long: 1, charge: "moyenne" }],
  ["veut partir à l'étranger, mais coche « Rien d'autre que ce que j'ai coché » seul", { etranger: "oui", pays: ["aucun"], anglais: 5 }],
  ["budget gratuit, vise les écoles de commerce les plus sélectives", { budget: "gratuit", secteurs: ["finance", "conseil"], ambition: 5, salaire: 5, finance: 5 }],
  ["veut rester chez ses parents, mais seulement en Île-de-France et à Lyon", { mobilite: "domicile", lieu: ["idf", "lyon"] }],
  ["rythme très intense refusé, mais ambition maximale et prépa", { charge: "moyenne", ambition: 5, tests: 5, long: 5, cadre: 5 }],
  ["ne veut pas partir, mais n'étudierait qu'au Royaume-Uni", { etranger: "non", pays: ["Royaume-Uni", "aucun"], mobilite: "partout" }],
  ["outre-mer et Corse uniquement, sans vouloir bouger", { pays: ["corse", "outremer", "aucun"], mobilite: "proche", lieu: ["regions"] }],
];

function genererProfils(n = N_DEFAUT, graine = GRAINE_DEFAUT) {
  const r = aleatoire(graine);
  const questions = JSON.parse(fs.readFileSync(path.join(RACINE, "data", "questionnaire.json"), "utf8")).questions;
  const lieux = preparerLieux(r);
  const reponses = preparerReponses(r, questions);
  const out = [];
  for (let i = 0; i < n; i++) {
    const id = `alea-${String(i + 1).padStart(3, "0")}`;
    // types de profils, en tourniquet : 1 vide sur 20, 3 partiels, 2 contradictoires, le reste complets
    const k = i % 20;
    const sorte = k === 0 ? "vide" : k <= 3 ? "partiel" : k <= 5 ? "contradictoire" : "complet";
    if (sorte === "vide") {
      // vide : rien du tout, ou seulement quelques réponses, ou seulement un lycée
      const v = Math.floor(i / 20) % 3;
      const p = profilBase(v === 2 ? { lycee: lieux.lycee() } : {});
      out.push({ id, sorte, description: v === 0 ? "profil vide" : v === 1 ? "profil sans notes, quelques réponses" : "profil vide avec seulement un lycée",
        profil: p, reponses: v === 1 ? reponses({ taux: 0.3 }) : {} });
      continue;
    }
    const niveau = r() < 0.3 ? "premiere" : "terminale";
    const trip = TRIPLETTES[(i * 7 + Math.floor(i / 3)) % TRIPLETTES.length];
    const specialites = niveau === "premiere" ? trip.slice() : trip.slice(0, 2);
    const abandonnee = niveau === "premiere" ? "" : trip[2];
    // option maths : expertes seulement avec la spécialité maths ; complémentaires seulement sans
    let optionMaths = "aucune";
    if (niveau === "terminale") {
      if (specialites.includes("maths")) optionMaths = r() < 0.45 ? "expertes" : "aucune";
      else optionMaths = r() < 0.5 ? "complementaires" : "aucune";
    }
    const m = 6 + ((i * 13) % 27) / 2 + (r() - 0.5) * 0.4;   // de 6 à 19, bien réparti
    const partiel = sorte === "partiel";
    const lycee = r() < 0.12 ? null : r() < 0.06 ? lieux.commune() : lieux.lycee();
    const p = profilBase({
      niveau, specialites, specialiteAbandonnee: abandonnee, optionMaths,
      anglaisAuto: r.choix(CECRL), lycee: lycee || undefined,
      periodes: partiel && r() < 0.25 ? [] : bulletins(r, niveau, specialites, abandonnee, optionMaths, m, { partiel }),
      certifications: r() < 0.2 ? [(([t, scores]) => ({ type: t, score: r.choix(scores) }))(r.choix(CERTIFS))] : [],
      experiences: r.sousEnsemble(EXPERIENCES, r.entier(0, 2)).map((t) => ({ type: t, titre: `Expérience ${t}` })),
    });
    if (!lycee) delete p.lycee;
    if (niveau === "terminale" && r() < 0.4) p.bacPremiere = { francaisEcrit: String(r.entier(6, 19)), francaisOral: String(r.entier(6, 20)), maths: r() < 0.5 ? String(r.entier(5, 20)) : "" };
    let rep = reponses({ taux: partiel ? 0.5 : 1 });
    let description = `${niveau === "premiere" ? "première" : "terminale"}, ≈ ${String(arrondi(m)).replace(".", ",")} de moyenne, ${specialites.join(" + ")}${optionMaths !== "aucune" ? `, maths ${optionMaths}` : ""}, ${lycee ? `${lycee.nom} (${lycee.dep || "?"})` : "sans lycée"}`;
    if (sorte === "partiel") description = `partiel : ${description}`;
    if (sorte === "contradictoire") {
      const [quoi, sur] = CONTRADICTIONS[(Math.floor(i / 20) * 2 + (k - 4)) % CONTRADICTIONS.length];
      rep = Object.assign(rep, sur);
      if (quoi.startsWith("médecine")) { p.specialites = p.specialites.filter((s) => s !== "SVT"); if (!p.specialites.length) p.specialites = ["HLP"]; }
      description = `contradictoire (${quoi}) : ${description}`;
    }
    out.push({ id, sorte, description, profil: p, reponses: rep });
  }
  return out;
}

// Couverture : pour chaque question, les valeurs jamais tirées (vide si tout est couvert)
function couverture(profils) {
  const questions = JSON.parse(fs.readFileSync(path.join(RACINE, "data", "questionnaire.json"), "utf8")).questions;
  const manque = {};
  for (const q of questions) {
    const vus = new Set();
    for (const p of profils) { const v = p.reponses[q.id]; (Array.isArray(v) ? v : [v]).forEach((x) => vus.add(String(x))); }
    const attendu = q.type === "scale" ? ["1", "2", "3", "4", "5", "nsp"] : [...q.options.map((o) => o.value), "nsp"];
    const m = attendu.filter((v) => !vus.has(v));
    if (m.length) manque[q.id] = m;
  }
  const deps = new Set(profils.map((p) => p.profil.lycee && p.profil.lycee.dep).filter(Boolean));
  return { manque, departements: deps.size, sansLycee: profils.filter((p) => !p.profil.lycee).length };
}

module.exports = { genererProfils, couverture, aleatoire, GRAINE_DEFAUT, N_DEFAUT };

if (require.main === module) {
  const n = Number(process.argv[2]) || N_DEFAUT, g = Number(process.argv[3]) || GRAINE_DEFAUT;
  const P = genererProfils(n, g);
  const sortes = {};
  P.forEach((p) => { sortes[p.sorte] = (sortes[p.sorte] || 0) + 1; });
  console.log(`${P.length} profils (graine ${g}) :`, sortes);
  console.log("Couverture :", JSON.stringify(couverture(P)));
  for (const p of P.slice(0, 25)) console.log(`  ${p.id}  ${p.description}`);
}
