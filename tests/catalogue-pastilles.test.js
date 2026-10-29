/*
 * tests/catalogue-pastilles.test.js : grandes pastilles par filière de la page Catalogue (#explorer).
 *
 * Affichage seulement (js/app.js) : chaque formation du catalogue est dans une seule pastille (les types sans pastille
 * vont dans « Autres formations »), les effectifs sont calculés depuis le catalogue, un clic filtre, un second clic
 * retire le filtre, et les puces d'affinage (MPSI, PCSI, BCPST ; ECG) filtrent sur le nom de la fiche.
 * Les recommandations ne sont pas concernées (js/moteur.js n'est pas touché).
 *
 * Lancer : npm test
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { chargerSite } = require("./charger-site");

const nb = (t) => Number(String(t).replace(/\D/g, ""));
const pastilles = (h) => Object.fromEntries([...h.matchAll(/data-action="cat-pastille" data-k="([^"]*)" aria-pressed="(\w+)"><b>[^<]*<\/b><span>([^<]*) formation/g)].map((m) => [m[1], { actif: m[2] === "true", n: nb(m[3]) }]));
const puces = (h) => Object.fromEntries([...h.matchAll(/data-action="cat-puce" data-k="([^"]*)" aria-pressed="(\w+)">([^<]*)(?:<span class="cat-puce-n">([^<]*)<\/span>)?<\/button>/g)].map((m) => [m[1] || "toutes", { actif: m[2] === "true", n: m[4] === undefined ? null : nb(m[4]) }]));
const trouvees = (h) => nb((h.match(/<b>([^<]*)<\/b> formations? trouvée/) || [])[1]);

test("pastilles : chaque formation du catalogue est dans une seule pastille (la somme redonne le total, « Autres » comprise)", async () => {
  const site = await chargerSite();
  const h = site.afficher("#explorer");
  const p = pastilles(h);
  const somme = Object.values(p).reduce((s, x) => s + x.n, 0);
  assert.equal(somme, site.CAT.length, "somme des pastilles ≠ nombre de formations du catalogue");
  assert.ok(p.autres && p.autres.n > 0, "pastille « Autres formations » absente");
  for (const k of ["prepa_ecg", "prepa_scientifique", "licence", "bachelor_france", "bachelor_europeen"]) assert.equal(p[k].n, site.CAT.filter((e) => e.type === k).length, k);
  assert.doesNotMatch(h, /id="ctype"/, "l'ancien menu « Type » ne doit plus être à l'écran");
  assert.doesNotMatch(h, /NaN|undefined|null/);
  assert.equal(trouvees(h), site.CAT.length);
});

test("pastilles : un clic filtre sur le type, un second clic retire le filtre ; « Autres » regroupe les types sans pastille", async () => {
  const site = await chargerSite();
  site.afficher("#explorer");
  const total = site.CAT.length;
  let h = site.cliquer({ action: "cat-pastille", k: "licence" });
  assert.equal(pastilles(h).licence.actif, true);
  assert.equal(trouvees(h), site.CAT.filter((e) => e.type === "licence").length);
  h = site.cliquer({ action: "cat-pastille", k: "licence" });
  assert.equal(pastilles(h).licence.actif, false);
  assert.equal(trouvees(h), total);
  const avec = new Set(["prepa_ecg", "prepa_scientifique", "prepa_litteraire", "prepa_bl", "licence", "double_licence", "iep", "college_universitaire", "ecole_ingenieur", "ecole_commerce", "ecole_art", "dn_made", "sante_social", "bachelor_france", "bachelor_europeen"]);
  h = site.cliquer({ action: "cat-pastille", k: "autres" });
  assert.equal(trouvees(h), site.CAT.filter((e) => !avec.has(e.type)).length);
});

test("pastilles : la recherche et le lieu se combinent avec la pastille", async () => {
  const site = await chargerSite();
  site.afficher("#explorer");
  site.cliquer({ action: "cat-pastille", k: "bachelor_france" });
  const h = site.saisir({ cfiltre: "region" }, "etranger");
  assert.equal(trouvees(h), site.CAT.filter((e) => e.type === "bachelor_france" && e.pays !== "France").length);
});

test("puces des prépas scientifiques : MPSI + PCSI + BCPST + autres intitulés = la pastille", async () => {
  const site = await chargerSite();
  site.afficher("#explorer");
  let h = site.cliquer({ action: "cat-pastille", k: "prepa_scientifique" });
  const total = pastilles(h).prepa_scientifique.n;
  const pu = puces(h);
  for (const k of ["MPSI", "PCSI", "BCPST"]) assert.ok(pu[k] && pu[k].n > 0, `puce ${k} absente`);
  assert.equal(["MPSI", "PCSI", "BCPST", "__reste"].reduce((s, k) => s + (pu[k] ? pu[k].n : 0), 0), total);
  h = site.cliquer({ action: "cat-puce", k: "BCPST" });
  assert.equal(trouvees(h), pu.BCPST.n);
  assert.ok(/<h3>CPGE[^<]*BCPST/i.test(h));
  h = site.cliquer({ action: "cat-puce", k: "" });
  assert.equal(trouvees(h), total);
});

test("puces des prépas ECG : chaque puce filtre sur le nom, les puces à 0 sont masquées, changer de pastille remet « Toutes »", async () => {
  const site = await chargerSite();
  site.afficher("#explorer");
  let h = site.cliquer({ action: "cat-pastille", k: "prepa_ecg" });
  const pu = puces(h);
  for (const k of ["Maths approfondies", "Maths appliquées", "avec ESH", "avec HGG"]) assert.ok(pu[k] && pu[k].n > 0, `puce ${k} absente`);
  h = site.cliquer({ action: "cat-puce", k: "avec HGG" });
  assert.equal(trouvees(h), pu["avec HGG"].n);
  h = site.cliquer({ action: "cat-pastille", k: "licence" });
  assert.deepEqual(puces(h), {}, "pas de puces d'affinage pour la licence");
  assert.equal(trouvees(h), site.CAT.filter((e) => e.type === "licence").length);
});
