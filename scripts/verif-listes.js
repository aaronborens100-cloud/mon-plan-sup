// Vérification indépendante d'une version du dépôt : listes de 10 vœux + contrôles permanents.
// Usage : node verif.js <dossier du dépôt> > sortie.txt
const path = require("path");
const racine = path.resolve(process.argv[2] || ".");
process.chdir(racine);
const { chargerSite } = require(path.join(racine, "tests/charger-site.js"));
const P = require(path.join(racine, "tests/profils.js"));
const LIMITE = { 0: 45, 1: 250 };
(async () => {
  const { E, DATA, QUEST } = await chargerSite();
  const echecs = [];
  for (const p of P) {
    const R = E.recommander(DATA.formations, p.profil, QUEST, p.reponses);
    const W = E.wishlist(R.resultats, 10, R.interets);
    const s = E.statsProfil(p.profil);
    const mob = R.interets && R.interets.prefs ? R.interets.prefs.mobilite : undefined;
    const nbSec = W.liste.filter((x) => x.categorie === "securite").length;
    console.log(`== ${p.id} | moy ${s.moyenneGenerale} maths ${s.maths} exp ${s.expertes} | mobilite ${mob} | protection ${W.protection && W.protection.niveau} (${nbSec} sûrs) | ${W.liste.length} vœux`);
    console.log(`   msg: ${W.protection && W.protection.message}`);
    if (E.alerteBac) { try { const a = E.alerteBac(s); if (a) console.log(`   bac: ${typeof a === "string" ? a : JSON.stringify(a)}`); } catch (e) {} }
    (W.alertes || []).forEach((a) => console.log(`   alerte: ${typeof a === "string" ? a : JSON.stringify(a)}`));
    W.liste.forEach((x, i) => {
      const r = x.repere || {};
      console.log(`  ${i + 1}. ${x.categorie} | ${r.taux ?? "?"}% ${r.position ?? "?"} | ${x.dist != null ? Math.round(x.dist) + "km" : "?km"} | ${x.f.nom.slice(0, 70)} | ${x.f.ville} | pert ${x.pertinence}`);
      const err = (m) => echecs.push(`${p.id} #${i + 1} ${x.f.nom.slice(0, 50)} (${x.f.ville}) : ${m}`);
      const regles = E.reglesHorsListe(x.f);
      if (regles.length) err("hors liste : " + regles.join(","));
      if (x.f.stats === "sans_stats" || x.f.stats === "nouvelle_2026" || r.taux == null) err("sans statistiques");
      if (typeof x.f.__pctBG === "number" && x.f.__pctBG < E.SEUIL_BAC_GENERAL) err("bac pro");
      if (x.categorie === "securite" && r.taux != null && r.taux < 50) err(`sécurité sous 50 % (${r.taux})`);
      if (x.categorie === "securite" && LIMITE[mob] != null && x.dist != null && x.dist > LIMITE[mob]) err(`sécurité hors mobilité (${Math.round(x.dist)} km > ${LIMITE[mob]})`);
    });
    if (W.liste.length !== 10 && p.id !== "vide") echecs.push(`${p.id} : ${W.liste.length} vœux`);
    if (nbSec < 3 && W.protection && W.protection.niveau === "bon") echecs.push(`${p.id} : protection « bon » avec ${nbSec} sûrs`);
  }
  console.log("\n#### ÉCHECS DES CONTRÔLES PERMANENTS (" + echecs.length + ")");
  echecs.forEach((e) => console.log(" - " + e));
})();
