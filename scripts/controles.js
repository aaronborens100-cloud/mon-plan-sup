#!/usr/bin/env node
/*
 * scripts/controles.js : contrôles permanents du moteur et des pages, sur des profils aléatoires.
 *
 * Usage : npm run controles   (ou : node scripts/controles.js [--n 300] [--graine 20261022] [--dossier .] [--json fichier])
 *
 * Profils : tests/profils-aleatoires.js (300 par défaut, graine fixe). Date du jour figée (scripts/verification-site.js).
 * Chaque règle est nommée ; le rapport donne, pour chaque règle, le nombre de violations, le nombre de profils touchés
 * et un exemple (profil + formation). Les règles viennent de js/moteur.js et de docs/modele-chances.md : elles sont
 * recalculées ici à partir des données (distance, territoire, taux, part de bacheliers généraux…), sans relire les
 * drapeaux posés par le moteur (horsDistance, horsTerritoire…), pour qu'une erreur du moteur ne se cache pas
 * elle-même. Interprétations retenues (toujours la plus stricte) : voir docs/methode-controles.md.
 *
 * Ces contrôles vérifient que les règles écrites sont respectées. Ils ne jugent pas la pertinence des vœux.
 * Code de sortie : 0 sans violation, 1 avec des violations, 2 en cas d'erreur.
 */
"use strict";
const path = require("path");
const fs = require("fs");
const { chargerCopie, sorties, pages, DATE_FIGEE } = require("./verification-site");
const { genererProfils, GRAINE_DEFAUT, N_DEFAUT } = require("../tests/profils-aleatoires");

/* ---------------------------------------------------------------- règles */
const REGLES = {
  voeu_sans_statistiques: "Aucun vœu (liste de 10 ou équivalent proposé) sans taux d'accès publié (stats.json, session antérieure ou relevé manuel)",
  voeu_bac_pro: "Aucun vœu visant les bacs pro : part de bacheliers généraux admis < 20 % (SEUIL_BAC_GENERAL) ou catégorie « Certificats de spécialisation et FCIL »",
  securite_sous_50: "Aucune formation « sécurité » avec un taux d'accès inférieur à 50 % ou non publié",
  securite_hors_distance: "Aucune formation « sécurité » au-delà de la distance acceptée (45 km « domicile », 250 km « proche »), de l'autre côté de la mer ou à l'étranger",
  securite_distance_inconnue: "Aucune formation « sécurité » sans coordonnées pour un élève « domicile » ou « proche » qui a indiqué son lycée",
  securite_hors_territoire: "Aucune formation « sécurité » hors des territoires acceptés (zone du lycée + zones cochées dans « pays »)",
  domicile_au_dela_45_km: "Élève « domicile » avec lycée : aucun vœu (liste ou équivalent) à plus de 45 km (traversée comprise), quelle que soit sa catégorie ; seule exception (décision du 30/10/2026) : un vœu ambitieux ou réaliste de la liste de 10 qui porte la mention « Hors de ta zone de mobilité »",
  dix_voeux: "La liste proposée compte 10 vœux",
  alerte_moins_de_3_surs: "Moins de 3 vœux « sécurité » dans la liste ⇒ l'alerte « Pas assez de vœux vraiment sûrs » est affichée (page Mes vœux)",
  protection_coherente: "Le message de protection correspond au nombre de vœux « sécurité » et est affiché (page Mes vœux)",
  message_moyenne_sous_10: "Moyenne sous 10 ⇔ message « Ta moyenne est sous 10… » en tête de Ma liste (recommandées et Mes vœux)",
  message_sans_notes: "Profil sans moyenne : protection « Renseigne tes bulletins », aucune formation « sécurité », message affiché",
  message_sans_lycee: "Profil sans lycée ⇔ message « Indique ton lycée… » sur Ma liste",
  pourcentage_personnel: "Aucun pourcentage personnel dans les pages (« tes chances : X % », « X % de chances », fourchette « X–Y % », « probabilité … X % »)",
  prepa_scientifique_sans_maths: "Aucune prépa scientifique MPSI, PCSI, PTSI ou MP2I (liste de 10, équivalents, nouvelle formation) pour un élève sans la spécialité maths (maths complémentaires non comptées)",
  prepa_scientifique_sans_maths_recommandees: "Aucune prépa MPSI, PCSI, PTSI ou MP2I dans les 10 recommandations affichées pour un élève sans la spécialité maths",
  html_nan_undefined_null: "Aucun « NaN », « undefined », « null » ni « [object Object] » dans le texte visible des pages",
  html_element_vide: "Aucun élément de texte visible vide (p, li, h1-h6, dt, dd, td, th, a, button, strong, b, em, label, summary, option)",
};

const ALERTE_SURS = /Pas assez de vœux vraiment sûrs/;
const MESSAGES_PROTECTION = (n) => (n === 0 ? "aucun" : n === 1 ? "insuffisant" : n === 2 ? "minimum" : "bon");
// motifs de « pourcentage personnel » (tests/categories.test.js, élargis)
const POURCENTAGES = [
  [/\btes chances\b[^<.]{0,60}?\d+(?:[.,]\d+)?\s*%/i, "« tes chances … X % »"],
  [/\d+(?:[.,]\d+)?\s*%\s*de chances/i, "« X % de chances »"],
  [/\bchances? (?:estimée|d['’]admission|d['’]être pris)[^<.]{0,40}?\d+(?:[.,]\d+)?\s*%/i, "« chances … X % »"],
  [/\d+\s*[–-]\s*\d+\s*%/, "fourchette en pourcentage"],
  [/probabilit[ée][^<.]{0,40}?\d+(?:[.,]\d+)?\s*%/i, "« probabilité … X % »"],
  [/>\s*Tes chances/i, "titre « Tes chances »"],
];
const BALISES_TEXTE = ["p", "li", "h1", "h2", "h3", "h4", "h5", "h6", "dt", "dd", "td", "th", "a", "button", "strong", "b", "em", "label", "summary", "option"];

// texte visible : sans scripts, styles, commentaires ni balises ; entités principales décodées
const texteVisible = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, " ")
  .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const extrait = (s, i, l = 80) => s.slice(Math.max(0, i - l), i + l).replace(/\s+/g, " ").trim();

// Éléments de texte vides : <p></p>, <li> </li>, <strong><span></span></strong>… Un élément qui ne contient que
// des balises sans texte compte comme vide, sauf s'il porte une image, une icône SVG, un champ, ou un nom accessible
// (aria-label, title).
function elementsVides(html) {
  const out = [];
  const re = new RegExp(`<(${BALISES_TEXTE.join("|")})(\\s[^>]*)?>([\\s\\S]*?)</\\1>`, "gi");
  let m;
  while ((m = re.exec(html))) {
    const [tout, balise, attrs = "", contenu] = m;
    if (/aria-label=|title=|aria-hidden="true"|class="[^"]*sr-only/.test(attrs)) continue;
    if (/<(svg|img|input|select|textarea|canvas|video|iframe)\b/i.test(contenu)) continue;
    if (/aria-label=|title=/.test(contenu)) continue;
    // contenu imbriqué de même balise (li dans li…) : seul le texte compte
    if (texteVisible(contenu).trim() === "") out.push({ balise, extrait: extrait(html, m.index + tout.length / 2, 120) });
  }
  return out;
}

/* ---------------------------------------------------------------- géographie (recalculée ici) */
function geographie(E, s, x) {
  const f = x.f;
  const lieu = f.pays === "France" ? E.situer(f) : { zone: null, etranger: true };
  const loin = f.pays !== "France" || lieu.etranger;
  const dist = s.geo && f.__gps && !loin ? E.km(s.geo, f.__gps) : null;
  const traversee = dist !== null && !!s.zone && !!lieu.zone && lieu.zone !== s.zone;
  return { lieu, loin, dist, traversee };
}
function territoireAccepte(E, s, p, x) {
  const f = x.f;
  if (f.pays !== "France" || E.situer(f).etranger) return true;   // l'étranger n'est pas un territoire
  const pays = p.pays;
  if (!Array.isArray(pays) || !pays.length) return true;          // sans réponse : aucune restriction
  const t = E.territoireDe(f);
  const coches = pays.filter((v) => ["corse", "outremer", "continent"].includes(v));
  if (coches.includes(t)) return true;
  const eleveContinent = !s.zone || s.zone === "continent";
  if (t === "continent") return eleveContinent;
  return !eleveContinent && E.situer(f).zone === s.zone;
}
const aSpecialiteMaths = (profil) => (profil.specialites || []).includes("maths");

/* ---------------------------------------------------------------- contrôle d'un profil */
function controler(site, p) {
  const { E } = site;
  const v = [];   // { regle, formation, detail, page }
  const ajoute = (regle, formation, detail, page) => v.push({ regle, formation: formation || null, detail: detail || "", page: page || null });
  const o = sorties(site, p);
  const { A, W, N, M } = o;
  const s = A.stats, pr = A.interets.prefs;
  const mob = pr.mobilite;
  const lim = { 0: 45, 1: 250 }[mob];
  const nom = (x) => `${x.f.id} — ${x.f.nom} (${x.f.etablissement}, ${x.f.ville})`;

  // vœux : liste de 10 et équivalents proposés (une formation proposée comme vœu est un vœu possible)
  const equivalents = [];
  for (const l of M.values()) equivalents.push(...l);
  const voeux = [...W.liste.map((x) => ["liste", x]), ...equivalents.map((x) => ["équivalent", x])];
  for (const [ou, x] of voeux) {
    const f = x.f;
    if (!f.admission || typeof f.admission.taux !== "number") ajoute("voeu_sans_statistiques", nom(x), `${ou} ; stats = ${f.stats || "?"}`);
    const pctBG = f.__pctBG;
    if ((f.__tf || []).includes("Certificats de spécialisation et FCIL") || (typeof pctBG === "number" && pctBG < 20))
      ajoute("voeu_bac_pro", nom(x), `${ou} ; bacheliers généraux ${pctBG} %, catégorie ${(f.__tf || []).join(", ")}`);
    if (mob === 0 && s.geo) {
      const g = geographie(E, s, x);
      // Décision du fondateur du 30/10/2026 (liste 3 / 4 / 3) : un vœu AMBITIEUX ou RÉALISTE de la liste de 10 peut dépasser la zone
      // « domicile » s'il le dit (« Hors de ta zone de mobilité » dans l'explication du vœu). Jamais « sécurité », jamais un équivalent.
      const ditHorsZone = ou === "liste" && (x.categorie === "ambitieux" || x.categorie === "realiste")
        && /Hors de ta zone de mobilité/.test((x.repere && x.repere.pourquoi) || "");
      if (!ditHorsZone && (g.loin || (g.dist !== null && g.dist + (g.traversee ? E.SURCOUT_TRAVERSEE_KM : 0) > 45)))
        ajoute("domicile_au_dela_45_km", nom(x), `${ou} ; ${g.loin ? "à l'étranger" : `${Math.round(g.dist)} km${g.traversee ? " + traversée" : ""}`}`);
    }
  }
  // nouvelles : seule la règle bac pro (catégorie) peut être vérifiée (sans statistiques par construction)
  for (const x of N) if ((x.f.__tf || []).includes("Certificats de spécialisation et FCIL")) ajoute("voeu_bac_pro", nom(x), "nouvelle formation");

  // catégorie « sécurité » : TOUTES les formations notées (affichées sur leur fiche et dans le catalogue)
  for (const x of A.resultats) {
    if (x.categorie !== "securite") continue;
    const t = x.repere && x.repere.taux;
    if (typeof t !== "number" || t < 50) ajoute("securite_sous_50", nom(x), `taux ${t}`);
    if (s.geo && (mob === 0 || mob === 1)) {
      const g = geographie(E, s, x);
      if (g.loin || g.traversee || (g.dist !== null && g.dist > lim))
        ajoute("securite_hors_distance", nom(x), `${mob === 0 ? "domicile" : "proche"} ; ${g.loin ? "à l'étranger" : `${Math.round(g.dist)} km${g.traversee ? ", traversée" : ""}`}`);
      else if (g.dist === null) ajoute("securite_distance_inconnue", nom(x), `${mob === 0 ? "domicile" : "proche"} ; pas de coordonnées`);
    }
    if (!territoireAccepte(E, s, pr, x)) ajoute("securite_hors_territoire", nom(x), `formation : ${E.territoireDe(x.f)} ; lycée : ${s.zone || "aucun"} ; pays : ${(pr.pays || []).join(", ")}`);
    if (s.moyenneGenerale === null) ajoute("message_sans_notes", nom(x), "formation « sécurité » pour un élève sans moyenne");
  }

  // liste de 10, alerte, protection
  const nbSecu = W.liste.filter((x) => x.categorie === "securite").length;
  if (W.liste.length !== 10) ajoute("dix_voeux", null, `${W.liste.length} vœux${mob === 0 && s.geo ? " (élève « domicile » : conséquence assumée, docs/modele-chances.md 8.3)" : ""}`);
  const sansNotes = s.moyenneGenerale === null;
  // Issue #43 : sans lycée + « domicile » ou « proche », des formations auraient été « sécurité » sans la règle « sans_lycee » :
  // 0 vœu « sécurité », niveau « sans_lycee », message « Indique ton lycée » en tête de Ma liste, pas d'alerte « pas assez
  // de vœux sûrs ». Tout autre profil garde les règles ordinaires.
  const sansLyceeSansSecurite = !s.geo && (mob === 0 || mob === 1) && nbSecu === 0 && W.protection.niveau === "sans_lycee"
    && A.resultats.some((x) => x.repere && x.repere.regle === "sans_lycee");
  const attenduNiveau = W.liste.length && W.liste.every((x) => x.repere && x.repere.sansNotes) ? "sans_notes" : sansLyceeSansSecurite ? "sans_lycee" : MESSAGES_PROTECTION(nbSecu);
  if (W.protection.nbSecurite !== nbSecu || W.protection.niveau !== attenduNiveau)
    ajoute("protection_coherente", null, `${nbSecu} « sécurité », niveau ${W.protection.niveau} (attendu ${attenduNiveau})`);
  if (sansNotes && W.liste.length && W.protection.niveau !== "sans_notes") ajoute("message_sans_notes", null, `protection : ${W.protection.niveau}`);

  // pages
  const { pages: P } = pages(site, p, { toutesLesFiches: true });
  const esc = (t) => String(t).replace(/'/g, "&#39;").replace(/"/g, "&quot;");
  const prop = P["liste-proposition"] || "";
  if (sansLyceeSansSecurite) {
    // tête de Ma liste : le message « Indique ton lycée » est avant les onglets, et l'ancienne alerte est absente
    const msgLycee = esc(E.MESSAGE_SANS_LYCEE);
    if (prop.indexOf(msgLycee) < 0 || prop.indexOf(msgLycee) > prop.indexOf('data-action="onglet-liste"'))
      ajoute("alerte_moins_de_3_surs", null, "sans lycée : message « Indique ton lycée » absent ou pas en tête de Ma liste", "liste-proposition");
    if (ALERTE_SURS.test(prop)) ajoute("alerte_moins_de_3_surs", null, "sans lycée : ancienne alerte « pas assez de vœux sûrs » encore affichée (double alerte)", "liste-proposition");
  } else if (nbSecu < 3 && W.liste.length && !ALERTE_SURS.test(prop)) ajoute("alerte_moins_de_3_surs", null, `${nbSecu} vœu(x) « sécurité », alerte absente de la page`, "liste-proposition");
  if (W.liste.length && !prop.includes(esc(W.protection.message).replace(/&quot;/g, '"')) && !prop.includes(esc(W.protection.message)))
    ajoute("protection_coherente", null, "message de protection absent de la page", "liste-proposition");
  const bac = esc(E.MESSAGE_BAC);
  const sous10 = s.moyenneGenerale !== null && s.moyenneGenerale < 10;
  for (const k of ["liste", "liste-proposition"]) {
    if (sous10 !== P[k].includes(bac)) ajoute("message_moyenne_sous_10", null, `moyenne ${s.moyenneGenerale} ; message ${P[k].includes(bac) ? "affiché" : "absent"}`, k);
    const lyc = P[k].includes(esc(E.MESSAGE_SANS_LYCEE));
    if (!s.geo !== lyc) ajoute("message_sans_lycee", null, `lycée ${s.geo ? "indiqué" : "absent"} ; message ${lyc ? "affiché" : "absent"}`, k);
  }
  if (sansNotes && W.liste.length && !/Renseigne tes bulletins/.test(prop)) ajoute("message_sans_notes", null, "« Renseigne tes bulletins » absent", "liste-proposition");
  for (const [k, html] of Object.entries(P)) {
    const texte = texteVisible(html);
    for (const [re, quoi] of POURCENTAGES) { const m = html.match(re); if (m) ajoute("pourcentage_personnel", null, `${quoi} : « ${extrait(html, m.index)} »`, k); }
    const m = texte.match(/\bNaN\b|\bundefined\b|\bnull\b|\[object Object\]/);
    if (m) ajoute("html_nan_undefined_null", null, `« ${m[0]} » : « ${extrait(texte, m.index)} »`, k);
    for (const e of elementsVides(html)) ajoute("html_element_vide", null, `<${e.balise}> vide : « ${e.extrait} »`, k);
  }

  // prépa scientifique sans spécialité maths
  if (!aSpecialiteMaths(p.profil) && (p.profil.specialites || []).length) {
    for (const [ou, x] of [...voeux, ...N.map((x) => ["nouvelle formation", x])])
      if (E.estPrepaMaths(x.f)) ajoute("prepa_scientifique_sans_maths", nom(x), `${ou} ; spécialités ${p.profil.specialites.join(" + ")}${p.profil.optionMaths !== "aucune" ? `, maths ${p.profil.optionMaths}` : ""}`);
    // les 10 recommandations affichées (prépas regroupées par famille sur la page : on lit les 10 premières non exclues)
    for (const x of A.resultats.filter((y) => !y.exclu).slice(0, 10))
      if (E.estPrepaMaths(x.f)) ajoute("prepa_scientifique_sans_maths_recommandees", nom(x), `spécialités ${p.profil.specialites.join(" + ")}`);
  }
  return v;
}

/* ---------------------------------------------------------------- exécution (deux fils) */
function travailleur() {
  const { parentPort, workerData } = require("worker_threads");
  (async () => {
    const site = await chargerCopie(workerData.dossier);
    const profils = genererProfils(workerData.n, workerData.graine).filter((_, i) => i % workerData.nb === workerData.rang);
    for (const p of profils) {
      let v;
      try { v = controler(site, p); } catch (e) { parentPort.postMessage({ erreur: `${p.id} : ${e.stack}` }); return; }
      parentPort.postMessage({ id: p.id, violations: v });
    }
    parentPort.postMessage({ fini: true });
  })().catch((e) => parentPort.postMessage({ erreur: e.stack }));
}

function options(argv) {
  const o = { n: N_DEFAUT, graine: GRAINE_DEFAUT, dossier: path.join(__dirname, ".."), json: null, fils: 2 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--n") o.n = Number(argv[++i]);
    else if (a === "--graine") o.graine = Number(argv[++i]);
    else if (a === "--dossier") o.dossier = path.resolve(argv[++i]);
    else if (a === "--json") o.json = argv[++i];
    else if (a === "--fils") o.fils = Math.max(1, Number(argv[++i]));
  }
  return o;
}

async function main() {
  const o = options(process.argv.slice(2));
  const debut = Date.now();
  const { Worker } = require("worker_threads");
  const profils = genererProfils(o.n, o.graine);
  const desc = new Map(profils.map((p) => [p.id, p.description]));
  console.log(`Contrôles permanents : ${o.n} profils aléatoires (graine ${o.graine}), site ${o.dossier}, date figée ${DATE_FIGEE}`);
  const resultats = new Map();
  await Promise.all(Array.from({ length: o.fils }, (_, rang) => new Promise((ok, ko) => {
    const w = new Worker(__filename, { workerData: { dossier: o.dossier, n: o.n, graine: o.graine, rang, nb: o.fils }, resourceLimits: { maxOldGenerationSizeMb: 3072 } });
    w.on("message", (m) => {
      if (m.erreur) { ko(new Error(m.erreur)); w.terminate(); return; }
      if (m.fini) { w.terminate(); ok(); return; }
      resultats.set(m.id, m.violations);
      if (resultats.size % 25 === 0) process.stderr.write(`  ${resultats.size}/${o.n} profils\n`);
    });
    w.on("error", ko);
  })));

  // rapport, dans l'ordre des profils
  const parRegle = Object.fromEntries(Object.keys(REGLES).map((k) => [k, { n: 0, profils: new Set(), exemple: null }]));
  for (const p of profils) for (const x of resultats.get(p.id) || []) {
    const r = parRegle[x.regle];
    r.n++; r.profils.add(p.id);
    if (!r.exemple) r.exemple = { profil: p.id, description: desc.get(p.id), formation: x.formation, detail: x.detail, page: x.page };
  }
  const duree = ((Date.now() - debut) / 1000).toFixed(1);
  console.log(`\n${profils.length} profils contrôlés en ${duree} s.\n`);
  let total = 0;
  for (const [k, texte] of Object.entries(REGLES)) {
    const r = parRegle[k];
    total += r.n;
    console.log(`${r.n ? "ÉCHEC" : "ok   "}  ${k} : ${r.n} violation(s)${r.n ? `, ${r.profils.size} profil(s)` : ""}\n       ${texte}`);
    if (r.exemple) {
      const e = r.exemple;
      console.log(`       exemple : ${e.profil} (${e.description})${e.formation ? `\n                 formation : ${e.formation}` : ""}${e.page ? `\n                 page : ${e.page}` : ""}\n                 ${e.detail}`);
    }
  }
  console.log(`\nTotal : ${total} violation(s).`);
  if (o.json) {
    const sortie = { date: DATE_FIGEE, n: o.n, graine: o.graine, duree_s: Number(duree),
      regles: Object.fromEntries(Object.entries(parRegle).map(([k, r]) => [k, { texte: REGLES[k], violations: r.n, profils: r.profils.size, exemple: r.exemple }])),
      detail: Object.fromEntries(profils.map((p) => [p.id, resultats.get(p.id) || []])) };
    fs.writeFileSync(o.json, JSON.stringify(sortie, null, 1));
    console.log(`Détail complet : ${o.json}`);
  }
  process.exit(total ? 1 : 0);
}

module.exports = { REGLES, controler, texteVisible, elementsVides };

if (require.main === module || !require("worker_threads").isMainThread) {
  if (require("worker_threads").isMainThread) main().catch((e) => { console.error(e.stack); process.exit(2); });
  else travailleur();
}
