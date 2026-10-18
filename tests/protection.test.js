/*
 * tests/protection.test.js : repère de protection de la liste de vœux (CapEngine.protection).
 *
 * Le site n'affiche plus de « chances d'avoir au moins une admission » (calcul faux : il supposait
 * les vœux indépendants). À la place, wishlist() renvoie protection = { nbSolides, nbSecuriteFragiles, niveau,
 * message }, sans probabilité. Règles vérifiées :
 *   - aucune page du site ni aucune référence ne contient plus l'ancien chiffre ;
 *   - un vœu est « solide » s'il est « sécurité » ET que chance.bas >= SEUIL_SOLIDE (60) ;
 *   - le message correspond au nombre de vœux solides (0, 1, 2, 3 ou plus), aux vœux « sécurité »
 *     fragiles et à l'absence de notes, sur des listes fabriquées pour le test ;
 *   - pour les 10 profils types, les compteurs sont cohérents avec la liste ; « fragile » reçoit le
 *     message « incertains », « vide » le message « Renseigne tes bulletins ».
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

const RACINE = path.join(__dirname, "..");
let site;

test.before(async () => { site = await chargerSite(); });

test("aucune page ni référence ne contient plus le chiffre « au moins une admission »", () => {
  const fichiers = ["index.html", "README.md",
    ...fs.readdirSync(path.join(RACINE, "js")).map((f) => "js/" + f),
    ...fs.readdirSync(path.join(RACINE, "css")).map((f) => "css/" + f),
    ...fs.readdirSync(path.join(__dirname, "reference")).map((f) => "tests/reference/" + f)];
  for (const f of fichiers) {
    const texte = fs.readFileSync(path.join(RACINE, f), "utf8");
    assert.ok(!texte.includes("auMoinsUne"), `${f} contient encore auMoinsUne.`);
    assert.ok(!/au moins une proposition/i.test(texte), `${f} parle encore de « au moins une proposition ».`);
  }
});

// Listes fabriquées pour le test (10 vœux). Un vœu est décrit par sa catégorie et le bas de sa fourchette
// (null = aucune chance calculée). Les objets du site viennent d'un autre contexte vm : on les compare après
// un passage par JSON.
const voeu = (categorie, bas, i) => ({ categorie, chance: { bas, haut: bas === null ? null : Math.min(97, bas + 20) }, f: { id: "test-" + i } });
const fabriquer = (...groupes) => groupes.flatMap(([n, cat, bas]) => Array(n).fill([cat, bas])).map(([c, b], i) => voeu(c, b, i));
// nbSolides vœux « sécurité » solides (bas 80 %), le reste en « réaliste » (bas 30 %)
const liste = (nbSolides) => fabriquer([nbSolides, "securite", 80], [10 - nbSolides, "realiste", 30]);
const P = (l) => JSON.parse(JSON.stringify(site.E.protection(l)));

test("le message correspond au nombre de vœux solides", () => {
  const cas = [
    [0, "aucun", "Attention : ta liste n'a aucun vœu vraiment sûr. Ajoute au moins deux formations où ton profil est au-dessus de la plupart des admis, sinon tu risques de n'avoir aucune proposition."],
    [1, "insuffisant", "Ta liste n'a qu'un seul vœu vraiment sûr : ajoutes-en au moins un autre."],
    [2, "minimum", "Ta liste a 2 vœux sûrs. C'est un minimum : un troisième te protégerait davantage."],
    [3, "bon", "Ta liste a 3 vœux sûrs : garde-les, ce sont eux qui te protègent si les autres ne passent pas."],
    [5, "bon", "Ta liste a 5 vœux sûrs : garde-les, ce sont eux qui te protègent si les autres ne passent pas."],
  ];
  for (const [n, niveau, message] of cas) {
    assert.deepEqual(P(liste(n)), { nbSolides: n, nbSecuriteFragiles: 0, niveau, message }, `${n} vœu(x) solide(s)`);
    assert.ok(!/%/.test(message), "le message ne doit contenir aucun pourcentage");
  }
  assert.equal(site.E.SEUIL_SOLIDE, 60);
  assert.equal(site.E.PROTECTION_REPERE, "Aucun site ne peut calculer tes chances exactes d'admission : ces repères viennent des résultats Parcoursup 2025.");
});

test("un vœu « sécurité » ne compte comme solide que si le bas de sa fourchette atteint le seuil", () => {
  // seuil exact : 60 compte, 59 ne compte pas
  assert.equal(P(fabriquer([1, "securite", 60], [1, "securite", 59], [8, "realiste", 30])).nbSolides, 1);
  // un vœu réaliste à 90 % de bas n'est pas « solide » : seule la catégorie « sécurité » compte
  assert.equal(P(fabriquer([10, "realiste", 90])).nbSolides, 0);
  // 1 solide + 2 fragiles : message « un seul vœu », les fragiles sont comptés à part
  assert.deepEqual(P(fabriquer([1, "securite", 70], [2, "securite", 35], [7, "realiste", 30])),
    { nbSolides: 1, nbSecuriteFragiles: 2, niveau: "insuffisant", message: "Ta liste n'a qu'un seul vœu vraiment sûr : ajoutes-en au moins un autre." });
});

test("vœux « sécurité » fragiles : message « incertains » avec le plus grand risque de refus", () => {
  assert.deepEqual(P(fabriquer([2, "securite", 35], [1, "securite", 33], [7, "realiste", 30])), {
    nbSolides: 0, nbSecuriteFragiles: 3, niveau: "securite_fragile",
    message: "Attention : tes vœux « sécurité » restent incertains pour ton profil (jusqu'à 67 % de risque de refus chacun). Ajoute des formations où tes notes sont nettement au-dessus de celles des admis, par exemple des licences de ton académie peu demandées.",
  });
});

test("aucune note renseignée : message « Renseigne tes bulletins »", () => {
  assert.deepEqual(P(fabriquer([3, "securite", null], [7, "realiste", null])), {
    nbSolides: 0, nbSecuriteFragiles: 3, niveau: "sans_notes",
    message: "Renseigne tes bulletins : sans tes notes, on ne peut pas savoir quels vœux sont sûrs pour toi.",
  });
});

// message attendu pour certains profils types
const ATTENDU = { fragile: "securite_fragile", vide: "sans_notes", "eco-excellent-decide": "bon" };

for (const p of PROFILS) {
  test(`profil « ${p.id} » : protection calculée sur la liste de 10 vœux`, () => {
    const { E, DATA, QUEST } = site;
    const A = E.recommander(DATA.formations, p.profil, QUEST, p.reponses);
    const W = E.wishlist(A.resultats, 10, A.interets);
    assert.ok(!("auMoinsUne" in W), "wishlist() ne doit plus renvoyer auMoinsUne");
    const secu = W.liste.filter((x) => x.categorie === "securite");
    const solides = secu.filter((x) => x.chance.bas !== null && x.chance.bas >= E.SEUIL_SOLIDE).length;
    assert.equal(W.protection.nbSolides, solides);
    assert.equal(W.protection.nbSecuriteFragiles, secu.length - solides);
    assert.deepEqual(W.protection, E.protection(W.liste));
    if (ATTENDU[p.id]) assert.equal(W.protection.niveau, ATTENDU[p.id]);
  });
}
