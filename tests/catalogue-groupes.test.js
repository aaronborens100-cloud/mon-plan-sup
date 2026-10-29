/*
 * tests/catalogue-groupes.test.js : grandes catégories du catalogue (Prépa ECG, Licence, Bachelor…).
 *
 * C'est de l'affichage seulement (js/app.js) : une formation est dans une seule grande catégorie, la somme des
 * catégories redonne le total, et les sous-catégories d'une catégorie redonnent le total de cette catégorie.
 * Les recommandations ne sont pas concernées (js/moteur.js n'est pas touché).
 *
 * Lancer : npm test
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { chargerSite } = require("./charger-site");

const nb = (t) => Number(String(t).replace(/\D/g, ""));
const puces = (html, action) => [...html.matchAll(new RegExp(`data-action="${action}" data-k="([^"]*)" aria-pressed="(\\w+)">([^<]*)<span class="cat-puce-n">([^<]*)<`, "g"))]
  .map((m) => ({ k: m[1], actif: m[2] === "true", lib: m[3], n: nb(m[4]) }));
const trouvees = (html) => nb((html.match(/<b>([^<]*)<\/b> formations? trouvée/) || [])[1]);

test("catalogue : chaque formation est dans une seule grande catégorie (la somme redonne le total)", async () => {
  const site = await chargerSite();
  const h = site.afficher("#explorer");
  const g = puces(h, "cat-groupe");
  const toutes = g.find((x) => x.k === "");
  assert.ok(toutes && toutes.actif, "puce « Toutes » active par défaut");
  assert.equal(toutes.n, trouvees(h));
  assert.equal(g.filter((x) => x.k !== "").reduce((s, x) => s + x.n, 0), toutes.n);
  for (const k of ["prepa-ecg", "licence", "bachelor"]) assert.ok(g.some((x) => x.k === k && x.n > 0), `catégorie ${k} absente`);
  assert.doesNotMatch(h, /NaN|undefined|null/);
});

test("catalogue : choisir une catégorie filtre la liste, ses sous-catégories redonnent son total, « Toutes » rétablit", async () => {
  const site = await chargerSite();
  const total = trouvees(site.afficher("#explorer"));
  for (const k of ["prepa-ecg", "prepa-sci", "licence", "bachelor"]) {
    const h = site.cliquer({ action: "cat-groupe", k });
    const g = puces(h, "cat-groupe").find((x) => x.k === k);
    assert.ok(g.actif && g.n > 0 && trouvees(h) === g.n, `${k} : ${trouvees(h)} résultats pour ${g.n} annoncés`);
    const s = puces(h, "cat-sous");
    assert.ok(s.length > 2, `${k} : sous-catégories attendues`);
    assert.equal(s.filter((x) => x.k !== "").reduce((t, x) => t + x.n, 0), g.n, `${k} : la somme des sous-catégories ≠ ${g.n}`);
    const un = s.find((x) => x.k !== "");
    const h2 = site.cliquer({ action: "cat-sous", k: un.k.replace(/&#39;/g, "'").replace(/&amp;/g, "&") });
    assert.equal(trouvees(h2), un.n, `${k} / ${un.lib}`);
  }
  assert.equal(trouvees(site.cliquer({ action: "cat-groupe", k: "" })), total);
});

test("catalogue : les prépas ECG se découpent en ECG, ECT et ENS ; les prépas scientifiques en MPSI, PCSI, MP2I…", async () => {
  const site = await chargerSite();
  site.afficher("#explorer");
  const ecg = puces(site.cliquer({ action: "cat-groupe", k: "prepa-ecg" }), "cat-sous").map((x) => x.lib);
  for (const l of ["ECG", "ECT (bac techno)", "ENS D1 / D2"]) assert.ok(ecg.includes(l), `sous-catégorie ${l} absente`);
  const sci = puces(site.cliquer({ action: "cat-groupe", k: "prepa-sci" }), "cat-sous").map((x) => x.lib);
  for (const l of ["MPSI", "PCSI", "MP2I", "PTSI", "BCPST"]) assert.ok(sci.includes(l), `sous-catégorie ${l} absente`);
});
