/*
 * tests/statuts-stats.test.js : formations sans statistiques 2025 (data/statuts-stats.json)
 * et relevés manuels (data/stats-manuelles.json).
 *
 * Règles vérifiées, pour les 10 profils types :
 *   - une formation « nouvelle_2026 » n'est jamais en « sécurité » ni en « réaliste », n'a pas de
 *     fourchette de chances, et une liste de vœux en compte au plus 2 ;
 *   - une formation « sans_stats » n'entre jamais dans une liste de vœux ;
 *   - un relevé manuel sourcé fait passer la formation en « avec_stats », un relevé sans source est ignoré.
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
const STATUTS = lire("data/statuts-stats.json").formations;
let site;

test.before(async () => { site = await chargerSite(); });

const listes = (s, formations, p) => {
  const R = s.E.recommander(formations, p.profil, s.QUEST, p.reponses);
  return { R, W: s.E.wishlist(R.resultats, 10, R.interets) };
};
function verifierListe(W, E) {
  const nouvelles = W.liste.filter((x) => x.f.stats === "nouvelle_2026");
  assert.ok(nouvelles.length <= E.MAX_NOUVELLES, `${nouvelles.length} nouvelles formations dans la liste (au plus ${E.MAX_NOUVELLES}).`);
  for (const x of nouvelles) {
    assert.equal(x.categorie, "ambitieux", `${x.f.id} : nouvelle formation classée « ${x.categorie} ».`);
    assert.equal(x.chance.bas, null, `${x.f.id} : fourchette de chances affichée pour une nouvelle formation.`);
  }
  for (const x of W.liste) assert.notEqual(x.f.stats, "sans_stats", `${x.f.id} : formation sans statistiques dans la liste.`);
}

test("chaque formation Parcoursup générée sans statistiques a un statut", () => {
  const sans = site.DATA.formations.filter((f) => f.__gen && f.__gen.fam && f.admission.statut === "non_communique");
  assert.ok(sans.length > 0);
  for (const f of sans) {
    assert.ok(["nouvelle_2026", "sans_stats"].includes(f.stats), `${f.id} : statut « ${f.stats} ».`);
    assert.equal(f.stats, STATUTS[f.__gen.gta].stats);
  }
  const avec = site.DATA.formations.filter((f) => f.__gen && f.__gen.fam && f.admission.statut === "officiel");
  for (const f of avec) assert.equal(f.stats, "avec_stats");
});

for (const p of PROFILS) {
  test(`profil « ${p.id} » : nouvelles formations limitées, aucune formation sans statistiques`, () => {
    const { R, W } = listes(site, site.DATA.formations, p);
    verifierListe(W, site.E);
    for (const x of R.resultats) if (x.f.stats === "nouvelle_2026") {
      assert.equal(x.categorie, "ambitieux", `${x.f.id} : nouvelle formation classée « ${x.categorie} ».`);
      assert.equal(x.chance.mid, null);
    }
  });
}

test("plafond de 2 nouvelles formations, même quand elles sont les plus pertinentes", () => {
  // Les 40 formations les plus pertinentes de chaque profil deviennent artificiellement « nouvelles ».
  for (const p of PROFILS) {
    const { R } = listes(site, site.DATA.formations, p);
    const cibles = new Set(R.resultats.filter((x) => x.f.pays === "France").slice(0, 40).map((x) => x.f.id));
    const formations = site.DATA.formations.map((f) => (cibles.has(f.id) ? Object.assign({}, f, { stats: "nouvelle_2026" }) : f));
    const { W } = listes(site, formations, p);
    verifierListe(W, site.E);
  }
});

test("relevé manuel : sourcé, il rend la formation éligible ; sans source, il est ignoré", async () => {
  const [g1, g2] = Object.entries(STATUTS).filter(([, e]) => e.stats === "sans_stats").map(([g]) => g)
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
