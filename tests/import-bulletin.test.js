/*
 * tests/import-bulletin.test.js : un bulletin importé n'est jamais perdu.
 *
 * - période reconnue à la lecture du PDF : la période est enregistrée sans autre clic ;
 * - période non reconnue : rien n'est enregistré, le bloc d'import est en haut de l'étape avec le bouton
 *   « Ajouter à mon profil », et quitter l'étape affiche un message bloquant (l'import est conservé) ;
 * - sans aucun bulletin enregistré, la page « Ma liste » affiche le bandeau « notes pas encore enregistrées ».
 *
 * Le bulletin lu est FABRIQUÉ (objet d'import fictif, B.lireFichier remplacé) : aucun vrai bulletin dans le dépôt.
 *
 * Lancer : npm test
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { chargerSite } = require("./charger-site");

const profilBase = () => ({ prenom: "", niveau: "terminale", specialites: ["maths", "SES"], specialiteAbandonnee: "", optionMaths: "aucune", autresOptions: "",
  anglaisAuto: "", periodes: [], bacFrancais: { ecrit: "", oral: "" }, certifications: [], experiences: [] });
const etatBase = () => ({ profil: profilBase(), reponses: {}, retenus: [], profilTermine: true, qIndex: 999 });
const attendre = () => new Promise((r) => setImmediate(r));
const MSG_BLOQUANT = "Ton bulletin n'est pas encore ajouté : choisis sa période puis clique sur « Ajouter à mon profil ».";

function bulletinFictif(label) {
  const imp = { fichier: "bulletin-fictif.pdf", notes: { maths: { moy: "14.5" }, SES: { moy: "13" } }, moyenneGenerale: "13.8", moyenneClasse: "11.2", rang: "", effectif: "", appreciationGenerale: "", mention: "", alertes: [] };
  if (label) imp.label = label;
  return imp;
}
async function importer(site, imp) {
  site.B.lireFichier = async () => imp;
  site.cliquer({ action: "profil-edition", i: 1 });
  site.changer({}, { type: "file", id: "pdfbulletins", files: [{ name: imp.fichier }] });
  await attendre(); await attendre();
  return site.afficher("#profil");
}

test("période reconnue : enregistrée dès la lecture, sans autre clic", async () => {
  const site = await chargerSite({}, { etat: etatBase() });
  await importer(site, bulletinFictif("Terminale – T1"));
  const periodes = site.etatEnregistre().profil.periodes;
  assert.equal(periodes.length, 1);
  assert.equal(periodes[0].label, "Terminale – T1");
  assert.equal(periodes[0].moyenneGenerale, "13.8");
  assert.equal(periodes[0].source, "pdf");
});

test("période non reconnue : rien d'enregistré, bloc en haut avec le bouton, message bloquant en quittant l'étape", async () => {
  const site = await chargerSite({}, { etat: etatBase() });
  const page = await importer(site, bulletinFictif(""));
  assert.equal(site.etatEnregistre().profil.periodes.length, 0);
  const iBouton = page.indexOf('data-action="valider-import"');
  assert.ok(iBouton > 0, "bouton « Ajouter à mon profil » absent");
  assert.ok(iBouton < page.indexOf("<table"), "le bouton doit être au-dessus du tableau des matières");
  assert.ok(iBouton < page.indexOf('id="pdfbulletins"'), "le bloc d'import doit être en haut de l'étape");
  assert.ok(!page.includes(MSG_BLOQUANT), "message bloquant affiché trop tôt");
  for (const clic of [{ action: "etape", i: 2 }, { action: "etape", i: 0 }]) {
    const apres = site.cliquer(clic);
    assert.ok(apres.includes(MSG_BLOQUANT), "message bloquant absent après " + JSON.stringify(clic));
    assert.ok(apres.includes('data-action="valider-import"'), "l'import doit être conservé");
    assert.equal(site.etatEnregistre().profil.periodes.length, 0);
  }
  // choisir la période puis valider : enregistré, plus de blocage
  site.saisir({ imp: "0", k: "label" }, "Terminale – T1");
  const fin = site.cliquer({ action: "valider-import", k: "0" });
  assert.equal(site.etatEnregistre().profil.periodes.length, 1);
  assert.ok(!fin.includes(MSG_BLOQUANT));
});

test("page « Ma liste » : bandeau « notes pas encore enregistrées » sans bulletin, absent avec un bulletin", async () => {
  const sans = await chargerSite({}, { etat: etatBase() });
  const p = sans.afficher("#liste");
  assert.ok(p.includes("Tes notes ne sont pas encore enregistrées : toutes tes formations sont classées « ambitieux »."), "bandeau absent");
  assert.ok(p.includes('data-i="1"') && p.includes("Ajoute tes bulletins dans ton profil."), "lien vers l'étape Bulletins absent");
  sans.cliquer({ action: "onglet-liste", o: "voeux" });
  assert.ok(sans.afficher("#liste").includes("Tes notes ne sont pas encore enregistrées"), "bandeau absent sur l'onglet vœux");

  const e = etatBase();
  e.profil.periodes = [{ id: "Terminale – T1", label: "Terminale – T1", moyenneGenerale: "13.8", moyenneClasse: "", rang: "", effectif: "", notes: { maths: { moy: "14" } }, appreciationGenerale: "", mention: "" }];
  const avec = await chargerSite({}, { etat: e });
  assert.ok(!avec.afficher("#liste").includes("Tes notes ne sont pas encore enregistrées"));
});
