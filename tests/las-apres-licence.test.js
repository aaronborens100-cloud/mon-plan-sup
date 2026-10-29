/*
 * tests/las-apres-licence.test.js : licence simple avant LAS pour un élève sans intérêt santé (issue #69).
 *
 * Décision d'Aaron : sans intérêt santé, quand une licence simple et une LAS de la même discipline (même code de
 * filière Parcoursup) sont toutes deux proposées, la licence simple est classée avant la LAS. La LAS n'est jamais
 * supprimée. Un élève avec un intérêt santé, même léger, garde l'ordre actuel.
 * « Sans intérêt santé » : questionnaire répondu et domaine santé à 0 (aucune réponse ne le touche).
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

const profil = (id) => PROFILS.find((x) => x.id === id);
const analyser = (p) => {
  const A = site.E.recommander(site.DATA.formations, p.profil, site.QUEST, p.reponses);
  return { A, W: site.E.wishlist(A.resultats, 10, A.interets) };
};
const forme = (x) => site.E.formeDe(x.f);
// rang de la meilleure licence simple proposée de chaque discipline
const premiereSimple = (liste) => {
  const m = new Map();
  liste.forEach((x, i) => { const k = site.E.nmcDe(x.f); if (k && !x.exclu && !x.bloque && forme(x) === "simple" && !m.has(k)) m.set(k, i); });
  return m;
};
const ordreOk = (liste) => {
  const m = premiereSimple(liste);
  return liste.every((x, i) => { const k = site.E.nmcDe(x.f); return forme(x) !== "las" || !m.has(k) || m.get(k) < i; });
};

test("sans intérêt santé : toute LAS est classée après la meilleure licence simple de sa discipline, et reste proposée", () => {
  for (const id of ["eco-excellent-decide", "ecg-expertes-fort", "ecg-expertes-faible"]) {
    const { A, W } = analyser(profil(id));
    assert.ok(site.E.sansInteretSante(A.interets), id);
    assert.ok(ordreOk(A.resultats), `${id} : une LAS précède une licence simple de sa discipline`);
    assert.ok(A.resultats.some((x) => forme(x) === "las"), `${id} : les LAS restent dans les résultats`);
    assert.equal(A.resultats.length, site.DATA.formations.length, `${id} : aucune formation retirée`);
    assert.equal(W.liste.length, 10);
  }
});

// I2 : l'exemple de la licence de Toulon (psup-10367) est remplacé par celle de Côte d'Azur (psup-2258), meilleure licence simple d'éco-gestion dans les résultats une fois les fiches maison retirées.
test("sans intérêt santé : exemple concret, la LAS d'éco-gestion passe derrière la licence d'éco-gestion", () => {
  const { A } = analyser(profil("ecg-expertes-faible"));
  const rang = (id) => A.resultats.findIndex((x) => x.f.id === id);
  assert.ok(rang("psup-28381") > rang("psup-2258"), "LAS Sorbonne Paris Nord avant la licence Économie-gestion de Côte d'Azur");
  assert.equal(forme(A.resultats[rang("psup-28381")]), "las");
  assert.ok(A.resultats[rang("psup-28381")].pertinence > A.resultats[rang("psup-2258")].pertinence, "la pertinence affichée ne change pas");
});

test("avec un intérêt santé, même léger : l'ordre n'est pas modifié", () => {
  assert.ok(!site.E.sansInteretSante({ repondues: 5, domaines: { sante: 0.25 } }));
  assert.ok(!site.E.sansInteretSante({ repondues: 5, domaines: { sante: 0.8 } }));
  assert.ok(site.E.sansInteretSante({ repondues: 5, domaines: { sante: 0 } }));
  const { A } = analyser(profil("sante-svt"));
  assert.ok(!site.E.sansInteretSante(A.interets));
  assert.ok(!A.resultats.some((x) => x.lasApres || x.pertinenceTri !== undefined));
});

test("questionnaire vide : l'ordre n'est pas modifié", () => {
  const { A } = analyser(profil("vide"));
  assert.ok(!site.E.sansInteretSante(A.interets));
  assert.ok(!A.resultats.some((x) => x.lasApres));
});
