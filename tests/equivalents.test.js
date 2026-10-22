/*
 * tests/equivalents.test.js : formations équivalentes sous chaque vœu de la liste de 10 (tâche 4,
 * docs/modele-chances.md, section 11).
 *
 * Vérifié sur les 14 profils types (tests/profils.js) :
 *   - au plus 3 équivalents par vœu ;
 *   - mêmes garde-fous que la liste : jamais exclu (budget, « domicile », étranger non voulu…), jamais de point
 *     bloquant, jamais hors Parcoursup, jamais écarté des listes (sans statistiques, bac pro, nouvelle 2026, à relire) ;
 *   - jamais un vœu de la liste, jamais deux fois la même formation ;
 *   - même code de filière (nmc) et même catégorie que le vœu ;
 *   - un équivalent « sécurité » n'est jamais au-delà de la distance acceptée, hors des territoires choisis, à distance
 *     inconnue, sur un campus à l'étranger non voulu, privé aux frais inconnus avec un budget serré, ni dans une fourchette
 *     de frais qui dépasse le budget ;
 *   - ordre = règle de départage du moteur (departage), et aucun candidat mieux placé n'est laissé de côté ;
 *   - la liste de 10 vœux n'est pas modifiée.
 * Plus des cas construits à la main (distance inconnue avec la mobilité « partout », frais) et l'interface :
 * remplacement d'un vœu par un équivalent, enregistré dans localStorage, gardé après un rechargement, réversible.
 *
 * Lancer : npm test
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { chargerSite } = require("./charger-site");
const PROFILS = require("./profils");

let site;
test.before(async () => { site = await chargerSite(); });

const analyser = (p) => {
  const { E, DATA, QUEST } = site;
  const A = E.recommander(DATA.formations, p.profil, QUEST, p.reponses);
  return { A, W: E.wishlist(A.resultats, 10, A.interets) };
};
// copies dans le contexte de Node : les tableaux du site (vm) ne passent pas deepStrictEqual
const ids = (l) => Array.from(l, (x) => x.f.id);
const copie = (x) => JSON.parse(JSON.stringify(x));
const etatDe = (p, extra = {}) => Object.assign({ profil: p.profil, reponses: p.reponses, retenus: [], profilTermine: true, qIndex: 999 }, extra);

for (const p of PROFILS) {
  test(`profil « ${p.id} » : équivalents (nombre, garde-fous, doublons, filière, catégorie, sécurité, ordre)`, () => {
    const { E } = site;
    const { A, W } = analyser(p);
    const avant = JSON.stringify(ids(W.liste).concat(W.liste.map((x) => x.categorie)));
    const M = E.equivalentsListe(A.resultats, W);
    assert.equal(JSON.stringify(ids(W.liste).concat(W.liste.map((x) => x.categorie))), avant, `${p.id} : la liste de 10 vœux a changé`);
    assert.equal(M.size, W.liste.length, `${p.id} : un vœu sans entrée`);
    const mob = A.interets.prefs.mobilite, budget = A.interets.prefs.budget_max, avecLycee = !!A.stats.geo;
    const vus = new Set(ids(W.liste));
    for (const v of W.liste) {
      const eqs = M.get(v.f.id);
      const ctx = `${p.id}, vœu ${v.f.id}`;
      assert.ok(eqs.length <= 3, `${ctx} : ${eqs.length} équivalents`);
      // l'API publique donne le même résultat (avec l'objet de recommander(), la liste est recalculée)
      assert.deepEqual(ids(E.equivalents(A, v)), ids(eqs), `${ctx} : CapEngine.equivalents(resultats, voeu)`);
      assert.deepEqual(ids(E.equivalents(A.resultats, v, 3, W)), ids(eqs), `${ctx} : CapEngine.equivalents avec la liste`);
      assert.ok(E.equivalents(A, v, 1).length <= 1, `${ctx} : n = 1`);
      if (!E.nmcDe(v.f)) assert.equal(eqs.length, 0, `${ctx} : vœu sans code nmc avec des équivalents`);
      for (const x of eqs) {
        const c = `${ctx} → ${x.f.id}`;
        // garde-fous de la liste
        assert.ok(!x.exclu, `${c} : exclu (${x.exclu})`);
        assert.ok(!x.bloque, `${c} : point bloquant`);
        assert.ok(E.voeuParcoursup(x.f), `${c} : hors Parcoursup`);
        assert.equal(E.reglesHorsListe(x.f).length, 0, `${c} : écarté des listes (${E.reglesHorsListe(x.f).join(", ")})`);
        assert.equal(typeof x.f.admission.taux, "number", `${c} : sans statistiques`);
        assert.ok(!(typeof x.f.__pctBG === "number" && x.f.__pctBG < E.SEUIL_BAC_GENERAL), `${c} : vise les bacs pro`);
        assert.notEqual(x.f.stats, "nouvelle_2026", `${c} : nouvelle formation 2026`);
        // budget serré : jamais de frais connus minimums au-dessus du budget (exclusion du 22/10/2026)
        if (budget !== undefined && budget <= E.BUDGET_SERRE_MAX) {
          const bornes = E.bornesFrais(x.f), apd = (x.f.cout || {}).a_partir_de;
          assert.ok(!bornes || bornes.min <= budget, `${c} : frais minimums ${bornes && bornes.min} € au-delà du budget ${budget} €`);
          assert.ok(bornes || typeof apd !== "number" || apd <= budget, `${c} : « à partir de ${apd} € » au-delà du budget`);
        }
        // « domicile » avec un lycée : jamais au-delà de 45 km
        if (mob === 0 && avecLycee && x.dist !== null) assert.ok(E.distanceEquivalente(x.dist, x.traversee) <= E.DISTANCE_ACCEPTEE_KM[0], `${c} : à ${Math.round(x.dist)} km pour « domicile »`);
        // même filière, même catégorie
        assert.equal(E.nmcDe(x.f), E.nmcDe(v.f), `${c} : autre filière`);
        assert.equal(x.categorie, v.categorie, `${c} : autre catégorie`);
        // jamais un doublon de la liste ni d'un autre équivalent
        assert.ok(!vus.has(x.f.id), `${c} : doublon`);
        vus.add(x.f.id);
        if (x.categorie === "securite") {
          assert.equal(x.horsDistance, false, `${c} : « sécurité » au-delà de la distance acceptée`);
          if (avecLycee && (mob === 0 || mob === 1)) {
            assert.ok(x.dist !== null, `${c} : « sécurité » à distance inconnue`);
            assert.ok(E.distanceEquivalente(x.dist, x.traversee) <= E.DISTANCE_ACCEPTEE_KM[mob], `${c} : « sécurité » à ${Math.round(x.dist)} km`);
          }
          if (avecLycee && x.f.pays === "France" && !E.situer(x.f).etranger) assert.ok(x.dist !== null, `${c} : « sécurité » à distance inconnue`);
          assert.equal(x.horsTerritoire, false, `${c} : « sécurité » hors des territoires choisis`);
          assert.equal(E.raisonCampusNonVoulu(x.f, A.interets.prefs), null, `${c} : « sécurité » sur un campus à l'étranger non voulu`);
          assert.equal(x.repere.priveFraisInconnus, false, `${c} : « sécurité » privé aux frais inconnus avec un budget serré`);
          assert.equal(x.repere.fraisFourchette, false, `${c} : « sécurité » avec une fourchette de frais qui dépasse le budget`);
        }
      }
      // ordre = départage
      for (let i = 1; i < eqs.length; i++) assert.ok(E.departage(eqs[i - 1], eqs[i]) < 0, `${ctx} : ordre ${eqs[i - 1].f.id} puis ${eqs[i].f.id}`);
    }
    // aucun candidat mieux placé (selon le départage) laissé de côté : les vœux sont servis dans l'ordre de la liste,
    // chacun prend les meilleurs candidats encore libres
    const pris = new Set(ids(W.liste));
    for (const v of W.liste) {
      const eqs = M.get(v.f.id);
      if (!E.nmcDe(v.f)) continue;
      const libres = A.resultats.filter((x) => E.nmcDe(x.f) === E.nmcDe(v.f) && x.categorie === v.categorie && !pris.has(x.f.id)
        && !x.exclu && !x.bloque && E.voeuParcoursup(x.f) && !E.horsListe(x.f));
      if (eqs.length < 3) {
        // moins de 3 : tous les libres de catégorie autre que « sécurité » ont été pris (« sécurité » : filtre en plus)
        for (const x of libres) if (x.categorie !== "securite") assert.ok(eqs.includes(x), `${p.id}, vœu ${v.f.id} : ${x.f.id} oublié`);
      } else {
        const dernier = eqs[eqs.length - 1];
        for (const x of libres) if (!eqs.includes(x) && x.categorie !== "securite") assert.ok(E.departage(dernier, x) < 0, `${p.id}, vœu ${v.f.id} : ${x.f.id} mieux placé que ${dernier.f.id}`);
      }
      eqs.forEach((x) => pris.add(x.f.id));
    }
  });
}

test("cas construits : distance inconnue, frais, ordre de départage, plafond de 3", () => {
  const { E } = site;
  // formation minimale qui passe le garde-fou des listes
  const fiche = (id, extra = {}) => Object.assign({ id, nom: "Licence - Economie", type: "licence", pays: "France", ville: "Nice", etablissement: "Université " + id,
    __nmc: "L1-Economie", __tf: ["Licence"], __pctBG: 80, __dep: "Alpes-Maritimes", __gps: { lat: 43.7, lon: 7.27 }, admission: { taux: 90 }, cout: {} }, extra);
  const res = (f, extra = {}) => Object.assign({ f, categorie: "securite", exclu: null, bloque: false, dist: 10, traversee: false, horsDistance: false, horsTerritoire: false,
    memeAcademie: true, distTri: 10, pertinence: 50, repere: { taux: f.admission.taux, priveFraisInconnus: false, fraisFourchette: false } }, extra);
  const voeu = res(fiche("v"));
  const proche = res(fiche("proche"), { dist: 5, distTri: 5 });
  const loin = res(fiche("loin"), { dist: 30, distTri: 30 });
  const horsAca = res(fiche("hors-aca"), { memeAcademie: false, dist: 2, distTri: 2 });
  const inconnue = res(fiche("inconnue", { __gps: null }), { dist: null, distTri: null });
  const prive = res(fiche("prive"), { repere: { taux: 90, priveFraisInconnus: true, fraisFourchette: false } });
  const fourchette = res(fiche("fourchette"), { repere: { taux: 90, priveFraisInconnus: false, fraisFourchette: true } });
  const exclu = res(fiche("exclu"), { exclu: "Frais (≈ 9 000 €/an) au-delà de ton budget." });
  const sansStats = res(fiche("sans-stats", { admission: {} }));
  const bacPro = res(fiche("bac-pro", { __pctBG: 5 }));
  const autreFil = res(fiche("autre-filiere", { __nmc: "L1-Droit" }));
  const autreCat = res(fiche("autre-cat"), { categorie: "realiste" });
  const egal = res(fiche("egal", { admission: { taux: 95 } }), { dist: 5, distTri: 5 });   // même distance que « proche », taux plus haut
  const tous = [voeu, loin, proche, horsAca, inconnue, prive, fourchette, exclu, sansStats, bacPro, autreFil, autreCat, egal];
  const eqs = E.equivalents(tous, voeu, 3, [voeu]);
  // académie d'abord, puis distance, puis taux d'accès ; jamais plus de 3
  assert.deepEqual(ids(eqs), ["egal", "proche", "loin"]);
  // la formation à distance inconnue n'est jamais un équivalent « sécurité » quand l'élève a indiqué son lycée,
  // même avec la mobilité « partout » (où evaluer() la laisse « sécurité »)
  assert.ok(!ids(E.equivalents(tous, voeu, 10, [voeu])).includes("inconnue"));
  assert.deepEqual(ids(E.equivalents(tous, voeu, 10, [voeu])), ["egal", "proche", "loin", "hors-aca"]);
  // sans lycée (aucune distance), la règle de distance ne s'applique pas
  const sansLycee = tous.map((x) => Object.assign({}, x, { dist: null, distTri: null }));
  assert.ok(ids(E.equivalents(sansLycee, sansLycee[0], 10, [sansLycee[0]])).includes("inconnue"));
  // un vœu de la liste n'est jamais un équivalent
  assert.ok(!ids(E.equivalents(tous, voeu, 3, [voeu, egal])).includes("egal"));
  // catégorie « réaliste » : privé aux frais inconnus et fourchette restent possibles (le message de frais s'affiche)
  const v2 = res(fiche("v2"), { categorie: "realiste" });
  const p2 = Object.assign({}, prive, { categorie: "realiste" }), f2 = Object.assign({}, fourchette, { categorie: "realiste" });
  assert.deepEqual(ids(E.equivalents([v2, p2, f2, autreCat], v2, 3, [v2])).sort(), ["autre-cat", "fourchette", "prive"]);
  // n = 0 : aucun équivalent
  assert.equal(E.equivalents(tous, voeu, 0, [voeu]).length, 0);
});

test("interface : remplacer un vœu par un équivalent, enregistré dans localStorage, gardé au rechargement, réversible", async () => {
  const p = PROFILS.find((x) => x.id === "ecg-expertes-faible");
  const { E } = site;
  const { A, W } = analyser(p);
  const M = E.equivalentsListe(A.resultats, W);
  const v = W.liste.find((x) => M.get(x.f.id).length >= 2), e = M.get(v.f.id)[1];
  // 1. proposition (aucun vœu retenu) : les équivalents sont affichés sous le vœu
  const s1 = await chargerSite({}, { etat: etatDe(p) });
  s1.afficher("#liste");
  let html = s1.cliquer({ action: "onglet-liste", o: "voeux" });
  assert.ok(html.includes(`data-action="remplacer" data-voeu="${v.f.id}" data-id="${e.f.id}"`), "bouton « Choisir à la place » absent");
  assert.match(html, /formations? équivalentes?/);
  // 2. remplacement : enregistré dans localStorage
  html = s1.cliquer({ action: "remplacer", voeu: v.f.id, id: e.f.id });
  assert.deepEqual(copie(s1.etatEnregistre().remplacements), { [v.f.id]: e.f.id });
  assert.ok(html.includes("Ton choix, à la place de"), "le remplacement n'est pas affiché");
  assert.ok(html.includes(`data-action="retablir" data-voeu="${v.f.id}"`), "pas de retour au vœu d'origine");
  // 3. rechargement : le choix est relu et affiché ; « Générer une liste » retient l'équivalent choisi
  const s2 = await chargerSite({}, { etat: s1.etatEnregistre() });
  s2.afficher("#liste");
  html = s2.cliquer({ action: "onglet-liste", o: "voeux" });
  assert.ok(html.includes("Ton choix, à la place de"), "choix perdu au rechargement");
  s2.cliquer({ action: "auto-retenir" });
  let retenus = s2.etatEnregistre().retenus;
  assert.ok(retenus.includes(e.f.id) && !retenus.includes(v.f.id), "la liste retenue ne contient pas l'équivalent choisi");
  assert.equal(retenus.length, 10);
  // 4. retour au vœu d'origine : le remplacement est effacé et le vœu retenu est échangé
  html = s2.cliquer({ action: "retablir", voeu: v.f.id });
  assert.deepEqual(copie(s2.etatEnregistre().remplacements), {});
  retenus = s2.etatEnregistre().retenus;
  assert.ok(retenus.includes(v.f.id) && !retenus.includes(e.f.id), "le vœu d'origine n'est pas revenu dans les vœux retenus");
  assert.deepEqual(retenus.slice().sort(), ids(W.liste).sort(), "après le retour, les vœux retenus sont la liste calculée");
  // 5. remplacement depuis la liste retenue : le vœu retenu est échangé, et le choix survit au rechargement
  s2.cliquer({ action: "remplacer", voeu: v.f.id, id: e.f.id });
  const s3 = await chargerSite({}, { etat: s2.etatEnregistre() });
  s3.afficher("#liste");
  html = s3.cliquer({ action: "onglet-liste", o: "voeux" });
  assert.ok(html.includes("Ton choix, à la place de"), "remplacement absent de la liste retenue après rechargement");
  assert.ok(html.includes(`href="#formation-${e.f.id}"`));
  // un remplacement qui n'est plus un équivalent (profil modifié) est ignoré à l'affichage
  const s4 = await chargerSite({}, { etat: etatDe(p, { remplacements: { [v.f.id]: "formation-inexistante" } }) });
  s4.afficher("#liste");
  html = s4.cliquer({ action: "onglet-liste", o: "voeux" });
  assert.ok(!html.includes("Ton choix, à la place de"));
});
