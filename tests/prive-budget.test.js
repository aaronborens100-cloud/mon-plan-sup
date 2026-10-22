/*
 * tests/prive-budget.test.js : règle « prive_frais_inconnus » (décision du fondateur du 21/10/2026, option A).
 *
 * Élève au budget serré (budget_max ≤ 5 000 : réponses « gratuit » et « faible ») et formation française dont
 * l'établissement n'est pas « Publics » d'après Parcoursup (champ tc) et dont les frais ne sont pas chiffrés :
 *   - la formation reste dans les résultats, avec un malus d'intérêt (MALUS_PRIVE_FRAIS_INCONNUS) ;
 *   - elle n'est jamais « sécurité » (liste et protection()) ;
 *   - elle affiche MESSAGE_PRIVE_FRAIS_INCONNUS (ajustement, texte de catégorie, Ma liste).
 * Rien ne change : formation publique, frais connus, statut inconnu (fiche non liée à Parcoursup), budget
 * « moyen » ou « eleve », pas de réponse au budget.
 *
 * Depuis le relevé des frais des formations privées (data/frais-prives.json, 22/10/2026), la plupart des écoles de
 * commerce de ces profils ont des frais connus : les tests qui partent de cas réels de 10 vœux (fragile,
 * baisse-dernier-trimestre) chargent le site SANS ce relevé (siteSansReleve), pour continuer de vérifier la règle
 * elle-même. Le comportement avec le relevé est vérifié dans tests/frais-prives.test.js.
 *
 * Lancer : npm test
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { chargerSite } = require("./charger-site");
const PROFILS = require("./profils");

let site, siteSansReleve;
test.before(async () => {
  site = await chargerSite();
  siteSansReleve = await chargerSite({ "data/frais-prives.json": { meta: {}, formations: {} } });
});

const MESSAGE = "Établissement privé : vérifie les frais avant de le mettre dans tes vœux, ils peuvent dépasser ton budget.";
const LIBELLE = "établissement privé aux frais non relevés";
const analyser = (p, s = site) => {
  const { E, DATA, QUEST } = s;
  const A = E.recommander(DATA.formations, p.profil, QUEST, p.reponses);
  return { A, W: E.wishlist(A.resultats, 10, A.interets) };
};
const avecReponses = (p, modif) => Object.assign({}, p, { reponses: Object.assign({}, p.reponses, modif) });
const profil = (id) => PROFILS.find((x) => x.id === id);
// formation Parcoursup : en France ou campus à l'étranger (issue #16), comme sur main où ces campus étaient « France »
const prive = (f) => (f.pays === "France" || f.__campusEtranger === true) && typeof f.__tc === "string" && f.__tc !== "Publics";
const fraisInconnus = (f) => !f.cout || f.cout.valeur_annuelle_eur == null;

test("constantes et message", () => {
  const E = site.E;
  assert.equal(E.BUDGET_SERRE_MAX, 5000);
  assert.equal(E.MALUS_PRIVE_FRAIS_INCONNUS, 18);
  assert.equal(E.MESSAGE_PRIVE_FRAIS_INCONNUS, MESSAGE);
  assert.equal(E.REGLE_PRIVE_FRAIS_INCONNUS.cle, "prive_frais_inconnus");
  assert.equal(E.REGLE_PRIVE_FRAIS_INCONNUS.categorie, "realiste");
});

test("statut : uniquement Parcoursup (tc) ; toute fiche liée à Parcoursup a un statut, les autres aucun", () => {
  const TC = new Set(["Publics", "Privés en contrat avec l’Etat / EESC", "Privés"]);
  for (const f of site.DATA.formations) {
    if (f.__gta !== undefined) assert.ok(TC.has(f.__tc), `${f.id} : statut ${f.__tc}`);
    else assert.equal(f.__tc, undefined, `${f.id} : statut sans lien Parcoursup`);
  }
});

test("fragile (budget « gratuit ») : aucun vœu « sécurité » privé aux frais inconnus, message affiché", async () => {
  const p = profil("fragile");
  const { A, W } = analyser(p, siteSansReleve);
  const concernes = A.resultats.filter((x) => prive(x.f) && fraisInconnus(x.f));
  assert.ok(concernes.length > 0);
  for (const x of concernes) {
    assert.equal(x.repere.priveFraisInconnus, true, x.f.id);
    assert.notEqual(x.categorie, "securite", x.f.id);
    assert.ok(x.ajust.includes(LIBELLE), x.f.id);
    assert.ok(x.repere.pourquoi.includes(MESSAGE), x.f.id);
    // la règle n'exclut jamais (exclusions éventuelles : distance, étranger… comme avant)
    assert.ok(!x.exclu || !/frais|budget/i.test(x.exclu), `${x.f.id} : ${x.exclu}`);
  }
  const dansListe = W.liste.filter((x) => x.repere.priveFraisInconnus);
  assert.ok(dansListe.length > 0, "fragile garde des écoles privées dans sa liste");
  assert.ok(!dansListe.some((x) => x.categorie === "securite"));
  assert.equal(W.protection.nbSecurite, W.liste.filter((x) => x.categorie === "securite" && !x.repere.priveFraisInconnus).length);
  // Ma liste (proposition de 10 vœux) : le message est affiché
  const s = await chargerSite({ "data/frais-prives.json": { meta: {}, formations: {} } }, { etat: { profil: p.profil, reponses: p.reponses, retenus: [], profilTermine: true, qIndex: 999 } });
  assert.ok(s.afficher("#liste").includes(MESSAGE), "message absent de Ma liste (Recommandées)");
  // onglet « Mes vœux » : une fois par vœu concerné de la proposition de 10 vœux, et une fois par formation concernée
  // de la section « Nouvelle formation à la rentrée 2026 » (fragile y reçoit ISG Nice, privé aux frais inconnus)
  const nouv = site.E.nouvelles(A.resultats, A.interets).filter((x) => x.repere.priveFraisInconnus);
  // et une fois par formation équivalente concernée affichée sous un vœu (tâche 4, docs/modele-chances.md, section 11)
  const M = siteSansReleve.E.equivalentsListe(A.resultats, W);
  const equiv = [...M.values()].flat().filter((x) => x.repere.priveFraisInconnus);
  const voeux = s.cliquer({ action: "onglet-liste", o: "voeux" });
  assert.equal(voeux.split(MESSAGE).length - 1, dansListe.length + nouv.length + equiv.length, "message absent de la proposition de vœux, des équivalents ou de la section « Nouvelle formation »");
});

test("budget serré : une formation privée qui serait « sécurité » devient « réaliste » (règle nommée)", () => {
  // baisse-dernier-trimestre (budget « moyen ») a 2 vœux « sécurité » privés aux frais inconnus ; avec « faible », aucun
  const p = profil("baisse-dernier-trimestre");
  const moyen = analyser(p, siteSansReleve), faible = analyser(avecReponses(p, { budget: "faible" }), siteSansReleve);
  const avant = moyen.W.liste.filter((x) => x.categorie === "securite" && prive(x.f) && fraisInconnus(x.f));
  assert.ok(avant.length > 0, "cas de test : un vœu « sécurité » privé aux frais inconnus avec le budget « moyen »");
  const parId = new Map(faible.A.resultats.map((x) => [x.f.id, x]));
  for (const x of avant) {
    const y = parId.get(x.f.id);
    assert.equal(y.categorie, "realiste", x.f.id);
    assert.equal(y.repere.regle, "prive_frais_inconnus", x.f.id);
    assert.equal(y.repere.pourquoi, MESSAGE, x.f.id);
    assert.equal(y.interet, Math.max(0, x.interet - 18), `${x.f.id} : malus de 18`);
  }
  assert.ok(!faible.W.liste.some((x) => x.categorie === "securite" && x.repere.priveFraisInconnus));
  assert.ok(!faible.A.resultats.some((x) => x.categorie === "securite" && x.repere.priveFraisInconnus));
});

test("budget « moyen », « eleve » ou sans réponse : écoles privées inchangées", () => {
  for (const p of PROFILS) {
    for (const budget of ["moyen", "eleve", undefined]) {
      const q = avecReponses(p, { budget });
      if (budget === undefined) delete q.reponses.budget;
      const { A } = analyser(q);
      for (const x of A.resultats) {
        assert.equal(x.repere.priveFraisInconnus, false, `${p.id}, ${budget} : ${x.f.id}`);
        assert.notEqual(x.repere.regle, "prive_frais_inconnus");
        assert.ok(!x.ajust.includes(LIBELLE));
      }
    }
  }
  // les profils « moyen » ont toujours leurs écoles privées : même liste que sans la règle (références), et
  // des vœux privés aux frais inconnus, y compris en « sécurité »
  const { W } = analyser(profil("baisse-dernier-trimestre"), siteSansReleve);
  assert.ok(W.liste.some((x) => x.categorie === "securite" && prive(x.f) && fraisInconnus(x.f)));
});

// fiche réelle privée aux frais inconnus, modifiée (statut, frais) pour comparer à elle-même
const evaluerVariante = (p, f, modif) => {
  const { E, QUEST } = site;
  const A = E.recommander([], p.profil, QUEST, p.reponses);
  const g = Object.assign(Object.create(Object.getPrototypeOf(f)), f, modif);
  return E.evaluer(g, A.stats, A.interets);
};

test("formation publique, statut inconnu, frais connus : jamais touchées", () => {
  const p = profil("fragile");
  const { A } = analyser(p);
  // une formation publique n'est jamais concernée (vrai catalogue, deux budgets serrés)
  for (const budget of ["gratuit", "faible"]) {
    const r = analyser(avecReponses(p, { budget })).A;
    for (const x of r.resultats) if (!prive(x.f) || !fraisInconnus(x.f)) {
      assert.equal(x.repere.priveFraisInconnus, false, x.f.id);
      assert.ok(!x.ajust.includes(LIBELLE), x.f.id);
      assert.ok(!String(x.repere.pourquoi || "").includes(MESSAGE), x.f.id);
    }
  }
  const x = A.resultats.find((y) => prive(y.f) && fraisInconnus(y.f) && !y.exclu && y.interet > 30 && y.interet < 80);
  assert.ok(x, "cas de test : une formation privée aux frais inconnus");
  const ref = evaluerVariante(p, x.f, {});
  const pub = evaluerVariante(p, x.f, { __tc: "Publics" });
  const inconnu = evaluerVariante(p, x.f, { __tc: undefined });
  assert.equal(ref.repere.priveFraisInconnus, true);
  assert.equal(pub.repere.priveFraisInconnus, false);
  assert.equal(inconnu.repere.priveFraisInconnus, false, "statut inconnu : rien");
  assert.equal(ref.interet, pub.interet - 18);
  assert.equal(inconnu.interet, pub.interet);
  // frais connus : règle actuelle (« frais au-dessus de ton budget » ou exclusion), pas la nouvelle règle,
  // et le même résultat que pour un établissement public aux mêmes frais
  for (const v of [0, 800, 1500, 3000]) {
    const cout = Object.assign({}, x.f.cout, { valeur_annuelle_eur: v });
    const pr = evaluerVariante(p, x.f, { cout }), pu = evaluerVariante(p, x.f, { cout, __tc: "Publics" });
    assert.equal(pr.repere.priveFraisInconnus, false, `${v} €`);
    assert.equal(pr.interet, pu.interet, `${v} €`);
    assert.equal(pr.categorie, pu.categorie, `${v} €`);
    assert.equal(pr.exclu, pu.exclu, `${v} €`);
    assert.deepEqual(pr.ajust, pu.ajust, `${v} €`);
    assert.equal(pr.ajust.includes("frais au-dessus de ton budget") || !!pr.exclu, v > 1000, `${v} € : règle actuelle`);
  }
});

for (const p of PROFILS) {
  test(`profil « ${p.id} » : aucun vœu « sécurité » privé aux frais inconnus avec un budget serré`, () => {
    const { A, W } = analyser(p);
    const serre = A.interets.prefs.budget_max !== undefined && A.interets.prefs.budget_max <= 5000;
    for (const x of A.resultats) {
      const attendu = serre && prive(x.f) && fraisInconnus(x.f);
      assert.equal(x.repere.priveFraisInconnus, attendu, x.f.id);
      if (attendu) assert.notEqual(x.categorie, "securite", x.f.id);
    }
    assert.equal(W.protection.nbSecurite, W.liste.filter((x) => x.categorie === "securite").length);
    if (serre) assert.ok(!W.liste.some((x) => x.categorie === "securite" && prive(x.f) && fraisInconnus(x.f)));
  });
}
