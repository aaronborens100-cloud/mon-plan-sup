/*
 * tests/campus-etranger.test.js : campus à l'étranger de formations Parcoursup enregistrés « France » (issue #16).
 *
 * Décision du fondateur (19/10/2026) : « Un campus à l'étranger enregistré « France » est traité comme étranger. »
 * Règles vérifiées (docs/modele-chances.md, section 8) :
 *   - pays et ville réels, lus dans l'intitulé officiel Parcoursup (data/ajustements.json, campus_etranger) ;
 *   - exclusion pour un élève « Non, je veux rester en France », ou « Rien d'autre que ce que j'ai coché » sans ce pays ;
 *   - toujours possible pour un élève qui a coché le pays ; malus « pays non choisi » sinon ;
 *   - jamais « sécurité » pour un élève qui n'a pas dit vouloir étudier dans ce pays ;
 *   - reste un vœu Parcoursup (garde-fou des listes), mais n'est pas proposé dans « Et à l'étranger ? » ;
 *   - « Autre pays d'Europe » ne couvre pas le Maroc, Singapour… ;
 *   - fiche et carte : ville et pays réels, jamais « Non renseigné » comme lieu.
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

const LONDRES = ["psup-25819", "ps-12025"];   // Dauphine, campus de Londres (fiche Parcoursup et fiche éditoriale)
const NON_REPRIS = ["psup-34475", "psup-34465", "psup-34466"];   // intitulé en France, coordonnées à l'étranger : pays non sûr
const avecReponses = (p, modif) => Object.assign({}, p, { reponses: Object.assign({}, p.reponses, modif) });
const analyser = (p) => {
  const { E, DATA, QUEST } = site;
  const A = E.recommander(DATA.formations, p.profil, QUEST, p.reponses);
  return { A, W: E.wishlist(A.resultats, 10, A.interets) };
};
const trouver = (A, id) => A.resultats.find((x) => x.f.id === id);
// élève qui accepte de partir partout, pour isoler les règles « étranger »
const BASE = avecReponses(PROFILS.find((p) => p.id === "eco-excellent-decide"), { mobilite: "partout", lieu: ["partout"] });

test("22 fiches corrigées : pays et ville réels, toujours sur Parcoursup", () => {
  const { DATA } = site;
  const camp = DATA.formations.filter((f) => f.__campusEtranger);
  assert.equal(camp.length, 22);
  for (const f of camp) {
    assert.notEqual(f.pays, "France", f.id);
    assert.ok(f.ville && f.ville !== "Non renseigné", f.id);
  }
  const F = (id) => DATA.formations.find((f) => f.id === id);
  for (const id of LONDRES) { assert.equal(F(id).ville, "Londres", id); assert.equal(F(id).pays, "Royaume-Uni", id); }
  assert.equal(F("psup-25818").pays, "Espagne");
  assert.equal(F("psup-28455").pays, "Singapour");
  assert.equal(F("psup-31816").pays, "Maroc");
  assert.equal(F("psup-39676").pays, "Monaco");
  // pays non établi de façon sûre : fiches laissées telles quelles
  for (const id of NON_REPRIS) { assert.equal(F(id).pays, "France", id); assert.ok(!F(id).__campusEtranger, id); }
});

test("Dauphine Londres : exclue pour « Non, je veux rester en France »", () => {
  const { A } = analyser(avecReponses(BASE, { etranger: "non", pays: [] }));
  for (const id of LONDRES) assert.equal(trouver(A, id).exclu, "Tu as indiqué vouloir rester en France.", id);
  // et pour tous les campus corrigés
  for (const x of A.resultats.filter((r) => r.f.__campusEtranger)) assert.ok(x.exclu, x.f.id);
});

test("Dauphine Londres : possible pour un élève qui a coché Royaume-Uni (même avec « Rien d'autre »)", () => {
  for (const pays of [["Royaume-Uni"], ["Royaume-Uni", "aucun"]]) {
    const { A } = analyser(avecReponses(BASE, { etranger: "oui", pays }));
    for (const id of LONDRES) {
      const x = trouver(A, id);
      assert.equal(x.exclu, null, `${id}, ${pays}`);
      assert.ok(!x.ajust.includes("pays non choisi"), `${id}, ${pays}`);
    }
    // « Rien d'autre que ce que j'ai coché » : Madrid (Espagne non cochée) est exclue
    if (pays.includes("aucun")) assert.equal(trouver(A, "psup-25818").exclu, site.E.MESSAGE_AUCUN_AUTRE_PAYS);
  }
});

test("pays non coché : malus « pays non choisi », jamais « sécurité »", () => {
  const { E } = site;
  const { A } = analyser(avecReponses(BASE, { etranger: "oui", pays: ["Italie"] }));
  for (const x of A.resultats.filter((r) => r.f.__campusEtranger)) {
    assert.ok(x.ajust.includes("pays non choisi"), x.f.id);
    assert.notEqual(x.categorie, "securite", x.f.id);
  }
  // « Autre pays d'Europe » couvre le Luxembourg, pas le Maroc ni Singapour
  const F = (id) => site.DATA.formations.find((f) => f.id === id);
  assert.equal(E.paysCoche(F("psup-50516"), ["autre_europe"]), true);
  for (const id of ["psup-31816", "psup-28455", "psup-50517"]) assert.equal(E.paysCoche(F(id), ["autre_europe"]), false, id);
});

test("jamais « sécurité » sans envie d'étudier dans ce pays, sur les 14 profils", () => {
  const { E } = site;
  for (const p of PROFILS) {
    const { A, W } = analyser(p);
    const pr = A.interets.prefs;
    for (const x of A.resultats.filter((r) => r.f.__campusEtranger && r.categorie === "securite")) {
      assert.ok(pr.etranger === 2 || pr.etranger === 3, `${p.id} : ${x.f.id} « sécurité »`);
      const voulus = (pr.pays || []).filter((v) => v !== "aucun" && !E.TERRITOIRES.includes(v));
      assert.ok(!voulus.length || E.paysCoche(x.f, voulus), `${p.id} : ${x.f.id} « sécurité » dans un pays non coché`);
    }
    // un vœu de la liste reste un vœu Parcoursup (France ou campus à l'étranger)
    for (const x of W.liste) assert.ok(E.voeuParcoursup(x.f), `${p.id} : ${x.f.id}`);
  }
  // un élève qui ne veut pas partir n'a aucun campus « sécurité » (règle appliquée même sans distance : pas de lycée)
  const sansLycee = Object.assign({}, BASE, { profil: Object.assign({}, BASE.profil, { lycee: null }), reponses: Object.assign({}, BASE.reponses, { etranger: "echange", pays: [] }) });
  const { A } = analyser(sansLycee);
  for (const x of A.resultats.filter((r) => r.f.__campusEtranger)) assert.notEqual(x.categorie, "securite", x.f.id);
});

test("campus à l'étranger : vœu Parcoursup, pas dans « Et à l'étranger ? »", () => {
  const { E } = site;
  const F = (id) => site.DATA.formations.find((f) => f.id === id);
  assert.equal(E.voeuParcoursup(F("psup-25819")), true);
  assert.equal(E.reglesHorsListe(F("psup-50516")).includes("nouvelle_2026"), true, "garde-fou des listes appliqué");
  for (const p of PROFILS) {
    const { A, W } = analyser(p);
    const X = E.etranger(A.resultats, W, A.interets);
    for (const e of X.liste) assert.ok(!e.x.f.__campusEtranger, `${p.id} : ${e.x.f.id}`);
  }
});

test("fiche et carte : « Londres », « Royaume-Uni », coût de la vie ; jamais « Non renseigné » comme lieu", async () => {
  const p = avecReponses(BASE, { etranger: "oui", pays: ["Royaume-Uni"] });
  const s = await chargerSite({}, { etat: { profil: p.profil, reponses: p.reponses, retenus: [], profilTermine: true, qIndex: 999 } });
  const lieux = (html) => [...html.matchAll(/<p class="f-lieu">([\s\S]*?)<\/p>/g)].map((m) => m[1])
    .concat([...html.matchAll(/<dt>Lieu<\/dt><dd>([\s\S]*?)<\/dd>/g)].map((m) => m[1]));
  const html = s.afficher("#formation-psup-25819");
  const l = lieux(html).join(" ");
  assert.ok(l.includes("Londres") && l.includes("Royaume-Uni"), "Londres, Royaume-Uni absents du lieu");
  assert.ok(html.includes("Campus à l'étranger : Londres, Royaume-Uni."), "encadré « Campus à l'étranger » absent");
  assert.ok(html.includes("/mois"), "coût de la vie du Royaume-Uni absent");
  for (const f of s.DATA.formations.filter((x) => x.__campusEtranger)) {
    const L = lieux(s.afficher("#formation-" + f.id));
    assert.ok(L.length > 0, `${f.id} : lieu non affiché`);
    for (const t of L) assert.ok(!t.includes("Non renseigné"), `${f.id} : « Non renseigné » dans le lieu`);
    assert.ok(L.join(" ").includes(f.pays), `${f.id} : pays absent`);
  }
});
