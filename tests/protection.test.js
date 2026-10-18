/*
 * tests/protection.test.js : repère de protection de la liste de vœux (CapEngine.protection).
 *
 * Le site n'affiche plus de « chances d'avoir au moins une admission » (calcul faux : il supposait
 * les vœux indépendants). À la place, wishlist() renvoie protection = { nbSurs, niveau, message },
 * sans probabilité. Règles vérifiées :
 *   - aucune page du site ni aucune référence ne contient plus l'ancien chiffre ;
 *   - le message correspond au nombre de vœux « sécurité » (0, 1, 2, 3 ou plus), sur des listes
 *     fabriquées pour le test ;
 *   - pour les 10 profils types, protection.nbSurs compte bien les vœux « sécurité » de la liste.
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

// liste fabriquée : nbSurs vœux « sécurité », le reste en « réaliste », 10 vœux au total
// (les objets du site viennent d'un autre contexte vm : on les compare après un passage par JSON)
const liste = (nbSurs) => Array.from({ length: 10 }, (_, i) => ({ categorie: i < nbSurs ? "securite" : "realiste", f: { id: "test-" + i } }));

test("le message correspond au nombre de vœux sûrs", () => {
  const { E } = site;
  const cas = [
    [0, "aucun", "Attention : ta liste n'a aucun vœu vraiment sûr. Ajoute au moins deux formations où ton profil est au-dessus de la plupart des admis, sinon tu risques de n'avoir aucune proposition."],
    [1, "insuffisant", "Ta liste n'a qu'un seul vœu vraiment sûr : ajoutes-en au moins un autre."],
    [2, "minimum", "Ta liste a 2 vœux sûrs. C'est un minimum : un troisième te protégerait davantage."],
    [3, "bon", "Ta liste a 3 vœux sûrs : garde-les, ce sont eux qui te protègent si les autres ne passent pas."],
    [5, "bon", "Ta liste a 5 vœux sûrs : garde-les, ce sont eux qui te protègent si les autres ne passent pas."],
  ];
  for (const [n, niveau, message] of cas) {
    assert.deepEqual(JSON.parse(JSON.stringify(E.protection(liste(n)))), { nbSurs: n, niveau, message }, `${n} vœu(x) sûr(s)`);
    assert.ok(!/%/.test(message), "le message ne doit contenir aucun pourcentage");
  }
  assert.equal(E.PROTECTION_REPERE, "Aucun site ne peut calculer tes chances exactes d'admission : ces repères viennent des résultats Parcoursup 2025.");
});

for (const p of PROFILS) {
  test(`profil « ${p.id} » : protection calculée sur la liste de 10 vœux`, () => {
    const { E, DATA, QUEST } = site;
    const A = E.recommander(DATA.formations, p.profil, QUEST, p.reponses);
    const W = E.wishlist(A.resultats, 10, A.interets);
    assert.ok(!("auMoinsUne" in W), "wishlist() ne doit plus renvoyer auMoinsUne");
    assert.equal(W.protection.nbSurs, W.liste.filter((x) => x.categorie === "securite").length);
    assert.deepEqual(W.protection, E.protection(W.liste));
  });
}
