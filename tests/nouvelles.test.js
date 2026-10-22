/*
 * tests/nouvelles.test.js : section « Nouvelle formation à la rentrée 2026 » (décisions du fondateur du 22/10/2026).
 *
 * Règles vérifiées :
 *   - une seule formation dans la section (MAX_NOUVELLES = 1), pour les 14 profils types ;
 *   - avertissement « filière très sélective » seulement si la moyenne générale est sous 12 et si le taux d'accès
 *     moyen 2025 des formations de la même filière (nmc) est sous SEUIL_FILIERE_TRES_SELECTIVE ;
 *   - fragile (9,5) voit l'avertissement quand sa formation est dans une filière très sélective (Sciences Po – HKU) ;
 *   - un élève à 14 ne le voit jamais ; une filière sans statistiques 2025 ne déclenche rien ;
 *   - le taux moyen de chaque filière est bien la moyenne de taux_acces_ens de stats.json (recalculé ici).
 *
 * Lancer : npm test
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { chargerSite } = require("./charger-site");
const PROFILS = require("./profils");

const lire = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", f), "utf8"));
const profil = (id) => PROFILS.find((p) => p.id === id);
const SCPO_HKU = "psup-52341", DEUST_PTP_APP = "psup-53243";
let site;

test.before(async () => { site = await chargerSite(); });

const analyser = (s, formations, p) => {
  const R = s.E.recommander(formations, p.profil, s.QUEST, p.reponses);
  return { R, N: s.E.nouvelles(R.resultats, R.interets) };
};
const fiche = (id) => { const f = site.DATA.formations.find((x) => x.id === id); assert.ok(f, `${id} absente du catalogue`); return f; };
// même élève, moyenne générale remplacée (pour tester le seuil de 12 sans changer le reste)
const avecMoyenne = (s, m) => Object.assign({}, s, { moyenneGenerale: m });

test("taux d'accès moyen 2025 par filière : recalculé depuis parcoursup.json et stats.json", () => {
  const ps = lire("data/parcoursup.json"), st = lire("data/stats.json");
  const K = ps.meta.cles, iN = K.indexOf("nmc"), iG = K.indexOf("gta"), iT = st.meta.cols.indexOf("taux_acces_ens");
  const v = {};
  for (const L of ps.l) {
    const n = L[iN] == null ? null : ps.s[L[iN]], g = ps.s[L[iG]], r = st.rows[g];
    if (n && r && typeof r[iT] === "number") (v[n] = v[n] || []).push(r[iT]);
  }
  for (const [nmc, nb, arrondi] of [["ScPo-Lic", 16, 7], ["L1-STAPS", 125, 36], ["FECM-B3", 133, 68]]) {
    const t = site.E.tauxFiliere({ __nmc: nmc });
    assert.equal(t.nb, nb, `${nmc} : nombre de formations 2025`);
    assert.equal(t.nb, v[nmc].length);
    assert.ok(Math.abs(t.moyenne - v[nmc].reduce((a, x) => a + x, 0) / v[nmc].length) < 1e-9);
    assert.equal(Math.round(t.moyenne), arrondi);
  }
  assert.equal(site.E.tauxFiliere({ __nmc: "DEUST-PTP-App" }), null, "DEUST-PTP-App : aucune formation avec stats 2025");
});

// Contrôles permanents, pour les 14 profils
for (const p of PROFILS) {
  test(`profil « ${p.id} » : au plus 1 formation, avertissement seulement sous 12 et filière très sélective`, () => {
    const { R, N } = analyser(site, site.DATA.formations, p);
    assert.ok(N.length <= site.E.MAX_NOUVELLES && site.E.MAX_NOUVELLES === 1, `${N.length} formations dans la section`);
    for (const x of N) {
      const al = site.E.alerteFiliereSelective(x.f, R.stats), t = site.E.tauxFiliere(x.f), mg = R.stats.moyenneGenerale;
      const attendu = typeof mg === "number" && mg < site.E.SEUIL_MOYENNE_FILIERE_SELECTIVE && !!t && t.moyenne < site.E.SEUIL_FILIERE_TRES_SELECTIVE;
      assert.equal(!!al, attendu, `${x.f.id} : avertissement ${al ? "affiché" : "absent"} (moyenne ${mg}, filière ${t ? t.moyenne : "sans stats"})`);
    }
  });
}

test("fragile (9,5) : avertissement quand sa formation est dans une filière très sélective (affiché dans « Mes vœux »)", async () => {
  const p = profil("fragile");
  // Les deux bachelors (FECM-B3, 68 %) qui passent avant Sciences Po – HKU deviennent « sans_stats » : HKU devient la nouvelle proposée.
  const statuts = lire("data/statuts-stats.json");
  for (const g of ["51307", "52795"]) statuts.formations[g] = Object.assign({}, statuts.formations[g], { stats: "sans_stats" });
  const s = await chargerSite({ "data/statuts-stats.json": statuts }, { etat: { profil: p.profil, reponses: p.reponses, retenus: [], profilTermine: true, qIndex: 999 } });
  const { R, N } = analyser(s, s.DATA.formations, p);
  assert.deepEqual(N.map((x) => x.f.id), [SCPO_HKU]);
  const al = s.E.alerteFiliereSelective(N[0].f, R.stats);
  assert.ok(al, "pas d'avertissement pour fragile");
  assert.equal(al.nb, 16);
  assert.equal(al.texte, "Formation très sélective dans cette filière : en 2025, 7 % des candidats en moyenne ont reçu une proposition dans les formations de la même filière.");
  s.afficher("#liste");
  const html = s.cliquer({ action: "onglet-liste", o: "voeux" });
  assert.ok(html.includes(al.texte), "avertissement absent de l'onglet « Mes vœux »");
  assert.ok(html.includes("Nouvelle formation à la rentrée 2026") && !html.includes("Nouvelles formations à la rentrée 2026"), "titre au singulier");
  assert.ok(html.includes("Cette formation ouvre cette année : elle correspond à ton profil"), "texte au singulier");
});

test("élève à 14 : jamais d'avertissement, même dans une filière très sélective", () => {
  const s14 = analyser(site, site.DATA.formations, profil("droit-sciencespo")).R.stats;
  assert.ok(s14.moyenneGenerale >= 14);
  assert.equal(site.E.alerteFiliereSelective(fiche(SCPO_HKU), avecMoyenne(s14, 14)), null);
  // aucune nouvelle formation du catalogue, quelle que soit sa filière
  for (const f of site.DATA.formations.filter((x) => x.stats === "nouvelle_2026")) assert.equal(site.E.alerteFiliereSelective(f, avecMoyenne(s14, 14)), null, f.id);
  // seuil : 12 pile ne déclenche rien, 11,99 si
  const sf = analyser(site, site.DATA.formations, profil("fragile")).R.stats;
  assert.equal(site.E.alerteFiliereSelective(fiche(SCPO_HKU), avecMoyenne(sf, 12)), null);
  assert.ok(site.E.alerteFiliereSelective(fiche(SCPO_HKU), avecMoyenne(sf, 11.99)));
  // sans moyenne : on ne sait pas
  assert.equal(site.E.alerteFiliereSelective(fiche(SCPO_HKU), avecMoyenne(sf, null)), null);
});

test("filière sans statistiques 2025 : pas d'avertissement", () => {
  const f = fiche(DEUST_PTP_APP);
  assert.equal(f.__nmc, "DEUST-PTP-App");
  assert.equal(site.E.tauxFiliere(f), null);
  const sf = analyser(site, site.DATA.formations, profil("fragile")).R.stats;
  assert.ok(sf.moyenneGenerale < 12);
  assert.equal(site.E.alerteFiliereSelective(f, sf), null);
});
