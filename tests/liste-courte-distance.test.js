/*
 * tests/liste-courte-distance.test.js : message honnête quand la zone de mobilité laisse moins de 10 vœux (issue #58).
 *
 * Décision du fondateur : « Dans ta zone de mobilité, seules N formations correspondent à ton profil. Pour avoir 10
 * vœux, élargis ta zone. » Jamais de vœu ajouté hors rayon (la liste ne change pas) ; une liste vide due à la distance
 * n'affiche pas « Complète ton profil… », réservé à un profil réellement incomplet.
 * Cas réels de l'issue : lycée André Honnorat (Barcelonnette, 0 vœu en « domicile ») et lycée de Mauriac (4 vœux, 3 depuis I2).
 *
 * Lancer : npm test
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { chargerSite } = require("./charger-site");

const LIEUX = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "lieux.json"), "utf8"));
function lycee(test_) {
  const l = LIEUX.lycees.find(test_);
  return { type: "lycee", uai: l[0], nom: l[1], commune: l[2], dep: l[3], lat: l[4], lon: l[5] };
}
function profil(specialites, moyenne, lyc) {
  return { prenom: "", niveau: "terminale", specialites, specialiteAbandonnee: "", optionMaths: "aucune", autresOptions: "", anglaisAuto: "B1",
    periodes: [{ id: "T1", label: "Terminale – T1", moyenneGenerale: String(moyenne), moyenneClasse: "", rang: "", effectif: "", notes: {}, appreciationGenerale: "", mention: "" }],
    bacFrancais: { ecrit: "", oral: "" }, certifications: [], experiences: [], lycee: lyc };
}
const reponses = (mobilite) => ({ matieres: ["svt"], soigner: 5, vivant: 4, societe: 4, secteurs: ["sante"], concret: 5, maths_niv: "0", ecrit_niv: "1",
  charge: "moyenne", ambition: 2, long: 2, etranger: "non", pays: ["aucun"], budget: "gratuit", lieu: ["regions"], mobilite });
const BARCELONNETTE = profil(["LLCA", "HLP"], 16, lycee((x) => /Honnorat/.test(x[1])));
const MAURIAC = profil(["SVT", "SES"], 11.25, lycee((x) => x[0] === "0150747F"));
const COMPLETE = "Complète ton profil et le questionnaire";

let site;
test.before(async () => { site = await chargerSite(); });
const analyser = (p, mob) => {
  const A = site.E.recommander(site.DATA.formations, p, site.QUEST, reponses(mob));
  return { A, W: site.E.wishlist(A.resultats, 10, A.interets) };
};
async function page(p, mob) {
  const s = await chargerSite({}, { etat: { profil: p, reponses: reponses(mob), retenus: [] } });
  s.afficher("#liste");
  return s.cliquer({ action: "onglet-liste", o: "voeux" });
}
const texte = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#39;|&#x27;/g, "'").replace(/\s+/g, " ");

test("domicile, liste vide (Barcelonnette) : message de zone de mobilité, pas « Complète ton profil »", async () => {
  const { W } = analyser(BARCELONNETTE, "domicile");
  assert.equal(W.liste.length, 0);
  assert.equal(W.limiteeParDistance, true);
  const t = texte(await page(BARCELONNETTE, "domicile"));
  assert.ok(t.includes("Dans ta zone de mobilité, aucune formation ne correspond à ton profil. Pour avoir 10 vœux, élargis ta zone."));
  assert.ok(!t.includes(COMPLETE));
});

// I2 : 4 vœux avant le retrait des fiches maison (2 DN MADE d'Aurillac), 3 depuis (voir tests/domicile-sans-coordonnees.test.js)
test("domicile, 3 vœux (Mauriac) : « seules 3 formations correspondent », la liste reste sans vœu hors rayon", async () => {
  const { W } = analyser(MAURIAC, "domicile");
  assert.equal(W.liste.length, 3);
  assert.equal(W.limiteeParDistance, true);
  for (const x of W.liste) assert.ok(x.dist !== null && site.E.distanceEquivalente(x.dist, x.traversee) <= 45, x.f.id);
  const t = texte(await page(MAURIAC, "domicile"));
  assert.ok(t.includes("Dans ta zone de mobilité, seules 3 formations correspondent à ton profil. Pour avoir 10 vœux, élargis ta zone."));
});

test("même élève en « proche » ou « partout » : 10 vœux, aucun message de zone", async () => {
  for (const mob of ["proche", "partout"]) {
    const { W } = analyser(MAURIAC, mob);
    assert.equal(W.liste.length, 10);
    assert.equal(W.limiteeParDistance, false);
    assert.ok(!texte(await page(MAURIAC, mob)).includes("Dans ta zone de mobilité"));
  }
});

test("profil réellement incomplet : « Complète ton profil » reste affiché, sans message de zone", async () => {
  const vide = profil([], "", null);
  const s = await chargerSite({}, { etat: { profil: vide, reponses: {}, retenus: [] } });
  s.afficher("#liste");
  const t = texte(s.cliquer({ action: "onglet-liste", o: "voeux" }));
  const A = s.E.recommander(s.DATA.formations, vide, s.QUEST, {});
  const W = s.E.wishlist(A.resultats, 10, A.interets);
  if (W.liste.length === 0) {
    assert.equal(W.limiteeParDistance, false);
    assert.ok(t.includes(COMPLETE));
  }
  assert.ok(!t.includes("Dans ta zone de mobilité"));
});

test("l'indicateur est invisible dans la liste : même résultat sérialisé", () => {
  const { W } = analyser(MAURIAC, "domicile");
  assert.ok(!Object.keys(W).includes("limiteeParDistance"));
});
