/*
 * tests/profils-aleatoires.test.js : le générateur de profils aléatoires (tests/profils-aleatoires.js) est
 * déterministe et couvre ce qu'il annonce. Ne charge pas le site (rapide) : les contrôles eux-mêmes sont lancés
 * par npm run controles.
 *
 * Lancer : npm test
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { genererProfils, couverture, GRAINE_DEFAUT } = require("./profils-aleatoires");

test("même graine : mêmes profils ; autre graine : profils différents", () => {
  const a = JSON.stringify(genererProfils(300, GRAINE_DEFAUT));
  assert.equal(JSON.stringify(genererProfils(300, GRAINE_DEFAUT)), a);
  assert.notEqual(JSON.stringify(genererProfils(300, GRAINE_DEFAUT + 1)), a);
});

test("300 profils : toutes les valeurs du questionnaire, tous les départements de lieux.json, des profils sans lycée", () => {
  const P = genererProfils(300);
  assert.equal(P.length, 300);
  assert.equal(new Set(P.map((p) => p.id)).size, 300, "identifiants uniques");
  const c = couverture(P);
  assert.deepEqual(c.manque, {}, "valeurs du questionnaire jamais tirées");
  assert.ok(c.departements >= 105, `${c.departements} départements`);
  assert.ok(c.sansLycee > 0);
  for (const sorte of ["vide", "partiel", "contradictoire", "complet"]) assert.ok(P.some((p) => p.sorte === sorte), sorte);
  assert.ok(P.some((p) => p.profil.niveau === "premiere") && P.some((p) => p.profil.niveau === "terminale"));
  assert.ok(P.some((p) => p.profil.optionMaths === "expertes") && P.some((p) => p.profil.optionMaths === "complementaires"));
  assert.ok(P.some((p) => p.profil.specialites.length && !p.profil.specialites.includes("maths")));
  // moyennes générales saisies de 6 à 19 (hors notes volontairement impossibles des profils partiels)
  const m = P.filter((p) => p.sorte === "complet").flatMap((p) => p.profil.periodes.map((x) => Number(x.moyenneGenerale)));
  assert.ok(Math.min(...m) < 7 && Math.max(...m) > 18, `moyennes de ${Math.min(...m)} à ${Math.max(...m)}`);
  for (const zone of ["Corse-du-Sud", "Haute-Corse", "Guadeloupe", "Martinique", "Guyane", "La Réunion", "Mayotte"])
    assert.ok(P.some((p) => p.profil.lycee && p.profil.lycee.dep === zone), zone);
});
