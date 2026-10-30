/*
 * tests/liste-courte-distance.test.js : message honnête quand la zone de mobilité laisse moins de 10 vœux (issue #58).
 *
 * Décision du fondateur : « Dans ta zone de mobilité, seules N formations correspondent à ton profil. Pour avoir 10
 * vœux, élargis ta zone. » Jamais de vœu ajouté hors rayon (la liste ne change pas) ; une liste vide due à la distance
 * n'affiche pas « Complète ton profil… », réservé à un profil réellement incomplet.
 * Cas réels de l'issue : lycée André Honnorat (Barcelonnette, 0 vœu en « domicile ») et lycée de Mauriac (4 vœux).
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

// Décision du fondateur du 30/10/2026 (liste 3 / 4 / 3) : les vœux ambitieux, puis réalistes, qui manquent peuvent dépasser la
// zone de mobilité, à condition de le dire sur le vœu. La liste n'est plus vide ni limitée à la zone : on vérifie que les
// vœux de la zone sont les seuls sans mention, et que les autres sont signalés « hors de ta zone de mobilité », jamais « sécurité ».
const dansLaZone = (W) => W.liste.filter((x) => !x.horsZone);
const horsZone = (W) => W.liste.filter((x) => x.horsZone);

test("domicile, zone vide (Barcelonnette) : aucun vœu dans la zone, les vœux proposés sont signalés « hors de ta zone de mobilité »", async () => {
  const { W } = analyser(BARCELONNETTE, "domicile");
  assert.equal(dansLaZone(W).length, 0);
  assert.ok(horsZone(W).length > 0 && W.liste.length < 10);
  assert.equal(W.limiteeParDistance, true);
  for (const x of horsZone(W)) assert.ok(x.categorie !== "securite" && /Hors de ta zone de mobilité/.test(x.repere.pourquoi), x.f.id);
  const t = texte(await page(BARCELONNETTE, "domicile"));
  assert.ok(!t.includes(COMPLETE));
  assert.ok(t.includes("Dans ta zone de mobilité, aucune formation ne correspond à ton profil."));
  assert.ok(t.includes("hors de ta zone de mobilité » sont là pour compléter ta liste. Pour avoir 10 vœux, élargis ta zone."));
});

test("domicile, 4 vœux dans la zone (Mauriac) : les autres sont signalés hors zone, jamais « sécurité »", async () => {
  const { W } = analyser(MAURIAC, "domicile");
  assert.ok(dansLaZone(W).length >= 4, "au moins les 4 vœux de la zone");   // 5 depuis que le plafond par établissement est assoupli en dernier recours
  assert.ok(horsZone(W).length > 0);
  for (const x of dansLaZone(W)) assert.ok(x.dist !== null && site.E.distanceEquivalente(x.dist, x.traversee) <= 45, x.f.id);
  for (const x of horsZone(W)) assert.ok(x.categorie !== "securite" && /Hors de ta zone de mobilité/.test(x.repere.pourquoi), x.f.id);
  const t = texte(await page(MAURIAC, "domicile"));
  assert.ok(!t.includes(COMPLETE));
  assert.ok(t.includes(`Dans ta zone de mobilité, seules ${dansLaZone(W).length} formations correspondent à ton profil.`), "le message compte les vœux de la zone seulement");
  assert.ok(t.includes(`Les ${horsZone(W).length} vœux signalés « hors de ta zone de mobilité » sont là pour compléter ta liste.`));
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
