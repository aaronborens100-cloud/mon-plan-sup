#!/usr/bin/env node
/*
 * scripts/comparer-versions.js : compare deux copies du site, profil par profil (règle 5 de CLAUDE.md).
 *
 * Usage : node scripts/comparer-versions.js <dossierA> <dossierB> [--n 300] [--graine 20261022] [--details 20]
 *   (ou : npm run comparer -- <dossierA> <dossierB> [--n 300])
 *
 * Chaque dossier est une copie complète du dépôt (js/, data/, tests/charger-site.js), par exemple :
 *   git worktree add /tmp/avant main
 *   node scripts/comparer-versions.js /tmp/avant .
 *
 * Profils : les 14 de tests/profils.js, puis N profils aléatoires à graine fixe (tests/profils-aleatoires.js ;
 * N = 300 par défaut, --n 0 pour les seuls profils types).
 * Sorties comparées en égalité stricte (texte JSON identique) : recommander (liste complète, chaque formation notée
 * en entier), wishlist, etranger, nouvelles, equivalentsListe, protection, statsProfil, et le HTML des pages :
 * accueil, profil, liste (recommandées), proposition de vœux, liste après génération des 10 vœux, plan, explorer
 * (catalogue), données, fiche du 1er vœu retenu.
 * La date du jour est figée (scripts/verification-site.js, DATE_FIGEE) dans les deux copies : aucune différence ne
 * peut venir de « aujourd'hui » ni des jours restants.
 *
 * Sortie : nombre de profils, nombre de différences, détail des 20 premières (profil, sortie, avant / après autour du
 * premier écart). Code de sortie : 0 sans différence, 1 avec des différences, 2 en cas d'erreur.
 */
"use strict";
const path = require("path");
const { chargerCopie, sorties, sortiesComparables, pages, DATE_FIGEE } = require("./verification-site");
const PROFILS = require("../tests/profils");
const { genererProfils, GRAINE_DEFAUT, N_DEFAUT } = require("../tests/profils-aleatoires");

function options(argv) {
  const o = { dossiers: [], n: N_DEFAUT, graine: GRAINE_DEFAUT, details: 20 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--n") o.n = Number(argv[++i]);
    else if (a === "--graine") o.graine = Number(argv[++i]);
    else if (a === "--details") o.details = Number(argv[++i]);
    else if (a === "-h" || a === "--help") o.aide = true;
    else o.dossiers.push(a);
  }
  return o;
}

// Copie indépendante d'une chaîne. Un « slice » d'une longue chaîne garde la chaîne entière en mémoire (V8 ne copie pas) :
// sans cette copie, chaque différence retenue empêchait de libérer les pages HTML et les JSON de recommander complets,
// et le script manquait de mémoire dès que beaucoup de résultats changeaient.
function detacher(s) { return JSON.parse(JSON.stringify(s)); }

// Extrait lisible autour du premier caractère qui diffère
function premierEcart(a, b) {
  let i = 0;
  const n = Math.min(a.length, b.length);
  while (i < n && a[i] === b[i]) i++;
  const debut = Math.max(0, i - 120);
  const extrait = (s) => (debut > 0 ? "…" : "") + detacher(s.slice(debut, i + 180)) + (s.length > i + 180 ? "…" : "");
  return { position: i, avant: extrait(a), apres: extrait(b), longueurs: [a.length, b.length] };
}

// Pour recommander (très long), on nomme la formation concernée : premier résultat qui diffère
function ecartRecommander(a, b) {
  const A = JSON.parse(a), B = JSON.parse(b);
  for (const k of ["stats", "interets"]) if (JSON.stringify(A[k]) !== JSON.stringify(B[k])) return { quoi: k, ...premierEcart(JSON.stringify(A[k]), JSON.stringify(B[k])) };
  if (A.resultats.length !== B.resultats.length) return { quoi: `nombre de formations notées (${A.resultats.length} → ${B.resultats.length})`, ...premierEcart(a, b) };
  let nb = 0, premier = null;
  for (let i = 0; i < A.resultats.length; i++) {
    const x = JSON.stringify(A.resultats[i]), y = JSON.stringify(B.resultats[i]);
    if (x !== y) { nb++; if (!premier) premier = { rang: i + 1, id: detacher(String(A.resultats[i].f)), idApres: detacher(String(B.resultats[i].f)), ...premierEcart(x, y) }; }
  }
  return { quoi: `${nb} formation(s) notée(s) différente(s), première au rang ${premier.rang} (${premier.id}${premier.idApres !== premier.id ? ` → ${premier.idApres}` : ""})`, ...premier };
}

/* ---------------------------------------------------------------- un fil d'exécution par copie */
// Chaque copie du site est chargée dans son propre worker (deux cœurs au lieu d'un) ; le fil principal envoie les
// profils un par un et compare les deux réponses avant de passer au suivant (mémoire bornée).
function travailleur() {
  const { parentPort, workerData } = require("worker_threads");
  (async () => {
    const site = await chargerCopie(workerData.dossier);
    parentPort.postMessage({ pret: true });
    parentPort.on("message", (p) => {
      try {
        const s = sortiesComparables(sorties(site, p));
        const pg = pages(site, p).pages;
        parentPort.postMessage({ id: p.id, sorties: s, pages: pg });
      } catch (e) { parentPort.postMessage({ id: p.id, erreur: e.stack }); }
    });
  })().catch((e) => parentPort.postMessage({ erreur: e.stack }));
}

function lancer(dossier) {
  const { Worker } = require("worker_threads");
  const w = new Worker(__filename, { workerData: { dossier }, resourceLimits: { maxOldGenerationSizeMb: 3072 } });
  let attente = null;
  w.on("message", (m) => { const a = attente; attente = null; if (a) a(m); });
  w.on("error", (e) => { console.error(e.stack); process.exit(2); });
  const recevoir = () => new Promise((r) => { attente = r; });
  return {
    pret: recevoir().then((m) => { if (m.erreur) throw new Error(m.erreur); }),
    calculer: (p) => { const r = recevoir(); w.postMessage(p); return r; },
    fermer: () => w.terminate(),
  };
}

async function main() {
  const o = options(process.argv.slice(2));
  if (o.aide || o.dossiers.length !== 2) {
    console.log("Usage : node scripts/comparer-versions.js <dossierA> <dossierB> [--n 300] [--graine 20261022] [--details 20]");
    process.exit(o.aide ? 0 : 2);
  }
  const debut = Date.now();
  const [dA, dB] = o.dossiers.map((d) => path.resolve(d));
  console.log(`Comparaison : A = ${dA}\n              B = ${dB}\nDate figée : ${DATE_FIGEE}`);
  const A = lancer(dA), B = lancer(dB);
  await Promise.all([A.pret, B.pret]);
  const profils = [...PROFILS.map((p) => Object.assign({ sorte: "type" }, p)), ...genererProfils(o.n, o.graine)];
  console.log(`Profils : ${PROFILS.length} profils types + ${o.n} aléatoires (graine ${o.graine})`);

  const diffs = [];
  const parSortie = {};
  const profilsTouches = new Set();
  let i = 0;
  for (const p of profils) {
    i++;
    const ligne = (nom, a, b, ecart) => {
      diffs.push({ profil: p.id, description: p.description, sortie: nom, ...ecart(a, b) });
      parSortie[nom] = (parSortie[nom] || 0) + 1;
      profilsTouches.add(p.id);
    };
    const [ra, rb] = await Promise.all([A.calculer(p), B.calculer(p)]);
    for (const r of [ra, rb]) if (r.erreur) { console.error(`Erreur sur le profil ${p.id} : ${r.erreur}`); process.exit(2); }
    const sa = ra.sorties, sb = rb.sorties, pa = ra, pb = rb;
    for (const k of Object.keys(sa)) if (sa[k] !== sb[k]) ligne(k, sa[k], sb[k], k === "recommander" ? ecartRecommander : premierEcart);
    const noms = new Set([...Object.keys(pa.pages), ...Object.keys(pb.pages)]);
    for (const k of noms) {
      const a = pa.pages[k] ?? "⟨page absente⟩", b = pb.pages[k] ?? "⟨page absente⟩";
      if (a !== b) ligne(`page ${k}`, a, b, premierEcart);
    }
    if (i % 25 === 0 || i === profils.length) process.stderr.write(`  ${i}/${profils.length} profils, ${diffs.length} différence(s)\n`);
  }

  A.fermer(); B.fermer();
  const duree = ((Date.now() - debut) / 1000).toFixed(1);
  console.log(`\n${profils.length} profils comparés en ${duree} s.`);
  console.log(`${diffs.length} différence(s), dans ${profilsTouches.size} profil(s).`);
  if (diffs.length) {
    console.log("Par sortie :", Object.entries(parSortie).map(([k, v]) => `${k} ${v}`).join(", "));
    console.log(`\nDétail des ${Math.min(o.details, diffs.length)} premières :`);
    for (const d of diffs.slice(0, o.details)) {
      console.log(`\n— profil ${d.profil} (${d.description})\n  sortie : ${d.sortie}${d.quoi ? ` : ${d.quoi}` : ""}`);
      console.log(`  premier écart au caractère ${d.position} (longueurs ${d.longueurs[0]} → ${d.longueurs[1]})`);
      console.log(`  avant : ${d.avant.replace(/\s+/g, " ")}`);
      console.log(`  après : ${d.apres.replace(/\s+/g, " ")}`);
    }
  }
  process.exit(diffs.length ? 1 : 0);
}

if (require("worker_threads").isMainThread) main().catch((e) => { console.error(e.stack); process.exit(2); });
else travailleur();
