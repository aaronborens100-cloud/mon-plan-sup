/*
 * tests/statuts-stats.test.js : formations sans statistiques 2025 (data/statuts-stats.json)
 * et relevés manuels (data/stats-manuelles.json).
 *
 * Règles vérifiées, pour les 10 profils types :
 *   - aucune formation « nouvelle_2026 » ni « sans_stats » dans la liste de 10 vœux (wishlist) ;
 *   - la section « Nouvelles à la rentrée 2026 » (nouvelles) compte au plus 3 formations, toutes
 *     « nouvelle_2026 », d'une catégorie Parcoursup de la liste blanche, triées par intérêt ;
 *   - ni fourchette de chances pour une nouvelle formation, ni estimation pour une « sans_stats » ;
 *   - un relevé manuel sourcé fait passer la formation en « avec_stats », un relevé sans source est ignoré ;
 *   - des statistiques de la session 2024 rendent la formation éligible, pas celles de 2023.
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
const STATUTS = lire("data/statuts-stats.json");
let site;

test.before(async () => { site = await chargerSite(); });

const analyser = (s, formations, p) => {
  const R = s.E.recommander(formations, p.profil, s.QUEST, p.reponses);
  return { R, W: s.E.wishlist(R.resultats, 10, R.interets), N: s.E.nouvelles(R.resultats, R.interets) };
};
function verifier({ W, N }, E) {
  for (const x of W.liste) {
    assert.notEqual(x.f.stats, "nouvelle_2026", `${x.f.id} : nouvelle formation dans la liste de 10 vœux.`);
    assert.notEqual(x.f.stats, "sans_stats", `${x.f.id} : formation sans statistiques dans la liste de 10 vœux.`);
  }
  assert.ok(N.length <= 3, `${N.length} formations dans la section « Nouvelles » (au plus 3).`);
  for (const x of N) {
    assert.equal(x.f.stats, "nouvelle_2026", `${x.f.id} : pas une nouvelle formation.`);
    assert.ok((x.f.__tf || []).some((t) => E.CATEGORIES_NOUVELLES.includes(t)), `${x.f.id} : catégorie hors liste blanche (${x.f.__tf}).`);
    assert.equal(x.chance.bas, null, `${x.f.id} : fourchette de chances pour une nouvelle formation.`);
  }
  for (let i = 1; i < N.length; i++) assert.ok(N[i - 1].interet >= N[i].interet, "Section « Nouvelles » non triée par intérêt.");
}

test("chaque formation Parcoursup générée sans statistiques a un statut", () => {
  const sans = site.DATA.formations.filter((f) => f.__gen && f.__gen.fam && f.admission.statut === "non_communique");
  assert.ok(sans.length > 0);
  for (const f of sans) {
    assert.ok(["nouvelle_2026", "sans_stats"].includes(f.stats), `${f.id} : statut « ${f.stats} ».`);
    assert.equal(f.stats, STATUTS.formations[f.__gen.gta].stats);
  }
  for (const f of site.DATA.formations.filter((f) => f.__gen && f.__gen.fam && f.admission.statut === "officiel")) assert.equal(f.stats, "avec_stats");
});

for (const p of PROFILS) {
  test(`profil « ${p.id} » : ni nouvelle ni « sans_stats » dans les vœux, section « Nouvelles » limitée`, () => {
    const a = analyser(site, site.DATA.formations, p);
    verifier(a, site.E);
    for (const x of a.R.resultats) if (x.f.stats === "sans_stats") assert.equal(x.chance.mid, null, `${x.f.id} : estimation de chances sans statistiques.`);
  });
}

test("section « Nouvelles » : au plus 3, même quand les nouvelles formations sont les plus pertinentes", () => {
  // Les 40 formations les plus pertinentes de chaque profil deviennent artificiellement « nouvelles ».
  let plein = 0;
  for (const p of PROFILS) {
    const { R } = analyser(site, site.DATA.formations, p);
    const cibles = new Set(R.resultats.filter((x) => x.f.pays === "France").slice(0, 40).map((x) => x.f.id));
    const formations = site.DATA.formations.map((f) => (cibles.has(f.id) ? Object.assign({}, f, { stats: "nouvelle_2026" }) : f));
    const a = analyser(site, formations, p);
    verifier(a, site.E);
    if (a.N.length === 3) plein++;
  }
  assert.ok(plein > 0, "Le plafond de 3 n'est jamais atteint : test sans portée.");
});

test("liste blanche : une nouvelle formation hors des catégories retenues n'est jamais proposée", () => {
  const f = site.DATA.formations.find((x) => x.stats === "nouvelle_2026" && !(x.__tf || []).some((t) => site.E.CATEGORIES_NOUVELLES.includes(t)));
  assert.ok(f, "Aucune nouvelle formation hors liste blanche : test sans portée.");
  assert.ok(site.E.reglesHorsListe(f).includes("nouvelle_hors_categories"));
});

test("relevé manuel : sourcé, il rend la formation éligible ; sans source, il est ignoré", async () => {
  const [g1, g2] = Object.entries(STATUTS.formations).filter(([, e]) => e.stats === "sans_stats").map(([g]) => g)
    .filter((g) => site.DATA.formations.some((f) => f.id === "psup-" + g)).slice(0, 2);
  const man = lire("data/stats-manuelles.json");
  man.formations = {
    [g1]: { taux: 42, places: 30, voeux: 400, admis: 29, session: "2024", source: "https://exemple.fr/releve", consulte_le: "2026-10-18", statut: "releve_manuel" },
    [g2]: { taux: 42, places: 30, voeux: 400, admis: 29, session: "2024", consulte_le: "2026-10-18", statut: "releve_manuel" },
  };
  const s = await chargerSite({ "data/stats-manuelles.json": man });
  const f1 = s.DATA.formations.find((f) => f.id === "psup-" + g1), f2 = s.DATA.formations.find((f) => f.id === "psup-" + g2);
  assert.equal(f1.stats, "avec_stats");
  assert.equal(f1.admission.taux, 42);
  assert.equal(f1.admission.source, "https://exemple.fr/releve");
  assert.equal(f1.admission.statut, "releve_manuel");
  assert.ok(!s.E.reglesHorsListe(f1).includes("sans_stats"));
  assert.equal(f2.stats, "sans_stats");
  assert.ok(s.E.reglesHorsListe(f2).includes("sans_stats"));
});

test("statistiques d'une session antérieure : 2024 rend la formation éligible, 2023 non", async () => {
  const [g1, g2] = Object.entries(STATUTS.formations).filter(([, e]) => e.stats === "sans_stats").map(([g]) => g)
    .filter((g) => site.DATA.formations.some((f) => f.id === "psup-" + g)).slice(0, 2);
  const anc = (session) => ({ taux: 55, places: 30, voeux: 400, admis: 28, session, source: "https://data.enseignementsup-recherche.gouv.fr/explore/dataset/fr-esr-parcoursup/", consulte_le: "2026-10-18", statut: "officiel" });
  const st = JSON.parse(JSON.stringify(STATUTS));
  st.formations[g1] = { stats: "avec_stats", certitude: "verifiee", anciennes: anc("2024") };
  st.formations[g2] = { stats: "sans_stats", certitude: "verifiee", anciennes: anc("2023") };
  const s = await chargerSite({ "data/statuts-stats.json": st });
  const f1 = s.DATA.formations.find((f) => f.id === "psup-" + g1), f2 = s.DATA.formations.find((f) => f.id === "psup-" + g2);
  assert.equal(f1.stats, "avec_stats");
  assert.equal(f1.admission.taux, 55);
  assert.equal(f1.admission.session, "2024");
  assert.match(f1.admission.texte, /statistiques de la session 2024/);
  assert.equal(f1.admission.consulte_le, "2026-10-18");
  assert.ok(!s.E.reglesHorsListe(f1).includes("sans_stats"));
  assert.equal(f2.stats, "sans_stats");
  assert.equal(f2.admission.taux, null);
  assert.equal(f2.stats_anciennes.session, "2023");
  assert.ok(s.E.reglesHorsListe(f2).includes("sans_stats"));
});
