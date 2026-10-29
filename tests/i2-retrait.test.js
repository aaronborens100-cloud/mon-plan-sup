/*
 * tests/i2-retrait.test.js : PR I2, retrait des fiches maison fusionnées avec Parcoursup (règle 2).
 *
 * Décision d'Aaron : data/formations.json ne contient plus que les 519 fiches à l'étranger. Toutes les formations
 * françaises sont des formations Parcoursup (identifiant psup-<code>), notées par la table des filières. BTS et BUT
 * restent masqués. Les anciens identifiants (fusionnés, modèles ECG, fiches retirées par H) sont redirigés vers
 * psup-<code> (data/anciennes-fiches.json, redirections), ou le vœu est retiré avec un message.
 *
 * Lancer : npm test
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { chargerSite } = require("./charger-site");
const PROFILS = require("./profils");

const FU = require("../data/anciennes-fiches.json");
const AJ = require("../data/ajustements.json");
const FICHIER = require("../data/formations.json");
const P = PROFILS[0];
const ETAT = (retenus) => ({ profil: P.profil, reponses: P.reponses, retenus, profilTermine: true, qIndex: 999 });
const MESSAGE = "Une formation de ta liste n'est plus proposée par Mon Plan Sup (fiche sans correspondance Parcoursup). Elle a été retirée de ta liste.";

let site;
test.before(async () => { site = await chargerSite(); });

test("aucune fiche France hors psup-* : ni dans data/formations.json ni dans le catalogue", () => {
  assert.deepEqual(FICHIER.formations.filter((f) => f.pays === "France").map((f) => f.id), []);
  assert.deepEqual(Array.from(site.DATA.formations.filter((f) => f.pays === "France" && !f.id.startsWith("psup-")).map((f) => f.id)), []);
  assert.deepEqual(Array.from(site.CAT.filter((e) => e.pays === "France" && !e.id.startsWith("psup-")).map((e) => e.id)), []);
  assert.equal(FICHIER.meta.nb_formations, FICHIER.formations.length);
});

test("formations à l'étranger : 519 fiches, toutes gardées", () => {
  assert.equal(FICHIER.formations.length, 519);
  const ids = new Set(site.DATA.formations.map((f) => f.id));
  assert.equal(FICHIER.formations.filter((f) => ids.has(f.id)).length, 519);
});

test("ajustements.json : plus de taux_officiel ni de remplacements", () => {
  assert.equal(AJ.taux_officiel, undefined);
  assert.equal(AJ.remplacements, undefined);
  assert.ok(AJ.campus_etranger);
});

test("un ancien id fusionné (insa-toulouse-ingenieur) est redirigé vers sa formation Parcoursup", async () => {
  const x = FU.anciennes["insa-toulouse-ingenieur"];
  assert.equal(x.m, "C");
  assert.deepEqual(FU.redirections["insa-toulouse-ingenieur"], ["psup-" + x.g]);
  const s = await chargerSite({}, { etat: ETAT(["insa-toulouse-ingenieur"]) });
  assert.deepEqual(s.etatEnregistre().retenus, ["psup-" + x.g]);
  assert.ok(!s.afficher("#liste").includes(MESSAGE));
  // le lien #formation-<ancien id> mène à la fiche Parcoursup
  const cible = site.CAT.find((e) => e.id === "psup-" + x.g);
  assert.ok(cible && cible.f, "formation Parcoursup notée absente");
  assert.ok(s.afficher("#formation-insa-toulouse-ingenieur").includes(cible.nom.replace(/&/g, "&amp;").replace(/'/g, "&#39;").slice(0, 25)));
});

test("un ancien id retiré par H qui visait une fiche C est redirigé vers le psup", async () => {
  // H : la fiche P visait la fiche C fusionnée avec la même formation Parcoursup ; elle vise maintenant psup-<code> directement
  const id = "la-rochelle-universite-la-rochelle-double-licence-droit-lea-anglais-coreen";
  const x = FU.anciennes[id];
  assert.equal(x.m, "P");
  assert.ok(Object.values(FU.anciennes).some((y) => y.m === "C" && y.g === x.c[0]), "la candidate n'était pas fusionnée avec une fiche C");
  assert.deepEqual(FU.redirections[id], ["psup-" + x.c[0]]);
  const s = await chargerSite({}, { etat: ETAT([id]) });
  assert.deepEqual(s.etatEnregistre().retenus, ["psup-" + x.c[0]]);
});

test("les 15 modèles ECG sont redirigés vers les fiches Parcoursup de leurs options", async () => {
  const modeles = Object.entries(FU.anciennes).filter(([, x]) => x.remplacee_par);
  assert.equal(modeles.length, 15);
  for (const [id, x] of modeles) assert.deepEqual(FU.redirections[id], x.remplacee_par.map((g) => "psup-" + g), id);
  const [id, x] = modeles.find(([, y]) => y.remplacee_par.length === 2);
  const s = await chargerSite({}, { etat: ETAT([id]) });
  assert.deepEqual(s.etatEnregistre().retenus, x.remplacee_par.map((g) => "psup-" + g));
});

test("sans cible affichée (BTS ou BUT masqué, ou aucune correspondance) : vœu retiré, avec le message", async () => {
  const sansCible = Object.entries(FU.redirections).filter(([, t]) => t.length === 0).map(([id]) => id);
  assert.ok(sansCible.some((id) => FU.anciennes[id].m === "C"), "aucun ancien id fusionné avec un BTS ou BUT masqué");
  const [id] = sansCible.filter((i) => FU.anciennes[i].m === "C");
  const s = await chargerSite({}, { etat: ETAT([id]) });
  assert.deepEqual(s.etatEnregistre().retenus, []);
  assert.ok(s.afficher("#liste").includes(MESSAGE), "message absent");
});

test("toute cible de redirection est affichée, sauf les listes vides ; aucune n'est un BTS ou BUT", () => {
  const ids = new Set(site.CAT.map((e) => e.id));
  for (const [id, cibles] of Object.entries(FU.redirections)) {
    for (const c of cibles) assert.ok(ids.has(c), `${id} -> ${c} absent du catalogue`);
  }
  const cats = FU.meta.perimetre.categories_masquees;
  for (const e of site.CAT) if (e.ps) assert.ok(!e.ps.tf.some((t) => cats.includes(t)), e.id);
});

test("BTS et BUT absents du catalogue et des fiches", () => {
  assert.equal(site.CAT.filter((e) => e.type === "bts" || e.type === "but" || (e.ps && e.ps.tf.some((t) => t === "BUT" || /^BTS/.test(t)))).length, 0);
  assert.equal(site.DATA.formations.filter((f) => f.type === "bts" || f.type === "but").length, 0);
});

test("les formations Parcoursup concernées sont notées comme les autres (fiche générée)", () => {
  const x = FU.anciennes["insa-toulouse-ingenieur"];
  const e = site.CAT.find((y) => y.id === "psup-" + x.g);
  assert.ok(e.f.__gen && e.f.__gen.gta === x.g);
  assert.equal(e.src, "parcoursup");
});

test("le calendrier Parcoursup (Mon plan, fiches) est gardé : repris de data/ajustements.json par les formations Parcoursup", () => {
  assert.ok(AJ.calendrier_parcoursup.length >= 5);
  for (const c of AJ.calendrier_parcoursup) assert.ok(c.date && c.etape && /^https?:\/\//.test(c.source) && c.consulte_le, "calendrier sans source");
  const e = site.CAT.find((y) => y.ps && y.f && y.f.__gen);
  assert.deepEqual(JSON.parse(JSON.stringify(e.f.calendrier)), AJ.calendrier_parcoursup);
});
