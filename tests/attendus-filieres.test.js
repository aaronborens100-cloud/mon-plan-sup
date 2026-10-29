/*
 * tests/attendus-filieres.test.js : table des attendus nationaux officiels (data/attendus-filieres.json).
 *
 * Table des attendus, appliquée telle quelle (décision d'Aaron du 29/10/2026) : js/catalogue.js en tire les spécialités
 * conseillées des filières couvertes (voir tests/attendus-branches.test.js). Ce test vérifie la table :
 *   - chaque entrée a au moins une citation et un champ applique (true seulement si elle a un code nmc) ;
 *   - chaque citation est bien recopiée mot pour mot dans le texte extrait du PDF officiel (docs/releves/) ;
 *   - chaque code nmc existe dans data/filieres.json ;
 *   - chaque spécialité déduite est recalculée avec la table discipline → spécialité sûre de meta, en « recommandées » seulement ;
 *   - ECE / ECS / ECT / PACES / ENS Cachan C et D2 sont rattachées à leurs codes actuels, MP2I n'est pas créée.
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

test("toute entrée a au moins une citation et un champ applique cohérent avec ses codes nmc", () => {
  for (const [cle, e] of entrees) {
    assert.ok(Array.isArray(e.citations) && e.citations.length >= 1, cle + " : aucune citation");
    assert.ok(!("valide" in e), cle + " : le champ valide n'existe plus");
    assert.equal(typeof e.applique, "boolean", cle);
    assert.equal(e.applique, e.nmc.length > 0 && !/Sciences de l'éducation$/.test(cle), cle + " : applique incohérent");
    if (!e.applique) assert.ok(e.non_applique_raison, cle + " : raison de non-application manquante");
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

test("texte de l'État appliqué tel quel : règle de la table et liste des entrées non appliquées", () => {
  assert.equal(T.meta.regle, "Texte de l'État appliqué tel quel (décision d'Aaron du 29/10/2026) ; seules les correspondances discipline → spécialité sûres sont utilisées");
  assert.deepEqual(T.meta.table_disciplines_specialites.correspondances, {
    "mathématiques": "maths", "physique-chimie": "physique_chimie", "sciences de la vie et de la Terre": "SVT",
    "sciences économiques et sociales": "SES", "sciences de l’ingénieur": "SI", "informatique": "NSI",
    "langue étrangère": ["LLCER_anglais", "LLCER_autre"], "langues vivantes": ["LLCER_anglais", "LLCER_autre"],
  });
  assert.match(T.meta.table_disciplines_specialites.correspondances_approchees["langue étrangère"], /correspondance approchée acceptée par Aaron le 29\/10\/2026/);
  for (const x of ["histoire-géographie", "lettres", "philosophie"]) assert.ok(T.meta.table_disciplines_specialites.disciplines_sans_specialite.includes(x), x);
  const r = T.meta.regles_acces_ecg;
  assert.equal(r.a_confirmer, true);
  assert.match(r.source, /^https:\/\/www\.onisep\.fr\/.*classe-preparatoire-economique-et-commerciale-generale-1re-annee$/);
  assert.deepEqual(Object.keys(r.codes).sort(), ["ECG-MA-ESH", "ECG-MA-HGG", "ECG-Mapp-ESH", "ECG-Mapp-HGG"]);
  assert.deepEqual(T.meta.non_appliquees.slice().sort(), entrees.filter(([, e]) => !e.applique).map(([c]) => c).sort());
  assert.ok(T.meta.non_appliquees.includes("Licence mention Sciences de l'éducation"));
});

test("chaque spécialité déduite est recalculée avec la table de correspondance : recommandées seulement, jamais obligatoires", () => {
  const connues = new Set();
  for (const f of Object.values(FILIERES)) {
    for (const s of [...(f.specialites.obligatoires || []), ...(f.specialites.recommandees || [])]) connues.add(s);
  }
  for (const [cle, e] of entrees) {
    const d = e.specialites_deduites;
    assert.equal(d.statut, "table_discipline_specialite", cle);
    const TAB = T.meta.table_disciplines_specialites.correspondances;
    assert.deepEqual(d.obligatoires, [], cle + " : aucune spécialité obligatoire");
    assert.deepEqual(d.recommandees, [...new Set(e.disciplines.filter((x) => TAB[x]).flatMap((x) => [].concat(TAB[x])))], cle + " : spécialités mal recalculées");
    for (const x of e.disciplines) assert.ok(TAB[x] || T.meta.table_disciplines_specialites.disciplines_sans_specialite.includes(x), cle + " : discipline non classée « " + x + " »");
    assert.ok(typeof d.justification === "string" && d.justification.length > 10, cle + " : justification manquante");
    for (const s of [...d.obligatoires, ...d.recommandees]) assert.ok(connues.has(s), `${cle} : spécialité inconnue « ${s} »`);
    // ne rien inventer : pas de spécialité déduite sans discipline citée
    if (d.recommandees.length || d.obligatoires.length) assert.ok(e.disciplines.length > 0, cle);
  }
});

test("ECE, ECS, ECT, PACES, ENS Cachan C et D2 : rattachées aux codes actuels, avec la phrase d'explication ; MP2I absente", () => {
  const code = (debut) => T.filieres[Object.keys(T.filieres).find((k) => k.startsWith(debut))];
  const attendu = [
    ["CPGE ECE ", ["ECG-Mapp-ESH", "ECG-MA-ESH"]], ["CPGE ECS ", ["ECG-Mapp-HGG", "ECG-MA-HGG"]], ["CPGE ECT ", ["CPGE-ECT"]],
    ["PACES", ["PASS"]], ["CPGE ENS Cachan C", ["CPGE-PS-AD"]], ["CPGE ENS Paris-Saclay D2", ["CPGE-Cachan-D2"]],
  ];
  for (const [debut, nmc] of attendu) {
    const e = code(debut);
    assert.ok(e, debut + " absente");
    assert.deepEqual(e.nmc, nmc, debut);
    assert.ok(e.rattachement && e.rattachement.length > 40, debut + " : phrase de rattachement manquante");
    assert.equal(e.applique, true, debut);
  }
  assert.ok(!/supprimée en 2021/.test(JSON.stringify(T.filieres)), "la note « supprimée en 2021 » doit disparaître");
  assert.ok(!Object.keys(T.filieres).some((k) => /MP2I/i.test(k)));
});

test("le site lit la table des attendus pour les spécialités des filières, et ne l'expose pas dans DATA", async () => {
  const site = await chargerSite();
  assert.ok(site.DATA && site.DATA.formations.length > 0);
  assert.ok(!("attendus" in site.DATA) && !("attendus-filieres" in site.DATA));
  assert.ok(/attendus-filieres/.test(lire("js/app.js")), "app.js doit charger la table");
});
