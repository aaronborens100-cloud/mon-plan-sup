/*
 * tests/charger-site.js : charge le vrai code du site dans Node, sans navigateur.
 *
 * Les quatre scripts de js/ sont exécutés tels quels, dans l'ordre de index.html, avec une
 * fausse page minimale (document, localStorage, fetch qui lit data/ sur le disque).
 * Le catalogue est donc construit exactement comme sur le site (construireCatalogue dans
 * app.js), sans recopier sa logique ici.
 *
 * Renvoie { E, B, DATA, QUEST, afficher, cliquer } : E = CapEngine, B = CapBulletin, DATA.formations = catalogue complet,
 * QUEST = questionnaire. Pour lire les pages : passer l'état de l'élève (options.etat, même forme que
 * CapStore), puis afficher("#liste") renvoie le HTML de la page, et cliquer({ action, ... }) simule un
 * clic sur un bouton data-action (exemple : { action: "onglet-liste", o: "voeux" }).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RACINE = path.join(__dirname, "..");

// Objet « bouche-trou » : toute propriété, tout appel renvoie à nouveau un bouche-trou.
// Il sert de document et d'éléments HTML : app.js peut dessiner ses vues sans planter,
// et rien de ce qu'il affiche n'a d'effet sur les calculs.
function boucheTrou() {
  const cible = function () {};
  const p = new Proxy(cible, {
    get(_, cle) {
      if (cle === Symbol.toPrimitive) return () => "";
      if (cle === Symbol.iterator) return function* () {};
      if (cle === "length") return 0;
      if (cle === "then") return undefined; // ne pas être pris pour une promesse
      return p;
    },
    set() { return true; },
    apply() { return p; },
    construct() { return p; },
    has() { return true; },
  });
  return p;
}

// remplacements : { "data/fichier.json": objet } pour charger un jeu de données modifié (tests du garde-fou).
// options.etat : état de l'élève enregistré avant le chargement (profil, réponses, vœux retenus…).
async function chargerSite(remplacements = {}, options = {}) {
  const stockage = new Map();
  if (options.etat) stockage.set("capsup.v1", JSON.stringify(options.etat));
  const doc = boucheTrou();
  // #main garde le HTML de la page affichée ; les écouteurs (changement d'adresse, clics) sont gardés pour afficher()
  // et cliquer(). Les autres éléments restent des bouche-trous.
  let html = "";
  const main = { get innerHTML() { return html; }, set innerHTML(v) { html = String(v); }, querySelector: () => null, querySelectorAll: () => [] };
  const ecouteurs = {};
  const ecouter = (type, f) => { (ecouteurs[type] = ecouteurs[type] || []).push(f); };
  const fenetre = {
    console,
    setTimeout: (f) => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    localStorage: {
      getItem: (k) => (stockage.has(k) ? stockage.get(k) : null),
      setItem: (k, v) => stockage.set(k, String(v)), removeItem: (k) => stockage.delete(k),
    },
    location: { hash: "", href: "http://localhost/", pathname: "/" },
    history: boucheTrou(), navigator: boucheTrou(), matchMedia: () => boucheTrou(),
    addEventListener: ecouter, removeEventListener() {}, scrollTo() {}, requestAnimationFrame: () => 0,
    getComputedStyle: () => boucheTrou(), CSS: { escape: (s) => s },
    // Ni document.getElementById ni balise <script> de données : charger() passe par fetch.
    document: new Proxy(doc, { get: (t, c) => (c === "getElementById" ? () => null : c === "querySelector" ? (sel) => (sel === "#main" ? main : t.querySelector(sel))
      : c === "addEventListener" ? ecouter : t[c]) }),
    fetch: async (url) => {
      const rel = String(url).split("?")[0];
      const texte = rel in remplacements ? JSON.stringify(remplacements[rel]) : fs.readFileSync(path.join(RACINE, rel), "utf8");
      return { ok: true, json: async () => JSON.parse(texte), text: async () => texte };
    },
  };
  fenetre.window = fenetre; fenetre.self = fenetre; fenetre.top = fenetre; fenetre.globalThis = fenetre;
  const ctx = vm.createContext(fenetre);
  for (const s of ["store", "bulletin", "moteur", "app"]) {
    const code = fs.readFileSync(path.join(RACINE, "js", s + ".js"), "utf8");
    vm.runInContext(code, ctx, { filename: `js/${s}.js` });
  }
  // app.js charge les données de façon asynchrone puis publie window.__DATA
  for (let i = 0; i < 600 && !fenetre.__DATA; i++) await new Promise((r) => setImmediate(r));
  if (!fenetre.__DATA) throw new Error("Le site n'a pas fini de charger ses données (window.__DATA absent).");
  const afficher = (hash) => { fenetre.location.hash = hash; (ecouteurs.hashchange || []).forEach((f) => f()); return html; };
  const cliquer = ({ action, ...data }) => {
    const bouton = { dataset: { action, ...data }, getAttribute: () => null, setAttribute() {}, closest: () => null };
    (ecouteurs.click || []).forEach((f) => f({ target: { closest: (s) => (s === "[data-action]" ? bouton : null) }, preventDefault() {} }));
    return html;
  };
  return { E: fenetre.CapEngine, B: fenetre.CapBulletin, DATA: fenetre.__DATA, QUEST: fenetre.__QUEST, afficher, cliquer };
}

module.exports = { chargerSite };
