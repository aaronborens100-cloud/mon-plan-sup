#!/usr/bin/env node
/*
 * scripts/fiches-suspectes.js : repère les fiches maison françaises fusionnées avec Parcoursup dont les estimations
 * maison contredisent les données officielles. Lecture seule : ne change rien au site.
 *
 * Usage : node scripts/fiches-suspectes.js [--dossier .] [--rapport docs/fiches-suspectes.md] [--sans-rapport]
 *
 * Trois signaux par fiche :
 *   1. type : le type de la fiche maison n'est pas celui lu dans Parcoursup (typeParcoursup de js/catalogue.js) ;
 *   2. specialites : une spécialité « obligatoire » ou « recommandée » de la fiche n'est pas conseillée par les attendus
 *      nationaux (data/attendus-filieres.json, code nmc appliqué), ou une spécialité conseillée par l'État manque ;
 *   3. moyenne : la moyenne visée (notes.moyenne_cible) s'éloigne d'au moins SEUIL_MOYENNE points de la moyenne estimée
 *      à partir des mentions officielles des admis (calcul de fichGeneree dans js/catalogue.js, réutilisé tel quel).
 * Le score d'une fiche est son nombre de signaux ; à score égal, l'écart de moyenne départage.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const SEUIL_MOYENNE = 1.5;   // points sur 20 : écart à partir duquel la moyenne visée est jugée suspecte
const TAILLE_LISTE = 20;     // fiches les plus suspectes détaillées dans le rapport

const SIGNAUX = {
  type: "Le type de formation de la fiche n'est pas celui indiqué par Parcoursup",
  specialites: "Les spécialités de la fiche ne correspondent pas aux attendus officiels",
  moyenne: "La moyenne visée est très éloignée de celle des admis d'après Parcoursup",
};

// Cœur du calcul (pur, testable) :
//   fiche = { type, specialites: { obligatoires, recommandees }, notes: { moyenne_cible } }
//   officiel = { typePs (ou null), attendu ({ recommandees, maths_obligatoire } ou null), moyennePs (ou null) }
// Renvoie { signaux: [clés], details: {...}, ecart (ou null), score }.
function evaluerFiche(fiche, officiel) {
  const signaux = [], details = {};
  const { typePs, attendu, moyennePs } = officiel;
  if (typePs && fiche.type !== typePs) { signaux.push("type"); details.type = { fiche: fiche.type, parcoursup: typePs }; }
  if (attendu) {
    const sp = fiche.specialites || {};
    const conseillees = new Set(attendu.recommandees || []);
    if (attendu.maths_obligatoire) conseillees.add("maths");   // prépas ECG : maths obligatoires (règle d'accès, hors texte des attendus)
    const deLaFiche = new Set([].concat(sp.obligatoires || [], sp.recommandees || []));
    const enTrop = [...deLaFiche].filter((s) => !conseillees.has(s));
    const manquantes = [...conseillees].filter((s) => !deLaFiche.has(s));
    if (enTrop.length || manquantes.length) { signaux.push("specialites"); details.specialites = { enTrop, manquantes }; }
  }
  const cible = fiche.notes ? fiche.notes.moyenne_cible : null;
  let ecart = null;
  if (typeof cible === "number" && typeof moyennePs === "number") {
    ecart = Math.round((cible - moyennePs) * 10) / 10;
    if (Math.abs(ecart) >= SEUIL_MOYENNE - 1e-9) { signaux.push("moyenne"); details.moyenne = { fiche: cible, parcoursup: moyennePs, ecart }; }
  }
  return { signaux, details, ecart, score: signaux.length };
}

// Analyse toutes les fiches maison françaises fusionnées d'un site chargé (chargerCopie).
async function analyserSite(dossier) {
  const { chargerCopie, globalDe } = require("./verification-site");
  const site = await chargerCopie(dossier);
  const cat = globalDe(site).CapCatalogue;
  const lire = (f) => JSON.parse(fs.readFileSync(path.resolve(dossier, "data", f), "utf8"));
  const fil = lire("filieres.json");
  const attendus = cat.tableAttendus(lire("attendus-filieres.json"));
  const lignes = [];
  for (const c of site.CAT) {
    if (c.src !== "fusion" || !c.ps || c.f.pays !== "France" || c.f.__gen) continue;   // fiches maison fusionnées, en France
    const r = c.ps;
    const gen = cat.fichGeneree(r, fil);   // fiche Parcoursup de la même formation : sa moyenne est le calcul de référence
    const a = r.nmc ? attendus[r.nmc] : null;
    const officiel = {
      typePs: cat.typeParcoursup(r),
      attendu: a ? { recommandees: a.recommandees, maths_obligatoire: !!(a.acces && a.acces.maths_obligatoire) } : null,
      moyennePs: gen && gen.notes ? gen.notes.moyenne_cible : null,
    };
    const ev = evaluerFiche(c.f, officiel);
    lignes.push({ id: c.f.id, nom: c.f.nom, etablissement: c.f.etablissement, lien: r.fiche || null, gta: r.gta, ...ev });
  }
  return lignes;
}

const LIB_SPEC = (l) => l.join(", ");
function phrases(l) {
  const p = [];
  if (l.details.type) p.push(`type « ${l.details.type.fiche} » sur la fiche, « ${l.details.type.parcoursup} » d'après Parcoursup`);
  if (l.details.specialites) {
    const s = l.details.specialites;
    if (s.enTrop.length) p.push(`spécialités de la fiche que l'État ne conseille pas : ${LIB_SPEC(s.enTrop)}`);
    if (s.manquantes.length) p.push(`spécialités conseillées par l'État absentes de la fiche : ${LIB_SPEC(s.manquantes)}`);
  }
  if (l.details.moyenne) { const m = l.details.moyenne; p.push(`moyenne visée ${m.fiche} sur la fiche, ${m.parcoursup} chez les admis (écart de ${Math.abs(m.ecart).toString().replace(".", ",")} points)`); }
  return p;
}

const triSuspectes = (a, b) => b.score - a.score || Math.abs(b.ecart || 0) - Math.abs(a.ecart || 0) || (a.id < b.id ? -1 : 1);

function rapport(lignes) {
  const tot = { type: 0, specialites: 0, moyenne: 0 };
  for (const l of lignes) for (const s of l.signaux) tot[s]++;
  const parScore = [0, 1, 2, 3].map((n) => lignes.filter((l) => l.score === n).length);
  const top = lignes.filter((l) => l.score > 0).sort(triSuspectes).slice(0, TAILLE_LISTE);
  const e = (t) => String(t || "").replace(/\|/g, "/");
  let md = `# Fiches maison suspectes\n\n`;
  md += `Ce rapport est généré par \`node scripts/fiches-suspectes.js\`. Il ne change rien au site : il repère seulement les fiches Mon Plan Sup (fusionnées avec Parcoursup, en France) dont les estimations maison contredisent les données officielles. Un signal n'est pas une preuve d'erreur : c'est un endroit où regarder en premier.\n\n`;
  md += `## Les trois signaux\n\n`;
  md += `1. **Type** : ${SIGNAUX.type}.\n2. **Spécialités** : ${SIGNAUX.specialites} (une spécialité obligatoire ou recommandée de la fiche n'est pas conseillée par l'État, ou une spécialité conseillée par l'État manque). Seules les formations dont les attendus nationaux sont connus sont contrôlées.\n3. **Moyenne** : ${SIGNAUX.moyenne} (écart d'au moins ${String(SEUIL_MOYENNE).replace(".", ",")} points, estimation tirée des mentions des admis).\n\n`;
  md += `## Totaux\n\n${lignes.length} fiches contrôlées.\n\n| Signal | Fiches concernées |\n|---|---|\n`;
  md += `| Type différent de Parcoursup | ${tot.type} |\n| Spécialités contraires aux attendus officiels | ${tot.specialites} |\n| Moyenne visée éloignée de celle des admis | ${tot.moyenne} |\n\n`;
  md += `| Score (nombre de signaux) | Fiches |\n|---|---|\n` + parScore.map((n, i) => `| ${i} | ${n} |`).join("\n") + `\n\n`;
  md += `## Les ${TAILLE_LISTE} fiches les plus suspectes\n\n`;
  md += `| Rang | Identifiant | Nom | Établissement | Signaux | Parcoursup |\n|---|---|---|---|---|---|\n`;
  top.forEach((l, i) => { md += `| ${i + 1} | ${l.id} | ${e(l.nom)} | ${e(l.etablissement)} | ${e(phrases(l).join(" ; "))} | ${l.lien ? `[fiche](${l.lien})` : "lien non disponible"} |\n`; });
  md += `\n`;
  return { md, tot, parScore, top };
}

async function main() {
  const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
  const dossier = arg("--dossier", path.join(__dirname, ".."));
  const lignes = await analyserSite(dossier);
  const r = rapport(lignes);
  if (!process.argv.includes("--sans-rapport")) fs.writeFileSync(path.resolve(arg("--rapport", path.join(dossier, "docs", "fiches-suspectes.md"))), r.md);
  console.log(`${lignes.length} fiches contrôlées`);
  console.log(`Totaux : type ${r.tot.type}, spécialités ${r.tot.specialites}, moyenne ${r.tot.moyenne}`);
  console.log(`Scores : ${r.parScore.map((n, i) => `${i} signal : ${n}`).join(" ; ")}`);
  r.top.slice(0, 10).forEach((l, i) => console.log(`${i + 1}. ${l.id} | ${l.nom} | ${l.etablissement} | ${l.signaux.join("+")} | écart ${l.ecart}`));
}

module.exports = { SEUIL_MOYENNE, TAILLE_LISTE, evaluerFiche, analyserSite, rapport };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(2); });
