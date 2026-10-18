/*
 * tests/instantane.js : ce que le moteur produit pour un profil, sous une forme comparable.
 *
 * Pour chaque profil, on garde :
 *   - les 40 premières recommandations, en clair (id, intérêt, faisabilité, pertinence,
 *     chances, catégorie), pour voir facilement ce qui a changé ;
 *   - la liste de 10 vœux (wishlist) et les propositions à l'étranger (etranger), en clair ;
 *   - deux empreintes (sha256) de TOUTES les formations notées :
 *       « calculs » : chiffres, catégories, exclusions ;
 *       « textes »  : explications affichées à l'élève (raisons, critères, actions).
 *     Une seule formation qui change, n'importe où dans le classement, change l'empreinte.
 *
 * La date du jour est fixée (DATE_TEST) pour que etranger() donne toujours le même résultat.
 */
"use strict";
const crypto = require("crypto");

const DATE_TEST = "2026-10-01";
const NB_EN_CLAIR = 40;

const empreinte = (x) => crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex");
// Les Set (centres d'intérêt) ne passent pas dans JSON.stringify : on les trie en tableaux.
// Une formation notée (objet avec une fiche « f ») est réduite à l'essentiel, pour que les
// instantanés restent lisibles et ne recopient pas les fiches.
const estSet = (v) => v instanceof Set || (v && v.constructor && v.constructor.name === "Set");
const resume = (x) => ({ id: x.f.id, categorie: x.categorie, pertinence: x.pertinence, chance: x.chance ? [x.chance.bas, x.chance.haut] : null });
const remplacer = (k, v) => (estSet(v) ? [...v].sort() : v && typeof v === "object" && v.f && v.f.id ? resume(v) : v);
const propre = (x) => (x === undefined ? null : JSON.parse(JSON.stringify(x, remplacer)));

function chiffres(r) {
  const c = r.chance || {};
  return { id: r.f.id, interet: r.interet, faisabilite: r.faisabilite, pertinence: r.pertinence,
    chance: [c.bas, c.haut], categorie: r.categorie, bloque: r.bloque, exclu: r.exclu };
}
function textes(r) {
  return { id: r.f.id, raisons: r.raisons, ajust: r.ajust, actions: r.actions,
    criteres: Object.fromEntries(Object.entries(r.crit || {}).map(([k, v]) => [k, propre(v)])), methode: (r.chance || {}).methode };
}

function instantane(site, p) {
  const { E, DATA, QUEST } = site;
  const A = E.recommander(DATA.formations, p.profil, QUEST, p.reponses);
  const W = E.wishlist(A.resultats, 10, A.interets);
  const X = E.etranger(A.resultats, W, A.interets, DATE_TEST);
  return {
    profil: p.id,
    description: p.description,
    nbFormationsNotees: A.resultats.length,
    statsEleve: propre(A.stats),
    interets: propre(A.interets),
    top: A.resultats.slice(0, NB_EN_CLAIR).map(chiffres),
    voeux: propre(W),
    etranger: propre(X),
    empreintes: {
      calculs: empreinte(A.resultats.map(chiffres)),
      textes: empreinte(A.resultats.map(textes)),
    },
  };
}

module.exports = { instantane, DATE_TEST };
