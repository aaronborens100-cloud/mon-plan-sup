/*
 * tests/affichage-faisabilite.test.js : affichage honnête de la faisabilité, et aucun « NaN » dans les pages.
 *
 * Règle 2 du projet : jamais d'estimation présentée comme un fait. Quand le taux d'accès officiel d'une formation est
 * inconnu (non publié, nouvelle formation, formation sans statistiques, la plupart des universités étrangères), le site
 * n'affiche ni « Faisabilité X/5 » ni note globale « X/5 » (étoiles comprises) : il écrit « pas de chiffres officiels ».
 * Le moteur n'est pas modifié : listes, vœux et catégories restent identiques (tests de non-régression).
 *
 * Pour les 14 profils types (tests/profils.js), y compris vide et fragile :
 *   (a) aucune formation au taux inconnu n'affiche de faisabilité ni de note globale sur 5 (cartes de Ma liste,
 *       tableau des vœux, liste proposée, fiche) ;
 *   (b) le HTML de l'accueil, du profil, de Ma liste (recommandations et vœux, avec la section « Et à l'étranger ? »),
 *       de la fiche du 1er vœu et des fiches étrangères ne contient ni « NaN », ni « undefined », ni « null ».
 *
 * Lancer : npm test
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { chargerSite } = require("./charger-site");
const PROFILS = require("./profils");

const MOTS_INTERDITS = /\b(NaN|undefined|null)\b/;
// faisabilité ou note globale chiffrée sur 5
const NOTE_FAISABILITE = /Faisabilit[ée]\s*(<[^>]*>\s*)*[\d,]+\s*(<[^>]*>\s*)*\/\s*5/;
const NOTE_GLOBALE = /Note Mon Plan Sup : [\d,]+ sur 5/;
const sansTaux = (x) => x.repere.taux === null || x.repere.taux === undefined;

function extrait(html, re) {
  const m = html.match(new RegExp(`.{0,100}${re.source}.{0,60}`));
  return m ? m[0] : "";
}
function verifierPropre(page, html, id) {
  assert.ok(html && html.length > 200, `${id} : page « ${page} » vide`);
  assert.ok(!MOTS_INTERDITS.test(html), `${id} : « ${page} » contient NaN, undefined ou null : ${extrait(html, MOTS_INTERDITS)}`);
}

// Un site chargé par profil (l'état de l'élève est lu au chargement), avec ses vœux retenus : liste proposée et étranger.
// Le site de base (sans état) est chargé une seule fois ; chaque test charge ensuite son propre site, libéré à la fin.
let base;
test.before(async () => { base = await chargerSite(); });
const profilDebute = (p) => Object.assign({}, p, { profil: Object.assign({}, p.profil, { specialites: ["maths"] }) });
async function sitePour(p) {
  const A = base.E.recommander(base.DATA.formations, p.profil, base.QUEST, p.reponses);
  const W = base.E.wishlist(A.resultats, 10, A.interets);
  const X = base.E.etranger(A.resultats, W, A.interets);
  const retenus = [...W.liste.map((x) => x.f.id), ...X.liste.map((e) => (e.x || e).f.id)];
  const site = await chargerSite({}, { etat: { profil: p.profil, reponses: p.reponses, retenus } });
  return { site, A, W, X };
}


for (const p of PROFILS) {
  test(`profil « ${p.id} » : pas de faisabilité ni de note sur 5 pour une formation sans taux d'accès officiel`, async () => {
    const { site, A, W, X } = await sitePour(p);
    // Ma liste, recommandations : chaque carte au taux inconnu (anneau « Taux d'accès non publié ») est sans note sur 5
    site.afficher("#liste");
    const reco = site.cliquer({ action: "onglet-liste", o: "reco" });
    const plus = site.cliquer({ action: "plus-formations" });
    for (const html of [reco, plus]) {
      const cartes = html.split("<article").slice(1);
      assert.ok(cartes.length > 0 || p.id === "vide", `${p.id} : aucune carte`);
      for (const c of cartes) {
        const tete = c.split('class="f-faits"')[0];
        if (!/aria-label="Taux d'accès non publié"/.test(tete)) continue;
        assert.ok(!NOTE_FAISABILITE.test(c), `${p.id} : carte au taux inconnu avec une faisabilité sur 5 : ${extrait(c, NOTE_FAISABILITE)}`);
        assert.ok(!NOTE_GLOBALE.test(c), `${p.id} : carte au taux inconnu avec des étoiles : ${extrait(c, NOTE_GLOBALE)}`);
        assert.match(c, /pas de chiffres officiels/, `${p.id} : carte au taux inconnu sans le texte « pas de chiffres officiels »`);
      }
    }
    // Ma liste, vœux : tableau des vœux retenus et liste proposée ; une ligne au taux inconnu n'a pas de « X/5 »
    const voeux = site.cliquer({ action: "onglet-liste", o: "voeux" });
    const lignes = [...voeux.split("<tr>").slice(1), ...voeux.split("<li>").slice(1)];
    for (const l of lignes) {
      if (!/(taux non publié|pas encore de chiffres|pas de statistiques)</.test(l)) continue;
      assert.ok(!/[\d,]+\/5(<\/td>|<\/span>)/.test(l.split("chance-txt")[0]), `${p.id} : vœu au taux inconnu noté sur 5 : ${l.slice(0, 300)}`);
    }
    // Fiches des formations au taux inconnu : vœux retenus, propositions à l'étranger et 5 premières recommandations
    const ids = new Set([...W.liste, ...X.liste.map((e) => e.x || e), ...A.resultats.filter((x) => !x.exclu).slice(0, 30)]
      .filter(sansTaux).slice(0, 12).map((x) => x.f.id));
    for (const id of ids) {
      const fiche = site.afficher("#formation-" + id);
      assert.ok(!NOTE_FAISABILITE.test(fiche), `${p.id} : fiche ${id} (taux inconnu) avec une faisabilité sur 5 : ${extrait(fiche, NOTE_FAISABILITE)}`);
      assert.ok(!NOTE_GLOBALE.test(fiche), `${p.id} : fiche ${id} (taux inconnu) avec des étoiles`);
      assert.match(fiche, /pas de chiffres officiels/, `${p.id} : fiche ${id}`);
      verifierPropre(`fiche ${id}`, fiche, p.id);
    }
  });

  // « Ma liste » et « Mon plan » affichent la page verrouillée tant qu'aucune spécialité n'est cochée (profilPret) :
  // le profil « vide » est donc rendu avec une seule spécialité, le minimum pour débloquer ces pages.
  test(`profil « ${p.id} » : ni NaN, ni undefined, ni null dans les pages`, async () => {
    const { site, W, X } = await sitePour(p.id === "vide" ? profilDebute(p) : p);
    verifierPropre("accueil", site.afficher("#accueil"), p.id);
    verifierPropre("profil", site.afficher("#profil"), p.id);
    site.afficher("#liste");
    verifierPropre("Ma liste (recommandations)", site.cliquer({ action: "onglet-liste", o: "reco" }), p.id);
    verifierPropre("Ma liste (plus de formations)", site.cliquer({ action: "plus-formations" }), p.id);
    const voeux = site.cliquer({ action: "onglet-liste", o: "voeux" });
    verifierPropre("Ma liste (vœux et étranger)", voeux, p.id);
    if (X.liste.length && X.mode !== "echange") assert.match(voeux, /Et à l'étranger \?/, `${p.id} : section étranger absente`);
    if (W.liste[0]) verifierPropre("fiche du 1er vœu", site.afficher("#formation-" + W.liste[0].f.id), p.id);
    for (const e of X.liste) verifierPropre(`fiche étrangère ${(e.x || e).f.id}`, site.afficher("#formation-" + (e.x || e).f.id), p.id);
    verifierPropre("Mon plan", site.afficher("#plan"), p.id);
    verifierPropre("Mes données", site.afficher("#donnees"), p.id);
  });
}

test("une formation au taux d'accès officiel garde sa note et sa faisabilité sur 5", async () => {
  const { site, A } = await sitePour(PROFILS.find((p) => p.id === "eco-excellent-decide"));
  const x = A.resultats.find((r) => !r.exclu && !sansTaux(r));
  const fiche = site.afficher("#formation-" + x.f.id);
  assert.match(fiche, NOTE_FAISABILITE);
  assert.match(fiche, NOTE_GLOBALE);
  assert.doesNotMatch(fiche, /pas de chiffres officiels/);
});

// Accueil (design v9) : texte statique, seul le nombre de formations vient des données (calculé depuis le catalogue)
const nbAccueil = (html) => (html.match(/<strong id="nb-formations">([^<]*)<\/strong>/) || [])[1];
const nbCatalogue = (html) => Number(((html.match(/<strong>([^<]*) formations<\/strong> dont/) || [])[1] || "").replace(/\D/g, ""));

test("accueil : « plus de N formations » est calculé depuis le catalogue, arrondi au millier, pas « NaN » ni « 0 »", async () => {
  const site = await chargerSite();
  const html = site.afficher("#accueil");
  const n = nbAccueil(html);
  assert.ok(n !== undefined, "nombre de formations de l'accueil introuvable");
  const chiffre = Number(n.replace(/\D/g, ""));
  const catalogue = nbCatalogue(site.afficher("#explorer"));   // compteur du catalogue (Parcoursup)
  assert.ok(chiffre >= 1000 && chiffre % 1000 === 0, `arrondi au millier attendu : ${n}`);
  assert.ok(catalogue > 0 && chiffre <= catalogue + 1000, `nombre de l'accueil (${chiffre}) incohérent avec le catalogue (${catalogue})`);
  assert.doesNotMatch(html, /NaN|undefined|null/);
});

test("accueil : contenu statique présent (menu, FAQ, qui sommes-nous), sans ancien exemple de recommandation", async () => {
  const site = await chargerSite();
  const html = site.afficher("#accueil");
  assert.match(html, /Qui sommes-nous \?/);
  assert.match(html, /Questions fréquentes/);
  assert.doesNotMatch(html, /hv-exemple-anneau|bande-chiffres/);
});

test("lien direct #formation-… sans profil : ni NaN, ni undefined, ni null (fiches Parcoursup, anciennes fiches, étranger)", async () => {
  const ids = ["psup-7917", ...base.DATA.formations.filter((f) => f.pays && f.pays !== "France").slice(0, 3).map((f) => f.id),
    ...base.DATA.formations.filter((f) => !f.pays || f.pays === "France").slice(0, 3).map((f) => f.id)];
  const site = await chargerSite();   // état vierge : aucun profil
  for (const id of ids) {
    const fiche = site.afficher("#formation-" + id);
    verifierPropre(`fiche ${id} sans profil`, fiche, "sans profil");
    assert.match(fiche, /Prérequis/, `fiche ${id} : bloc Prérequis absent`);
  }
});
