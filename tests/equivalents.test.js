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
 *     inconnue (« domicile » et « proche », comme la liste), sur un campus à l'étranger non voulu, privé aux frais inconnus
 *     avec un budget serré, ni dans une fourchette de frais qui dépasse le budget ;
 *   - diversité : la liste où l'équivalent prend la place du vœu respecte les règles de wishlist() (2 vœux au plus par
 *     établissement, plafond par voie, même filière et même catégorie, nombre de vœux d'une même filière) ;
 *   - ordre = règle de départage du moteur (departage), et aucun candidat admissible mieux placé n'est laissé de côté ;
 *   - la liste de 10 vœux n'est pas modifiée.
 * Plus des cas construits à la main et l'interface : remplacement d'un vœu par un équivalent, enregistré dans
 * localStorage, gardé après un rechargement, réversible ; choix obsolète ; vœu et équivalent tous deux retenus ; purge.
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
    const D = W.diversite, maxType = (voie) => (voie === D.principal ? D.plafonds[0] : D.plafonds[2]) + D.bonusType;
    W.liste.forEach((v, i) => {
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
        // même filière, même intitulé Parcoursup (codes à variantes), même type de formation, même catégorie
        assert.equal(E.nmcDe(x.f), E.nmcDe(v.f), `${c} : autre filière`);
        assert.equal(x.f.__variante || "", v.f.__variante || "", `${c} : autre intitulé Parcoursup du même code`);
        assert.equal(E.voie(x.f), E.voie(v.f), `${c} : autre type de formation`);
        assert.equal(E.formeDe(x.f), E.formeDe(v.f), `${c} : ${E.formeDe(v.f)} → ${E.formeDe(x.f)}`);
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
          assert.equal(x.horsTerritoire, false, `${c} : « sécurité » hors des territoires choisis`);
          assert.equal(E.raisonCampusNonVoulu(x.f, A.interets.prefs), null, `${c} : « sécurité » sur un campus à l'étranger non voulu`);
          assert.equal(x.repere.priveFraisInconnus, false, `${c} : « sécurité » privé aux frais inconnus avec un budget serré`);
          assert.equal(x.repere.fraisFourchette, false, `${c} : « sécurité » avec une fourchette de frais qui dépasse le budget`);
        }
      }
      // diversité : la liste où x prend la place du vœu respecte les règles de wishlist()
      for (const x of eqs) {
        const c = `${ctx} → ${x.f.id}`, autres = W.liste.filter((_, j) => j !== i);
        assert.ok(autres.filter((y) => y.f.etablissement === x.f.etablissement).length < 2, `${c} : 3e vœu dans ${x.f.etablissement}`);
        assert.ok(autres.filter((y) => E.intitule(y.f) === E.intitule(x.f)).length < D.maxFil, `${c} : trop de vœux de la même filière`);
        if (D.maxFil <= 2) assert.ok(!autres.some((y) => E.intitule(y.f) === E.intitule(x.f) && y.categorie === x.categorie), `${c} : même filière et même catégorie qu'un autre vœu`);
        // plafond par voie : au plus celui de la voie principale (le plafond exact dépend du « cœur de projet », vérifié par peutRemplacer)
        assert.ok(autres.filter((y) => E.voie(y.f) === E.voie(x.f)).length < maxType(E.voie(x.f)) || E.voie(x.f) !== D.principal, `${c} : plafond de la voie ${E.voie(x.f)}`);
        assert.ok(W.peutRemplacer(W.liste, i, x), `${c} : refusé par les règles de la liste`);
      }
      // ordre = départage
      for (let k = 1; k < eqs.length; k++) assert.ok(E.departage(eqs[k - 1], eqs[k]) < 0, `${ctx} : ordre ${eqs[k - 1].f.id} puis ${eqs[k].f.id}`);
    });
    // aucun candidat mieux placé (selon le départage) laissé de côté : les vœux sont servis dans l'ordre de la liste,
    // chacun prend les meilleurs candidats encore libres
    const pris = new Set(ids(W.liste));
    W.liste.forEach((v, i) => {
      const eqs = M.get(v.f.id);
      if (!E.nmcDe(v.f)) return;
      const libres = A.resultats.filter((x) => E.cleEquivalent(x.f) === E.cleEquivalent(v.f) && x.categorie === v.categorie && !pris.has(x.f.id)
        && !x.exclu && !x.bloque && E.voeuParcoursup(x.f) && !E.horsListe(x.f) && W.peutRemplacer(W.liste, i, x));
      if (eqs.length < 3) for (const x of libres) assert.ok(eqs.includes(x), `${p.id}, vœu ${v.f.id} : ${x.f.id} oublié`);
      else {
        const dernier = eqs[eqs.length - 1];
        for (const x of libres) if (!eqs.includes(x)) assert.ok(E.departage(dernier, x) < 0, `${p.id}, vœu ${v.f.id} : ${x.f.id} mieux placé que ${dernier.f.id}`);
      }
      eqs.forEach((x) => pris.add(x.f.id));
    });
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
  const prive = res(fiche("prive"), { categorie: "realiste", repere: { taux: 90, priveFraisInconnus: true, fraisFourchette: false } });
  const fourchette = res(fiche("fourchette"), { categorie: "realiste", repere: { taux: 90, priveFraisInconnus: false, fraisFourchette: true } });
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
  // pas de règle en plus de la liste : la catégorie d'evaluer() décide (une formation à distance inconnue laissée
  // « sécurité » par evaluer(), mobilité « partout », reste un équivalent « sécurité », placée après les distances connues)
  assert.deepEqual(ids(E.equivalents(tous, voeu, 10, [voeu])), ["egal", "proche", "loin", "inconnue", "hors-aca"]);
  // sans liste : refus (on ne renverrait pas forcément les équivalents de Ma liste)
  assert.throws(() => E.equivalents(tous, voeu, 3));
  // vœu absent de la liste : aucun équivalent
  assert.equal(E.equivalents(tous, loin, 3, [voeu]).length, 0);
  // un vœu de la liste n'est jamais un équivalent
  assert.ok(!ids(E.equivalents(tous, voeu, 3, [voeu, egal])).includes("egal"));
  // catégorie « réaliste » : privé aux frais inconnus et fourchette restent possibles (le message de frais s'affiche)
  const v2 = res(fiche("v2"), { categorie: "realiste" });
  assert.deepEqual(ids(E.equivalents([v2, prive, fourchette, autreCat], v2, 3, [v2])).sort(), ["autre-cat", "fourchette", "prive"]);
  // règles de diversité (liste = objet de wishlist() avec peutRemplacer) : un candidat refusé n'est jamais proposé
  const Wfaux = { liste: [voeu] };
  Object.defineProperty(Wfaux, "peutRemplacer", { value: (l, i, x) => x.f.id !== "egal", enumerable: false });
  assert.deepEqual(ids(E.equivalentsListe(tous, Wfaux).get("v")), ["proche", "loin", "inconnue"]);
  // choix de l'élève : gardé dans .choix s'il est valable, ignoré sinon ; toujours parmi les équivalents de son vœu
  const Mc = E.equivalentsListe(tous, [voeu], 2, { v: "hors-aca" });
  assert.equal(Mc.choix.get("v").f.id, "hors-aca");
  assert.deepEqual(ids(Mc.get("v")), ["egal", "hors-aca"]);
  assert.equal(E.equivalentsListe(tous, [voeu], 3, { v: "ancien-choix" }).choix.size, 0);
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
  // … et purgé de l'état enregistré
  assert.deepEqual(copie(s4.etatEnregistre().remplacements), {});
});

test("interface : choix obsolète, vœu et équivalent tous deux retenus", async () => {
  const p = PROFILS.find((x) => x.id === "ecg-expertes-faible");
  const { W } = analyser(p);
  const liste = ids(W.liste);
  assert.ok(liste.includes("psup-17165"), "vœu psup-17165 attendu dans la liste d'ecg-expertes-faible");
  // 1. 10 vœux retenus, un choix obsolète enregistré pour psup-17165 : « Choisir à la place » remplace bien le vœu
  const s = await chargerSite({}, { etat: etatDe(p, { retenus: liste.slice(), remplacements: { "psup-17165": "ancien-choix-obsolete" } }) });
  s.afficher("#liste");
  let html = s.cliquer({ action: "onglet-liste", o: "voeux" });
  assert.ok(html.includes('data-action="remplacer" data-voeu="psup-17165" data-id="psup-35609"'), "équivalent psup-35609 non proposé");
  html = s.cliquer({ action: "remplacer", voeu: "psup-17165", id: "psup-35609" });
  let e = s.etatEnregistre();
  assert.deepEqual(copie(e.remplacements), { "psup-17165": "psup-35609" });
  assert.ok(e.retenus.includes("psup-35609") && !e.retenus.includes("psup-17165"), "le vœu n'a pas été remplacé dans les vœux retenus");
  assert.equal(e.retenus.length, 10);
  assert.ok(html.includes('data-action="retablir" data-voeu="psup-17165"'), "« Revenir au vœu d'origine » absent");
  assert.ok(html.includes("Ton choix, à la place de"));
  // 2. passer d'un équivalent à un autre : l'ancien choix laisse sa place
  const autre = (html.match(/data-action="remplacer" data-voeu="psup-17165" data-id="([^"]+)"/) || [])[1];
  assert.ok(autre && autre !== "psup-35609");
  s.cliquer({ action: "remplacer", voeu: "psup-17165", id: autre });
  e = s.etatEnregistre();
  assert.ok(e.retenus.includes(autre) && !e.retenus.includes("psup-35609") && !e.retenus.includes("psup-17165"));
  assert.equal(e.retenus.length, 10);
  // 3. retour au vœu d'origine
  s.cliquer({ action: "retablir", voeu: "psup-17165" });
  e = s.etatEnregistre();
  assert.deepEqual(copie(e.retenus).sort(), liste.slice().sort());
  // 4. vœu d'origine et équivalent tous deux retenus : « Choisir à la place » retire le vœu d'origine
  const s2 = await chargerSite({}, { etat: etatDe(p, { retenus: liste.concat("psup-35609") }) });
  s2.afficher("#liste");
  s2.cliquer({ action: "onglet-liste", o: "voeux" });
  s2.cliquer({ action: "remplacer", voeu: "psup-17165", id: "psup-35609" });
  e = s2.etatEnregistre();
  assert.ok(!e.retenus.includes("psup-17165"), "le vœu d'origine est resté retenu");
  assert.equal(e.retenus.filter((id) => id === "psup-35609").length, 1);
  assert.equal(e.retenus.length, 10);
});

test("diversité : jamais un équivalent qui enfreindrait les règles de la liste (exemples)", () => {
  const { E } = site;
  // sante-svt : 2 vœux à l'Université Côte d'Azur ; aucun équivalent n'en ajoute un 3e (avant I2, l'exemple était sciences-ingenieur et Lyon 1 : plus de cas de ce genre dans sa liste)
  const p = PROFILS.find((x) => x.id === "sante-svt");
  const { A, W } = analyser(p);
  const M = E.equivalentsListe(A.resultats, W);
  const LYON1 = "Université Côte d'Azur";
  assert.equal(W.liste.filter((x) => x.f.etablissement === LYON1).length, 2);
  W.liste.forEach((v) => {
    if (v.f.etablissement === LYON1) return;
    for (const x of M.get(v.f.id)) assert.notEqual(x.f.etablissement, LYON1, `${v.f.id} → ${x.f.id} : 3e vœu Côte d'Azur`);
  });
  // sans les règles de diversité (tableau de vœux), ces candidats existent : le filtre a bien un effet
  const sans = E.equivalentsListe(A.resultats, W.liste, 1000);
  assert.ok(W.liste.some((v) => v.f.etablissement !== LYON1 && sans.get(v.f.id).some((x) => x.f.etablissement === LYON1)));
  // droit-sciencespo (élève décidé, voie principale « licence de droit ») : jamais plus de vœux de cette voie que son
  // plafond (CAPS.decide[0] = 5, celui de wishlist())
  const q = PROFILS.find((x) => x.id === "droit-sciencespo");
  const B = analyser(q), Mq = E.equivalentsListe(B.A.resultats, B.W);
  const D = B.W.diversite;
  assert.equal(D.principal, "lic-droit");
  B.W.liste.forEach((v, i) => {
    for (const x of Mq.get(v.f.id)) {
      const l = B.W.liste.slice(); l[i] = x;
      assert.ok(l.filter((y) => E.voie(y.f) === "lic-droit").length <= D.plafonds[0] + D.bonusType, `${v.f.id} → ${x.f.id} : plafond de la voie dépassé`);
    }
  });
});

test("même intitulé Parcoursup et même type de formation (décision du fondateur du 22/10/2026)", () => {
  const { E, DATA } = site;
  // profil vide : la licence Sciences sociales (code L1-SS, partagé avec « Sciences pour la santé ») n'a plus
  // d'équivalent « Sciences pour la santé »
  const { A, W } = analyser(PROFILS.find((x) => x.id === "vide"));
  const M = E.equivalentsListe(A.resultats, W);
  const v = W.liste.find((x) => /Sciences sociales - Parcours Sciences politiques et écologie humaine/.test(x.f.nom));
  assert.ok(v, "vœu « Sciences sociales – Sciences politiques et écologie humaine » attendu dans la liste du profil vide");
  assert.equal(E.nmcDe(v.f), "L1-SS");
  assert.ok(M.get(v.f.id).length > 0);
  for (const x of M.get(v.f.id)) assert.ok(!/Sciences pour la santé/i.test(x.f.nom), `${x.f.id} : ${x.f.nom}`);
  // sans le filtre, le même code regroupait bien les deux intitulés dans le catalogue
  assert.ok(DATA.formations.some((f) => E.nmcDe(f) === "L1-SS" && /Sciences pour la santé/i.test(f.nom)));
  // sur les 14 profils : une double licence n'a jamais pour équivalent une licence simple ou une LAS, et inversement
  let doubles = 0;
  for (const p of PROFILS) {
    const B = analyser(p), Mp = E.equivalentsListe(B.A.resultats, B.W);
    for (const w of B.W.liste) for (const x of Mp.get(w.f.id)) {
      if (E.formeDe(w.f) === "double") { doubles++; assert.equal(E.formeDe(x.f), "double", `${p.id} : ${w.f.nom} → ${x.f.nom}`); }
      if (E.formeDe(x.f) === "double") assert.equal(E.formeDe(w.f), "double", `${p.id} : ${w.f.nom} → ${x.f.nom}`);
      if (E.formeDe(w.f) !== E.formeDe(x.f)) assert.fail(`${p.id} : ${w.f.nom} → ${x.f.nom}`);
    }
  }
  assert.ok(doubles > 0, "aucune double licence avec équivalent : le test ne vérifie rien");
  // formes reconnues dans l'intitulé
  assert.equal(E.formeDe({ type: "licence", nom: "Double licence - Economie / Philosophie -" }), "double");
  assert.equal(E.formeDe({ type: "double_licence", nom: "Formation valant grade de licence" }), "double");
  assert.equal(E.formeDe({ type: "licence", nom: "Licence - Lettres -  Accès Santé (LAS)" }), "las");
  assert.equal(E.formeDe({ type: "licence", nom: "Licence - Economie" }), "simple");
});

test("texte d'aide des équivalents : académie et distance seulement si le lycée est connu", async () => {
  const avec = PROFILS.find((x) => x.id === "ecg-expertes-faible"), sans = PROFILS.find((x) => x.id === "vide");
  const page = async (p) => { const s = await chargerSite({}, { etat: etatDe(p) }); s.afficher("#liste"); return s.cliquer({ action: "onglet-liste", o: "voeux" }); };
  const h1 = await page(avec), h2 = await page(sans);
  assert.ok(h1.includes("Celles de ton académie et les plus proches de chez toi d'abord."));
  assert.ok(!h2.includes("Celles de ton académie et les plus proches de chez toi d'abord."));
  assert.ok(h2.includes("Indique ton lycée pour voir d'abord celles de ton académie"));
});
