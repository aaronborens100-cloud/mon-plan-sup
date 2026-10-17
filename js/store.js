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
      reponses: {}, qIndex: 0, retenus: [], faits: {}, majLe: null,
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
