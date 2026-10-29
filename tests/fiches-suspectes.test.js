/*
 * tests/fiches-suspectes.test.js : détection des fiches maison suspectes (scripts/fiches-suspectes.js).
 *
 * Sur des fiches fabriquées ici : chaque signal (type, spécialités, moyenne) se déclenche quand il le doit, et aucun ne
 * se déclenche sur une fiche conforme. Le seuil de moyenne est testé de part et d'autre.
 *
 * Lancer : npm test
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluerFiche, SEUIL_MOYENNE } = require("../scripts/fiches-suspectes");

const officiel = () => ({ typePs: "licence", attendu: { recommandees: ["maths", "physique_chimie"], maths_obligatoire: false }, moyennePs: 13 });
const fiche = () => ({ type: "licence", specialites: { obligatoires: [], recommandees: ["maths", "physique_chimie"] }, notes: { moyenne_cible: 13.4 } });

test("une fiche conforme ne déclenche aucun signal", () => {
  const r = evaluerFiche(fiche(), officiel());
  assert.deepEqual(r.signaux, []);
  assert.equal(r.score, 0);
});

test("signal type : type différent de celui de Parcoursup", () => {
  const f = fiche(); f.type = "ecole_commerce";
  const r = evaluerFiche(f, officiel());
  assert.deepEqual(r.signaux, ["type"]);
  assert.equal(r.details.type.parcoursup, "licence");
});

test("signal type : sans type lu dans Parcoursup, pas de signal", () => {
  const o = officiel(); o.typePs = null;
  assert.deepEqual(evaluerFiche(fiche(), o).signaux, []);
});

test("signal spécialités : spécialité de la fiche absente des attendus", () => {
  const f = fiche(); f.specialites.recommandees.push("HLP");
  const r = evaluerFiche(f, officiel());
  assert.deepEqual(r.signaux, ["specialites"]);
  assert.deepEqual(r.details.specialites.enTrop, ["HLP"]);
});

test("signal spécialités : spécialité obligatoire absente des attendus", () => {
  const f = fiche(); f.specialites.obligatoires = ["SES"];
  assert.deepEqual(evaluerFiche(f, officiel()).details.specialites.enTrop, ["SES"]);
});

test("signal spécialités : spécialité conseillée par l'État absente de la fiche", () => {
  const f = fiche(); f.specialites.recommandees = ["maths"];
  const r = evaluerFiche(f, officiel());
  assert.deepEqual(r.signaux, ["specialites"]);
  assert.deepEqual(r.details.specialites.manquantes, ["physique_chimie"]);
});

test("signal spécialités : sans attendus pour la formation, pas de signal", () => {
  const f = fiche(); f.specialites.recommandees = ["HLP"];
  const o = officiel(); o.attendu = null;
  assert.deepEqual(evaluerFiche(f, o).signaux, []);
});

test("prépa ECG : maths obligatoires comptent comme attendues", () => {
  const f = fiche(); f.specialites = { obligatoires: ["maths"], recommandees: [] };
  const o = officiel(); o.attendu = { recommandees: [], maths_obligatoire: true };
  assert.deepEqual(evaluerFiche(f, o).signaux, []);
});

test("signal moyenne : écart au seuil ou au-delà, dans les deux sens", () => {
  const f = fiche(); f.notes.moyenne_cible = 13 + SEUIL_MOYENNE;
  assert.deepEqual(evaluerFiche(f, officiel()).signaux, ["moyenne"]);
  f.notes.moyenne_cible = 13 - SEUIL_MOYENNE;
  const r = evaluerFiche(f, officiel());
  assert.deepEqual(r.signaux, ["moyenne"]);
  assert.equal(r.ecart, -SEUIL_MOYENNE);
});

test("signal moyenne : écart sous le seuil ou moyenne inconnue, pas de signal", () => {
  const f = fiche(); f.notes.moyenne_cible = 13 + SEUIL_MOYENNE - 0.1;
  assert.deepEqual(evaluerFiche(f, officiel()).signaux, []);
  const o = officiel(); o.moyennePs = null;
  f.notes.moyenne_cible = 20;
  assert.deepEqual(evaluerFiche(f, o).signaux, []);
});

test("le score est le nombre de signaux", () => {
  const f = fiche(); f.type = "iep"; f.specialites.recommandees = ["HLP"]; f.notes.moyenne_cible = 18;
  const r = evaluerFiche(f, officiel());
  assert.equal(r.score, 3);
});
