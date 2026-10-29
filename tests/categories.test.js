/*
 * tests/categories.test.js : catégories ambitieux / réaliste / sécurité (docs/modele-chances.md).
 *
 * Règles vérifiées :
 *   - la table des catégories (REGLES_CATEGORIE) sur des repères fabriqués, cas par cas ;
 *   - monotonie : à formation égale, une moyenne plus haute ne donne jamais une catégorie moins bonne ;
 *   - le profil « vide » (aucune note) n'a aucun vœu « sécurité », ni aucune formation « sécurité » ;
 *   - toute formation « sécurité » a un taux d'accès ≥ 50 % et la position « au-dessus », ou un taux ≥ 85 %
 *     (formation très ouverte) et la position « moyenne » ou « au-dessus » ; jamais de point bloquant ;
 *   - aucune formation à au moins 85 % de taux, sans point bloquant, n'est « ambitieux » pour un élève avec notes ;
 *   - moyenne sous 10 : message sur le bac en tête de Ma liste (« fragile »), sans effet sur les catégories ;
 *   - aucun pourcentage personnel (fourchette de chances) n'apparaît plus dans les pages du site.
 *
 * Lancer : npm test
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { chargerSite } = require("./charger-site");
const PROFILS = require("./profils");

let site;
test.before(async () => { site = await chargerSite(); });

const RANG = { ambitieux: 0, realiste: 1, securite: 2 };
const analyser = (p) => {
  const { E, DATA, QUEST } = site;
  const A = E.recommander(DATA.formations, p.profil, QUEST, p.reponses);
  return { A, W: E.wishlist(A.resultats, 10, A.interets) };
};

test("constantes du modèle", () => {
  const E = site.E;
  assert.equal(E.MARGE_BULLETIN, 0.5);
  assert.equal(E.SEUIL_AU_DESSUS, 0.6);
  assert.equal(E.SEUIL_EN_DESSOUS, 0.3);
  assert.equal(E.SEUIL_TAUX_SECURITE, 50);
  assert.equal(E.SEUIL_TAUX_AMBITIEUX, 20);
  assert.equal(E.SEUIL_TAUX_TRES_OUVERT, 85);
  assert.equal(E.LIMITE_REPERE, "Ce n'est pas une probabilité : les jurys regardent aussi ton dossier complet.");
  assert.equal(E.chance, undefined, "l'ancien calcul de fourchette ne doit plus exister");
});

test("table des catégories, cas par cas", () => {
  const E = site.E;
  const cat = (r, bloque = false) => E.REGLES_CATEGORIE.find((g) => g.si(Object.assign({ taux: null, position: "inconnue", sansNotes: false }, r), bloque)).categorie;
  assert.equal(cat({ taux: 50, position: "au_dessus" }), "securite");
  assert.equal(cat({ taux: 49.9, position: "au_dessus" }), "realiste");
  assert.equal(cat({ taux: 84.9, position: "moyenne" }), "realiste");
  assert.equal(cat({ taux: 84.9, position: "en_dessous" }), "ambitieux");
  // formation très ouverte (taux ≥ 85 %)
  assert.equal(cat({ taux: 85, position: "moyenne" }), "securite");
  assert.equal(cat({ taux: 90, position: "au_dessus" }), "securite");
  assert.equal(cat({ taux: 85, position: "en_dessous" }), "realiste");
  assert.equal(cat({ taux: 98, position: "inconnue" }), "realiste", "très ouverte mais position inconnue");
  assert.equal(cat({ taux: 98, position: "moyenne" }, true), "ambitieux", "très ouverte avec point bloquant");
  assert.equal(cat({ taux: 98, position: null, sansNotes: true }), "realiste", "très ouverte sans notes");
  assert.equal(E.REGLES_CATEGORIE.find((g) => g.cle === "tres_ouverte").texte, "Formation très ouverte : au moins 85 % des candidats ont reçu une proposition en 2025.");
  assert.equal(E.REGLES_CATEGORIE.find((g) => g.cle === "tres_ouverte_en_dessous").texte, "Formation très ouverte, mais ta moyenne est en dessous de celle des admis 2025 : candidate, et renforce tes notes.");
  const ordre = E.REGLES_CATEGORIE.map((g) => g.cle);
  for (const avant of ["nouvelle", "bloquant", "sans_notes_ouverte", "sans_notes"]) assert.ok(ordre.indexOf(avant) < ordre.indexOf("tres_ouverte"), `${avant} doit rester prioritaire`);
  assert.ok(ordre.indexOf("tres_ouverte_en_dessous") < ordre.indexOf("en_dessous"));
  assert.equal(cat({ taux: 19.9, position: "au_dessus" }), "ambitieux");
  assert.equal(cat({ taux: 20, position: "moyenne" }), "realiste");
  assert.equal(cat({ taux: 90, position: "au_dessus" }, true), "ambitieux", "point bloquant");
  assert.equal(cat({ taux: null, position: "au_dessus" }), "realiste", "sans taux publié : jamais « sécurité »");
  assert.equal(cat({ taux: 90, position: "inconnue" }), "realiste", "sans mentions : jamais « sécurité »");
  assert.equal(cat({ taux: 90, position: null, sansNotes: true }), "realiste", "sans notes, taux ≥ 50 %");
  assert.equal(cat({ taux: 49, position: null, sansNotes: true }), "ambitieux", "sans notes, taux < 50 %");
  assert.equal(cat({ taux: null, position: null, sansNotes: true }), "ambitieux", "sans notes ni taux");
  assert.equal(cat({ taux: 90, nouvelle: true }), "ambitieux", "nouvelle formation 2026");
});

test("position : moyenne moins la marge, trois niveaux", () => {
  const E = site.E;
  const f = { pays: "France", stats: "avec_stats", admission: { taux: 100 }, mentions_admis: { TBF: 0, TB: 0, B: 13, AB: 31, sans: 56 } };
  const pos = (m) => E.repere(f, { moyenneGenerale: m });
  // 12 → 11,5 : 56 % × 1,5 / 2 = 42 % des admis en dessous
  assert.equal(Math.round(pos(12).percentile * 100), 42);
  assert.equal(pos(12).position, "moyenne");
  assert.equal(pos(13).position, "au_dessus");
  assert.equal(pos(9.5).position, "en_dessous");
  assert.equal(pos(9.5).percentile, 0);
  assert.match(pos(13).texte, /^Ta moyenne te place au-dessus d'environ 64 % des admis de 2025\.$/);
  assert.equal(E.repere(f, { moyenneGenerale: null }).position, null);
  assert.equal(E.repere(Object.assign({}, f, { mentions_admis: null }), { moyenneGenerale: 15 }).position, "inconnue");
});

test("monotonie : à formation égale, une moyenne plus haute ne donne jamais une catégorie moins bonne", () => {
  const { E, DATA, QUEST } = site;
  const p = PROFILS.find((x) => x.id === "eco-moyen");
  const s0 = E.statsProfil(p.profil), it = E.interets(QUEST, p.reponses);
  const moyennes = []; for (let m = 8; m <= 20; m += 0.25) moyennes.push(m);
  const formations = DATA.formations.filter((f, i) => f.mentions_admis || i % 5 === 0);
  let changements = 0;
  for (const f of formations) {
    let avant = -1;
    for (const m of moyennes) {
      const r = RANG[E.evaluer(f, Object.assign({}, s0, { moyenneGenerale: m }), it).categorie];
      assert.ok(r >= avant, `${f.id} : catégorie moins bonne à ${m} de moyenne.`);
      if (avant >= 0 && r > avant) changements++;
      avant = r;
    }
  }
  assert.ok(changements > 100, "Aucune catégorie ne change avec la moyenne : test sans portée.");
});

test("profil « vide » : aucun vœu ni aucune formation « sécurité »", () => {
  const { A, W } = analyser(PROFILS.find((x) => x.id === "vide"));
  assert.equal(W.liste.filter((x) => x.categorie === "securite").length, 0);
  assert.equal(A.resultats.filter((x) => x.categorie === "securite").length, 0);
  assert.equal(W.protection.niveau, "sans_notes");
  for (const x of A.resultats.filter((y) => !y.repere.nouvelle && !y.bloque)) {
    const attendu = x.repere.taux !== null && x.repere.taux >= 50 ? "realiste" : "ambitieux";
    assert.equal(x.categorie, attendu, `${x.f.id} : catégorie sans notes`);
    assert.match(x.repere.pourquoi, /Sans tes notes/);
  }
});

for (const p of PROFILS) {
  test(`profil « ${p.id} » : tout « sécurité » est solide, aucune formation très ouverte n'est « ambitieux »`, () => {
    const { A, W } = analyser(p);
    const secu = A.resultats.filter((x) => x.categorie === "securite");
    for (const x of secu) {
      const t = x.repere.taux, pos = x.repere.position;
      assert.ok(typeof t === "number", `${x.f.id} : taux non publié`);
      // licence non sélective du secteur de l'élève (règle licence_secteur, tests/distance-academie.test.js) : taux ≥ 50 % et position « moyenne »
      const secteur = x.repere.regle === "licence_secteur" && x.repere.secteur === true && t >= 50 && pos === "moyenne";
      // licence de secteur à 100 % d'accès et au moins 50 candidats, sous la moyenne des admis (décision du fondateur, issue #45)
      const secteurOuverte = x.repere.regle === "licence_secteur_ouverte" && x.repere.secteur === true && t === 100 && pos === "en_dessous" && x.f.admission.candidats >= 50;
      assert.ok(secteur || secteurOuverte || (t >= 50 && pos === "au_dessus") || (t >= 85 && (pos === "moyenne" || pos === "au_dessus")), `${x.f.id} : taux ${t}, position ${pos}`);
      assert.ok(!x.bloque, `${x.f.id} : point bloquant`);
    }
    for (const x of A.resultats) {
      if (x.repere.sansNotes || x.bloque || x.repere.taux === null || x.repere.taux < 85) continue;
      assert.notEqual(x.categorie, "ambitieux", `${x.f.id} : taux ${x.repere.taux} %, « ambitieux »`);
    }
    for (const x of W.liste) assert.ok(x.categorie !== "securite" || secu.includes(x));
    // la phrase affichée (pour cent arrondi) et le niveau de position ne se contredisent jamais
    for (const x of A.resultats.filter((y) => y.repere.percentile !== null)) {
      const pc = Math.round(x.repere.percentile * 100), attendu = pc >= 60 ? "au_dessus" : pc >= 30 ? "moyenne" : "en_dessous";
      assert.equal(x.repere.position, attendu, `${x.f.id} : ${pc} % mais position ${x.repere.position}`);
    }
    for (const x of A.resultats) assert.ok(!("chance" in x), `${x.f.id} : ancien champ « chance »`);
  });
}

test("moyenne sous 10 : message sur le bac, sans effet sur les catégories", async () => {
  const E = site.E;
  assert.equal(E.MESSAGE_BAC, "Ta moyenne est sous 10 : toute admission sur Parcoursup dépend de l'obtention de ton bac. C'est ta priorité n° 1 cette année.");
  assert.equal(E.alerteBac({ moyenneGenerale: 9.99 }), E.MESSAGE_BAC);
  assert.equal(E.alerteBac({ moyenneGenerale: 10 }), null);
  assert.equal(E.alerteBac({ moyenneGenerale: null }), null);
  const msg = E.MESSAGE_BAC.replace(/'/g, "&#39;");
  for (const id of ["fragile", "eco-moyen", "vide"]) {
    const p = PROFILS.find((x) => x.id === id);
    const s = await chargerSite({}, { etat: { profil: p.profil, reponses: p.reponses, retenus: [], profilTermine: true, qIndex: 999 } });
    const reco = s.afficher("#liste"), voeux = s.cliquer({ action: "onglet-liste", o: "voeux" });
    assert.equal(reco.includes(msg) && voeux.includes(msg), id === "fragile", `${id} : message sur le bac`);
    if (id === "fragile") assert.match(voeux, /class="notice small protection/, "le message de protection reste affiché");
  }
});

// Pages du site (HTML de #main) : plus de fourchette ni de « % de chances », mais le taux d'accès et la position.
const INTERDITS = [
  [/\d+\s*[–-]\s*\d+\s*%/, "fourchette en pourcentage"],
  [/%\s*de chances/i, "« % de chances »"],
  [/chances estimées/i, "« chances estimées »"],
  [/Estimation entre/i, "« Estimation entre »"],
  [/>Tes chances/, "titre « Tes chances »"],
];
const verifierPage = (nom, html) => {
  assert.ok(html.length > 500, `${nom} : page vide`);
  for (const [re, quoi] of INTERDITS) { const m = html.match(re); assert.ok(!m, `${nom} : ${quoi} (« ${m && html.slice(Math.max(0, m.index - 60), m.index + 40)} »)`); }
};
for (const id of ["eco-moyen", "fragile", "eco-excellent-decide", "vide"]) {
  test(`profil « ${id} » : aucun pourcentage personnel dans les pages`, async () => {
    const p0 = PROFILS.find((x) => x.id === id);
    // profil « vide » : une spécialité cochée pour débloquer Ma liste et Mon plan (page verrouillée sinon, profilPret)
    const p = id === "vide" ? Object.assign({}, p0, { profil: Object.assign({}, p0.profil, { specialites: ["maths"] }) }) : p0;
    const { W } = analyser(p);
    const etat = { profil: p.profil, reponses: p.reponses, retenus: [], profilTermine: true, qIndex: 999 };
    const s = await chargerSite({}, { etat });
    for (const h of ["#accueil", "#donnees", "#liste"]) verifierPage(h, s.afficher(h));
    const proposition = s.cliquer({ action: "onglet-liste", o: "voeux" });
    verifierPage("Mes vœux (proposition)", proposition);
    assert.ok(proposition.includes(s.E.LIMITE_REPERE.replace("'", "&#39;")), "phrase sur la limite absente de Ma liste");
    const retenus = await chargerSite({}, { etat: Object.assign({}, etat, { retenus: W.liste.map((x) => x.f.id) }) });
    retenus.afficher("#liste");
    verifierPage("Mes vœux (retenus)", retenus.cliquer({ action: "onglet-liste", o: "voeux" }));
    verifierPage("#plan", retenus.afficher("#plan"));
    for (const x of W.liste) {
      const html = s.afficher("#formation-" + x.f.id);
      verifierPage("#formation-" + x.f.id, html);
      assert.ok(html.includes("Ta position parmi les admis"), `${x.f.id} : bloc de position absent`);
      assert.ok(html.includes(s.E.LIMITE_REPERE.replace("'", "&#39;")), `${x.f.id} : phrase sur la limite absente`);
      if (id === "vide") assert.match(html, /Renseigne tes bulletins/);
      else if (x.repere.percentile !== null) assert.match(html, /Ta moyenne te place (au-dessus d&#39;environ \d+ % des|au-dessus de presque tous les|en dessous de presque tous les) admis de 2025/);
      if (x.repere.taux !== null) assert.match(html, /Taux d(&#39;|')accès 20\d\d : [\d,]+ %/);
    }
  });
}
