/*
 * tests/attendus-filieres.test.js : table des attendus nationaux officiels (data/attendus-filieres.json).
 *
 * Table de référence à valider par Aaron : le moteur ne la lit pas. Ce test vérifie :
 *   - chaque entrée a au moins une citation et valide = false (rien n'est validé avant Aaron) ;
 *   - chaque citation est bien recopiée mot pour mot dans le texte extrait du PDF officiel (docs/releves/) ;
 *   - chaque code nmc existe dans data/filieres.json ;
 *   - chaque spécialité déduite est une clé de spécialité déjà utilisée dans data/filieres.json ;
 *   - ECE / ECS / ECT (supprimées en 2021) n'ont pas de code, MP2I n'est pas créée ;
 *   - le site charge le fichier sans changement : ni js/ ni index.html ne le lisent.
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
const lire = (f) => fs.readFileSync(path.join(RACINE, f), "utf8");
const T = JSON.parse(lire("data/attendus-filieres.json"));
const FILIERES = JSON.parse(lire("data/filieres.json")).filieres;
const entrees = Object.entries(T.filieres);

const sansEspaces = (s) => s.replace(/\s+/g, "");

test("la table contient des filières et des sources renseignées", () => {
  assert.ok(entrees.length > 0);
  assert.equal(T.meta.sources.length, 2);
  for (const s of T.meta.sources) {
    assert.ok(s.titre && s.fichier && s.fourni_par === "Aaron" && s.recu_le === "2026-10-29");
    assert.equal(s.url, null);
    assert.equal(s.url_a_fournir, true);
    assert.ok(fs.existsSync(path.join(RACINE, s.fichier)), s.fichier + " absent");
    assert.ok(fs.existsSync(path.join(RACINE, s.texte_extrait)), s.texte_extrait + " absent");
  }
});

test("toute entrée a au moins une citation et valide = false", () => {
  for (const [cle, e] of entrees) {
    assert.ok(Array.isArray(e.citations) && e.citations.length >= 1, cle + " : aucune citation");
    assert.equal(e.valide, false, cle + " : valide doit rester false");
    for (const c of e.citations) assert.ok(c.texte && Number.isInteger(c.page), cle + " : citation sans texte ou page");
  }
});

test("les citations sont recopiées mot pour mot dans le texte extrait du PDF, à la bonne page", () => {
  const textes = {};
  for (const s of T.meta.sources) textes[s.fichier] = lire(s.texte_extrait).split("\f").map(sansEspaces);
  for (const [cle, e] of entrees) {
    const pages = textes[e.fichier];
    assert.ok(pages, cle + " : fichier inconnu " + e.fichier);
    const verifier = (texte, page, ou) => {
      assert.ok(pages[page - 1] && pages[page - 1].includes(sansEspaces(texte)), `${cle} : ${ou} introuvable page ${page} : « ${texte} »`);
    };
    for (const c of e.citations) {
      verifier(c.texte, c.page, "citation");
      for (const s of c.sous_puces || []) verifier(s.texte, s.page, "sous-puce");
    }
    for (const p of e.precisions_disciplines || []) verifier(p.texte, p.page, "précision");
  }
  for (const m of T.meta.mentions_sans_attendus) {
    const pages = textes[m.fichier];
    assert.ok(pages[m.page - 1].includes(sansEspaces(m.texte)), m.libelle);
  }
});

test("chaque code nmc existe dans data/filieres.json et la correspondance est cohérente", () => {
  for (const [cle, e] of entrees) {
    assert.ok(Array.isArray(e.nmc), cle);
    for (const c of e.nmc) assert.ok(FILIERES[c], `${cle} : code nmc inconnu « ${c} »`);
    assert.ok(["certaine", "a_verifier", "aucune"].includes(e.correspondance), cle);
    assert.equal(e.nmc.length === 0, e.correspondance === "aucune", cle + " : nmc et correspondance incohérents");
  }
});

test("chaque spécialité déduite est une clé de spécialité connue, statut d'interprétation et justification", () => {
  const connues = new Set();
  for (const f of Object.values(FILIERES)) {
    for (const s of [...(f.specialites.obligatoires || []), ...(f.specialites.recommandees || [])]) connues.add(s);
  }
  for (const [cle, e] of entrees) {
    const d = e.specialites_deduites;
    assert.equal(d.statut, "interpretation_mon_plan_sup", cle);
    assert.ok(typeof d.justification === "string" && d.justification.length > 10, cle + " : justification manquante");
    for (const s of [...d.obligatoires, ...d.recommandees]) assert.ok(connues.has(s), `${cle} : spécialité inconnue « ${s} »`);
    // ne rien inventer : pas de spécialité déduite sans discipline citée
    if (d.recommandees.length || d.obligatoires.length) assert.ok(e.disciplines.length > 0, cle);
  }
});

test("ECE, ECS, ECT : recopiées sans code, avec la note de suppression ; MP2I absente", () => {
  for (const sigle of ["ECE", "ECS", "ECT"]) {
    const cle = Object.keys(T.filieres).find((k) => k.startsWith("CPGE " + sigle + " "));
    assert.ok(cle, sigle + " absente");
    assert.deepEqual(T.filieres[cle].nmc, [], sigle);
    assert.match(T.filieres[cle].note, /filière supprimée en 2021 ; ECG à reprendre de la version en vigueur/);
  }
  assert.ok(!Object.keys(T.filieres).some((k) => /MP2I/i.test(k)));
});

test("le site charge le fichier sans changement : ni js/ ni index.html ne le lisent", async () => {
  for (const f of [...fs.readdirSync(path.join(RACINE, "js")).map((n) => "js/" + n), "index.html"]) {
    assert.ok(!/attendus-filieres/.test(lire(f)), f + " lit la table des attendus");
  }
  const site = await chargerSite();
  assert.ok(site.DATA && site.DATA.formations.length > 0);
  assert.ok(!("attendus" in site.DATA) && !("attendus-filieres" in site.DATA));
});
