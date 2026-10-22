/*
 * tests/wishlist-quotas.test.js : quotas de la liste de 10 vœux et découvertes écartées (issue #17).
 *
 * Une découverte réservée à l'étape 1 de wishlist() consomme une place du quota de sa catégorie. Si elle est
 * écartée à la fin (un vœu de même filière et de même catégorie, ou le plafond de sa voie, a été atteint
 * entre-temps), sa place est rendue et remplie par le meilleur vœu admissible de la même catégorie
 * (mêmes règles de diversité, même plancher). Règles vérifiées, sur les 14 profils types et sur des catalogues
 * mélangés (l'ordre des formations ne doit rien changer à ces garanties) :
 *   - invariant : moins de 3 vœux « sécurité » ⇒ l'alerte « Pas assez de vœux vraiment sûrs » est affichée
 *     (wishlist() ne s'arrête sous 3 que s'il n'existe plus aucun vœu « sécurité » admissible) ;
 *   - contrôles permanents : aucun vœu sans statistiques, à relire ou visant les bacs pro ; aucun vœu
 *     « sécurité » sous 50 % de taux d'accès, au-delà de la distance acceptée ou hors des territoires choisis ;
 *     10 vœux ; protection() cohérente avec les catégories de la liste ;
 *   - les 7 profils de l'issue : 3 vœux « sécurité » (eco-moyen : 2 et l'alerte avant la règle « prive_frais_inconnus »).
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

const ALERTE_SURS = /Pas assez de vœux vraiment sûrs/;
// mélange déterministe (générateur congruentiel), comme tests/distance-academie.test.js
const melanger = (t, graine) => { const a = t.slice(); let g = graine; for (let i = a.length - 1; i > 0; i--) { g = (g * 1103515245 + 12345) % 2147483648; const j = g % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const VARIANTES = [
  ["catalogue d'origine", (t) => t],
  ["mélange (graine 7)", (t) => melanger(t, 7)],
  ["mélange (graine 2026)", (t) => melanger(t, 2026)],
  ["catalogue inversé", (t) => t.slice().reverse()],
];
const analyser = (p, formations) => {
  const { E, QUEST } = site;
  const A = E.recommander(formations, p.profil, QUEST, p.reponses);
  return { A, W: E.wishlist(A.resultats, 10, A.interets) };
};

for (const p of PROFILS) {
  test(`profil « ${p.id} » : quotas, alerte « sécurité » et contrôles permanents (catalogue mélangé ou non)`, () => {
    const { E, DATA } = site;
    for (const [nom, variante] of VARIANTES) {
      const { W } = analyser(p, variante(DATA.formations));
      const ctx = `${p.id}, ${nom}`;
      const secu = W.liste.filter((x) => x.categorie === "securite");
      // invariant de l'issue #17
      if (secu.length < 3) assert.ok(W.alertes.some((a) => ALERTE_SURS.test(a)), `${ctx} : ${secu.length} vœux « sécurité » sans l'alerte`);
      // 10 vœux (tous les profils types en ont assez)
      assert.equal(W.liste.length, 10, `${ctx} : ${W.liste.length} vœux`);
      assert.equal(new Set(W.liste.map((x) => x.f.id)).size, W.liste.length, `${ctx} : vœu en double`);
      for (const x of W.liste) {
        assert.ok(E.voeuParcoursup(x.f), `${ctx} : ${x.f.id} à l'étranger hors Parcoursup`);
        const regles = E.reglesHorsListe(x.f);
        assert.equal(regles.length, 0, `${ctx} : ${x.f.id} ne devrait pas être dans la liste (${regles.join(", ")})`);
        assert.equal(typeof x.f.admission.taux, "number", `${ctx} : ${x.f.id} sans statistiques`);
        assert.ok(!x.exclu && !x.bloque, `${ctx} : ${x.f.id} exclu ou bloqué`);
      }
      for (const x of secu) {
        assert.ok(typeof x.repere.taux === "number" && x.repere.taux >= E.SEUIL_TAUX_SECURITE, `${ctx} : ${x.f.id} « sécurité » à ${x.repere.taux} %`);
        assert.equal(x.horsDistance, false, `${ctx} : ${x.f.id} « sécurité » au-delà de la distance acceptée`);
        assert.equal(x.horsTerritoire, false, `${ctx} : ${x.f.id} « sécurité » hors des territoires choisis`);
        assert.equal(x.repere.priveFraisInconnus, false, `${ctx} : ${x.f.id} « sécurité » privé aux frais inconnus avec un budget serré`);
      }
      // protection() cohérente avec les catégories
      assert.equal(W.protection.nbSecurite, secu.length, `${ctx} : protection()`);
      assert.deepEqual(W.protection, E.protection(W.liste), `${ctx} : protection() recalculée`);
      // les découvertes annoncées sont bien dans la liste
      for (const id of W.decouvertes.keys()) assert.ok(W.liste.some((x) => x.f.id === id), `${ctx} : découverte ${id} absente de la liste`);
    }
  });
}

test("issue #17 : la place d'une découverte écartée est rendue à sa catégorie", () => {
  const { DATA } = site;
  // eco-moyen (budget « faible ») : 3 depuis la règle « prive_frais_inconnus » (21/10/2026) ; avant : 2, avec l'alerte
  const attendu = { "eco-moyen": 3,"sciences-ingenieur": 3, "droit-sciencespo": 3, "sante-svt": 3, indecis: 3, "international-langues": 3, "baisse-dernier-trimestre": 3 };
  for (const [id, n] of Object.entries(attendu)) {
    const { W } = analyser(PROFILS.find((x) => x.id === id), DATA.formations);
    assert.equal(W.protection.nbSecurite, n, `${id} : vœux « sécurité »`);
    // eco-moyen, avant la règle « prive_frais_inconnus » : la découverte (licence AES, Nîmes) était écartée par le
    // plafond de sa voie et aucun autre vœu « sécurité » ne respectait les règles (alerte). Les écoles privées aux
    // frais inconnus ayant perdu 18 points d'intérêt, la licence AES de Nîmes entre dans la liste en « sécurité ».
    assert.equal(W.alertes.some((a) => ALERTE_SURS.test(a)), n < 3, `${id} : alerte « sécurité »`);
  }
});
