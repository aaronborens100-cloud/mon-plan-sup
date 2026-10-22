/*
 * scripts/verification-site.js : outils communs à scripts/comparer-versions.js et scripts/controles.js.
 *
 * - chargerCopie(dossier) : charge une copie du site (un dossier qui contient js/, data/ et tests/charger-site.js)
 *   avec SON propre tests/charger-site.js, puis fige la date du jour (DATE_FIGEE) dans le contexte du site :
 *   « aujourd'hui », les jours restants, le calendrier de Mon plan et la date d'enregistrement ne changent plus
 *   d'un lancement à l'autre ;
 * - sorties(site, p) : ce que le moteur produit pour un profil (recommander, wishlist, etranger, nouvelles,
 *   equivalentsListe, protection, statsProfil) ;
 * - pages(site, p) : le HTML des pages pour ce profil (accueil, profil, liste, proposition de vœux, liste après
 *   génération des 10 vœux, plan, explorer, données, fiche du 1er vœu, et en option les fiches des autres vœux) ;
 * - serialiser(x) : JSON déterministe (Set, Map, NaN, undefined, objets d'un autre contexte vm).
 *
 * Aucun fichier du site n'est modifié : tout se passe dans le contexte vm créé par tests/charger-site.js.
 */
"use strict";
const path = require("path");

// Date figée : la même que tests/instantane.js (DATE_TEST), à midi (heure locale), pour éviter tout effet de fuseau.
const DATE_FIGEE = "2026-10-01T12:00:00";

// Objet global du contexte vm du site (le constructeur Function de ce contexte renvoie son « this » global)
const globalDe = (site) => site.E.recommander.constructor("return this")();

// Remplace Date dans le contexte du site : new Date() et Date.now() renvoient DATE_FIGEE ; avec des arguments,
// Date se comporte normalement. Le site lit Date au moment de l'appel (jamais au chargement des scripts), donc
// remplacer Date après le chargement suffit.
function figerDate(site, iso = DATE_FIGEE) {
  const g = globalDe(site);
  const Vraie = g.Date;
  const fixe = new Vraie(iso).getTime();
  class DateFigee extends Vraie {
    constructor(...a) { if (a.length) super(...a); else super(fixe); }
    static now() { return fixe; }
  }
  g.Date = DateFigee;
  return fixe;
}

async function chargerCopie(dossier, { date = DATE_FIGEE } = {}) {
  const { chargerSite } = require(path.resolve(dossier, "tests", "charger-site.js"));
  // l'état initial n'est pas lu ici : chaque profil est importé ensuite par le site lui-même (voir importer())
  const site = await chargerSite({}, { etat: { profil: {}, reponses: {}, retenus: [], profilTermine: true, qIndex: 999 } });
  figerDate(site, date);
  // document.querySelector("#import") renvoie le champ d'import (seul champ lu par l'action « importer »)
  const g = globalDe(site);
  const doc = g.document;
  site.__import = { value: "" };
  g.document = new Proxy(doc, { get: (t, c) => (c === "querySelector" ? (sel) => (sel === "#import" ? site.__import : t.querySelector(sel)) : t[c]) });
  site.dossier = path.resolve(dossier);
  memoriserRecommander(site);
  return site;
}

// recommander() est une fonction pure (mêmes formations, même profil, mêmes réponses → même résultat) et app.js
// l'appelle pour chaque page : on garde le dernier résultat, pour ne pas recalculer 11 000 formations deux fois par
// profil (sorties() puis pages()). La clé est le texte JSON des arguments ; le catalogue doit être le même objet.
function memoriserRecommander(site) {
  const E = site.E, vrai = E.recommander;
  let cle = null, valeur = null, formations = null;
  E.recommander = function (f, profil, questionnaire, reponses) {
    const k = JSON.stringify([profil, questionnaire === site.QUEST ? "Q" : questionnaire, reponses]);
    if (f !== formations || k !== cle) { valeur = vrai.call(this, f, profil, questionnaire, reponses); cle = k; formations = f; }
    return valeur;
  };
}

// État enregistré pour un profil : même forme que dans les tests (profil terminé, questionnaire passé)
const etatDe = (p) => ({ profil: p.profil, reponses: p.reponses, retenus: [], remplacements: {}, faits: {}, profilTermine: true, qIndex: 999 });

// Charge le profil dans le site par l'action « importer » de Mes données (le code du site remplace tout l'état :
// profil, réponses, vœux retenus, remplacements) : un seul chargement du site sert pour tous les profils.
function importer(site, p) {
  site.__import.value = JSON.stringify(etatDe(p));
  site.cliquer({ action: "importer" });
  const e = site.etatEnregistre();
  if (!e || JSON.stringify(e.profil) !== JSON.stringify(Object.assign({}, e.profil, p.profil))) throw new Error(`Import du profil ${p.id} impossible.`);
}

/* ---------------------------------------------------------------- sérialisation déterministe */
const typeDe = (v) => Object.prototype.toString.call(v).slice(8, -1);   // fonctionne entre contextes vm
// Une formation notée (objet avec une fiche « f ») ailleurs que dans la liste complète est réduite à son identité :
// son contenu complet est déjà comparé dans recommander.resultats.
const estResultat = (v) => v && typeof v === "object" && v.f && typeof v.f === "object" && typeof v.f.id === "string" && "categorie" in v;
function propre(v, profondeur = 0, resultatsComplets = false) {
  if (v === undefined) return "⟨undefined⟩";
  if (typeof v === "number") return Number.isFinite(v) ? v : `⟨${v}⟩`;
  if (typeof v === "function") return "⟨fonction⟩";
  if (v === null || typeof v !== "object") return v;
  const t = typeDe(v);
  if (t === "Set") return { "⟨Set⟩": [...v].map((x) => propre(x, profondeur + 1)).sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1)) };
  if (t === "Map") return { "⟨Map⟩": [...v].map(([k, x]) => [propre(k, profondeur + 1), propre(x, profondeur + 1)]) };
  if (t === "Date") return `⟨Date ${v.toISOString()}⟩`;
  if (Array.isArray(v)) {
    const o = v.map((x) => propre(x, profondeur + 1, resultatsComplets));
    // propriétés ajoutées à un tableau (exemple : equivalentsListe(...).choix est sur une Map)
    return o;
  }
  if (estResultat(v) && !(resultatsComplets && profondeur === 1)) return { "⟨formation⟩": v.f.id, categorie: v.categorie, pertinence: propre(v.pertinence) };
  const o = {};
  for (const k of Object.keys(v)) o[k] = k === "f" && v.f && typeof v.f.id === "string" ? `⟨fiche ${v.f.id}⟩` : propre(v[k], profondeur + 1);
  return o;
}
const serialiser = (v) => JSON.stringify(propre(v));

/* ---------------------------------------------------------------- sorties du moteur */
// resultats : la liste complète, chaque formation notée en entier (sauf sa fiche, réduite à son id)
function sorties(site, p) {
  const { E, DATA, QUEST } = site;
  const A = E.recommander(DATA.formations, p.profil, QUEST, p.reponses);
  const W = E.wishlist(A.resultats, 10, A.interets);
  const X = E.etranger(A.resultats, W, A.interets);   // sans date : la date figée du site est utilisée
  const N = E.nouvelles(A.resultats, A.interets);
  const M = E.equivalentsListe(A.resultats, W);
  const P = E.protection(W.liste);
  const S = E.statsProfil(p.profil);
  return { A, W, X, N, M, P, S };
}
// version comparable : { nom de la sortie : chaîne JSON }
function sortiesComparables(o) {
  return {
    recommander: JSON.stringify({ stats: propre(o.A.stats), interets: propre(o.A.interets), resultats: o.A.resultats.map((x) => propre(x, 1, true)) }),
    wishlist: JSON.stringify(Object.assign(propre(o.W), { "⟨diversite⟩": propre(o.W.diversite) })),
    etranger: serialiser(o.X),
    nouvelles: serialiser(o.N),
    equivalentsListe: JSON.stringify({ equivalents: propre(o.M), choix: propre(o.M.choix) }),
    protection: serialiser(o.P),
    statsProfil: serialiser(o.S),
  };
}

/* ---------------------------------------------------------------- pages */
// Ordre fixe : chaque page part du même état. Renvoie { nom de la page : HTML }, plus les vœux retenus après génération.
function pages(site, p, { toutesLesFiches = false } = {}) {
  importer(site, p);
  const out = {};
  out.accueil = site.afficher("#accueil");
  out.profil = site.afficher("#profil");
  site.cliquer({ action: "onglet-liste", o: "reco" });
  out.liste = site.afficher("#liste");
  out["liste-proposition"] = site.cliquer({ action: "onglet-liste", o: "voeux" });
  out["liste-apres-generation"] = site.cliquer({ action: "auto-retenir" });
  site.cliquer({ action: "onglet-liste", o: "reco" });
  const retenus = (site.etatEnregistre() || {}).retenus || [];
  out.plan = site.afficher("#plan");
  out.explorer = site.afficher("#explorer");
  out.donnees = site.afficher("#donnees");
  const fiches = toutesLesFiches ? retenus : retenus.slice(0, 1);
  fiches.forEach((id, i) => { out[i === 0 ? "fiche-1er-voeu" : `fiche-voeu-${i + 1}`] = site.afficher("#formation-" + id); });
  return { pages: out, retenus };
}

module.exports = { DATE_FIGEE, chargerCopie, figerDate, globalDe, etatDe, importer, propre, serialiser, sorties, sortiesComparables, pages };
