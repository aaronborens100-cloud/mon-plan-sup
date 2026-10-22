/*
 * js/store.js : enregistrement des données de l'élève (CapStore).
 *
 * Rôle : lire, écrire et effacer l'état de l'élève (profil, notes, réponses au questionnaire,
 * vœux retenus, formations équivalentes choisies à la place d'un vœu) dans le stockage local du navigateur (localStorage, clé « capsup.v1 »).
 * Si le stockage est indisponible, l'état est gardé en mémoire le temps de la visite.
 * Rien n'est envoyé sur un serveur.
 *
 * Expose : window.CapStore (lire, ecrire, effacer, vide, fusion, stockageDisponible, KEY).
 * Ordre de chargement : 1er des 4 scripts de js/ (aucune dépendance).
 */
/* Mon Plan Sup — stockage local (aucune donnée n'est envoyée sur un serveur). */
(function () {
  "use strict";
  const KEY = "capsup.v1";

  function vide() {
    return {
      profil: {
        prenom: "", niveau: "terminale", specialites: [], specialiteAbandonnee: "", optionMaths: "aucune", autresOptions: "",
        anglaisAuto: "", periodes: [], bacFrancais: { ecrit: "", oral: "" }, certifications: [], experiences: [],
      },
      // remplacements : { id du vœu proposé : id de la formation équivalente choisie à sa place } (Ma liste)
      reponses: {}, qIndex: 0, retenus: [], remplacements: {}, faits: {}, majLe: null,
    };
  }

  let memoire = null; // repli si le stockage du navigateur est indisponible
  function lire() {
    try {
      const brut = localStorage.getItem(KEY);
      if (brut) return fusion(vide(), JSON.parse(brut));
    } catch (e) { /* stockage indisponible */ }
    return memoire ? fusion(vide(), memoire) : vide();
  }
  function fusion(base, x) {
    if (!x || typeof x !== "object") return base;
    const out = Object.assign(base, x);
    out.profil = Object.assign(vide().profil, x.profil || {});
    return out;
  }
  function ecrire(etat) {
    etat.majLe = new Date().toISOString();
    memoire = JSON.parse(JSON.stringify(etat));
    try { localStorage.setItem(KEY, JSON.stringify(etat)); return true; } catch (e) { return false; }
  }
  function effacer() {
    memoire = null;
    try { localStorage.removeItem(KEY); } catch (e) { /* rien */ }
  }
  function stockageDisponible() {
    try { localStorage.setItem("capsup.test", "1"); localStorage.removeItem("capsup.test"); return true; } catch (e) { return false; }
  }

  window.CapStore = { lire, ecrire, effacer, vide, fusion, stockageDisponible, KEY };
})();
