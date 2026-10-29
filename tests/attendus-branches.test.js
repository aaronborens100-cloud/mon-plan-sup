/*
 * tests/attendus-branches.test.js : les spécialités conseillées des filières viennent du cadrage national des attendus
 * (data/attendus-filieres.json, texte de l'État pris tel quel, décision d'Aaron du 29/10/2026), branchées dans
 * js/catalogue.js sur les fiches Parcoursup générées.
 *
 * Vérifie : MPSI (maths, physique-chimie, SI, NSI), licence de droit (aucune discipline citée), prépa ECG + ESH
 * (reprend l'ancien texte ECE), MP2I inchangée (pas de texte), jamais d'obligatoires, maths expertes non touchées,
 * bloc « Attendus nationaux » sur la fiche.
 *
 * Lancer : npm test
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { chargerSite } = require("./charger-site");

const RACINE = path.join(__dirname, "..");
const lire = (f) => JSON.parse(fs.readFileSync(path.join(RACINE, f), "utf8"));
const ATT = lire("data/attendus-filieres.json");
const FIL = lire("data/filieres.json").filieres;

const generee = (site, nmc) => site.DATA.formations.find((f) => f.__gen && f.__gen.fam && f.__gen.fam.nmc === nmc && !f.__gen.modele);
const eq = (a, b, m) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, m);   // tableaux venus du site chargé dans vm : comparés par valeur
const entree = (debut) => ATT.filieres[Object.keys(ATT.filieres).find((k) => k.startsWith(debut))];

test("MPSI générée : spécialités conseillées maths, physique_chimie, SI, NSI, texte du cadrage national", async () => {
  const f = generee(await chargerSite(), "CPGE-MPSI");
  assert.ok(f, "fiche MPSI générée introuvable");
  eq(f.specialites.recommandees, ["maths", "physique_chimie", "SI", "NSI"]);
  eq(f.specialites.obligatoires, []);
  assert.equal(f.specialites.statut, "officiel");
  assert.match(f.specialites.texte, /^Disciplines attendues d'après le cadrage national des attendus \(ministère de l'Enseignement supérieur\) : /);
  assert.ok(f.specialites.source && /cadrage national/i.test(f.specialites.source));
  assert.equal(f.specialites.maths_expertes, FIL["CPGE-MPSI"].specialites.maths_expertes, "maths_expertes hors du texte : non touchée");
  eq(f.domaines, FIL["CPGE-MPSI"].domaines);
  eq(f.metiers, FIL["CPGE-MPSI"].metiers);
  eq(f.profil, FIL["CPGE-MPSI"].profil);
  assert.ok(f.attendus && f.attendus.citations.length > 0, "citations des attendus attachées à la fiche");
});

test("licence de droit : aucune spécialité, texte « ne cite pas »", async () => {
  const f = generee(await chargerSite(), "L1-Droit");
  assert.ok(f, "fiche L1-Droit générée introuvable");
  eq(f.specialites.recommandees, []);
  eq(f.specialites.obligatoires, []);
  assert.equal(f.specialites.texte, "Le cadrage national ne cite pas de discipline du lycée pour cette filière.");
  assert.equal(f.specialites.statut, "officiel");
});

test("prépa ECG + ESH : reçoit les spécialités de l'ancien texte ECE (maths, SES), jamais obligatoires", async () => {
  const site = await chargerSite();
  const ece = entree("CPGE ECE ").specialites_deduites.recommandees;
  assert.deepEqual(ece, ["maths", "SES"]);
  for (const nmc of ["ECG-Mapp-ESH", "ECG-MA-ESH"]) {
    const f = generee(site, nmc);
    assert.ok(f, nmc + " : fiche générée introuvable");
    eq(f.specialites.recommandees, ece, nmc);
    eq(f.specialites.obligatoires, [], nmc);
    assert.equal(f.specialites.maths_expertes, FIL[nmc].specialites.maths_expertes, nmc + " : maths_expertes non touchée");
  }
  const ecs = entree("CPGE ECS ").specialites_deduites.recommandees;
  for (const nmc of ["ECG-Mapp-HGG", "ECG-MA-HGG"]) eq(generee(site, nmc).specialites.recommandees, ecs, nmc);
  eq(generee(site, "CPGE-ECT").specialites.recommandees, []);
  eq(generee(site, "PASS").specialites.recommandees, ["maths", "physique_chimie", "SVT"]);
});

test("MP2I inchangée : pas de texte, spécialités de data/filieres.json, aucun bloc d'attendus", async () => {
  const f = generee(await chargerSite(), "CPGE-MP2I");
  assert.ok(f, "fiche MP2I générée introuvable");
  eq(f.specialites.recommandees, FIL["CPGE-MP2I"].specialites.recommandees);
  eq(f.specialites.obligatoires, FIL["CPGE-MP2I"].specialites.obligatoires);
  assert.equal(f.specialites.statut, "estimation");
  assert.ok(!f.attendus);
});

test("variante d'intitulé d'un code partagé et entrées non appliquées : non touchées", async () => {
  const site = await chargerSite();
  // L1-SEF (Sciences de l'éducation) : entrée non appliquée
  const sef = generee(site, "L1-SEF");
  if (sef) { assert.ok(!sef.attendus); assert.equal(sef.specialites.statut, "estimation"); }
  // intitulé « Sciences sociales » du code L1-SS (base : Sciences pour la santé) : variante, pas d'attendus
  const variantes = site.DATA.formations.filter((f) => f.__gen && f.__gen.fam && f.__gen.fam.nmc === "L1-SS" && f.__gen.fam.libelle === "L1 - Sciences sociales");
  for (const f of variantes) assert.ok(!f.attendus, f.id);
});

test("fiche formation : bloc « Attendus nationaux » avec les citations et la source", async () => {
  const site = await chargerSite();
  const f = generee(site, "CPGE-MPSI");
  const html = site.afficher ? await site.afficher("#formation-" + f.id) : "";
  assert.match(html, /Attendus nationaux/);
  assert.ok(html.includes("Source : Éléments de cadrage national des attendus"));
  assert.ok(html.includes("sciences de l’ingénieur") || html.includes("sciences de l&#39;ingénieur") || html.includes("ingénieur"));
});
