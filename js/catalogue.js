/*
 * js/catalogue.js : catalogue de formations (calcul seulement, aucun affichage).
 *
 * Rôle : décoder data/parcoursup.json, construire le catalogue (CAT, CATBY, PSBY, ALIAS, redirections des
 * anciens identifiants, périmètre BTS / BUT), les fiches Parcoursup (fichGeneree, fichDepuisModele), les
 * statistiques (statDe), les coordonnées (gpsDe, communeGps, chargerLieux), les frais relevés (coutReleve),
 * les campus à l'étranger (données) et la redirection des vœux enregistrés (redirigerVoeux, fonction pure).
 * Aucune chaîne HTML, aucun accès à la page : js/app.js n'y fait que des appels et dessine.
 *
 * Utilise : window.CapEngine. Publie : window.CapCatalogue (état lu par app.js via etat()), window.__CAT,
 * window.__decodePs.
 * Ordre de chargement : après js/moteur.js, avant js/app.js.
 */
(function () {
  "use strict";
  const E = window.CapEngine;
  // Base fusionnée : CAT = toutes les fiches affichées (ancienne base + Parcoursup), sans doublon certain
  let CAT = [], CATBY = {}, PSBY = {}, FU = null, ALIAS = {}, STATS = {}, STCOLS = [], STCONS = null, STATUTS_ST = {}, MANUELLES = {}, FIL = null, LIEUX = null, VILLES_GPS = {};

  const sansAccents = (x) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, " ");
  const etabCourt = (n) => String(n || "").replace(/\s*\([^()]*\)\s*$/, "").trim();
  // Apprentissage relevé sur la fiche Parcoursup (data/frais-prives.json) : texte relevé, tel quel, toujours précédé de
  // son contexte (un contrat avec un employeur), pour qu'un « gratuit » du relevé ne se lise jamais comme « la formation
  // est gratuite ». Il ne change jamais le montant affiché.
  const PREFIXE_APPRENTISSAGE = "En contrat d'apprentissage (avec un employeur) : ";
  const texteApprentissage = (t) => `${PREFIXE_APPRENTISSAGE}${t.replace(/\.$/, "")}.`;
  let REMPL = {};
  // Fiches maison françaises retirées (sans lien certain avec Parcoursup) dont aucune formation Parcoursup affichée ne prend la suite
  let RETIREES = new Set();
  const AVIS_RETRAIT = "Une formation de ta liste n'est plus proposée par Mon Plan Sup (fiche sans correspondance Parcoursup). Elle a été retirée de ta liste.";
  function chargerLieux(li) {
    if (!li) return;
    LIEUX = { lycees: li.lycees.map(([uai, nom, commune, dep, lat, lon]) => ({ uai, nom, commune, dep, lat, lon, cle: sansAccents(nom + " " + commune + " " + dep) })),
      communes: li.communes.map(([commune, dep, lat, lon]) => ({ commune, dep, lat, lon, cle: sansAccents(commune + " " + dep) })) };
    // VILLES_GPS : nom de commune → toutes les communes de ce nom (homonymes : Saint-Denis 93 et La Réunion, Valence…)
    VILLES_GPS = {};
    for (const c of LIEUX.communes) (VILLES_GPS[sansAccents(c.commune)] = VILLES_GPS[sansAccents(c.commune)] || []).push(c);
    E.definirLieux(li);   // département d'un lycée ou d'un campus d'après ses coordonnées (académie, zone, campus à l'étranger)
  }
  // Champs Parcoursup lus par le moteur : département (académie), code gta et places (départage), sélectivité (secteur des
  // licences), statut de l'établissement (champ tc : « Publics », « Privés en contrat avec l'Etat / EESC », « Privés » ;
  // règle « prive_frais_inconnus »). Fiche non liée à Parcoursup : __tc absent, statut inconnu.
  // statut_etab (« public », « prive_sous_contrat », « prive ») vient lui aussi du seul champ tc : null s'il est absent
  // ou inconnu, jamais « public » par défaut (décision du fondateur : statut inconnu, la règle ne s'applique pas).
  function lierParcoursup(f, r) {
    f.__gta = r.gta; f.__dep = r.departement || null; f.__capa = statDe(r.gta, "capa_fin"); f.__selectForm = statDe(r.gta, "select_form");
    f.__tc = r.tc || null;
    f.statut_etab = TC_ETAB[r.tc] || null;
    // code nmc partagé par plusieurs intitulés officiels (data/filieres.json, « variantes » : L1-SS, L1-AP, FP-CC-App…) :
    // intitulé Parcoursup de la formation (champ fl), ou "" pour l'intitulé de base du code. Formations équivalentes
    // (moteur, décision du fondateur du 22/10/2026) : même code nmc ET même intitulé.
    const fam = FIL && FIL.filieres && r.nmc ? FIL.filieres[r.nmc] : null;
    if (fam && fam.variantes) f.__variante = (r.fl || []).find((x) => fam.variantes[x]) || "";
    // frais relevés sur la fiche Parcoursup (établissement privé) : ils priment sur le coût d'une fiche maison
    const c = r.tc && r.tc !== "Publics" ? coutReleve(r.gta) : null;
    if (c) {
      f.__coutMaison = f.cout || null;   // gardé pour comparaison (contrôle du relevé), jamais affiché
      f.cout = c;
      if (Array.isArray(f.incertitudes)) f.incertitudes = f.incertitudes.filter((t) => t !== "Frais non relevés.");
    }
    // « à partir de X € » (maximum non indiqué sur la fiche) : montant toujours inconnu, minimum gardé pour la règle
    // d'exclusion du budget serré (moteur, décision du fondateur du 22/10/2026) et affiché dans le texte des frais
    const prive = r.tc && r.tc !== "Publics" && !c;
    const ap = prive ? FRAIS_A_PARTIR_DE[r.gta] : null;
    if (ap && typeof ap.min === "number") {
      f.cout = Object.assign({}, f.cout || {}, { valeur_annuelle_eur: null, a_partir_de: ap.min, statut: "releve_parcoursup", source: ap.source, consulte_le: ap.consulte_le,
        annee_tarifs: ap.annee_tarifs || null, texte: `À partir de ${E.fmtEur(ap.min)} par an (la fiche Parcoursup n'indique pas de maximum).` });
    }
    // montant par mois avec son nombre de mois (issue #49, décision du fondateur du 22/10/2026) : affiché tel quel, jamais
    // multiplié ; pour le budget (annuel), le montant annuel reste inconnu (règle « frais inconnus »), jamais d'exclusion
    const pm = prive && !ap ? FRAIS_PAR_MOIS[r.gta] : null;
    if (pm && typeof pm.montant === "number") {
      f.cout = Object.assign({}, f.cout || {}, { valeur_annuelle_eur: null, statut: "releve_parcoursup", source: pm.source, consulte_le: pm.consulte_le,
        annee_tarifs: pm.annee_tarifs || null, texte: `${E.fmtEur(pm.montant)} par mois (sur ${pm.mois} mois).` });
    }
    // montant de la 1re année seule, années suivantes gratuites en apprentissage (GOBELINS 37012) : sert de minimum
    // d'exclusion du budget serré (le moteur le lit dans a_partir_de), sans prétendre être le coût de tout le cursus
    const pa = prive && !ap && !pm ? FRAIS_PREMIERE_ANNEE[r.gta] : null;
    if (pa && typeof pa.montant === "number") {
      f.cout = Object.assign({}, f.cout || {}, { valeur_annuelle_eur: null, a_partir_de: pa.montant, statut: "releve_parcoursup", source: pa.source, consulte_le: pa.consulte_le,
        annee_tarifs: pa.annee_tarifs || null, texte: `${E.fmtEur(pa.montant)} la 1re année.${pa.apprentissage ? " " + texteApprentissage(pa.apprentissage) : ""}` });
    }
  }
  // Frais des formations privées relevés sur leur fiche Parcoursup (data/frais-prives.json, construit par
  // scripts/construire-frais-prives.py). Seules les formations au montant annuel en euros sont dans le fichier : les
  // autres gardent des frais inconnus (règle « prive_frais_inconnus » du moteur). Une fourchette (min < max) est
  // affichée en entier ; valeur_annuelle_eur, le seul nombre lu par le moteur et les cartes, vaut le max.
  let FRAIS_PRIVES = {}, FRAIS_PRIVES_META = null, FRAIS_A_PARTIR_DE = {}, FRAIS_PAR_MOIS = {}, FRAIS_PREMIERE_ANNEE = {};
  const SELON_FOURCHETTE = { revenus: " selon les revenus de ta famille", annee: " selon l'année d'études" };
  // Montant unique qui dépend des revenus (c.selon_revenus, décision du fondateur du 22/10/2026, issue #49) : « jusqu'à X € »,
  // jamais un minimum d'exclusion : NON GARANTI ici, le moteur lit encore c.min = X (voir la PR, hors périmètre).
  const SUFFIXE_REVENUS = " (selon les revenus)";
  const suffixeRevenus = (c) => (c.selon_revenus ? SUFFIXE_REVENUS : "");
  const montantFrais = (c) => (c.selon_revenus ? `jusqu'à ${E.fmtEur(c.valeur_annuelle_eur)}` : typeof c.min === "number" && c.min < c.valeur_annuelle_eur ? `${E.fmtEur(c.min)} à ${E.fmtEur(c.valeur_annuelle_eur)}` : E.fmtEur(c.valeur_annuelle_eur));
  function coutReleve(g) {
    const x = FRAIS_PRIVES[g];
    if (!x || typeof x.min !== "number" || typeof x.max !== "number" || x.min > x.max) return null;
    const revenus = x.selon_revenus === true;   // min = max dans le fichier : affiché « jusqu'à X € »
    const c = { valeur_annuelle_eur: x.max, min: x.min, max: x.max, nature_fourchette: x.nature_fourchette || null, par: x.par || "par an",
      selon_revenus: revenus, annee_tarifs: x.annee_tarifs || null,
      libelle: x.libelle === "droits_inscription" ? "droits_inscription" : "cout", apprentissage: x.apprentissage || null,
      boursiers_eur: x.boursiers_eur || null, statut: "releve_parcoursup", source: x.source, consulte_le: x.consulte_le };
    const m = montantFrais(c), detail = (c.par.match(/\((.*)\)\s*$/) || [])[1];
    c.texte = c.libelle === "droits_inscription"
      ? `Droits d'inscription et participation annuelle : ${m}${detail ? ` (${detail})` : ""}.`
      : `${c.selon_revenus ? "Jusqu'à " + E.fmtEur(c.max) : (c.min < c.max ? "De " : "") + m} par an${c.selon_revenus ? SUFFIXE_REVENUS : c.min < c.max ? SELON_FOURCHETTE[c.nature_fourchette] || "" : ""}${detail ? ` (${detail})` : ""}.`;
    return c;
  }
  // Coordonnées d'une fiche. Fiche liée à Parcoursup : coordonnées officielles de l'établissement (etab_gps), sinon
  // la commune Parcoursup dans le département Parcoursup. Sinon, la ville de la fiche (data/lieux.json) ; si plusieurs
  // communes de ce nom sont éloignées (homonymes), le département départage : département Parcoursup de la fiche,
  // département écrit dans la ville (« Saint-Pierre (Martinique) »), ou département commun aux formations Parcoursup
  // probables de cette ville (data/anciennes-fiches.json). Sans département pour trancher : null (distance inconnue), jamais un
  // homonyme pris au hasard.
  const SEUIL_KM_HOMONYMES = 20;   // deux communes de même nom à moins de 20 km : le même lieu (Papeete, Borgo)
  function communeGps(ville, deps) {
    const toutes = VILLES_GPS[sansAccents(String(ville || "").split(/\s*[/(]/)[0].trim())] || [];
    if (!toutes.length) return null;
    const homonymes = toutes.some((c) => E.km(c, toutes[0]) > SEUIL_KM_HOMONYMES);
    if (!homonymes) return { lat: toutes[0].lat, lon: toutes[0].lon };
    for (const d of deps) {
      const c = d && toutes.find((x) => sansAccents(x.dep) === sansAccents(d));
      if (c) return { lat: c.lat, lon: c.lon };
    }
    return null;
  }
  function gpsDe(f, ps) {
    if (ps && ps.etab_gps && ps.etab_gps.lat != null) return { lat: ps.etab_gps.lat, lon: ps.etab_gps.lon };
    if (ps && ps.commune && ps.departement) { const c = communeGps(ps.commune, [ps.departement]); if (c) return c; }
    if (f.pays !== "France") return null;
    const ville = String(f.ville || "");
    const entreParentheses = (ville.match(/\(([^)]+)\)/) || [])[1];
    const x = FU && FU.anciennes[f.id];
    const nomVille = sansAccents(ville.split(/\s*[/(]/)[0].trim());
    const depsProbables = [...new Set(((x && x.c) || []).map((g) => PSBY[g]).filter((r) => r && r.departement && sansAccents(r.commune) === nomVille).map((r) => r.departement))];
    return communeGps(ville, [f.__dep, entreParentheses, depsProbables.length === 1 ? depsProbables[0] : null]);
  }
  function construireCatalogue(d, psc, fu, st, fil, aj, sts, man, fp) {
    FU = fu; CAT = []; CATBY = {}; PSBY = {}; ALIAS = {}; FIL = fil; REMPL = {}; RETIREES = new Set();
    FRAIS_PRIVES = (fp && fp.formations) || {}; FRAIS_PRIVES_META = (fp && fp.meta) || null; FRAIS_A_PARTIR_DE = (fp && fp.a_partir_de) || {};
    FRAIS_PAR_MOIS = (fp && fp.par_mois) || {}; FRAIS_PREMIERE_ANNEE = (fp && fp.premiere_annee) || {};
    const lignesPs = psc ? decodePs(psc) : [];   // ordre du fichier (PSBY, aux clés numériques, serait trié par code)
    for (const r of lignesPs) PSBY[r.gta] = r;
    // Périmètre (anciennes-fiches.json, perimetre.categories_masquees) appliqué aussi aux fiches de data/formations.json :
    // une fiche de type BUT ou BTS, ou fusionnée avec une formation Parcoursup BUT ou BTS, n'est ni affichée ni
    // recommandée (données gardées dans le fichier). Sans cela, ces fiches entraient dans les listes de vœux.
    // Règle 2 : les fiches maison françaises sans lien certain avec Parcoursup (anciennes-fiches.json, m = "P" ou "N") ont été retirées de
    // data/formations.json, sauf les fiches « modèles » d'ajustements.json (remplacements), traitées plus bas. Leur identifiant
    // reste valide pour les vœux enregistrés et les liens (voir ALIAS / RETIREES en fin de fonction).
    const modelesRempl = new Set(Object.keys((aj && aj.remplacements) || {}));
    const presentes = new Set(d.formations.map((f) => f.id));
    const sansLien = fu ? Object.entries(fu.anciennes).filter(([id, x]) => (x.m === "P" || x.m === "N") && !presentes.has(id) && !modelesRempl.has(id)) : [];
    d.formations = d.formations.filter((f) => !ficheHorsPerimetre(f));
    if (st) { STATS = st.rows; STCOLS = st.meta.cols; STCONS = st.meta.consulte_le; }
    STATUTS_ST = (sts && sts.formations) || {};
    // relevés manuels : retenus seulement s'ils citent leur source et leur date (vérifiés par scripts/construire-statuts-stats.py)
    MANUELLES = {};
    for (const [g, e] of Object.entries((man && man.formations) || {}))
      if (e && typeof e.taux === "number" && /^https?:\/\//.test(e.source || "") && /^\d{4}-\d{2}-\d{2}$/.test(e.consulte_le || "") && e.session && e.statut === "releve_manuel" && !STATS[g]) MANUELLES[g] = e;
    // Taux d'accès moyen 2025 de chaque filière (code nmc) : moyenne de taux_acces_ens sur les formations de la
    // cartographie 2026 présentes dans stats.json (avertissement de la section « Nouvelles », E.alerteFiliereSelective)
    const parNmc = {};
    for (const r of lignesPs) {
      const t = r.nmc && STATS[r.gta] ? statDe(r.gta, "taux_acces_ens") : null;
      if (typeof t === "number") (parNmc[r.nmc] = parNmc[r.nmc] || []).push(t);
    }
    E.definirTauxFilieres(Object.fromEntries(Object.entries(parNmc).map(([n, v]) => [n, { moyenne: v.reduce((a, x) => a + x, 0) / v.length, nb: v.length }])));
    if (fil) for (const [k, l] of Object.entries(fil.meta.types_label)) if (!d.meta.types[k]) d.meta.types[k] = l;   // types ajoutés par la table des filières
    // compléments officiels (champs vides de l'ancienne base) : on ne remplace jamais une valeur existante
    if (fu) for (const f of d.formations) {
      const k = fu.anciennes[f.id] && fu.anciennes[f.id].k;
      if (!k) continue;
      f.__compl = k;
      if (k.admission) { f.admission = Object.assign({}, f.admission); for (const [c, v] of Object.entries(k.admission)) if (!c.startsWith("_") && f.admission[c] == null) f.admission[c] = v; }
      if (k.mentions_admis && !f.mentions_admis) f.mentions_admis = k.mentions_admis;
      if (k.notes && f.notes && f.notes.moyenne_cible == null) f.notes = Object.assign({}, f.notes, { moyenne_cible: k.notes.moyenne_cible });
    }
    if (aj) for (const [oid, v] of Object.entries(aj.taux_officiel || {})) {
      const f = d.formations.find((x) => x.id === oid);
      if (f) { f.__tauxAncien = f.admission.taux; f.admission = Object.assign({}, f.admission, { taux: v }); }
    }
    const modeles = {};
    if (aj) for (const [oid, gtas] of Object.entries(aj.remplacements || {})) {
      const o = d.formations.find((x) => x.id === oid);
      if (!o) continue;
      REMPL[oid] = gtas.map((g) => "psup-" + g);
      for (const g of gtas) modeles[g] = o;
    }
    if (Object.keys(REMPL).length) d.formations = d.formations.filter((f) => !REMPL[f.id]);
    const genIds = new Map();
    for (const [g, o] of Object.entries(modeles)) { const f = fichDepuisModele(o, g); if (f) { d.formations.push(f); genIds.set(g, f); } }
    // Toute formation Parcoursup du périmètre reçoit une fiche notable par le moteur, à partir de la table des filières,
    // sauf si elle a déjà une fiche : fusion certaine avec data/formations.json ou fiche remplacée (ajustements.json).
    const fusionnees = new Set(fu ? Object.values(fu.anciennes).filter((x) => x.m === "C").map((x) => x.g) : []);
    if (fil) for (const r of lignesPs) {
      if (modeles[r.gta] || fusionnees.has(r.gta) || horsPerimetre(r)) continue;
      const g = fichGeneree(r, fil); if (g) { d.formations.push(g); genIds.set(g.__gen.gta, g); }
    }
    for (const [oid, ids] of Object.entries(REMPL)) ALIAS[oid] = ids[0];
    const merged = new Set();
    for (const f of d.formations) {
      if (f.__gen) continue;
      const x = fu && fu.anciennes[f.id];
      const ps = x && x.m === "C" ? PSBY[x.g] : null;
      if (ps) { merged.add(ps.gta); ALIAS["psup-" + ps.gta] = f.id; if (ps.nmc) f.__nmc = ps.nmc; f.__tf = ps.tf; f.__pctBG = statDe(ps.gta, "pct_bg"); lierParcoursup(f, ps); }   // __tf, __pctBG : garde-fou des listes (moteur)
      else f.statut_etab = null;   // fiche non liée à Parcoursup : le statut de data/formations.json n'est pas sourcé, il est inconnu
      const avTxt = [];
      if (x && x.m === "P") avTxt.push("Correspondance Parcoursup probable mais non confirmée.");
      if (x && x.x && x.x.length) avTxt.push(`${x.x.length} information(s) divergente(s) entre Mon Plan Sup et Parcoursup.`);
      if (ps && fu.ps_doublons[ps.gta]) avTxt.push("Doublon Parcoursup possible.");
      CAT.push({ id: f.id, nom: f.nom, etablissement: f.etablissement, ville: f.ville, pays: f.pays, type: f.type, type_label: f.type_label,
        places: (f.admission && f.admission.places) || (ps && statDe(ps.gta, "capa_fin")), cout: f.cout ? f.cout.valeur_annuelle_eur : null, coutMin: f.cout ? f.cout.min : null, src: ps ? "fusion" : "ancienne", ps, f,
        region: ps ? ps.region : null, app: ps ? !!(ps.app && ps.app.length) : /apprentissage/i.test(f.nom), av: avTxt.length > 0, avTxt,
        cle: sansAccents([f.nom, f.etablissement, f.ville, f.pays, f.type_label, ps ? [ps.nm.join(" "), ps.fl.join(" "), ps.etab_nom, ps.departement, ps.region].join(" ") : ""].join(" ")) });
    }
    for (const r of Object.values(PSBY)) {
      if (merged.has(r.gta)) continue;
      if (horsPerimetre(r)) continue;   // BTS, BUT : formations non proposées par Mon Plan Sup (données conservées)
      const gf = genIds.get(r.gta) || null;
      if (gf && r.nmc) gf.__nmc = r.nmc;
      if (gf) { gf.__tf = r.tf; gf.__pctBG = statDe(r.gta, "pct_bg"); lierParcoursup(gf, r); }
      const prob = (fu && fu.ps_probables[r.gta]) || [], dup = (fu && fu.ps_doublons[r.gta]) || [];
      CAT.push({ id: "psup-" + r.gta, nom: r.nm[0], etablissement: etabCourt(r.etab_nom), ville: r.commune || r.departement || "Non renseigné", pays: "France",
        type: gf ? gf.type : "psup:" + r.tf[0], type_label: gf ? gf.type_label : r.tf.join(" · "), places: statDe(r.gta, "capa_fin") || (gf && gf.admission.places), cout: gf ? gf.cout.valeur_annuelle_eur : null, coutMin: gf ? gf.cout.min : null, src: "parcoursup", ps: r, region: r.region, f: gf, stats: gf ? gf.stats : null,
        app: !!(r.app && r.app.length), av: prob.length + dup.length > 0, avTxt: [],
        cle: sansAccents([r.nm.join(" "), r.fl.join(" "), r.etab_nom, r.commune, r.departement, r.region, r.tf.join(" ")].join(" ")) });
    }
    for (const e of CAT) if (e.f && !e.f.__gps) e.f.__gps = gpsDe(e.f, e.ps);
    for (const f of d.formations) if (!f.__gps) f.__gps = gpsDe(f, null);
    corrigerCampusEtranger(aj);
    E.lierFilieres(d.formations);
    CAT.sort((a, b) => a.nom.localeCompare(b.nom, "fr") || a.ville.localeCompare(b.ville, "fr"));
    for (const e of CAT) CATBY[e.id] = e;
    // Fiches retirées : m = "P" → première candidate Parcoursup affichée (jamais un BTS ou un BUT masqué), sinon le vœu disparaît
    for (const [id, x] of sansLien) {
      const cible = x.m === "P" ? (x.c || []).map((g) => "psup-" + g).find((id) => CATBY[id] || (ALIAS[id] && CATBY[ALIAS[id]])) : null;
      if (cible) ALIAS[id] = CATBY[cible] ? cible : ALIAS[cible]; else RETIREES.add(id);
    }
    window.__CAT = CAT;
  }
  // Campus à l'étranger enregistrés « France » (Dauphine Londres, ESSEC Singapour…), décision du fondateur du 19/10/2026 :
  // pays et ville réels lus dans l'intitulé officiel Parcoursup (data/ajustements.json, campus_etranger, avec sa source).
  // La fiche garde son lien Parcoursup (__campusEtranger : le moteur la laisse dans les listes de vœux) mais suit les
  // règles « étranger ». Appelé après le calcul des coordonnées (gpsDe ne cherche pas de commune française hors de France).
  let CAMPUS = {};
  function corrigerCampusEtranger(aj) {
    CAMPUS = {};
    for (const [id, c] of Object.entries((aj && aj.campus_etranger) || {})) if (!id.startsWith("_") && c && c.pays && c.ville) CAMPUS[id] = c;
    for (const e of CAT) {
      const c = CAMPUS[e.id]; if (!c) continue;
      e.pays = c.pays; e.ville = c.ville; e.cle += " " + sansAccents(c.ville + " " + c.pays);
      if (e.f) Object.assign(e.f, { pays: c.pays, ville: c.ville, __campusEtranger: true });
    }
  }
  const statDe = (g, col) => { const L = STATS[g]; const i = STCOLS.indexOf(col); return L && i >= 0 ? L[i] : null; };
  function horsPerimetre(r) { const cats = (FU && FU.meta.perimetre && FU.meta.perimetre.categories_masquees) || []; return r.tf.some((t) => cats.includes(t)); }
  // Catégorie Parcoursup correspondant à un type de fiche de data/formations.json
  const CATEGORIE_DU_TYPE = { but: "BUT", bts: "BTS - BTSA - BTSM" };
  function ficheHorsPerimetre(f) {
    const cats = (FU && FU.meta.perimetre && FU.meta.perimetre.categories_masquees) || [];
    if (cats.includes(CATEGORIE_DU_TYPE[f.type])) return true;
    const x = FU && FU.anciennes[f.id];
    const ps = x && x.m === "C" ? PSBY[x.g] : null;   // fusion certaine avec Parcoursup
    return !!(ps && horsPerimetre(ps));
  }
  const NIV_TAUX = (t) => (t == null ? null : t < 10 ? "tres_haute" : t < 25 ? "haute" : t < 50 ? "moyenne" : "ouverte");
  const TC_ETAB = { "Publics": "public", "Privés en contrat avec l’Etat / EESC": "prive_sous_contrat", "Privés": "prive" };
  // Mentions affichées pour les formations sans statistiques d'admission (statut « stats » de la fiche)
  const MENTION_STATS = {
    nouvelle_2026: "Nouvelle formation à la rentrée 2026 : pas encore de statistiques d'admission.",
    sans_stats: "Statistiques d'admission non publiées.",
  };
  // Type du site (clés de d.meta.types) d'une formation Parcoursup, lu dans la cartographie Parcoursup 2026 :
  // r.tf = catégorie(s) de formation, r.fl = filière détaillée, r.nm = intitulé de la formation. Aucune fiche maison
  // n'intervient (règle 2). Les règles sont essayées dans l'ordre, la première qui s'applique l'emporte : l'ordre
  // compte quand une formation a plusieurs catégories (exemple : « Etudes de santé » + « Licence » est une licence).
  // Sans règle : null, et fichGeneree garde le type de la filière (data/filieres.json) en le notant (__gen.typeSansRegle).
  const TYPES_PS = [
    // CPGE : le type se lit dans l'intitulé (ECG et ECT : prepa_ecg ; ENS D1 et D2 : pas de règle)
    ["CPGE", /\bEC[GT]\b/, "prepa_ecg"],
    ["CPGE", /\b(MPSI|PCSI|PTSI|MP2I|BCPST|TSI|TB|TPC|ATS)\b/, "prepa_scientifique"],
    ["CPGE", /B\/L/, "prepa_bl"],
    ["CPGE", /Lettres|Chartes|St Cyr|Saint-Cyr|arts et design/, "prepa_litteraire"],
    ["CPGE", /./, null],
    ["Formations des écoles d'ingénieurs", /./, "ecole_ingenieur"],
    ["Formations des écoles de commerce et de management", /Bac ?\+ ?3\b/, "bachelor_france"],
    ["Formations des écoles de commerce et de management", /./, "ecole_commerce"],
    ["Diplômes d'université ou d'établissement", /./, "diplome_etablissement"],
    ["DEUST", /./, "deust"],
    ["DCG", /./, "dcg"],
    ["Sciences Po - Instituts d'études politiques", /Grade Licence/, "college_universitaire"],
    ["Sciences Po - Instituts d'études politiques", /./, "iep"],
    ["Licence", /^Double licence/i, "double_licence"],
    ["Licence sélective", /^Double licence/i, "double_licence"],
    ["Licence", /./, "licence"],
    ["Licence sélective", /Formation valant grade de licence/, null],
    ["Licence sélective", /./, "licence"],
    ["Licence professionnelle", /./, "licence"],
    ["C.M.I - Cursus Master en Ingénierie", /./, "licence"],
    ["Formations aux métiers du sport", /./, "jeunesse_sport"],
    ["Formations d'architecture, du paysage et du patrimoine", /./, "architecture"],
    ["Formations d'art, de design et du spectacle vivant", /DN MADE/, "dn_made"],
    ["Formations d'art, de design et du spectacle vivant", /./, "ecole_art"],
    ["Etudes de santé", /./, "sante_social"],
    ["Formations diplômantes du travail social", /./, "sante_social"],
    ["Formations des écoles vétérinaires", /./, "ecole_veterinaire"],
    ["Formations préparatoires à l'enseignement supérieur", /./, "annee_preparatoire"],
    ["Formations aux métiers de l'hôtellerie restauration", /./, "ecole_specialisee"],
    ["Certificats de spécialisation et FCIL", /./, "certificat_specialisation"],
    ["Formations professionnelles", /./, "formation_pro"],
  ];
  function typeParcoursup(r) {
    const texte = (r.nm || []).concat(r.fl || []).join(" ");
    for (const [cat, motif, type] of TYPES_PS) if ((r.tf || []).includes(cat) && motif.test(texte)) return type;
    return null;
  }
  // Option d'une prépa ECG, lue dans l'intitulé Parcoursup (« Mathématiques approfondies » ou « appliquées »)
  function optionEcg(r) {
    const t = (r.nm || []).join(" ");
    return /approfondies/i.test(t) ? "appro" : /appliqu/i.test(t) ? "appli" : null;
  }
  // Fiche d'une formation Parcoursup : attributs éditoriaux de sa filière (data/filieres.json, code nmc),
  // chiffres officiels de la formation (stats.json, session 2025) ou, à défaut, relevé manuel sourcé
  // (stats-manuelles.json). Sans chiffres, la fiche est quand même créée (taux et mentions à null), avec le statut
  // de data/statuts-stats.json : « nouvelle_2026 » (pas de repère d'admission, vœu ambitieux ou découverte
  // seulement) ou « sans_stats » (hors des listes de vœux).
  function fichGeneree(r, fil) {
    const g = r.gta;
    let fam = fil.filieres[r.nmc];
    if (!fam) return null;
    const va = fam.variantes && (r.fl || []).find((x) => fam.variantes[x]);   // code nmc partagé : intitulé de la formation
    if (va) fam = fam.variantes[va];
    const typePs = typeParcoursup(r), type = typePs || fam.type;   // type lu dans Parcoursup ; sinon celui de la filière
    const opt = type === "prepa_ecg" ? optionEcg(r) : null;
    const st = STATUTS_ST[g] || null;
    // statistiques d'une session antérieure : seules celles de 2024 (statut « avec_stats » du script) comptent
    const anc = !STATS[g] && !MANUELLES[g] && st && st.stats === "avec_stats" && st.anciennes && typeof st.anciennes.taux === "number" ? st.anciennes : null;
    const v = (c) => statDe(g, c), aStats = !!STATS[g], man = !aStats ? MANUELLES[g] || anc : null;
    const stats = aStats || man ? "avec_stats" : (st && st.stats !== "avec_stats" && st.stats) || "sans_stats";
    const places = man ? man.places : v("capa_fin"), voeux = man ? man.voeux : v("voe_tot"), admis = man ? man.admis : v("acc_tot"), taux = man ? man.taux : v("taux_acces_ens");
    const pm = ["pct_tbf", "pct_tb", "pct_b", "pct_ab", "pct_sansmention"].map(v);
    const men = admis && pm.every((x) => x != null) && pm.some((x) => x > 0) ? pm : null;   // répartition vide = non publiée
    const deduite = fam.origine === "deduit_intitule";
    const src = r.dataviz || r.fiche, cons = STCONS || fil.meta.consulte_le;
    const m = men ? { TBF: men[0], TB: men[1], B: men[2], AB: men[3], sans: men[4], source: src, consulte_le: cons, statut: "officiel" } : null;
    const MID = { TBF: 18.6, TB: 16.9, B: 14.9, AB: 12.9, sans: 11.2 };
    const moy = m ? Math.round((["TBF", "TB", "B", "AB", "sans"].reduce((a, k) => a + MID[k] * m[k], 0) / ["TBF", "TB", "B", "AB", "sans"].reduce((a, k) => a + m[k], 0)) * 10) / 10 : null;
    const spLib = (l) => l.map((x) => E.SPEC_COURT[x] || x).join(", ");
    const sp = fam.specialites;
    const hors = (r.aut || []).some((a) => /hors Parcoursup/.test(a));
    const epreuves = (r.aut || []).some((a) => /épreuves de sélection/.test(a));
    const pub = r.tc === "Publics" && fam.cout_public;
    const chiffres = [places != null ? `${places} places` : null, voeux != null ? `${voeux} vœux reçus` : null, admis != null ? `${admis} admis` : null].filter(Boolean).join(" · ");
    return {
      id: "psup-" + g, type, type_label: (type === fam.type && fam.type_label) || fil.meta.types_label[type] || type, ...(opt ? { option: opt } : {}), nom: r.nm[0], etablissement: etabCourt(r.etab_nom),
      ville: r.commune || r.departement || "Non renseigné", pays: "France", duree_ans: fam.duree_ans, langue: fam.langue, charge: fam.charge,
      dossier_poids: fam.dossier_poids, profil: fam.profil, plateforme: hors ? "propre" : "parcoursup",
      tests: epreuves ? [{ nom: "Épreuves de sélection", obligatoire: true, texte: "Des épreuves de sélection sont mises en place pour candidater (fiche Parcoursup).", source: r.fiche, consulte_le: cons, statut: "officiel" }] : [],
      pieces: ["dossier Parcoursup", "projet de formation motivé"],
      langue_requise: { anglais_cecrl: fam.anglais_cecrl, texte: fam.anglais_cecrl ? `Niveau ${fam.anglais_cecrl} habituellement attendu dans cette filière (estimation).` : "Pas de certification exigée relevée pour cette filière.", statut: "estimation" },
      admission: aStats ? { taux, libelle: "Taux d'accès 2025", candidats: voeux, places, admis, texte: `${chiffres} (Parcoursup 2025).${taux != null ? ` Taux d'accès : ${taux} %.` : ""}`, source: src, consulte_le: cons, statut: "officiel" }
        : man ? { taux, libelle: `Taux d'accès ${man.session}`, candidats: voeux, places, admis, texte: `${chiffres ? chiffres + " " : ""}(statistiques de la session ${man.session}${man === anc ? "" : ", relevé manuel"}). Taux d'accès : ${taux} %.`, session: man.session, source: man.source, consulte_le: man.consulte_le, statut: man === anc ? "officiel" : "releve_manuel" }
        : { taux: null, libelle: "Taux d'accès 2025", candidats: null, places: null, admis: null, texte: MENTION_STATS[stats], source: src, consulte_le: cons, statut: "non_communique" },
      stats, stats_certitude: st && !aStats && !man ? st.certitude : null, stats_anciennes: !aStats && !man && st ? st.anciennes || null : null,
      mentions_admis: m, classement: null, integrations: [],
      incertitudes: [deduite ? `Profil, domaines, spécialités et métiers déduits de l'intitulé officiel de la filière Parcoursup (« ${fam.libelle} », ${fam.nmc}) : estimation à vérifier pour cet établissement.`
          : `Profil, domaines, spécialités, métiers et poursuites repris des ${fam.nb} fiche(s) Mon Plan Sup de la même filière Parcoursup (${fam.nmc}) : estimation à vérifier pour cet établissement.`,
        ...(fam.confiance === "basse" ? ["Déduction peu sûre (intitulé de filière générique ou ambigu) : vérifie le contenu de la formation sur sa fiche Parcoursup."] : []),
        ...(man ? [`Pas de statistiques Parcoursup 2025 : chiffres ${man === anc ? "de la session" : "relevés à la main (session"} ${man.session}${man === anc ? "" : ")"}, sans les mentions des admis.`] : []),
        ...(stats === "nouvelle_2026" ? ["Nouvelle formation à la rentrée 2026 : pas encore de statistiques d'admission, donc pas de repère d'admission. Elle n'entre pas dans ta liste de 10 vœux (section « Nouvelle formation à la rentrée 2026 »)."] : []),
        ...(stats === "sans_stats" ? ["Statistiques d'admission non publiées : aucun repère d'admission, et cette formation n'est pas proposée dans ta liste de vœux (tu peux l'ajouter toi-même)."] : []),
        ...(aStats && moy == null ? ["Mentions des admis non publiées : pas de repère de moyenne."] : []), ...(!pub ? ["Frais non relevés."] : [])],
      domaines: fam.domaines,
      cout: pub ? Object.assign({}, fam.cout_public) : { valeur_annuelle_eur: null, texte: TC_ETAB[r.tc] && r.tc !== "Publics" ? "Établissement privé : frais non relevés, vérifie sur le site de l'établissement." : "Frais non relevés pour cette formation : vérifie sur le site de l'établissement.", statut: "non_communique" },   // « privé » seulement si Parcoursup le dit
      specialites: { obligatoires: sp.obligatoires, recommandees: sp.recommandees, maths_expertes: sp.maths_expertes,
        texte: ([sp.obligatoires.length ? `Attendues : ${spLib(sp.obligatoires)}.` : "", sp.recommandees.length ? `Conseillées : ${spLib(sp.recommandees)}.` : "", sp.maths_expertes ? "Option maths expertes " + { indispensable: "indispensable", fortement_conseillee: "fortement conseillée", conseillee: "conseillée" }[sp.maths_expertes] + "." : ""].filter(Boolean).join(" ") || "Pas de spécialité conseillée relevée pour cette filière.") + (deduite ? " (déduit de l'intitulé de la filière)" : " (repris des fiches Mon Plan Sup de la même filière)"), statut: "estimation" },
      statut_etab: TC_ETAB[r.tc] || null, selectivite: taux != null ? { niveau: NIV_TAUX(taux) } : { niveau: "moyenne", estimee: true },   // niveau par défaut pour le calcul, non affiché
      notes: { moyenne_cible: moy, maths_cible: null, texte: moy != null ? `Moyenne au bac estimée des admis 2025 : ${String(moy).replace(".", ",")}/20, calculée à partir de la répartition officielle des mentions (Parcoursup 2025).` : "Pas de repère chiffré.", statut: "estimation", source: src, consulte_le: cons },
      metiers: fam.metiers, poursuites: fam.poursuites,
      __gen: { gta: g, fam, typeSansRegle: !typePs },
    };
  }
  function fichDepuisModele(o, g) {
    const r = PSBY[g]; if (!r) return null;
    const f = JSON.parse(JSON.stringify(o));
    const v = (c) => statDe(g, c), src = r.dataviz || r.fiche, cons = "2026-10-08";
    f.id = "psup-" + g; f.nom = r.nm[0].replace(/^CPGE - ECG - Mathématiques /, "CPGE ECG – Maths ").replace("approfondies", "approfondies").replace(" + ", " + ");
    if (STATS[g]) {
      const taux = v("taux_acces_ens");
      f.admission = { taux, libelle: "Taux d'accès 2025", candidats: v("voe_tot"), places: v("capa_fin"), admis: v("acc_tot"),
        texte: `${v("capa_fin")} places · ${v("voe_tot")} vœux reçus · ${v("acc_tot")} admis (Parcoursup 2025).${taux != null ? ` Taux d'accès : ${taux} %.` : ""}`, source: src, consulte_le: cons, statut: "officiel" };
      const m = { TBF: v("pct_tbf"), TB: v("pct_tb"), B: v("pct_b"), AB: v("pct_ab"), sans: v("pct_sansmention") };
      if (v("acc_tot") && Object.values(m).every((x) => x != null)) {
        f.mentions_admis = Object.assign(m, { source: src, consulte_le: cons, statut: "officiel" });
        const MID = { TBF: 18.6, TB: 16.9, B: 14.9, AB: 12.9, sans: 11.2 }, K = Object.keys(MID);
        const moy = Math.round((K.reduce((a, k) => a + MID[k] * m[k], 0) / K.reduce((a, k) => a + m[k], 0)) * 10) / 10;
        f.notes = Object.assign({}, f.notes, { moyenne_cible: moy, texte: `Moyenne au bac estimée des admis 2025 de cette option : ${String(moy).replace(".", ",")}/20, calculée à partir de la répartition officielle des mentions (Parcoursup 2025).${f.notes && f.notes.maths_cible != null ? " Repère de maths repris de la fiche Mon Plan Sup du lycée." : ""}`, statut: "estimation", source: src, consulte_le: cons });
      }
      if (taux != null) f.selectivite = { niveau: NIV_TAUX(taux) };
    }
    f.incertitudes = [`Fiche reprise de « ${o.nom} » (${o.etablissement}), qui ne précisait pas l'option HGG ou ESH : contenu éditorial commun aux options, chiffres d'admission propres à cette option.`, ...(o.incertitudes || [])];
    f.__gen = { gta: g, modele: o.id, modeleNom: o.nom };
    f.statut_etab = TC_ETAB[r.tc] || null;   // statut de cet établissement d'après Parcoursup, pas celui du modèle
    return f;
  }
  function decodePs(c) {
    const K = c.meta.cles, S = c.s, iG = K.indexOf("gta");
    const FICHE = (g) => `https://dossierappel.parcoursup.fr/Candidats/public/fiches/afficherFicheFormation?g_ta_cod=${g}&typeBac=0&originePc=0`;
    const DVIZ = (g) => `https://data.enseignementsup-recherche.gouv.fr/pages/parcoursup/?disjunctive.fili&sort=tri&refine.gta=${g}`;
    return c.l.map((L) => {
      const r = {}, g = S[L[iG]];
      K.forEach((k, j) => {
        const v = L[j];
        if (k === "fiche") r[k] = v === 0 ? FICHE(g) : S[v - 1];
        else if (k === "dataviz") r[k] = v === 0 ? null : v === 1 ? DVIZ(g) : S[v - 2];
        else if (k === "etab_gps") r[k] = v == null ? null : Array.isArray(v) ? { lon: v[0], lat: v[1] } : v.raw;
        else if (v == null) r[k] = null;
        else if (Array.isArray(v)) r[k] = v.map((i) => S[i]);
        else if (typeof v === "object") r[k] = v.raw;
        else r[k] = S[v];
      });
      return r;
    });
  }
  window.__decodePs = decodePs;

  // Fiches remplacées ou redirigées, fiches maison retirées : applique les redirections au nombre de vœux retenus
  // (fonction pure : renvoie le nouvel état et les messages, ne modifie pas l'état reçu ni ne l'enregistre).
  // Reprend à l'identique les lignes qui étaient dans chargerFormations (app.js).
  function redirigerVoeux(etat) {
    const messages = [];
    let retenus = [...new Set(etat.retenus.flatMap((id) => (REMPL[id] ? REMPL[id] : [ALIAS[id] || id])))];   // fiches remplacées ou redirigées
    // fiches maison retirées sans correspondance Parcoursup affichée : vœu retiré de la liste, avec un message (une seule fois)
    const retenusAvant = retenus.length;
    retenus = retenus.filter((id) => !RETIREES.has(id));
    if (retenus.length < retenusAvant) messages.push(AVIS_RETRAIT);
    return { etat: Object.assign({}, etat, { retenus }), messages, modifie: retenus.join("|") !== etat.retenus.join("|") };
  }
  // Calendrier Parcoursup repris par les fiches qui n'en ont pas (lignes qui étaient dans chargerFormations)
  function completerCalendrier(d) {
    const calPs = (d.formations.find((f) => f.plateforme === "parcoursup" && f.calendrier && f.calendrier.length) || {}).calendrier || []; d.formations.forEach((f) => { if (!f.calendrier) f.calendrier = calPs; });
  }
  // État courant, relu par app.js après construireCatalogue et chargerLieux (les variables sont réaffectées à chaque construction)
  const etat = () => ({ CAT, CATBY, PSBY, FU, ALIAS, STATS, STCONS, LIEUX, FRAIS_PRIVES_META, CAMPUS });
  window.CapCatalogue = { construireCatalogue, chargerLieux, redirigerVoeux, completerCalendrier, etat, decodePs, statDe, sansAccents, etabCourt,
    montantFrais, suffixeRevenus, texteApprentissage, MENTION_STATS, AVIS_RETRAIT };
})();
