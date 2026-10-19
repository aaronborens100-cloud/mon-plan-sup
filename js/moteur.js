/*
 * js/moteur.js : moteur de recommandation (CapEngine).
 *
 * Rôle : à partir du profil de l'élève et de ses réponses au questionnaire, noter chaque
 * formation (intérêt, faisabilité, pertinence), la situer à partir des statistiques officielles
 * (taux d'accès, position parmi les admis 2025), la classer ambitieux / réaliste / sécurité, construire la liste
 * équilibrée de 10 vœux Parcoursup et proposer des équivalents à l'étranger.
 * Fonctions principales : recommander, wishlist (et protection), etranger, repere, statsProfil.
 * Modèle des catégories : docs/modele-chances.md.
 * Aucun accès à la page : ce module ne fait que des calculs.
 *
 * Expose : window.CapEngine.
 * Ordre de chargement : 3e des 4 scripts de js/ ; utilise window.CapBulletin (analyse des
 * appréciations) s'il est présent.
 */
/* Mon Plan Sup — moteur de recommandation (version 2).
   - Adéquation critère par critère (notes, spécialités, langues, tests, extrascolaire, appréciations).
   - Taux d'accès officiel de chaque formation et position de l'élève parmi les admis 2025 (sans pourcentage de chances).
   - Catégories ambitieux / réaliste / sécurité déduites de ces deux mesures (REGLES_CATEGORIE).
   - Wishlist équilibrée de 10 vœux. */
(function () {
  "use strict";

  const SPECIALITES = [
    ["maths", "Mathématiques"], ["physique_chimie", "Physique-chimie"], ["SVT", "SVT"], ["SES", "Sciences économiques et sociales (SES)"],
    ["HGGSP", "Histoire-géo, géopolitique et sciences politiques (HGGSP)"], ["HLP", "Humanités, littérature et philosophie (HLP)"],
    ["AMC", "Anglais, monde contemporain (AMC)"], ["LLCER_anglais", "LLCER anglais"], ["LLCER_autre", "LLCER autre langue"],
    ["NSI", "Numérique et sciences informatiques (NSI)"], ["SI", "Sciences de l'ingénieur (SI)"], ["arts", "Arts"],
    ["bio_eco", "Biologie-écologie"], ["LLCA", "Littérature, langues et cultures de l'Antiquité (LLCA)"], ["EPPCS", "Éducation physique, pratiques et culture sportives"],
  ];
  const SPEC_COURT = { maths: "Maths", physique_chimie: "Physique-chimie", SVT: "SVT", SES: "SES", HGGSP: "HGGSP", HLP: "HLP", AMC: "AMC", LLCER_anglais: "LLCER anglais", LLCER_autre: "LLCER", NSI: "NSI", SI: "SI", arts: "Arts", bio_eco: "Bio-éco", LLCA: "LLCA", EPPCS: "EPPCS" };
  const SPEC_NOM = Object.fromEntries(SPECIALITES);
  const DOMAINES = {
    maths: "les mathématiques", economie: "l'économie", gestion_commerce: "le management et le commerce", finance: "la finance",
    droit: "le droit", sciences_politiques: "la science politique", international: "l'international", ingenierie_tech: "les sciences et la technique",
    data_informatique: "l'informatique et la data", sciences_humaines: "les sciences humaines", langues: "les langues",
    arts: "les arts et le design", sante: "la santé et le social", vivant: "le vivant et l'environnement", sport: "le sport", communication: "la communication et les médias",
  };
  const NIVEAUX = {
    fort: { label: "Atout fort", score: 100 }, conforme: { label: "Conforme", score: 78 }, preparer: { label: "À préparer", score: 62 },
    renforcer: { label: "À renforcer", score: 45 }, faible: { label: "Écart important", score: 18 }, bloquant: { label: "Point bloquant", score: 0 },
    inconnu: { label: "Donnée manquante", score: 55 }, na: { label: "Non exigé", score: null },
  };
  const CECRL = ["A1", "A2", "B1", "B2", "C1", "C2"];
  const SEL_LABEL = { tres_haute: "Très sélective", haute: "Sélective", moyenne: "Moyennement sélective", ouverte: "Peu sélective" };
  const CAT_LABEL = { ambitieux: "Ambitieux", realiste: "Réaliste", securite: "Sécurité" };
  const IDF = ["Paris", "Versailles", "Neuilly", "Sceaux", "Orsay", "Cergy", "Palaiseau", "Rueil", "Saint-Maur", "Jouy", "Nanterre", "Vincennes", "Massy", "Sarcelles", "Saint-Germain", "Savigny", "Meaux", "Villetaneuse", "Évry"];
  const TYPE_GROUPES = { prepa: ["prepa_ecg", "prepa_scientifique", "prepa_bl", "prepa_litteraire"] };
  // Bornes des mentions (pour situer un élève dans la distribution des admis)
  const BANDES = [["sans", 10, 12], ["AB", 12, 14], ["B", 14, 16], ["TB", 16, 18], ["TBF", 18, 20]];

  let REF = { metiers: {}, poursuites: {} };
  function init(ref) {
    REF.metiers = Object.fromEntries((ref.metiers || []).map((m) => [m.id, m]));
    REF.poursuites = Object.fromEntries((ref.poursuites || []).map((p) => [p.id, p]));
  }

  // une chaîne vide ou faite d'espaces est une valeur absente (null), pas 0
  const num = (v) => { if (v === null || v === undefined) return null; const t = String(v).trim(); if (t === "") return null; const n = Number(t.replace(",", ".")); return Number.isFinite(n) ? n : null; };
  const moyenne = (arr) => { const a = arr.filter((x) => x !== null && x !== undefined); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; };
  const r1 = (x) => (x === null || x === undefined ? null : Math.round(x * 10) / 10);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  function fmt(x) { return x === null || x === undefined ? "—" : String(Math.round(x * 100) / 100).replace(".", ","); }
  function fmtEur(x) { return x == null ? "—" : `${Math.round(x).toLocaleString("fr-FR")} €`; }

  function niveauCertif(c) {
    if (c.niveau && CECRL.includes(c.niveau)) return c.niveau;
    const s = num(c.score), t = (c.type || "").toLowerCase();
    if (s === null) return null;
    if (t.includes("ielts")) return s >= 8.5 ? "C2" : s >= 7 ? "C1" : s >= 5.5 ? "B2" : s >= 4 ? "B1" : "A2";
    if (t.includes("toefl")) return s >= 114 ? "C2" : s >= 95 ? "C1" : s >= 72 ? "B2" : s >= 42 ? "B1" : "A2";
    if (t.includes("cambridge")) return s >= 200 ? "C2" : s >= 180 ? "C1" : s >= 160 ? "B2" : s >= 140 ? "B1" : "A2";
    if (t.includes("toeic")) return s >= 945 ? "C1" : s >= 785 ? "B2" : s >= 550 ? "B1" : "A2";
    return null;
  }
  const estAnglais = (c) => /ielts|toefl|cambridge|toeic|anglais/i.test((c.type || "") + " " + (c.langue || ""));

  /* ---------------------------------------------------------------- profil */
  // Comment on calcule ta moyenne (règles éditoriales, détaillées dans docs/modele-chances.md) :
  // - moyenne générale = moyenne simple des moyennes générales écrites sur tes bulletins de première
  //   et de terminale : chaque période compte pour POIDS_PERIODE, sans coefficient ;
  // - une période sans moyenne générale saisie n'est pas comptée : on ne la reconstitue pas à partir
  //   des matières (le profil affiche MESSAGE_SANS_MOYENNE) ;
  // - maths et maths expertes sont deux matières distinctes, chacune moyenne simple de ses périodes ;
  // - aucune prédiction (tendance, extrapolation, bonus) : seule la marge MARGE_BULLETIN de repere()
  //   corrige la moyenne, et seulement pour la comparer aux mentions des admis.
  const POIDS_PERIODE = 1;   // même poids pour toutes les périodes (trimestres et semestres, première et terminale)
  // Bulletins pris en compte : ceux de première et de terminale (ceux que lisent les formations sur
  // Parcoursup). Ceux de seconde ne comptent que pour un élève qui n'en a pas d'autre.
  const NIVEAUX_BULLETINS = ["Première", "Terminale"];
  const MESSAGE_SANS_MOYENNE = (periode) => `Moyenne générale non renseignée pour ${periode} : ajoute-la depuis ton bulletin.`;
  // Seuils sur la note de maths expertes, pour les formations qui demandent l'option (critère
  // « spécialités ») : règles éditoriales de Mon Plan Sup, pas des exigences publiées par les formations.
  const SEUIL_EXPERTES_FAIBLE = 10;   // sous 10 : « à renforcer »
  const SEUIL_EXPERTES_FORT = 14;     // 14 ou plus : « atout fort »
  // Une moyenne (générale ou de matière) hors de 0 à 20 est une erreur de saisie : elle n'est pas comptée,
  // comme une valeur absente, et le profil affiche MESSAGE_NOTE_IMPOSSIBLE.
  const NOTE_MIN = 0, NOTE_MAX = 20;
  const noteValide = (v) => { const n = num(v); return n !== null && n >= NOTE_MIN && n <= NOTE_MAX ? n : null; };
  const noteImpossible = (v) => { const n = num(v); return n !== null && (n < NOTE_MIN || n > NOTE_MAX); };
  // periode : forme courte (« Tle T1 ») ; matiere : nom affiché, absent pour la moyenne générale
  const MESSAGE_NOTE_IMPOSSIBLE = (periode, valeur, matiere) =>
    `Moyenne ${matiere ? `de ${matiere} en ${periode}` : `de ${periode}`} impossible (${fmt(valeur)}) : vérifie-la sur ton bulletin.`;
  function periodesComptees(periodes) {
    const niveau = (x) => String(x.label || "").split(" – ")[0];
    const lycee = periodes.filter((x) => NIVEAUX_BULLETINS.includes(niveau(x)));
    return lycee.length ? lycee : periodes;
  }
  // moyenne simple d'une matière sur les périodes où elle a une note, avec la liste de ces périodes
  function moyenneMatiere(periodes, m) {
    const notes = periodes.map((x) => ({ periode: x.label || "", v: noteValide(((x.notes || {})[m] || {}).moy) })).filter((x) => x.v !== null);
    return { moyenne: r1(moyenne(notes.map((x) => x.v))), periodes: notes.map((x) => x.periode) };
  }
  // valeurs hors de 0 à 20 dans les périodes comptées : [{ periode, matiere (null pour la moyenne générale), valeur }]
  function notesImpossibles(p) {
    const out = [];
    for (const x of periodesComptees((p && p.periodes) || [])) {
      if (noteImpossible(x.moyenneGenerale)) out.push({ periode: x.label || "", matiere: null, valeur: num(x.moyenneGenerale) });
      for (const [m, n] of Object.entries(x.notes || {})) if (noteImpossible((n || {}).moy)) out.push({ periode: x.label || "", matiere: m, valeur: num(n.moy) });
    }
    return out;
  }
  function statsProfil(p) {
    const periodes = p.periodes || [];
    const comptees = periodesComptees(periodes);
    const avecMoyenne = comptees.filter((x) => noteValide(x.moyenneGenerale) !== null);
    const sp = avecMoyenne.reduce((a, x) => a + noteValide(x.moyenneGenerale) * POIDS_PERIODE, 0), sc = avecMoyenne.length * POIDS_PERIODE;
    const mg = sc ? sp / sc : null;
    const dernier = avecMoyenne[avecMoyenne.length - 1];
    const spe = moyenneMatiere(comptees, "maths"), exp = moyenneMatiere(comptees, "maths_expertes"), cpl = moyenneMatiere(comptees, "maths_complementaires");
    // maths retenues : la spécialité maths ; sinon les maths complémentaires ; sinon les notes de maths saisies
    const mathsMatiere = (p.specialites || []).includes("maths") ? "maths" : cpl.moyenne !== null ? "maths_complementaires" : spe.moyenne !== null ? "maths" : null;
    const mathsRef = mathsMatiere === "maths_complementaires" ? cpl : mathsMatiere ? spe : { moyenne: null, periodes: [] };
    const ecartsClasse = periodes.map((x) => { const g = num(x.moyenneGenerale), c = num(x.moyenneClasse); return g !== null && c !== null ? g - c : null; });
    const rangs = periodes.map((x) => { const r = num(x.rang), e = num(x.effectif); return r && e ? r / e : null; });
    const certs = p.certifications || [];
    const niv = certs.filter(estAnglais).map(niveauCertif).filter(Boolean).sort((a, b) => CECRL.indexOf(b) - CECRL.indexOf(a));
    const anglais = niv[0] || (CECRL.includes(p.anglaisAuto) ? p.anglaisAuto : null);
    const exps = p.experiences || [];
    const bp = Object.assign({ francaisEcrit: "", francaisOral: "", maths: "" }, p.bacPremiere || {});
    if (p.bacFrancais && !bp.francaisEcrit) { bp.francaisEcrit = p.bacFrancais.ecrit || ""; bp.francaisOral = p.bacFrancais.oral || ""; }
    const fe = num(bp.francaisEcrit), fo = num(bp.francaisOral), ma = num(bp.maths);
    const eaf = fe !== null && fo !== null && ma !== null ? 0.6 * fe + 0.1 * fo + 0.3 * ma : null;
    const appr = window.CapBulletin ? window.CapBulletin.analyseAppreciations(periodes) : null;
    return {
      moyenneGenerale: mg === null ? null : Math.round(mg * 100) / 100, moyennePeriodes: avecMoyenne.map((x) => x.label || ""),
      periodesSansMoyenne: comptees.filter((x) => num(x.moyenneGenerale) === null).map((x) => x.label || ""),
      dernierBulletin: dernier ? { moyenne: noteValide(dernier.moyenneGenerale), periode: dernier.label || "" } : null,
      maths: mathsRef.moyenne, mathsMatiere, mathsPeriodes: mathsRef.periodes, mathsSpe: spe.moyenne, compl: cpl.moyenne,
      expertes: exp.moyenne, expertesPeriodes: exp.periodes,
      anglais, anglaisCertifie: !!niv[0], ecartClasse: r1(moyenne(ecartsClasse)), rangRelatif: moyenne(rangs),
      nbExperiences: exps.length, nbExperiencesFortes: exps.filter((e) => ["competition", "responsabilite", "projet", "stage"].includes(e.type)).length,
      geo: p.lycee && p.lycee.lat != null ? { lat: p.lycee.lat, lon: p.lycee.lon, nom: p.lycee.nom } : null,
      certifications: certs, specialites: p.specialites || [], abandonnee: p.specialiteAbandonnee || "", optionMaths: p.optionMaths || "aucune",
      niveau: p.niveau || "terminale", nbPeriodes: periodes.length, bacPremiere: { francaisEcrit: fe, francaisOral: fo, maths: ma, scoreSciencesPo: r1(eaf) },
      appreciations: appr,
    };
  }

  /* ---------------------------------------------------------------- questionnaire */
  function interets(questionnaire, reponses) {
    const dom = Object.fromEntries(Object.keys(DOMAINES).map((k) => [k, 0]));
    const prefs = {}; const types = new Set(); const metiers = new Set();
    let repondues = 0;
    const ajoute = (d, f) => { for (const [k, v] of Object.entries(d || {})) dom[k] = (dom[k] || 0) + v * f; };
    for (const q of questionnaire.questions) {
      const r = reponses[q.id];
      if (r === undefined || r === null || r === "nsp" || (Array.isArray(r) && !r.length)) continue;
      repondues++;
      if (q.type === "scale") { const n = Number(r); ajoute(q.domaines, (n - 1) / 4); if (q.pref) prefs[q.pref] = n; continue; }
      const vals = Array.isArray(r) ? r : [r];
      for (const v of vals) {
        const opt = q.options.find((o) => o.value === v); if (!opt) continue;
        ajoute(opt.domaines, 1); Object.assign(prefs, opt.prefs || {});
        (opt.types || []).forEach((t) => types.add(t)); (opt.metiers || []).forEach((m) => metiers.add(m));
      }
      if (q.type === "multi") prefs[q.id] = vals;
    }
    const max = Math.max(...Object.values(dom), 0.0001);
    return { domaines: Object.fromEntries(Object.entries(dom).map(([k, v]) => [k, v / max])), prefs, types, metiers, repondues, total: questionnaire.questions.length };
  }

  /* ---------------------------------------------------------------- critères */
  function critNotes(f, s) {
    const n = f.notes || {};
    if (f.epreuves_anticipees && s.bacPremiere.scoreSciencesPo !== null) {
      const e = s.bacPremiere.scoreSciencesPo - (n.moyenne_cible || 17);
      const niveau = e >= 0.5 ? "fort" : e >= -0.5 ? "conforme" : e >= -2 ? "renforcer" : "faible";
      return { niveau, ecart: r1(e), texte: `Épreuves anticipées pondérées (français écrit 60 %, oral 10 %, maths 30 %) : ${fmt(s.bacPremiere.scoreSciencesPo)} — repère ${fmt(n.moyenne_cible)}.` };
    }
    if (n.moyenne_cible == null && n.maths_cible == null) return { niveau: "inconnu", texte: "Pas de repère chiffré relevé pour cette formation." };
    if (s.moyenneGenerale === null) return { niveau: "inconnu", texte: "Renseigne tes bulletins pour comparer tes notes." };
    // le repère de maths d'une formation vise la spécialité maths : les maths complémentaires ne lui sont pas comparées
    const compl = s.mathsMatiere === "maths_complementaires";
    const noteCompl = compl && n.maths_cible != null ? ` ${MESSAGE_MATHS_COMPL}` : "";
    if (compl && n.moyenne_cible == null) return { niveau: "inconnu", texte: `Pas de repère de moyenne générale relevé pour cette formation.${noteCompl}` };
    const ecarts = [];
    if (n.moyenne_cible != null) ecarts.push(s.moyenneGenerale - n.moyenne_cible);
    if (n.maths_cible != null && s.maths !== null && !compl) ecarts.push(s.maths - n.maths_cible);
    const e = Math.min(...ecarts);
    const cible = [n.moyenne_cible != null ? `${fmt(n.moyenne_cible)} de moyenne` : null, n.maths_cible != null ? `${fmt(n.maths_cible)} en maths` : null].filter(Boolean).join(" et ");
    const lib = n.statut === "officiel" ? "exigence officielle" : n.statut === "source_secondaire" ? "repère publié" : "repère estimé";
    const niveau = e >= 0.7 ? "fort" : e >= -0.3 ? "conforme" : e >= -1.5 ? "renforcer" : "faible";
    return { niveau, ecart: r1(e), texte: `Visé : ${cible} (${lib}) — toi : ${fmt(s.moyenneGenerale)}${s.maths !== null && !noteCompl ? ` / ${compl ? "maths complémentaires" : "maths"} ${fmt(s.maths)}` : ""}.${noteCompl}` };
  }
  const MESSAGE_MATHS_COMPL = "Repère de maths donné pour la spécialité maths : tes maths complémentaires ne sont pas comparées.";
  // Libellé des maths retenues, pour l'affichage : « Maths complémentaires » ; « Spécialité maths (première) » quand
  // la spécialité a été abandonnée en fin de première sans maths complémentaires (on garde ses notes de première) ; sinon « Maths ».
  function libelleMaths(s) {
    if (s.mathsMatiere === "maths_complementaires") return "Maths complémentaires";
    if (s.mathsMatiere === "maths" && !s.specialites.includes("maths") && s.abandonnee === "maths" && s.mathsPeriodes.length
      && s.mathsPeriodes.every((l) => String(l).startsWith("Première"))) return "Spécialité maths (première)";
    return "Maths";
  }
  function aMaths(s) {
    if (s.specialites.includes("maths")) return "spe";
    if (s.niveau === "terminale" && s.optionMaths === "complementaires") return "compl";
    return "non";
  }
  // niveau donné par la note de maths expertes (seuils éditoriaux SEUIL_EXPERTES_FAIBLE et SEUIL_EXPERTES_FORT)
  const niveauExpertes = (note) => (note === null || note === undefined ? null : note < SEUIL_EXPERTES_FAIBLE ? "renforcer" : note >= SEUIL_EXPERTES_FORT ? "fort" : "conforme");
  function worst(a, b) { const O = ["bloquant", "faible", "renforcer", "preparer", "inconnu", "conforme", "fort", "na"]; return O.indexOf(a) <= O.indexOf(b) ? a : b; }
  function critSpecialites(f, s) {
    const sp = f.specialites || {};
    if (!s.specialites.length) return { niveau: "inconnu", texte: "Indique tes spécialités dans ton profil.", manque: [], actions: [] };
    const manque = [], ok = [], actions = [];
    let niveau = "conforme";
    for (const o of sp.obligatoires || []) {
      if (o === "maths") {
        const m = aMaths(s);
        if (m === "spe") ok.push("maths");
        else if (m === "compl") { if (sp.maths_complementaires_ok) ok.push("maths complémentaires"); else { niveau = worst(niveau, "renforcer"); manque.push("spécialité maths (tu as maths complémentaires)"); } }
        else { niveau = "bloquant"; manque.push("des mathématiques en terminale"); }
      } else if (s.specialites.includes(o)) ok.push(SPEC_COURT[o] || o);
      else if (s.abandonnee === o) { niveau = worst(niveau, "renforcer"); manque.push(`${SPEC_COURT[o] || o} (abandonnée en fin de première)`); }
      else { niveau = "bloquant"; manque.push(SPEC_COURT[o] || o); }
    }
    const exp = sp.maths_expertes;
    let noteExpertes = "", atoutExpertes = false;
    if (exp) {
      if (s.optionMaths === "expertes") {
        ok.push("maths expertes");
        // l'option est suivie : on regarde aussi la note
        const ne = niveauExpertes(s.expertes);
        if (ne) noteExpertes = `Maths expertes : ${fmt(s.expertes)} (${NIVEAUX[ne].label.toLowerCase()}).`;
        if (ne === "renforcer") niveau = worst(niveau, "renforcer");
        atoutExpertes = ne === "fort";
      }
      else if (s.niveau !== "terminale") { niveau = worst(niveau, exp === "indispensable" ? "renforcer" : "conforme"); actions.push("Choisir l'option maths expertes en terminale"); manque.push("maths expertes (à choisir en terminale)"); }
      else { niveau = worst(niveau, exp === "indispensable" ? "bloquant" : exp === "fortement_conseillee" ? "renforcer" : "conforme"); manque.push(exp === "conseillee" ? "maths expertes (conseillée)" : "option maths expertes"); }
    }
    const reco = (sp.recommandees || []).filter((r) => s.specialites.includes(r) || s.abandonnee === r);
    if (niveau === "conforme" && (reco.length || atoutExpertes || (!(sp.recommandees || []).length && ok.length))) niveau = "fort";
    const txt = [ok.length || reco.length ? `Tu as : ${[...ok, ...reco.map((r) => SPEC_COURT[r] || r)].join(", ")}.` : "", noteExpertes, manque.length ? `Manque : ${manque.join(", ")}.` : ""].filter(Boolean).join(" ");
    return { niveau, texte: txt || "Pas de spécialité imposée.", manque, actions };
  }
  function critLangues(f, s) {
    const req = (f.langue_requise || {}).anglais_cecrl;
    if (!req) return { niveau: "na", texte: (f.langue_requise || {}).texte || "Pas de certification de langue exigée." };
    if (!s.anglais) return { niveau: "renforcer", texte: `Niveau ${req} attendu ; ton niveau n'est pas renseigné.`, requis: req };
    const d = CECRL.indexOf(s.anglais) - CECRL.indexOf(req);
    if (d >= 0) return s.anglaisCertifie ? { niveau: "fort", texte: `${req} attendu — certifié ${s.anglais}.`, requis: req } : { niveau: "conforme", texte: `${req} attendu — niveau estimé ${s.anglais}, à certifier.`, requis: req, aCertifier: true };
    return { niveau: d === -1 ? "renforcer" : "faible", texte: `${req} attendu — ton niveau : ${s.anglais}.`, requis: req };
  }
  function critTests(f, s) {
    const req = (f.tests || []).filter((t) => t.obligatoire);
    if (!req.length) return { niveau: "na", texte: "Pas de test spécifique exigé.", aPreparer: [] };
    const aPreparer = [], faits = [];
    for (const t of req) {
      const nom = t.nom.toLowerCase();
      const deja = s.certifications.find((c) => { const ty = (c.type || "").toLowerCase().split(" ")[0]; return ty && !["autre", "bafa", "psc1"].includes(ty) && nom.includes(ty); });
      if (deja) faits.push(t.nom); else aPreparer.push(t.nom);
    }
    if (!aPreparer.length) return { niveau: "fort", texte: `Déjà passé : ${faits.join(", ")}.`, aPreparer };
    return { niveau: "preparer", texte: `À préparer : ${aPreparer.join(" ; ")}.`, aPreparer };
  }
  function critExtra(f, s) {
    const poids = f.dossier_poids || "faible", n = s.nbExperiences;
    const imp = poids === "fort" ? "très regardé" : poids === "moyen" ? "pris en compte" : "peu déterminant";
    let niveau;
    if (poids === "faible") niveau = n >= 1 ? "fort" : "conforme";
    else if (n === 0) niveau = poids === "fort" ? "faible" : "renforcer";
    else if (s.nbExperiencesFortes >= 2 || n >= 3) niveau = "fort"; else niveau = "conforme";
    return { niveau, texte: `Dossier extrascolaire ${imp} ici — ${n} expérience${n > 1 ? "s" : ""} renseignée${n > 1 ? "s" : ""}.`, poids };
  }
  function critAppreciations(f, s) {
    const a = s.appreciations;
    if (!a) return { niveau: "inconnu", texte: "Ajoute les appréciations de tes bulletins (import PDF ou saisie) : les jurys Parcoursup les lisent attentivement." };
    const poidsFort = ["prepa_ecg", "prepa_scientifique", "prepa_bl", "prepa_litteraire", "college_universitaire", "double_licence", "iep"].includes(f.type);
    let niveau = a.niveau;
    if (!poidsFort && niveau === "faible") niveau = "renforcer";
    return { niveau, texte: `${a.nb} appréciation(s) analysée(s) : ${a.positifs} signal(aux) positif(s), ${a.negatifs} point(s) de vigilance${a.mentions.length ? " ; " + a.mentions.join(", ") : ""}.${poidsFort ? " Critère très regardé pour cette formation." : ""}` };
  }

  /* ---------------------------------------------------------------- repères d'admission et catégories */
  // Modèle décrit dans docs/modele-chances.md. Aucune donnée publique ne donne la chance d'admission d'un élève
  // précis (les statistiques décrivent les admis, pas les refusés) : pas de pourcentage personnel. Deux mesures
  // vérifiables seulement : le taux d'accès officiel de la formation et la position de l'élève parmi les admis 2025.
  const MARGE_BULLETIN = 0.5;   // points retirés à la moyenne des bulletins avant de la comparer aux mentions au bac (prudence)
  const SEUIL_AU_DESSUS = 0.6, SEUIL_EN_DESSOUS = 0.3;   // part des admis sous la moyenne de l'élève
  const SEUIL_TAUX_SECURITE = 50, SEUIL_TAUX_AMBITIEUX = 20;   // taux d'accès (%)
  // Formation très ouverte : presque tous les candidats reçoivent une proposition, la position parmi les admis
  // (qui ne décrit pas les refusés, très peu nombreux) ne suffit plus à la classer « ambitieux »
  const SEUIL_TAUX_TRES_OUVERT = 85;
  const POSITION_LABEL = { au_dessus: "au-dessus de la plupart des admis", moyenne: "dans la moyenne des admis", en_dessous: "en dessous de la plupart des admis", inconnue: "position inconnue" };
  const LIMITE_REPERE = "Ce n'est pas une probabilité : les jurys regardent aussi ton dossier complet.";
  function percentileAdmis(m, x) {
    // part des admis dont la moyenne est inférieure à x (répartition uniforme dans chaque tranche de mention)
    const tot = BANDES.reduce((a, [k]) => a + (m[k] || 0), 0);
    if (!tot || x === null) return null;
    let cum = 0;
    for (const [k, lo, hi] of BANDES) {
      const p = (m[k] || 0) / tot;
      if (x >= hi) cum += p; else if (x > lo) cum += p * (x - lo) / (hi - lo);
    }
    return clamp(cum, 0, 1);
  }
  const positionDe = (p) => (p === null ? "inconnue" : p >= SEUIL_AU_DESSUS ? "au_dessus" : p >= SEUIL_EN_DESSOUS ? "moyenne" : "en_dessous");
  function phrasePosition(r) {
    if (r.sansNotes) return "Renseigne tes bulletins pour te situer parmi les admis.";
    if (r.percentile === null) return "Mentions au bac des admis non publiées : impossible de te situer parmi eux.";
    const pc = Math.round(r.percentile * 100);
    const debut = pc >= 98 ? "Ta moyenne te place au-dessus de presque tous les admis" : pc <= 2 ? "Ta moyenne te place en dessous de presque tous les admis"
      : `Ta moyenne te place au-dessus d'environ ${pc} % des admis`;
    return `${debut} de ${r.sessionMentions}.`;
  }
  const METHODE_POSITION = `Position calculée à partir des mentions au bac des admis 2025 et de ta moyenne des bulletins moins ${fmt(MARGE_BULLETIN)} point, par prudence : la moyenne des bulletins n'est pas la note du bac, et les mentions sont des tranches de 2 points.`;
  // Repères affichés et utilisés pour la catégorie : { taux, session, source, consulte_le, statut, percentile, position,
  // sansNotes, nouvelle, sansStats, texte }. position : au_dessus, moyenne, en_dessous, inconnue (null sans notes).
  function repere(f, s) {
    const sansNotes = s.moyenneGenerale === null;
    const r = { taux: null, session: null, source: null, consulte_le: null, statut: null, percentile: null, position: sansNotes ? null : "inconnue", sansNotes, sessionMentions: null };
    if (f.stats === "nouvelle_2026") return Object.assign(r, { nouvelle: true, texte: "Nouvelle formation à la rentrée 2026 : pas encore de statistiques d'admission, donc pas de repère." });
    if (f.stats === "sans_stats") return Object.assign(r, { sansStats: true, texte: HORS_LISTE.sans_stats });
    const a = f.admission || {};
    if (typeof a.taux === "number") Object.assign(r, { taux: a.taux, session: a.session || (f.pays === "France" ? "2025" : null), source: a.source || null, consulte_le: a.consulte_le || null, statut: a.statut || null });
    const m = f.mentions_admis;
    if (m && !sansNotes) {
      // arrondi au pour cent affiché, pour que la phrase et le niveau ne se contredisent jamais (29,6 % → 30 % → « moyenne »)
      r.percentile = Math.round(percentileAdmis(m, s.moyenneGenerale - MARGE_BULLETIN) * 100) / 100;
      r.position = positionDe(r.percentile);
      r.sessionMentions = "2025";
    }
    r.texte = phrasePosition(r);
    return r;
  }
  // Table des catégories : la première règle vérifiée donne la catégorie et l'explication affichée sur la fiche.
  const REGLES_CATEGORIE = [
    { cle: "nouvelle", categorie: "ambitieux", si: (r) => r.nouvelle, texte: "Nouvelle formation 2026, sans statistiques : toujours « ambitieux »." },
    { cle: "bloquant", categorie: "ambitieux", si: (r, bloque) => bloque, texte: "Point bloquant dans ton dossier (voir les critères) : « ambitieux »." },
    { cle: "sans_notes_ouverte", categorie: "realiste", si: (r) => r.sansNotes && r.taux !== null && r.taux >= SEUIL_TAUX_SECURITE,
      texte: `Sans tes notes, on ne peut pas te situer parmi les admis : catégorie déduite du seul taux d'accès (au moins ${SEUIL_TAUX_SECURITE} %), jamais « sécurité ». Renseigne tes bulletins.` },
    { cle: "sans_notes", categorie: "ambitieux", si: (r) => r.sansNotes,
      texte: `Sans tes notes, on ne peut pas te situer parmi les admis : catégorie déduite du seul taux d'accès (moins de ${SEUIL_TAUX_SECURITE} % ou non publié). Renseigne tes bulletins.` },
    { cle: "taux_bas", categorie: "ambitieux", si: (r) => r.taux !== null && r.taux < SEUIL_TAUX_AMBITIEUX,
      texte: `Moins de ${SEUIL_TAUX_AMBITIEUX} % des candidats ont reçu une proposition : « ambitieux », même avec un très bon dossier.` },
    { cle: "tres_ouverte", categorie: "securite", si: (r) => r.taux !== null && r.taux >= SEUIL_TAUX_TRES_OUVERT && (r.position === "moyenne" || r.position === "au_dessus"),
      texte: `Formation très ouverte : au moins ${SEUIL_TAUX_TRES_OUVERT} % des candidats ont reçu une proposition en 2025.` },
    { cle: "tres_ouverte_en_dessous", categorie: "realiste", si: (r) => r.taux !== null && r.taux >= SEUIL_TAUX_TRES_OUVERT && r.position === "en_dessous",
      texte: "Formation très ouverte, mais ta moyenne est en dessous de celle des admis 2025 : candidate, et renforce tes notes." },
    { cle: "en_dessous", categorie: "ambitieux", si: (r) => r.position === "en_dessous", texte: "Ta moyenne est en dessous de celle de la plupart des admis 2025 : « ambitieux »." },
    { cle: "securite", categorie: "securite", si: (r) => r.taux !== null && r.taux >= SEUIL_TAUX_SECURITE && r.position === "au_dessus",
      texte: `Au moins ${SEUIL_TAUX_SECURITE} % des candidats ont reçu une proposition et ta moyenne est au-dessus de celle de la plupart des admis : « sécurité ».` },
    { cle: "sans_taux", categorie: "realiste", si: (r) => r.taux === null, texte: "Taux d'accès non publié : jamais « sécurité »." },
    { cle: "position_inconnue", categorie: "realiste", si: (r) => r.position === "inconnue", texte: "Impossible de te situer parmi les admis : jamais « sécurité »." },
    { cle: "realiste", categorie: "realiste", si: () => true,
      texte: `Pour être « sécurité », il faut un taux d'accès d'au moins ${SEUIL_TAUX_SECURITE} % et une moyenne au-dessus de celle de la plupart des admis : « réaliste ».` },
  ];
  const regleCategorie = (r, bloque) => REGLES_CATEGORIE.find((g) => g.si(r, bloque));
  // Moyenne des bulletins (sans la marge) sous 10 : message en tête de Ma liste, sans effet sur les catégories
  const MESSAGE_BAC = "Ta moyenne est sous 10 : toute admission sur Parcoursup dépend de l'obtention de ton bac. C'est ta priorité n° 1 cette année.";
  const alerteBac = (s) => (s && s.moyenneGenerale !== null && s.moyenneGenerale < 10 ? MESSAGE_BAC : null);

  /* ---------------------------------------------------------------- évaluation */
  function lieuDe(f) {
    if (f.pays !== "France") return "etranger";
    if (IDF.some((c) => f.ville.includes(c))) return "idf";
    if (f.ville.includes("Lyon")) return "lyon";
    return "regions";
  }
  function salaireMoyen(f) {
    const v = (f.metiers || []).map((id) => REF.metiers[id] && REF.metiers[id].salaire_fr && REF.metiers[id].salaire_fr.moyenne).filter((x) => typeof x === "number");
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }
  function evaluer(f, s, it) {
    const crit = { notes: critNotes(f, s), specialites: critSpecialites(f, s), langues: critLangues(f, s), tests: critTests(f, s), extra: critExtra(f, s), appreciations: critAppreciations(f, s) };
    const scores = Object.entries(crit).map(([k, c]) => (k === "notes" && typeof c.ecart === "number" ? clamp(74 + c.ecart * 16, 0, 100) : NIVEAUX[c.niveau].score)).filter((x) => x !== null);
    let faisabilite = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const bloque = Object.values(crit).some((c) => c.niveau === "bloquant");
    if (bloque) faisabilite = Math.min(faisabilite, 25);

    const p = it.prefs, d = it.domaines, ajust = []; let exclu = null;
    let interet = 55;
    if (it.repondues > 0) {
      const poids = [1, 0.8, 0.6, 0.45, 0.3], doms = f.domaines.slice(0, 5);
      const dom = doms.reduce((acc, k, i) => acc + (d[k] || 0) * poids[i], 0) / poids.slice(0, doms.length).reduce((a, b) => a + b, 0);
      const typeAff = it.types.size ? (it.types.has(f.type) ? 1 : 0.2) : 0.6;
      const attrs = [];
      const pf = f.profil || {};
      if (p.maths_niv !== undefined && pf.maths !== undefined) attrs.push(1 - Math.abs(p.maths_niv - pf.maths) / 3);
      if (p.ecrit_niv !== undefined && pf.ecrit !== undefined) attrs.push(1 - Math.abs(p.ecrit_niv - pf.ecrit) / 3);
      if (p.encadrement !== undefined && pf.encadrement !== undefined) attrs.push(1 - Math.abs((p.encadrement - 1) * 0.75 - pf.encadrement) / 3);
      if (p.pratique !== undefined && pf.pratique !== undefined) attrs.push(1 - Math.abs((p.pratique - 1) * 0.75 - pf.pratique) / 3);
      if (p.poly !== undefined && pf.poly !== undefined) attrs.push(1 - Math.abs(p.poly - pf.poly) / 2);
      const prof = attrs.length ? attrs.reduce((a, b) => a + b, 0) / attrs.length : 0.6;
      const met = it.metiers.size ? ((f.metiers || []).some((m) => it.metiers.has(m)) ? 1 : 0.25) : 0.6;
      interet = Math.round(100 * (0.4 * dom + 0.2 * typeAff + 0.25 * prof + 0.15 * met));
      if (it.types.size && !it.types.has(f.type)) ajust.push("type de formation non choisi");
      if (p.maths_niv !== undefined && pf.maths !== undefined && Math.abs(p.maths_niv - pf.maths) >= 2) ajust.push(pf.maths > p.maths_niv ? "beaucoup plus de maths que tu ne le souhaites" : "moins de maths que tu ne le souhaites");
      if (it.metiers.size && met < 1) ajust.push("débouchés éloignés de tes envies");
    }
    const etranger = f.pays !== "France";
    const anglaisSeul = /anglais/.test(f.langue) && !/français/.test(f.langue);
    const cout = (f.cout || {}).valeur_annuelle_eur;
    if (TYPE_GROUPES.prepa.includes(f.type)) {
      if (p.charge === 1) { interet -= 22; ajust.push("rythme de prépa très intense"); } else if (p.charge === 2) interet -= 6;
      if (f.type === "prepa_ecg" && f.option === "appro" && s.optionMaths !== "expertes" && s.niveau === "terminale") interet -= 6;
      // maths (sans les maths expertes) d'au moins 15, et maths expertes pas sous SEUIL_EXPERTES_FAIBLE
      if (f.type === "prepa_ecg" && f.option === "appli" && s.optionMaths === "expertes" && s.mathsMatiere === "maths" && (s.maths || 0) >= 15 && niveauExpertes(s.expertes) !== "renforcer") { interet -= 4; ajust.push("tes maths te permettent l'option approfondies"); }
    }
    if (etranger) {
      const voulus = (p.pays || []).filter((x) => x !== "aucun");
      if (p.etranger === 0 || (p.pays || []).includes("aucun")) exclu = "Tu as indiqué vouloir rester en France.";
      else if (p.etranger === 1) { interet -= 20; ajust.push("tu envisages surtout un échange"); }
      else if (p.etranger === 3) interet += 5;
      const NOMMES = ["Royaume-Uni", "Pays-Bas", "Italie", "Espagne", "Suisse", "Allemagne", "États-Unis", "Canada"];
      const okPays = (x) => (x === "autre_europe" ? !NOMMES.includes(f.pays) : f.pays.includes(x));
      if (voulus.length && !voulus.some(okPays)) { interet -= 15; ajust.push("pays non choisi"); }
    } else if (p.etranger === 3) interet -= 5;
    if (anglaisSeul && p.anglais !== undefined && p.anglais <= 2) { interet -= 15; ajust.push("cours entièrement en anglais"); }
    if (cout != null && p.budget_max !== undefined && cout > p.budget_max) {
      if (p.budget_max <= 5000 && cout > p.budget_max * 2) exclu = exclu || `Frais (≈ ${fmtEur(cout)}/an) au-delà de ton budget.`;
      else { interet -= 18; ajust.push("frais au-dessus de ton budget"); }
    }
    // distance au lycée de l'élève et envie de bouger (question « mobilite »)
    const dist = s.geo && f.__gps && !etranger ? km(s.geo, f.__gps) : null;
    if (etranger && p.mobilite === 0) exclu = exclu || "Tu as indiqué vouloir rester chez tes parents.";
    else if (etranger && p.mobilite === 1) { interet -= 12; ajust.push("à l'étranger, loin de chez toi"); }
    if (dist !== null && p.mobilite !== undefined) {
      if (p.mobilite === 0) { if (dist > 45) { interet -= dist > 120 ? 35 : 22; ajust.push(`à ${Math.round(dist)} km de chez toi`); } else interet += 6; }
      else if (p.mobilite === 1) { if (dist > 250) { interet -= 15; ajust.push(`à ${Math.round(dist)} km de chez toi`); } else interet += 2; }
    }
    const lieux = p.lieu || [];
    if (!etranger && lieux.length && !lieux.includes("partout") && !lieux.includes(lieuDe(f))) { interet -= 12; ajust.push("ville hors de tes choix"); }
    const sel = f.selectivite.niveau;
    if (p.ambition >= 4 && sel === "tres_haute") interet += 4;
    if (p.ambition !== undefined && p.ambition <= 2 && sel === "tres_haute") interet -= 8;
    if (crit.tests.aPreparer && crit.tests.aPreparer.length && p.tests !== undefined && p.tests <= 2) { interet -= 8; ajust.push("tests à préparer"); }
    if (p.long !== undefined && p.long <= 2 && f.duree_ans >= 5) interet -= 6;
    if (p.salaire >= 4) { const sm = salaireMoyen(f); if (sm && sm >= 46) interet += 4; }
    interet = clamp(Math.round(interet), 0, 100);

    const rep = repere(f, s), regle = regleCategorie(rep, bloque);
    rep.regle = regle.cle; rep.pourquoi = regle.texte;
    const categorie = regle.categorie;
    const pertinence = Math.round(it.repondues ? 0.6 * interet + 0.4 * faisabilite : faisabilite);
    return { f, crit, interet, faisabilite, pertinence, repere: rep, categorie, bloque, exclu, ajust, dist, raisons: raisons(f, s, it, crit, cout), actions: actions(f, s, crit) };
  }

  function raisons(f, s, it, crit, cout) {
    const out = [];
    if (it.repondues) {
      const top = f.domaines.filter((k) => (it.domaines[k] || 0) >= 0.55).slice(0, 2);
      if (top.length) out.push(`Correspond à ton intérêt pour ${top.map((k) => DOMAINES[k]).join(" et ")}.`);
      if (it.metiers.size) { const m = (f.metiers || []).filter((x) => it.metiers.has(x)).map((x) => REF.metiers[x] && REF.metiers[x].nom).filter(Boolean); if (m.length) out.push(`Mène vers des métiers que tu vises : ${m.slice(0, 2).join(", ").toLowerCase()}.`); }
    }
    if (crit.notes.niveau === "fort") out.push("Tes notes dépassent le repère des admis.");
    else if (crit.notes.niveau === "conforme") out.push("Tes notes sont au niveau du repère des admis.");
    if (crit.specialites.niveau === "fort") out.push("Tes spécialités correspondent aux attendus.");
    if (crit.appreciations.niveau === "fort") out.push("Tes appréciations sont très positives : un vrai atout sur Parcoursup.");
    if (crit.langues.niveau === "fort") out.push(`Ton anglais certifié couvre l'exigence (${crit.langues.requis}).`);
    if (cout != null && cout < 1000 && (it.prefs.budget_max || 0) <= 5000 && it.repondues) out.push("Formation publique quasi gratuite.");
    if (f.selectivite.niveau === "tres_haute") out.push("Très sélective : à combiner avec des vœux plus sûrs.");
    return out.slice(0, 4);
  }

  function actions(f, s, crit) {
    const a = [];
    const add = (cle, texte, mois, prio) => a.push({ cle, texte, mois, prio });
    const n = crit.notes;
    if (n.niveau === "renforcer" || n.niveau === "faible") add("notes", `Gagner environ ${fmt(Math.abs(n.ecart))} point(s) de moyenne${f.notes && f.notes.maths_cible && s.mathsMatiere !== "maths_complementaires" ? " (surtout en maths)" : ""} d'ici le prochain conseil de classe.`, "trimestre", 1);
    else if (n.niveau === "inconnu" && s.moyenneGenerale === null) add("bulletins", "Importer ou saisir tes bulletins pour affiner l'analyse.", "maintenant", 2);
    if (f.epreuves_anticipees && s.niveau !== "terminale") add("eaf", "Préparer sérieusement les épreuves anticipées de français et de maths de juin : elles comptent directement pour Sciences Po.", "avant juin", 1);
    for (const x of crit.specialites.actions || []) add("expertes", x + " (à demander au conseil de classe de première).", "avant juin", 1);
    if (crit.specialites.niveau === "bloquant") add("spe-" + f.id, `Vérifier auprès de la formation si ton profil est recevable sans : ${crit.specialites.manque.join(", ")}.`, "maintenant", 1);
    if (crit.appreciations.niveau === "faible" || crit.appreciations.niveau === "renforcer") add("appr", "Travailler les points relevés par tes professeurs (participation, régularité, comportement) : les appréciations pèsent dans les dossiers.", "trimestre", 1);
    const l = crit.langues;
    if (l.requis && l.niveau !== "fort") add("anglais", l.aCertifier ? `Passer une certification d'anglais (IELTS, TOEFL ou Cambridge) pour prouver le niveau ${l.requis}.` : `Travailler l'anglais puis passer une certification visant ${l.requis}.`, "certif", 1);
    for (const t of crit.tests.aPreparer || []) {
      if (/tmua/i.test(t)) add("tmua", "S'inscrire au TMUA et le préparer (annales officielles, chronométré). Sessions : 12–16 oct. 2026 ou 4–8 janv. 2027.", "tmua", 1);
      else if (/sesame|concours/i.test(t)) add("concours-postbac", "Préparer les concours post-bac (annales, maths, anglais, analyse documentaire, oraux).", "sesame", 1);
      else if (/lnat/i.test(t)) add("lnat", "S'inscrire au LNAT et s'entraîner (argumentation, compréhension de textes).", "certif", 1);
      else if (/tara|esat|step/i.test(t)) add("test-" + t.slice(0, 4), `Préparer le test d'admission ${t.split(" ")[0]} (sujets d'entraînement officiels).`, "oxbridge", 1);
      else if (/oral|entretien/i.test(t)) add("oral-" + f.id, `Préparer l'entretien (${f.etablissement}) : projet, actualité, simulations.`, "oral", 2);
      else if (/bocconi|sat|act/i.test(t)) add("sat", "Choisir entre test Bocconi, SAT ou ACT et le passer avant la date limite.", "certif", 1);
      else add("test-" + f.id, `Préparer : ${t}.`, "certif", 2);
    }
    if (crit.extra.niveau === "renforcer" || crit.extra.niveau === "faible") add("extra", "Choisir 1 ou 2 engagements suivis dans la durée, en lien avec le domaine (voir « Ton engagement extrascolaire » dans Mon plan).", "maintenant", 2);
    if (f.plateforme === "parcoursup" && (f.dossier_poids === "moyen" || f.dossier_poids === "fort" || f.type === "college_universitaire")) add("activites-ps", "Remplir la rubrique Parcoursup « Activités et centres d'intérêt » (4 sous-rubriques, 1 500 caractères chacune) avant la confirmation des vœux.", "parcoursup", 2);
    if (f.plateforme === "commonapp") add("commonapp-act", "Lister tes 10 activités pour la Common App (rôle, heures, résultats chiffrés) et préparer les essais.", "propre", 1);
    if (f.plateforme === "ucas") add("supercurr", "Nourrir la 3e question du personal statement : lectures, MOOC, conférences ou concours liés à la matière (« super-curricular »).", "maintenant", 2);
    if (f.plateforme === "ucas") add("ps", "Rédiger le personal statement UCAS (3 questions) et demander la référence à un professeur.", f.calendrier && f.calendrier.some((c) => c.date === "2026-10-15") ? "oxbridge" : "ucas", 1);
    else if (f.plateforme === "parcoursup") add("pm", "Rédiger le projet de formation motivé pour Parcoursup.", "parcoursup", 2);
    else add("dossier-" + f.id, `Préparer le dossier de candidature ${f.etablissement} (relevés, lettre ou essai).`, "propre", 2);
    return a;
  }

  /* ---------------------------------------------------------------- filière */
  // Même formation dans plusieurs établissements : prépas groupées par famille, sinon même type + même intitulé normalisé
  // « CPGE ECG – Maths approfondies + HGG » (ancienne base) et « CPGE - ECG - Mathématiques approfondies + HGG » (Parcoursup) donnent la même clé
  const normFil = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\bmathematiques\b/g, "maths").replace(/[^a-z0-9+]+/g, " ")
    .replace(/\b(de|d|du|des|la|le|l|les|en|et)\b/g, " ").replace(/\s+/g, " ").trim();
  // Clé « même formation » : code de filière Parcoursup (L1-Droit, DE-INF, PASS, ECG-MA-HGG…) quand on l'a,
  // sinon intitulé de base (sans parcours, option, campus ni rentrée)
  const nmcDe = (f) => f.__nmc || (f.__gen && f.__gen.fam && f.__gen.fam.nmc) || null;
  const baseNom = (f) => f.type + "|" + normFil(String(f.nom).replace(/^D\.?\s?E\.?\s/i, "Diplôme d'État ")
    .split(/\s+[–—+]\s+|\s+-\s+(?=parcours|option|rentr|campus|site|r[ée]serv)|\s*\(/i)[0]);
  let BASE_NMC = {};
  function intitule(f) {
    if (f.__fil) return f.__fil;
    const nmc = nmcDe(f), b = baseNom(f);
    let k;
    if (nmc) k = "nmc:" + nmc;
    else if (/\bPASS\b|acc[eè]s sp[ée]cifique sant[ée]/i.test(f.nom)) k = "nmc:PASS";
    else if (/\bL\.?AS\b|licence acc[eè]s sant[ée]/i.test(f.nom)) k = "nmc:LAS";
    else if (/\bECG\b/.test(f.nom)) k = "nmc:ECG-" + (/appliqu/i.test(f.nom) ? "Mapp" : "MA") + (/HGG/.test(f.nom) ? "-HGG" : /ESH/.test(f.nom) ? "-ESH" : "");
    else k = BASE_NMC[b] ? "nmc:" + BASE_NMC[b] : "fil:" + b;
    return (f.__fil = k);
  }
  // Fiches sans code Parcoursup : on reprend le code le plus fréquent parmi les fiches de même intitulé de base
  function lierFilieres(formations) {
    const cpt = {};
    for (const f of formations) { const n = nmcDe(f); if (!n) continue; const b = baseNom(f); (cpt[b] = cpt[b] || {})[n] = (cpt[b][n] || 0) + 1; }
    BASE_NMC = {};
    for (const [b, c] of Object.entries(cpt)) BASE_NMC[b] = Object.entries(c).sort((x, y) => y[1] - x[1])[0][0];
    for (const f of formations) { delete f.__fil; delete f.__voie; }
  }
  // regroupement à l'affichage : famille de prépas (même niveau d'exigence) si elle existe, sinon même intitulé
  const filiere = (f) => (f.famille ? "fam:" + f.famille.id : intitule(f));

  /* ---------------------------------------------------------------- voies (types de formation précis) */
  // « Licence » regroupe trop de choses : on la découpe par grande mention, à partir du code de filière Parcoursup
  const VOIE_LABEL = {
    "lic-eco": "Licence d'éco-gestion", "lic-droit": "Licence de droit ou science po", "lic-mi": "Licence de maths ou d'informatique",
    "lic-langues": "Licence de langues", "lic-shs": "Licence de lettres ou sciences humaines", "lic-sciences": "Licence de sciences",
    "lic-sante": "PASS ou LAS (santé)", "lic-staps": "Licence STAPS", "lic-arts": "Licence d'arts",
  };
  const NMC_VOIE = {};
  [["lic-eco", "L1-Economie L1-EG L1-Gestion L1-AES L1-MIASHS"], ["lic-droit", "L1-Droit L1-SCIPO L1-AP L1-DI"],
   ["lic-mi", "L1-Math L1-IMaths L1-Info L1-MPCI L1-MPSI"], ["lic-langues", "L1-LLCER L1-LEA L1-SL"],
   ["lic-shs", "L1-Lettres L1-Histoire L1-Philosophie L1-Sociologie L1-Psychologie L1-SEF L1-GA L1-IC L1-HAA L1-ST L1-TP L1-TC"],
   ["lic-arts", "L1-Arts L1-Ciné L1-Musicologie L1-AS"], ["lic-sante", "PASS LAS"], ["lic-staps", "L1-STAPS"],
   ["lic-sciences", "L1-SV L1-SVT L1-PC L1-Physique L1-Chimie L1-Méca L1-EEEA L1-ISV"]]
    .forEach(([v, l]) => l.split(" ").forEach((c) => { NMC_VOIE[c] = v; }));
  const DOM_VOIE = { economie: "lic-eco", gestion_commerce: "lic-eco", finance: "lic-eco", droit: "lic-droit", sciences_politiques: "lic-droit",
    maths: "lic-mi", data_informatique: "lic-mi", langues: "lic-langues", international: "lic-langues", sante: "lic-sante",
    vivant: "lic-sciences", ingenierie_tech: "lic-sciences", arts: "lic-arts", sport: "lic-staps" };
  function voie(f) {
    if (f.__voie) return f.__voie;
    let v = f.type;
    if (f.type === "licence") { const k = intitule(f).replace(/^nmc:/, ""); v = NMC_VOIE[k] || DOM_VOIE[(f.domaines || [])[0]] || "lic-shs"; }
    return (f.__voie = v);
  }
  let TYPE_LABELS = {};
  const voieLabel = (f) => VOIE_LABEL[voie(f)] || TYPE_LABELS[f.type] || f.type_label || f.type;

  /* ---------------------------------------------------------------- élève décidé ou indécis */
  // Mesuré sur le questionnaire : nombre de domaines nettement au-dessus des autres et nombre de types cochés
  // domaines voisins (éco et finance, maths et informatique…) : s'y intéresser à la fois n'est pas de l'hésitation
  const FAM_DOM = { economie: "eco", finance: "eco", gestion_commerce: "eco", maths: "sci", data_informatique: "sci", ingenierie_tech: "sci",
    droit: "droit", sciences_politiques: "droit", langues: "lang", communication: "lang", sciences_humaines: "shs", arts: "arts", sante: "sante", vivant: "sante", sport: "sport" };
  function certitude(it) {
    if (!it || !it.repondues) return { niveau: "inconnu", top: [] };
    const doms = Object.entries(it.domaines).filter(([k]) => k !== "international").sort((a, b) => b[1] - a[1]);
    const forts = new Set(doms.filter(([, v]) => v >= 0.75).map(([k]) => FAM_DOM[k] || k)).size, nTypes = it.types.size;
    const niveau = forts <= 1 || (forts === 2 && nTypes === 1) ? "decide" : forts >= 4 || (forts >= 3 && nTypes !== 1) ? "indecis" : "intermediaire";
    return { niveau, top: doms.filter(([, v]) => v >= 0.6).slice(0, 3).map(([k]) => k) };
  }
  const listeFr = (l) => (l.length <= 1 ? l.join("") : l.slice(0, -1).join(", ") + " et " + l[l.length - 1]);
  const aLe = (t) => (/^le /.test(t) ? "au " + t.slice(3) : /^les /.test(t) ? "aux " + t.slice(4) : "à " + t);
  const minus = (t) => (/^[A-ZÉ][A-ZÉ]/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1));

  /* ---------------------------------------------------------------- garde-fou des listes de vœux */
  // Une formation notée n'entre dans la liste de vœux (ni comme ancre des propositions à l'étranger) que si ses
  // chiffres et sa description sont assez sûrs, et si elle s'adresse aux bacheliers généraux. Elle reste notée,
  // visible dans le catalogue et sur sa fiche, et l'élève peut toujours l'ajouter lui-même à ses vœux.
  const SEUIL_BAC_GENERAL = 20;   // part minimale (%) de bacheliers généraux parmi les admis 2025 (stats.json, pct_bg)
  const CATEGORIES_BAC_PRO = ["Certificats de spécialisation et FCIL"];   // catégories Parcoursup (tf) visant les bacs pro
  // Nouvelles formations 2026 (sans statistiques) : jamais dans la liste de 10 vœux, proposées à part (nouvelles()),
  // et seulement si leur catégorie Parcoursup (tf) vise les bacheliers généraux (sans statistiques, pas de pct_bg).
  const MAX_NOUVELLES = 3;
  const CATEGORIES_NOUVELLES = ["Licence", "Licence sélective", "CPGE", "Formations des écoles d'ingénieurs",
    "Formations des écoles de commerce et de management", "Etudes de santé", "Sciences Po - Instituts d'études politiques",
    "C.M.I - Cursus Master en Ingénierie", "DEUST", "Formations d'art, de design et du spectacle vivant"];
  const HORS_LISTE = {
    sans_stats: "Statistiques d'admission non publiées : aucun repère d'admission.",
    filiere_a_relire: "Description de la filière encore à vérifier.",
    bac_pro: "Formation qui accueille surtout des bacheliers professionnels.",
    nouvelle_2026: "Nouvelle formation 2026 : proposée à part, dans « Nouvelles à la rentrée 2026 ».",
    nouvelle_hors_categories: "Nouvelle formation 2026 d'une catégorie qui ne vise pas d'abord les bacheliers généraux.",
  };
  // Règles qui écartent la formation des listes (tableau vide : la formation peut y entrer)
  function reglesHorsListe(f) {
    if (f.pays !== "France") return [];
    const r = [];
    if (f.stats === "nouvelle_2026") {
      r.push("nouvelle_2026");
      if (!(f.__tf || []).some((t) => CATEGORIES_NOUVELLES.includes(t))) r.push("nouvelle_hors_categories");
    } else if (!f.admission || typeof f.admission.taux !== "number") r.push("sans_stats");
    if (f.__gen && f.__gen.fam && f.__gen.fam.valide === false) r.push("filiere_a_relire");
    if ((f.__tf || []).some((t) => CATEGORIES_BAC_PRO.includes(t)) || (typeof f.__pctBG === "number" && f.__pctBG < SEUIL_BAC_GENERAL)) r.push("bac_pro");
    return r;
  }
  const horsListe = (f) => reglesHorsListe(f).length > 0;

  /* ---------------------------------------------------------------- wishlist */
  // 10 vœux Parcoursup (formations en France). Diversité adaptée au profil : un élève décidé concentre ses vœux
  // sur son projet, un élève indécis les répartit sur plus de types. Les formations à l'étranger sont proposées à part.
  function wishlist(resultats, n = 10, it = null) {
    const ok = resultats.filter((x) => !x.exclu && !x.bloque && x.f.pays === "France" && !horsListe(x.f));
    const cert = certitude(it);
    const V = (x) => voie(x.f);
    const parEtab = {}, parType = {};
    // voies « cœur de projet » : celles des 5 formations les plus pertinentes ; la première est la voie principale
    const top5 = ok.slice().sort((a, b) => b.pertinence - a.pertinence).slice(0, 5);
    const coeur = new Set(top5.map(V)), principal = top5.length ? V(top5[0]) : null;
    const CAPS = { decide: [5, 3, 2], intermediaire: [4, 3, 2], indecis: [3, 2, 2], inconnu: [3, 3, 2] }[cert.niveau];
    let bonusType = 0;
    const maxType = (v) => (v === principal ? CAPS[0] : coeur.has(v) ? CAPS[1] : CAPS[2]) + bonusType;
    // plancher : pas de vœu « pour la diversité » à plus d'1 point sur 5 de la formation la plus pertinente
    const topP = top5.length ? top5[0].pertinence : 0;
    let plancher = top5.length ? topP - 20 : -Infinity;
    const choisis = [];
    const oxbridge = (x) => /Oxford|Cambridge/.test(x.f.etablissement);
    const parFil = {}, parFam = {};
    let maxFil = 2;   // au plus 2 établissements pour une même formation, de catégories différentes
    const fam = (x) => (x.f.famille ? x.f.famille.id : null);
    const fil = (x) => intitule(x.f);
    const peut = (x) => (parEtab[x.f.etablissement] || 0) < 2 && (parFil[fil(x)] || 0) < maxFil && (!fam(x) || (parFam[fam(x)] || 0) < 2)
      && !choisis.some((c) => fil(c) === fil(x) && c.categorie === x.categorie && maxFil <= 2) && (parType[V(x)] || 0) < maxType(V(x)) && !choisis.includes(x)
      && !(oxbridge(x) && choisis.some((c) => oxbridge(c)));
    const prend = (x) => { choisis.push(x); parEtab[x.f.etablissement] = (parEtab[x.f.etablissement] || 0) + 1; parType[V(x)] = (parType[V(x)] || 0) + 1; parFil[fil(x)] = (parFil[fil(x)] || 0) + 1; if (fam(x)) parFam[fam(x)] = (parFam[fam(x)] || 0) + 1; };
    // score de choix : pertinence, bonus « cœur de projet », malus pour chaque vœu déjà pris dans la même voie ;
    // un élève indécis reçoit en priorité les formations qui laissent des portes ouvertes (polyvalence)
    const poly = (x) => (cert.niveau === "indecis" ? 3 * Math.min(2, (x.f.profil || {}).poly || 0) + (/^prepa|double_licence/.test(x.f.type) ? 3 : 0) : 0);
    const cle = (x) => x.pertinence + (coeur.has(V(x)) ? 6 : 0) - 6 * (parType[V(x)] || 0) + poly(x);
    const meilleur = (liste) => { let b = null, bv = -Infinity; for (const x of liste) { if (x.pertinence < plancher || !peut(x)) continue; const v = cle(x); if (v > bv) { bv = v; b = x; } } return b; };

    // 1. vœux « découverte » : une voie que l'élève n'a pas cochée et qui n'est pas dans son cœur de projet,
    //    mais dont la note reste proche des meilleures (au plus 0,75 point sur 5 d'écart)
    const nbDec = { decide: 1, intermediaire: 1, indecis: 2, inconnu: 0 }[cert.niveau];
    const decouvertes = new Map();
    const typesCoches = it && it.types ? it.types : new Set();
    const candDec = ok.filter((x) => !coeur.has(V(x)) && x.pertinence >= topP - 15 && (!typesCoches.size || !typesCoches.has(x.f.type)))
      .sort((a, b) => b.pertinence - a.pertinence);
    const voiesDec = new Set();
    for (const x of candDec) {
      if (decouvertes.size >= nbDec) break;
      if (voiesDec.has(V(x)) || x.categorie === "ambitieux" || !peut(x)) continue;   // une découverte doit rester atteignable
      voiesDec.add(V(x)); decouvertes.set(x.f.id, x);
    }

    // 2. vœux principaux, catégorie par catégorie (3 sûrs, 3 ambitieux, 4 réalistes, moins les découvertes)
    const nDec = { securite: 0, realiste: 0, ambitieux: 0 };
    decouvertes.forEach((x) => { nDec[x.categorie]++; });
    const quotas = [["securite", 3], ["ambitieux", 3], ["realiste", 4]].map(([c, q]) => [c, Math.max(0, q - nDec[c])]);
    const alertes = [];
    for (const [cat, q] of quotas) {
      const dispo = ok.filter((x) => x.categorie === cat && !decouvertes.has(x.f.id));
      let k = 0;
      while (k < q) { const x = meilleur(dispo); if (!x) break; prend(x); k++; }
      if (k < q) {
        if (cat === "securite") {
          plancher -= 10;
          while (k < q) { const x = meilleur(ok.filter((y) => y.categorie === "realiste" && !decouvertes.has(y.f.id))); if (!x) break; prend(x); k++; }
          plancher += 10;
          alertes.push("Pas assez de vœux vraiment sûrs dans tes domaines : complète avec des licences de ton académie ou des formations moins demandées (taux d'accès d'au moins 50 %).");
        } else alertes.push(`Moins de ${q} vœux « ${CAT_LABEL[cat].toLowerCase()} » disponibles avec tes critères.`);
      }
    }
    for (const x of decouvertes.values()) if (choisis.length < n && peut(x)) prend(x); else decouvertes.delete(x.f.id);
    const reste = ok.filter((x) => !decouvertes.has(x.f.id) || choisis.includes(x));
    while (choisis.length < n) { const x = meilleur(reste); if (!x) break; prend(x); }
    // trop peu de voies différentes : on relâche la diversité plutôt que de rendre une liste incomplète
    if (choisis.length < n) { bonusType = 2; maxFil = 3; plancher -= 10; while (choisis.length < n) { const x = meilleur(ok); if (!x) break; prend(x); } }
    if (choisis.length < n) { bonusType = 10; plancher = -Infinity; while (choisis.length < n) { const x = meilleur(ok); if (!x) break; prend(x); } }

    const ps = choisis.filter((x) => x.f.plateforme === "parcoursup").length;
    if (ps > 10) alertes.push("Parcoursup limite à 10 vœux (plus des sous-vœux) : regroupe ou réduis.");

    // explication en une ou deux phrases
    const compteV = {};
    choisis.forEach((x) => { if (!decouvertes.has(x.f.id)) compteV[V(x)] = (compteV[V(x)] || 0) + 1; });
    const ordreV = Object.entries(compteV).sort((a, b) => b[1] - a[1]).map(([v]) => v);
    const lib = (v) => { const x = choisis.find((y) => V(y) === v); return x ? minus(voieLabel(x.f)) : v; };
    const doms = cert.top.map((k) => (DOMAINES[k] || k).toLowerCase());
    let explication = "";
    if (!choisis.length) explication = "";
    else if (cert.niveau === "inconnu") explication = `Sans tes réponses au questionnaire, on a réparti tes vœux sur ${ordreV.length} types de formations. Réponds-y pour une liste vraiment personnalisée.`;
    else if (cert.niveau === "decide") explication = `Tes réponses montrent un intérêt net pour ${doms[0] || "un domaine précis"} : on a concentré tes vœux sur ${lib(ordreV[0])}${ordreV.length > 1 ? `, avec ${listeFr(ordreV.slice(1, 3).map(lib))} comme solution${ordreV.length > 2 ? "s" : ""} de repli` : ""}.`;
    else if (cert.niveau === "indecis") explication = `Tu sembles hésiter entre ${listeFr(doms.length ? doms : ["plusieurs domaines"])} : on a réparti tes vœux sur ${ordreV.length} types de formations pour garder un maximum de portes ouvertes.`;
    else explication = `Tu t'intéresses surtout ${aLe(listeFr(doms.slice(0, 2)))} : tes vœux se partagent entre ${listeFr(ordreV.slice(0, 3).map(lib))}${ordreV.length > 3 ? ", plus quelques autres pistes" : ""}.`;
    const dec = [...decouvertes.values()];
    if (dec.length) explication += ` ${dec.length > 1 ? "Deux vœux « découverte » t'ouvrent" : "Un vœu « découverte » t'ouvre"} à ${listeFr(dec.map((x) => minus(voieLabel(x.f))))}.`;
    const raisonDec = (x) => {
      const t = minus(voieLabel(x.f));
      const d = (x.f.domaines || []).filter((k) => cert.top.includes(k)).map((k) => (DOMAINES[k] || k).toLowerCase());
      return typesCoches.size
        ? `Tu n'avais pas coché ce type de formation (${t}), mais il correspond bien à ${d.length ? "ton intérêt pour " + listeFr(d.slice(0, 2)) : "ton profil"}.`
        : `Un type de formation auquel tu n'as peut-être pas pensé (${t}), mais qui correspond bien à ${d.length ? "ton intérêt pour " + listeFr(d.slice(0, 2)) : "ton profil"}.`;
    };
    return { liste: choisis, protection: protection(choisis), alertes, certitude: cert, explication,
      decouvertes: new Map(dec.map((x) => [x.f.id, raisonDec(x)])) };
  }

  /* ---------------------------------------------------------------- protection de la liste */
  // Repère sans probabilité globale : pas de « chances d'avoir au moins une admission », car les vœux ne sont pas
  // indépendants (les formations lisent le même dossier). Avec la table des catégories (REGLES_CATEGORIE), un vœu
  // « sécurité » est solide par construction (taux d'accès d'au moins 50 % et moyenne au-dessus de la plupart des
  // admis, ou taux d'au moins 85 % et moyenne dans celle des admis ; jamais de point bloquant) : on compte simplement
  // les vœux « sécurité ».
  const PROTECTION_REPERE = "Aucun site ne peut calculer tes chances exactes d'admission : ces repères viennent des résultats Parcoursup 2025.";
  function protection(liste) {
    const nbSecurite = liste.filter((x) => x.categorie === "securite").length;
    const r = (niveau, message) => ({ nbSecurite, niveau, message });
    if (liste.length && liste.every((x) => x.repere && x.repere.sansNotes))
      return r("sans_notes", "Renseigne tes bulletins : sans tes notes, on ne peut pas savoir quels vœux sont sûrs pour toi.");
    if (nbSecurite === 0) return r("aucun", "Attention : ta liste n'a aucun vœu vraiment sûr. Ajoute au moins deux formations où ton profil est au-dessus de la plupart des admis, sinon tu risques de n'avoir aucune proposition.");
    if (nbSecurite === 1) return r("insuffisant", "Ta liste n'a qu'un seul vœu vraiment sûr : ajoutes-en au moins un autre.");
    if (nbSecurite === 2) return r("minimum", "Ta liste a 2 vœux sûrs. C'est un minimum : un troisième te protégerait davantage.");
    return r("bon", `Ta liste a ${nbSecurite} vœux sûrs : garde-les, ce sont eux qui te protègent si les autres ne passent pas.`);
  }

  /* ---------------------------------------------------------------- nouvelles formations 2026 */
  // Section « Nouvelles à la rentrée 2026 », sous la liste de 10 vœux : au plus n formations « nouvelle_2026 »,
  // triées uniquement par intérêt (sans chiffres, leur faisabilité est artificiellement haute), sans catégorie ni
  // repère d'admission. Mêmes règles du garde-fou que la liste (filière à relire, liste blanche des catégories), sauf la
  // règle « nouvelle_2026 » elle-même. Sans réponse au questionnaire, l'intérêt ne distingue rien : section vide.
  function nouvelles(resultats, it, n = MAX_NOUVELLES) {
    if (!it || !it.repondues) return [];
    return resultats.filter((x) => !x.exclu && !x.bloque && x.f.pays === "France" && x.f.stats === "nouvelle_2026"
      && reglesHorsListe(x.f).every((r) => r === "nouvelle_2026"))
      .sort((a, b) => b.interet - a.interet)   // tri stable : à intérêt égal, l'ordre de recommander() est conservé
      .slice(0, n);
  }

  /* ---------------------------------------------------------------- étranger */
  // Coût de la vie étudiant par mois (hors frais de scolarité), en euros
  const COUT_VIE = {
    "Royaume-Uni": { min: 1370, max: 1790, texte: "1 171 £/mois hors Londres, 1 529 £/mois à Londres : montants exigés pour le visa étudiant", source: "https://www.gov.uk/student-visa/money", statut: "officiel" },
    "Allemagne": { min: 992, max: 992, texte: "992 €/mois : montant du compte bloqué exigé pour le visa étudiant", source: "https://www.expatrio.com/about-germany/blocked-amount-2025", statut: "source_secondaire" },
    "Canada": { min: 1220, max: 1220, texte: "23 448 $ CA/an hors Québec : montant exigé pour le permis d'études à partir du 1er septembre 2026 (≈ 1 220 €/mois au taux indicatif 1 $ CA = 0,63 €)", source: "https://www.sfu.ca/students/isap/news/newsletters/new-financial-requirements-for-study-permit-application--effecti.html", statut: "source_secondaire" },
    "Pays-Bas": { min: 1200, max: 1800, texte: "1 200 à 1 800 €/mois selon l'université d'Amsterdam (AUAS), un peu moins hors Amsterdam", source: "https://www.amsterdamuas.com/study/international-admissions/financial-matters/cost-of-living", statut: "source_secondaire" },
    "Belgique": { min: 900, max: 1200, statut: "estimation" }, "Italie": { min: 850, max: 1200, statut: "estimation" },
    "Espagne": { min: 900, max: 1200, statut: "estimation" }, "Portugal": { min: 700, max: 1000, statut: "estimation" },
    "Autriche": { min: 1000, max: 1300, statut: "estimation" }, "Suisse": { min: 1800, max: 2500, statut: "estimation" },
    "Irlande": { min: 1300, max: 1800, statut: "estimation" }, "Danemark": { min: 1100, max: 1500, statut: "estimation" },
    "Suède": { min: 950, max: 1300, statut: "estimation" }, "Norvège": { min: 1200, max: 1600, statut: "estimation" },
    "États-Unis": { min: 1500, max: 2500, statut: "estimation" },
  };
  const coutVie = (f) => {
    const c = COUT_VIE[f.pays]; if (!c) return null;
    if (f.pays === "Royaume-Uni") return Object.assign({}, c, /londres|london/i.test(f.ville) ? { min: 1790, max: 1790 } : { min: 1370, max: 1370 });
    return c;
  };
  const prochaineDate = (f, auj) => (f.calendrier || []).map((c) => c.date).filter((d) => d && d >= auj).sort()[0] || null;
  const toutesPassees = (f, auj) => (f.calendrier || []).some((c) => c.date) && !prochaineDate(f, auj);
  // ressemblance entre une formation étrangère et un vœu français : domaines (pondérés par leur rang) et métiers communs
  const MOTS_CLES = [["eco", /econom/i], ["droit", /\blaw\b|\bllb\b|droit|rechts/i], ["maths", /math/i], ["info", /computer|informati|data/i],
    ["gestion", /management|business|gestion|commerce/i], ["scpo", /politi|international relations|relations internationales/i], ["psycho", /psycho/i], ["medecine", /medic|medec|sante|health/i]];
  const motsDe = (f) => { const t = normFil(f.nom); return new Set(MOTS_CLES.filter(([, r]) => r.test(t)).map(([k]) => k)); };
  function ressemblance(a, b) {
    const ma0 = motsDe(a), mb0 = motsDe(b), commun = [...ma0].some((k) => mb0.has(k));
    const da = a.domaines || [], db = b.domaines || [];
    let s = 0, t = 0;
    da.forEach((k, i) => { const w = 1 / (i + 1); t += w; const j = db.indexOf(k); if (j >= 0) s += w * (1 / (1 + j * 0.5)); });
    const dom = t ? s / t : 0;
    const ma = new Set(a.metiers || []), mb = b.metiers || [];
    const met = ma.size && mb.length ? mb.filter((m) => ma.has(m)).length / Math.min(ma.size, mb.length) : 0;
    return 0.65 * dom + 0.15 * met + (commun ? 0.2 : 0);
  }

  // Propositions à l'étranger, rattachées chacune à un vœu français (« l'équivalent à l'étranger »)
  function etranger(resultats, W, it, auj = new Date().toISOString().slice(0, 10)) {
    const p = (it && it.prefs) || {};
    if (p.etranger === 0 || (p.pays || []).includes("aucun") || p.mobilite === 0) return { mode: "non", liste: [] };
    if (p.etranger === 1) {
      // « seulement un échange » : formations françaises très ouvertes à l'international, dans les mêmes voies que les vœux
      const voies = new Set(W.liste.map((x) => voie(x.f))), pris = new Set(W.liste.map((x) => x.f.id));
      const liste = resultats.filter((x) => !x.exclu && !x.bloque && x.f.pays === "France" && !horsListe(x.f) && !pris.has(x.f.id) && voies.has(voie(x.f)) && ((x.f.profil || {}).international || 0) >= 2)
        .sort((a, b) => b.pertinence - a.pertinence).slice(0, 3);
      return { mode: "echange", liste: liste.map((x) => ({ x })) };
    }
    const n = p.etranger === 3 ? 5 : p.etranger === 2 ? 3 : 2;
    const budget = p.budget_max, budgetSerre = budget !== undefined && budget <= 5000;
    const anglaisFragile = p.anglais !== undefined && p.anglais <= 2;
    const ancres = W.liste.length ? W.liste : resultats.filter((x) => !x.exclu && x.f.pays === "France" && !horsListe(x.f)).slice(0, 10);
    // seules exclusions acceptées : le budget (on propose alors les options les moins chères du pays)
    const cands = resultats.filter((x) => x.f.pays !== "France" && !x.bloque && (!x.exclu || /^Frais/.test(x.exclu)) && !toutesPassees(x.f, auj))
      .map((x) => {
        const proches = ancres.map((a) => ({ a, s: ressemblance(x.f, a.f) + a.pertinence / 10000 })).filter((o) => o.s >= 0.35).sort((u, v) => v.s - u.s);
        const best = proches.length ? proches[0].a : null, bs = proches.length ? proches[0].s : 0;
        const frais = (x.f.cout || {}).valeur_annuelle_eur;
        const francais = /français/.test(x.f.langue || "");
        let score = x.pertinence + 30 * bs + (anglaisFragile && francais ? 12 : 0);
        if (budget !== undefined && frais != null && frais > budget) score -= Math.min(25, 8 + (frais - budget) / 2000);
        return { x, ancre: best, proches, sim: bs, frais, francais, score };
      })
      .filter((c) => c.ancre && c.sim >= 0.35);
    // Royaume-Uni avec un budget serré : on le garde, mais seulement avec les universités les moins chères pour ce profil
    if (budgetSerre) {
      const uk = cands.filter((c) => c.x.f.pays === "Royaume-Uni" && c.frais != null).sort((a, b) => a.frais - b.frais);
      if (uk.length) {
        const pertMax = Math.max(...uk.map((c) => c.x.pertinence));
        const pertinents = uk.filter((c) => c.x.pertinence >= pertMax - 20);
        const seuil = (pertinents[0] || uk[0]).frais + 3000;
        for (const c of cands) if (c.x.f.pays === "Royaume-Uni" && (c.frais == null || c.frais > seuil)) c.score = -Infinity;
        for (const c of cands) if (c.x.f.pays === "Royaume-Uni" && c.score > -Infinity) { c.score += 25; c.moinsCher = true; }
      }
    }
    const tri = cands.filter((c) => c.score > -Infinity).sort((a, b) => b.score - a.score);
    const choix = [], parPays = {}, parEtab = {}, parAncre = {};
    const ox = (c) => /Oxford|Cambridge/.test(c.x.f.etablissement);
    // un vœu français sert d'ancre à 2 propositions au plus : sinon on prend l'ancre suivante la plus proche
    const ancreLibre = (c) => { const o = c.proches.find((q) => (parAncre[q.a.f.id] || 0) < 2); return o ? o.a : null; };
    const peut = (c) => (parPays[c.x.f.pays] || 0) < 2 && !parEtab[c.x.f.etablissement] && ancreLibre(c)
      && !(ox(c) && choix.some(ox)) && !(c.x.f.plateforme === "ucas" && choix.filter((d) => d.x.f.plateforme === "ucas").length >= 5);
    for (const c of tri) { if (choix.length >= n) break; if (peut(c)) { c.ancre = ancreLibre(c); choix.push(c); parPays[c.x.f.pays] = (parPays[c.x.f.pays] || 0) + 1; parEtab[c.x.f.etablissement] = 1; parAncre[c.ancre.f.id] = (parAncre[c.ancre.f.id] || 0) + 1; } }
    // au moins 2 pays différents quand c'est possible
    if (choix.length >= 2 && new Set(choix.map((c) => c.x.f.pays)).size === 1) {
      const autre = tri.find((c) => c.x.f.pays !== choix[0].x.f.pays && !parEtab[c.x.f.etablissement]);
      if (autre) choix[choix.length - 1] = autre;
    }
    const liste = choix.map((c) => {
      const d = prochaineDate(c.x.f, auj);
      const jours = d ? Math.round((new Date(d) - new Date(auj)) / 86400000) : null;
      return { x: c.x, ancre: c.ancre, frais: c.frais, vie: coutVie(c.x.f), francais: c.francais, moinsCher: !!c.moinsCher, date: d, bientot: jours !== null && jours <= 30, jours };
    });
    return { mode: p.etranger === 3 ? "oui" : "decouverte", liste, budgetSerre, anglaisFragile };
  }

  function recommander(formations, profil, questionnaire, reponses) {
    const s = statsProfil(profil), it = interets(questionnaire, reponses);
    const res = formations.map((f) => evaluer(f, s, it)).sort((a, b) => b.pertinence - a.pertinence);
    return { stats: s, interets: it, resultats: res };
  }

  function km(a, b) {
    const R = 6371, rad = (x) => (x * Math.PI) / 180, dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  window.CapEngine = { reglesHorsListe, horsListe, HORS_LISTE, MAX_NOUVELLES, CATEGORIES_NOUVELLES, nouvelles, SEUIL_BAC_GENERAL, km, filiere, intitule, lierFilieres, voie, voieLabel, certitude, etranger, COUT_VIE, init, recommander, evaluer, statsProfil, POIDS_PERIODE, NIVEAUX_BULLETINS, MESSAGE_SANS_MOYENNE, MESSAGE_NOTE_IMPOSSIBLE, notesImpossibles, NOTE_MIN, NOTE_MAX, MESSAGE_MATHS_COMPL, libelleMaths, SEUIL_EXPERTES_FAIBLE, SEUIL_EXPERTES_FORT, interets, wishlist, protection, PROTECTION_REPERE, repere, REGLES_CATEGORIE, MARGE_BULLETIN, SEUIL_AU_DESSUS, SEUIL_EN_DESSOUS, SEUIL_TAUX_SECURITE, SEUIL_TAUX_AMBITIEUX, SEUIL_TAUX_TRES_OUVERT, MESSAGE_BAC, alerteBac, POSITION_LABEL, LIMITE_REPERE, METHODE_POSITION, niveauCertif, percentileAdmis, SPECIALITES, SPEC_NOM, SPEC_COURT, DOMAINES, NIVEAUX, SEL_LABEL, CAT_LABEL, CECRL, fmt, fmtEur, REF };
})();
