/*
 * tests/protection.test.js : repère de protection de la liste de vœux (CapEngine.protection).
 *
 * Le site n'affiche plus de « chances d'avoir au moins une admission » (calcul faux : il supposait
 * les vœux indépendants). À la place, wishlist() renvoie protection = { nbSecurite, niveau, message }, sans
 * probabilité. Règles vérifiées :
 *   - aucune page du site ni aucune référence ne contient plus l'ancien chiffre ;
 *   - un vœu « sécurité » est solide par construction (docs/modele-chances.md) : on compte les vœux
 *     « sécurité », sans seuil sur une fourchette ;
 *   - le message correspond au nombre de vœux « sécurité » (0, 1, 2, 3 ou plus) et à l'absence de notes,
 *     sur des listes fabriquées pour le test ;
 *   - pour les 10 profils types, le compteur est cohérent avec la liste ; « fragile » reçoit le message
 *     « aucun vœu vraiment sûr », « vide » le message « Renseigne tes bulletins ».
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

// Listes fabriquées pour le test (10 vœux). Un vœu est décrit par sa catégorie et l'absence de notes de l'élève
// (repere.sansNotes). Les objets du site viennent d'un autre contexte vm : on les compare après un passage par JSON.
const voeu = (categorie, sansNotes, i) => ({ categorie, repere: { sansNotes }, f: { id: "test-" + i } });
const fabriquer = (...groupes) => groupes.flatMap(([n, cat, sn]) => Array(n).fill([cat, sn])).map(([c, s], i) => voeu(c, s, i));
// n vœux « sécurité », le reste en « réaliste », élève avec notes
const liste = (n) => fabriquer([n, "securite", false], [10 - n, "realiste", false]);
const P = (l) => JSON.parse(JSON.stringify(site.E.protection(l)));

test("le message correspond au nombre de vœux « sécurité »", () => {
  const cas = [
    [0, "aucun", "Attention : ta liste n'a aucun vœu vraiment sûr. Ajoute au moins deux formations où ton profil est au-dessus de la plupart des admis, sinon tu risques de n'avoir aucune proposition."],
    [1, "insuffisant", "Ta liste n'a qu'un seul vœu vraiment sûr : ajoutes-en au moins un autre."],
    [2, "minimum", "Ta liste a 2 vœux sûrs. C'est un minimum : un troisième te protégerait davantage."],
    [3, "bon", "Ta liste a 3 vœux sûrs : garde-les, ce sont eux qui te protègent si les autres ne passent pas."],
    [5, "bon", "Ta liste a 5 vœux sûrs : garde-les, ce sont eux qui te protègent si les autres ne passent pas."],
  ];
  for (const [n, niveau, message] of cas) {
    assert.deepEqual(P(liste(n)), { nbSecurite: n, niveau, message }, `${n} vœu(x) « sécurité »`);
    assert.ok(!/%/.test(message), "le message ne doit contenir aucun pourcentage");
  }
  assert.equal(site.E.SEUIL_SOLIDE, undefined, "plus de seuil sur une fourchette : un vœu « sécurité » est solide par construction");
  assert.equal(site.E.PROTECTION_REPERE, "Aucun site ne peut calculer tes chances exactes d'admission : ces repères viennent des résultats Parcoursup 2025.");
});

test("seule la catégorie « sécurité » compte", () => {
  assert.equal(P(fabriquer([10, "realiste", false])).nbSecurite, 0);
  assert.equal(P(fabriquer([2, "securite", false], [3, "ambitieux", false], [5, "realiste", false])).nbSecurite, 2);
});

test("aucune note renseignée : message « Renseigne tes bulletins »", () => {
  assert.deepEqual(P(fabriquer([3, "realiste", true], [7, "ambitieux", true])), {
    nbSecurite: 0, niveau: "sans_notes",
    message: "Renseigne tes bulletins : sans tes notes, on ne peut pas savoir quels vœux sont sûrs pour toi.",
  });
});

// message attendu pour certains profils types
const ATTENDU = { fragile: "aucun", vide: "sans_notes", "eco-excellent-decide": "bon" };

for (const p of PROFILS) {
  test(`profil « ${p.id} » : protection calculée sur la liste de 10 vœux`, () => {
    const { E, DATA, QUEST } = site;
    const A = E.recommander(DATA.formations, p.profil, QUEST, p.reponses);
    const W = E.wishlist(A.resultats, 10, A.interets);
    assert.ok(!("auMoinsUne" in W), "wishlist() ne doit plus renvoyer auMoinsUne");
    assert.equal(W.protection.nbSecurite, W.liste.filter((x) => x.categorie === "securite").length);
    assert.deepEqual(W.protection, E.protection(W.liste));
    if (ATTENDU[p.id]) assert.equal(W.protection.niveau, ATTENDU[p.id]);
  });
}
