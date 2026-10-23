/*
 * js/app.js : application (routeur et vues).
 *
 * Rôle : charger les données (blocs intégrés à la page, sinon data/*.json), construire le
 * catalogue (fiches Mon Plan Sup + Parcoursup), gérer la navigation par adresse (#accueil,
 * #liste, #plan, #explorer, #profil, #formation-…, #donnees) et afficher chaque page : accueil,
 * profil et questionnaire, Ma liste, fiche formation, catalogue, Mon plan, Mes données.
 * Gère aussi les clics et la saisie, et enregistre l'état avec CapStore.
 *
 * Utilise : window.CapStore, window.CapBulletin, window.CapEngine.
 * Ordre de chargement : 4e et dernier des scripts de js/ (démarre l'application).
 */
/* Mon Plan Sup — application (routeur + vues), version 2. */
(function () {
  "use strict";
  const E = window.CapEngine, S = window.CapStore, B = window.CapBulletin;
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const DANS_IFRAME = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();

  let DATA = null, QUEST = null, METIERS = null, POURS = null, EXTRA = null, etat = S.lire();
  // Base fusionnée : CAT = toutes les fiches affichées (ancienne base + Parcoursup), sans doublon certain
  let CAT = [], CATBY = {}, PSBY = {}, FU = null, ALIAS = {}, STATS = {}, STCOLS = [], STCONS = null, STATUTS_ST = {}, MANUELLES = {}, FIL = null, LIEUX = null, VILLES_GPS = {};
  const app = { vue: "accueil", etapeProfil: 0, ongletListe: "reco", plusFormations: false, filtreCat: "tous", filtres: { type: "", pays: "", q: "", exclus: false }, limite: 20, cat: { q: "", type: "", source: "", verif: false, app: "", region: "" }, limiteCat: 50, confirmEffacer: false, imports: [], importEnCours: false, profilEdition: false };
  migrer();

  function migrer() {
    const p = etat.profil;
    // Le résumé du profil ne s'affiche qu'une fois les 6 étapes terminées (questionnaire compris).
    // Données plus anciennes : profil déjà rempli et questionnaire fini → considéré comme terminé.
    if (typeof etat.profilTermine !== "boolean" && QUEST) etat.profilTermine = profilComplet() && (etat.qIndex || 0) >= QUEST.questions.length;
    if (!p.bacPremiere) p.bacPremiere = { francaisEcrit: (p.bacFrancais || {}).ecrit || "", francaisOral: (p.bacFrancais || {}).oral || "", maths: "" };
  }

  /* ---------------------------------------------------------------- données */
  async function charger(id, url) {
    const inline = document.getElementById(id);
    if (inline) return JSON.parse(inline.textContent);
    const r = await fetch(url, { cache: "no-cache" });
    if (!r.ok) throw new Error(`Impossible de charger ${url}`);
    return r.json();
  }
  // Chargement à la demande, pour que la page s'ouvre vite sur téléphone :
  // - au démarrage, seulement les petits fichiers (questionnaire, métiers, poursuites, engagement) ;
  // - les lycées (lieux.json) quand l'élève cherche son lycée, ou avec les formations (distances) ;
  // - les formations (≈ 11 Mo : formations, Parcoursup, statistiques…) pour les pages qui affichent
  //   des formations ou des recommandations. Chaque groupe n'est chargé qu'une fois.
  const chargements = {};
  function une(cle, f) {
    if (!chargements[cle]) chargements[cle] = f().catch((e) => { delete chargements[cle]; throw e; });   // nouvel essai à la page suivante
    return chargements[cle];
  }
  const chargerLycees = () => une("lieux", async () => { if (!LIEUX) chargerLieux(await charger("data-lieux", "data/lieux.json")); });
  const chargerFormations = () => une("formations", async () => {
    const [d, ps, fu, st, fil, aj, sts, man, , fpr] = await Promise.all([charger("data-formations", "data/formations.json"), charger("data-parcoursup", "data/parcoursup.json").catch(() => null), charger("data-fusion", "data/fusion.json").catch(() => null), charger("data-stats", "data/stats.json").catch(() => null), charger("data-filieres", "data/filieres.json").catch(() => null), charger("data-ajustements", "data/ajustements.json").catch(() => null), charger("data-statuts-stats", "data/statuts-stats.json").catch(() => null), charger("data-stats-manuelles", "data/stats-manuelles.json").catch(() => null), chargerLycees().catch(() => null), charger("data-frais-prives", "data/frais-prives.json").catch(() => null)]);
    construireCatalogue(d, ps, fu, st, fil, aj, sts, man, fpr);
    etat.retenus = [...new Set(etat.retenus.flatMap((id) => (REMPL[id] ? REMPL[id] : [ALIAS[id] || id])))];   // fiches remplacées
    const calPs = (d.formations.find((f) => f.plateforme === "parcoursup" && f.calendrier && f.calendrier.length) || {}).calendrier || []; d.formations.forEach((f) => { if (!f.calendrier) f.calendrier = calPs; });
    DATA = d; window.__DATA = DATA;
  });
  // Pages qui ont besoin des formations : toutes sauf l'accueil (chiffres complétés à l'arrivée des données)
  // et le profil en cours de saisie (le résumé du profil, lui, affiche une analyse).
  function besoinFormations(v) {
    if (v === "profil") return !app.profilEdition && etat.profilTermine === true;
    return v === "liste" || v === "plan" || v === "explorer" || v === "donnees" || v.startsWith("formation-");
  }
  // Message affiché seulement si l'attente dépasse une seconde (délai géré par la classe CSS « chargement »).
  const TEXTE_CHARGEMENT = "Chargement des formations… Sur téléphone, cela peut prendre quelques secondes.";
  const CHARGEMENT = `<p class="muted chargement" role="status">${TEXTE_CHARGEMENT}</p>`;
  function erreurDonnees(e) {
    return `<div class="notice bad"><strong>Les données n'ont pas pu être chargées.</strong> Si tu as ouvert index.html directement, lance plutôt un petit serveur local (voir le README) ou ouvre dist/mon-plan-sup.html. Détail : ${esc(e.message)}</div>`;
  }
  let sauvegardeT = null;
  function sauver(immediat) { clearTimeout(sauvegardeT); const go = () => S.ecrire(etat); if (immediat) go(); else sauvegardeT = setTimeout(go, 250); }
  function toast(msg) { const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }

  /* ---------------------------------------------------------------- navigation */
  const ICONES = {
    accueil: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    liste: '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/>',
    plan: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    explorer: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    profil: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  };
  // Navigation principale : cinq rubriques. Le questionnaire est une étape du profil ; les résultats sont dans Ma liste ;
  // les métiers et débouchés sont présentés dans chaque fiche formation. Mes données reste accessible depuis le pied de page.
  const NAV = [["accueil", "Accueil"], ["liste", "Ma liste"], ["plan", "Mon plan"], ["explorer", "Catalogue"], ["profil", "Profil"]];
  function rendreNav() {
    const cur = app.vue.startsWith("formation") ? "liste" : app.vue;
    document.body.classList.remove("menu-ouvert"); const mb = $("#menu-btn"); if (mb) mb.setAttribute("aria-expanded", "false");
    $("#nav").innerHTML = NAV.map(([id, l]) => `<a href="#${id}" ${cur === id ? 'aria-current="page"' : ""}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[id]}</svg><span>${l}</span></a>`).join("");
  }
  function remplaceHash(h) { try { history.replaceState(null, "", h); } catch (e) { /* bac à sable */ } }
  function route() {
    if (!QUEST) return;
    const av = app.vue;
    let v = (location.hash || "#accueil").slice(1) || "accueil";
    // anciennes adresses (pages supprimées ou fusionnées)
    if (v === "questionnaire") { v = "profil"; app.profilEdition = true; app.etapeProfil = ETAPE_Q; remplaceHash("#profil"); }
    else if (v === "resultats" || v === "metiers") { v = "liste"; app.ongletListe = "reco"; remplaceHash("#liste"); }
    app.vue = v;
    if (av === "profil" && v !== "profil") app.profilEdition = false;
    rendre(); window.scrollTo(0, 0);
  }
  function rendre() {
    rendreNav();
    const m = $("#main"), v = app.vue;
    if (!DATA && besoinFormations(v)) {
      // le message déjà affiché (celui de index.html) est complété plutôt que remplacé : son délai d'une seconde continue
      const c = m.querySelector(".chargement");
      if (c) c.textContent = TEXTE_CHARGEMENT; else m.innerHTML = CHARGEMENT;
      chargerFormations().then(() => { if (app.vue === v) rendre(); }, (e) => { if (app.vue === v) m.innerHTML = erreurDonnees(e); });
      return;
    }
    if (v === "profil") m.innerHTML = vueProfil();
    else if (v.startsWith("formation-")) {
      let id = v.slice(10);
      if (ALIAS[id]) { id = ALIAS[id]; remplaceHash("#formation-" + id); app.vue = "formation-" + id; }
      const e = CATBY[id];
      m.innerHTML = e && e.src === "parcoursup" && !e.f ? vueFichePs(e) : vueFiche(id);
    }
    else if (v === "explorer") m.innerHTML = vueExplorer();
    else if (v === "liste") m.innerHTML = vueListe();
    else if (v === "plan") m.innerHTML = vuePlan();
    else if (v === "donnees") m.innerHTML = vueDonnees();
    else {
      m.innerHTML = vueAccueil();
      if (!DATA) chargerFormations().then(() => { const b = $(".bande-chiffres"); if (b) b.outerHTML = bandeChiffres(); const ex = $(".hv-exemple-anneau"); if (ex) ex.outerHTML = anneauExempleAccueil(); }, () => {});   // chiffres et exemple de l'accueil
    }
    if (!LIEUX && $("#lyceeq")) chargerLycees().then(() => { if (app.lyceeQ && $("#lyceeq")) rendreRechercheLycee(); }, () => {});
    const h1 = m.querySelector("h1");
    document.title = h1 && app.vue !== "accueil" ? `${h1.textContent} · Mon Plan Sup` : "Mon Plan Sup";
  }

  /* ---------------------------------------------------------------- utilitaires */
  const AVERT = `<p class="notice small"><strong>Outil d'aide à la réflexion.</strong> Mon Plan Sup ne garantit aucune admission. Les catégories ambitieux, réaliste et sécurité sont des repères construits à partir des statistiques Parcoursup 2025, pas des probabilités : les jurys regardent aussi ton dossier complet. Vérifie toujours sur les sites officiels et sur Parcoursup.</p>`;
  let cacheA = null, cacheCle = "";
  function analyse() {
    const cle = JSON.stringify([etat.profil, etat.reponses]);
    if (cle !== cacheCle) { cacheA = E.recommander(DATA.formations, etat.profil, QUEST, etat.reponses); cacheCle = cle; }
    return cacheA;
  }
  function progressionProfil() { const p = etat.profil; return [p.specialites.length, p.periodes.length, p.certifications.length || p.anglaisAuto, p.experiences.length].filter(Boolean).length; }
  const nbReponses = () => Object.values(etat.reponses).filter((r) => r !== undefined && !(Array.isArray(r) && !r.length)).length;
  const STATUTS = { releve_manuel: "relevé manuel", releve_parcoursup: "relevé sur Parcoursup", officiel: "officiel", source_secondaire: "source secondaire", estimation: "estimation", non_communique: "non communiqué", indicatif: "indicatif" };
  const statutBadge = (st) => (st ? `<span class="badge-statut ${esc(st)}">${STATUTS[st] || esc(st)}</span>` : "");
  function srcLien(o) {
    if (!o || !o.source) return "";
    let host = o.source; try { host = new URL(o.source).hostname.replace(/^www\./, ""); } catch (e) { /* */ }
    return `<span class="src">Source : <a href="${esc(o.source)}" target="_blank" rel="noopener">${esc(host)}</a> · consulté le ${esc(fmtDate(o.consulte_le))}</span>`;
  }
  function fmtDate(iso) { if (!iso) return ""; const d = new Date(iso + "T12:00:00"); return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }); }
  function lvl(niv) { const N = E.NIVEAUX[niv]; return `<span class="lvl lvl-${niv}"><span class="dots" aria-hidden="true"><i></i><i></i><i></i><i></i></span>${N.label}</span>`; }
  const catPill = (c) => `<span class="pill ${c === "ambitieux" ? "amb" : c === "realiste" ? "rea" : "sec"}">${E.CAT_LABEL[c]}</span>`;
  const TYPES = () => DATA.meta.types;
  const pct = (x) => (x === null || x === undefined ? "—" : `${String(Math.round(x * 10) / 10).replace(".", ",")} %`);
  // Notes sur 5 (demande de l'utilisateur) : pertinence, intérêt, faisabilité sur 100 → sur 5
  // valeur non numérique (NaN, absente) → null : l'affichage met alors « — », jamais « NaN/5 »
  const sur5 = (x100) => (Number.isFinite(x100) ? Math.max(0, Math.min(5, Math.round((x100 / 20) * 10) / 10)) : null);
  const f5 = (n) => (n === null ? "—" : String(n).replace(".", ","));
  function etoiles(n, label) {
    return `<span class="stars" role="img" aria-label="${esc(label)} : ${f5(n)} sur 5"><span class="stars-fond" aria-hidden="true">★★★★★</span><span class="stars-plein" aria-hidden="true" style="width:${(n / 5) * 100}%">★★★★★</span></span>`;
  }
  // Taux d'accès officiel inconnu (non publié, nouvelle formation, formation sans statistiques, la plupart des universités
  // étrangères) : la faisabilité et la note globale qui en dépend ne sont pas affichées en chiffres. Elles restent calculées
  // par le moteur et servent toujours au classement (aucun changement des listes) ; seul l'affichage change.
  const sansTauxOfficiel = (x) => !x.repere || x.repere.taux === null || x.repere.taux === undefined;
  const TEXTE_SANS_CHIFFRES = "pas de chiffres officiels";
  const TITRE_SANS_CHIFFRES = "Pas de taux d'accès officiel pour cette formation : on ne lui donne pas de note de faisabilité ni de note globale. Elle reste classée d'après ton intérêt et ton dossier.";
  function notesSur5(x) {
    if (sansTauxOfficiel(x)) return `<div class="note5 note5-sans" title="${esc(TITRE_SANS_CHIFFRES)}"><span class="note5-g">Note Mon Plan Sup : <strong>non calculée</strong></span><span class="small muted">Intérêt <strong>${f5(sur5(x.interet))}/5</strong> · Faisabilité : ${TEXTE_SANS_CHIFFRES}</span></div>`;
    const g = sur5(x.pertinence);
    return `<div class="note5"><span class="note5-g">${g === null ? "" : etoiles(g, "Note Mon Plan Sup")}<strong>${f5(g)}/5</strong></span><span class="small muted">Intérêt <strong>${f5(sur5(x.interet))}/5</strong> · Faisabilité <strong>${f5(sur5(x.faisabilite))}/5</strong></span></div>`;
  }
  // note courte des tableaux (famille de formations, vœux) : « — » sans taux d'accès officiel
  const noteCourte = (x) => (sansTauxOfficiel(x) ? `<span title="${esc(TITRE_SANS_CHIFFRES)}">—<span class="sr-only"> (note non calculée : ${TEXTE_SANS_CHIFFRES})</span></span>` : `${f5(sur5(x.pertinence))}/5`);
  const CRIT5 = { fort: "5/5", conforme: "4/5", preparer: "3/5", renforcer: "2/5", faible: "1/5", bloquant: "0/5", inconnu: "?/5", na: "—" };
  // Repères d'admission (E.repere, docs/modele-chances.md) : taux d'accès officiel, position parmi les admis 2025 et
  // catégorie. Aucun pourcentage de chances : le site n'en calcule plus.
  const POSITION_COURT = { au_dessus: "au-dessus des admis", moyenne: "dans la moyenne des admis", en_dessous: "en dessous des admis", inconnue: "position inconnue" };
  const tauxFr = (t) => `${String(t).replace(".", ",")} %`;
  function repereTxt(r) {
    if (r && r.nouvelle) return "pas encore de chiffres";
    if (r && r.sansStats) return "pas de statistiques";
    if (!r) return "à calculer";
    return [r.taux !== null ? `accès ${tauxFr(r.taux)}` : "taux non publié", r.sansNotes ? "notes à renseigner" : POSITION_COURT[r.position]].join(" · ");
  }
  // Source affichée pour le taux d'accès : une fiche Mon Plan Sup fusionnée avec Parcoursup dont le taux est identique
  // à celui de stats.json cite l'open data Parcoursup 2025 plutôt que le média repris dans la fiche (Thotis, OptionMétier).
  function sourceTaux(f) {
    const a = f.admission || {}, e = CATBY[f.id], g = e && e.ps && e.ps.gta;
    if (g && STATS[g] && statDe(g, "taux_acces_ens") === a.taux) return { source: e.ps.dataviz || e.ps.fiche, consulte_le: STCONS, statut: "officiel" };
    return { source: a.source, consulte_le: a.consulte_le, statut: a.statut };
  }
  const libTauxAcces = (r) => `Taux d'accès${r.session ? " " + r.session : ""}`;
  // Ligne courte des cartes : taux d'accès (session, source) et position de l'élève en une phrase
  // (cartes et Ma liste), suivie du message sur les frais s'il s'applique (r.alerteFrais : établissement privé aux frais
  // inconnus avec un budget serré, ou frais dans une fourchette qui dépasse le budget)
  const alerteFraisHtml = (x, balise = "p", classe = "small") => (x.repere.alerteFrais && !x.exclu ? `<${balise} class="${classe} texte-bad">${esc(x.repere.alerteFrais)}</${balise}>` : "");
  function ligneRepere(x) {
    const r = x.repere;
    const alerteFrais = alerteFraisHtml(x);
    if (r.nouvelle || r.sansStats) return alerteFrais;
    const st = sourceTaux(x.f);
    return `<p class="small repere-ligne">${r.taux !== null ? `<strong>${libTauxAcces(r)} : ${tauxFr(r.taux)}</strong>${statutBadge(st.statut)}${srcLien(st)}` : "<strong>Taux d'accès non publié.</strong>"} ${esc(r.texte)}</p>${alerteFrais}`;
  }
  // Bloc de la fiche : position, taux d'accès, catégorie et sa règle, limite du repère
  function blocRepere(x) {
    const r = x.repere;
    if (r.nouvelle || r.sansStats) return `<div class="chances-detail"><div><h4>Ta position parmi les admis</h4><p class="small">${esc(r.texte)}</p></div></div>`;
    const st = sourceTaux(x.f);
    return `<div class="chances-detail ton-${CAT_TON[x.categorie]}">
            <div><h4>Ta position parmi les admis</h4><p class="small">${esc(r.texte)}</p>${r.percentile !== null ? `<p class="tiny muted">${esc(E.METHODE_POSITION)}</p>` : ""}</div>
            <p class="small">${r.taux !== null ? `<strong>${libTauxAcces(r)} : ${tauxFr(r.taux)}</strong> des candidats ont reçu une proposition.${statutBadge(st.statut)}${srcLien(st)}` : "<strong>Taux d'accès non publié.</strong>"}</p>
            <p class="small">${catPill(x.categorie)} ${esc(r.pourquoi)}${srcLien(r.sourceRegle)}</p>
            <p class="small muted">${esc(E.LIMITE_REPERE)}</p></div>`;
  }
  function libTaux(a) {
    if (!a || !a.places) return "Places non communiquées";
    return `<strong>${a.places.toLocaleString("fr-FR")}</strong> places${a.candidats ? ` · ${a.candidats.toLocaleString("fr-FR")} vœux` : ""}`;
  }


  /* ---------------------------------------------------------------- éléments visuels (identité v6) */
  const IC = {
    pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    ecole: '<path d="M3 10l9-5 9 5-9 5z"/><path d="M7 12.5V17c0 1 2.2 2.5 5 2.5s5-1.5 5-2.5v-4.5"/>',
    horloge: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    euro: '<path d="M17 6.5A6.5 6.5 0 1 0 17 17.5"/><path d="M4.5 10.5h8M4.5 13.5h8"/>',
    cible: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
    livre: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5"/>',
    courbe: '<path d="M4 19h16"/><path d="M5 15l4-4 3 3 6-7"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z"/>',
    crayon: '<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>',
    dossier: '<path d="M3.5 7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
    envoi: '<path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>',
    agenda: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    trophee: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7"/>',
    alerte: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.2v.3"/>',
    groupe: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><circle cx="17" cy="9.5" r="2.5"/><path d="M15.5 14.3c2.7.2 5 1.9 5 4.7"/>',
    malette: '<rect x="3.5" y="7" width="17" height="12.5" rx="2.5"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12.5h17"/>',
    diplome: '<path d="M3 9l9-5 9 5-9 5z"/><path d="M21 9v5"/><path d="M7 11.3V16c0 1.3 2.2 3 5 3s5-1.7 5-3v-4.7"/>',
    fleche: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    retour: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    etoile: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.5 9.7l5.9-.8z"/>',
    loupe: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/>',
    boussole: '<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    ampoule: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    coeur: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
    bulle: '<path d="M4 5.5h16v10H9l-5 4z"/>',
    cadenas: '<rect x="5" y="10" width="14" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    personne: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  };
  const ico = (n, cls = "") => `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || ""}</svg>`;
  const CAT_TON = { ambitieux: "corail", realiste: "ambre", securite: "menthe" };
  // anneau du taux d'accès officiel de la formation (pas une probabilité personnelle), couleur de la catégorie
  // Exemple de l'accueil : CPGE ECG maths approfondies + HGG du Lycée du Parc (Lyon), gta Parcoursup 31314. Son taux d'accès
  // est lu dans les données chargées (data/stats.json, via construireCatalogue puis E.repere), jamais écrit dans le code :
  // il suit la mise à jour des statistiques. Seul le taux officiel de stats.json est montré : si la formation n'y est plus,
  // la fiche fusionnée retombe sur un chiffre de média (Thotis, 14 % pour deux vœux additionnés), qui n'est pas affiché ici.
  // Formation absente, taux non publié ou données pas encore chargées : pas d'anneau (aucun chiffre de repli).
  // L'ancien appel anneau({ bas, haut, mid }) affichait « NaN % » et « undefined % ».
  const GTA_EXEMPLE_ACCUEIL = "31314";
  function anneauExempleAccueil() {
    const f = DATA && DATA.formations.find((x) => x.id === "psup-" + GTA_EXEMPLE_ACCUEIL);
    const officiel = DATA ? statDe(GTA_EXEMPLE_ACCUEIL, "taux_acces_ens") : null;
    const r = f && Number.isFinite(officiel) ? E.repere(f, { moyenneGenerale: null }) : null;
    return `<span class="hv-exemple-anneau">${r && r.taux === officiel ? anneau(r, "realiste", 68) : ""}</span>`;
  }
  function anneau(r, cat, taille = 84) {
    const ton = CAT_TON[cat] || "bleu", fond = '<circle class="anneau-fond" cx="32" cy="32" r="27"/>';
    // taux absent ou non numérique : anneau vide « ? », jamais « NaN » ni « undefined % »
    if (!r || !Number.isFinite(r.taux)) return `<div class="anneau ton-${ton}" style="--t:${taille}px" role="img" aria-label="Taux d'accès non publié"><svg viewBox="0 0 64 64" aria-hidden="true">${fond}</svg><span class="anneau-txt"><b>?</b><small>taux d'accès</small></span></div>`;
    const C = 2 * Math.PI * 27;
    return `<div class="anneau ton-${ton}" style="--t:${taille}px" role="img" aria-label="${libTauxAcces(r)} : ${tauxFr(r.taux)} des candidats ont reçu une proposition">
      <svg viewBox="0 0 64 64" aria-hidden="true">${fond}<circle class="anneau-val" cx="32" cy="32" r="27" stroke-dasharray="${((r.taux / 100) * C).toFixed(1)} ${C.toFixed(1)}"/></svg>
      <span class="anneau-txt"><b>${Math.round(r.taux)} %</b><small>${taille >= 110 ? "taux d'accès" : "d'accès"}</small></span></div>`;
  }
  // tonalité d'un type de formation (couleurs secondaires de la palette)
  function tonType(type, label) {
    const t = String(type || "") + " " + String(label || "");
    if (/prepa|CPGE|préparatoires/i.test(t)) return "violet";
    if (/iep|college_universitaire|Sciences Po/i.test(t)) return "corail";
    if (/commerce|management|IAE|DCG|bachelor/i.test(t)) return "ambre";
    if (/ingenieur|ingénieur|C\.M\.I/i.test(t)) return "ciel";
    if (/art|design|dn_made|architecture|spectacle/i.test(t)) return "corail";
    if (/sante|santé|social|sport|vétérinaire/i.test(t)) return "menthe";
    return "bleu";
  }
  const typePill = (type, label) => `<span class="pill ton-${tonType(type, label)}">${esc(label)}</span>`;
  // niveau d'un critère : barre à 4 segments
  const NIV_SEG = { fort: 4, conforme: 3, preparer: 2, renforcer: 2, faible: 1, bloquant: 0, inconnu: 0, na: 0 };
  function niveauBarre(niv) {
    const n = NIV_SEG[niv] || 0;
    return `<span class="seg seg-${niv}" aria-hidden="true">${[1, 2, 3, 4].map((i) => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}</span>`;
  }
  // bandeau d'en-tête commun à toutes les pages
  function pageHero(o) {
    return `<header class="page-hero ton-${o.ton || "bleu"}">
      <div class="page-hero-txt">${o.sur ? `<span class="eyebrow">${o.sur}</span>` : ""}<h1>${o.titre}</h1>${o.sous ? `<p>${o.sous}</p>` : ""}${o.actions ? `<div class="row">${o.actions}</div>` : ""}</div>
      ${o.cote ? `<div class="page-hero-cote">${o.cote}</div>` : `<div class="page-hero-ico" aria-hidden="true">${ico(o.ico || "boussole")}</div>`}
    </header>`;
  }
  const miniStat = (val, lib, ton) => `<div class="mini-stat ton-${ton || "bleu"}"><b>${val}</b><span>${lib}</span></div>`;

  /* ================================================================ ACCUEIL */
  // Chiffres de l'accueil : « … » tant que les formations ne sont pas chargées.
  function bandeChiffres() {
    const n = (f) => (DATA ? f().toLocaleString("fr-FR") : "…");
    return `<section class="bande-chiffres" aria-label="Mon Plan Sup en chiffres">
        <div><b>${n(() => CAT.length)}</b><span>formations dans le catalogue</span></div>
        <div><b>${n(() => CAT.filter((e) => e.ps).length)}</b><span>avec leur fiche officielle Parcoursup</span></div>
        <div><b>${n(() => DATA.formations.length)}</b><span>fiches détaillées pour les recommandations</span></div>
        <div><b>10</b><span>vœux équilibrés proposés</span></div>
      </section>`;
  }
  function vueAccueil() {
    const pp = progressionProfil(), nr = nbReponses(), demarre = pp || nr;
    return `<div class="accueil">
      <section class="hero">
        <div class="hero-txt">
          <span class="hero-badge">${ico("boussole")}Orientation post-bac, de la seconde à la terminale</span>
          <h1>Trouve en quelques clics les formations <span class="souligne">faites pour toi</span></h1>
          <p class="hero-sous">Parle-nous de ton parcours et de tes envies. Mon Plan Sup te propose les formations qui te correspondent, avec des repères sur l'admission et les étapes à suivre.</p>
          <div class="row hero-actions">
            <a class="btn primary lg" href="#profil">${demarre ? "Reprendre mon profil" : "Commencer"}${ico("fleche")}</a>
            ${demarre ? `<a class="btn lg" href="#liste">Voir ma liste</a>` : `<a class="btn lg" href="#explorer">Explorer le catalogue</a>`}
          </div>
          <ul class="hero-confiance"><li>${ico("check")}Gratuit</li><li>${ico("check")}Données gardées sur ton appareil</li><li>${ico("check")}Chiffres officiels Parcoursup</li></ul>
        </div>
        <div class="hero-visuel" aria-hidden="true">
          <div class="hv-forme hv-forme-1"></div><div class="hv-forme hv-forme-2"></div><div class="hv-forme hv-forme-3"></div>
          <div class="hv-carte hv-formation">
            <span class="hv-titre">Exemple de recommandation</span>
            <div class="row" style="gap:6px"><span class="pill ton-ambre">Réaliste</span><span class="pill ton-violet">Prépa ECG</span></div>
            <div class="hv-ligne"><div><b>CPGE ECG, maths approfondies</b><span>${ico("pin")}Lyon</span></div>${anneauExempleAccueil()}</div>
            <div class="hv-crit"><span>Notes ${niveauBarre("fort")}</span><span>Spécialités ${niveauBarre("conforme")}</span><span>Appréciations ${niveauBarre("conforme")}</span></div>
          </div>
          <div class="hv-carte hv-plan">
            <span class="hv-titre">${ico("agenda")}Ton plan</span>
            <ol><li class="fait">Profil complété</li><li class="cours">Choisir 10 vœux</li><li>Projets motivés</li></ol>
          </div>
          <div class="hv-pastille">${ico("etoile")}3 ambitieux · 4 réalistes · 3 sûrs</div>
        </div>
      </section>
      <section class="bloc-etapes" aria-labelledby="etapes-titre">
        <div class="titre-section"><span class="eyebrow">En trois étapes</span><h2 id="etapes-titre">Comment ça marche</h2></div>
        <ol class="etapes-accueil">
          <li class="ton-bleu"><span class="etape-ico">${ico("personne")}</span><span class="etape-num">1</span><h3>Ton profil</h3><p>Tes notes (tu peux importer tes bulletins PDF), tes spécialités, puis un questionnaire sur tes envies.</p></li>
          <li class="ton-violet"><span class="etape-ico">${ico("etoile")}</span><span class="etape-num">2</span><h3>Ta liste</h3><p>Tes 10 formations les plus adaptées, avec pour chacune le taux d'accès et ta position parmi les admis.</p></li>
          <li class="ton-ambre"><span class="etape-ico">${ico("agenda")}</span><span class="etape-num">3</span><h3>Ton plan</h3><p>Les étapes et les dates à ne pas manquer, mois par mois, jusqu'aux résultats.</p></li>
        </ol>
      </section>
      ${bandeChiffres()}
      <section class="cta-bande">
        <div><h2>Prêt à construire ta liste ?</h2><p>Tu peux t'arrêter et reprendre quand tu veux : tout est enregistré sur ton appareil.</p></div>
        <a class="btn blanc lg" href="#profil">${demarre ? "Reprendre" : "Créer mon profil"}${ico("fleche")}</a>
      </section>
    </div>`;
  }

  /* ================================================================ PROFIL */
  const ETAPES = ["Scolarité", "Bulletins", "Épreuves de première", "Certifications", "Expériences", "Questionnaire"];
  const ETAPE_Q = ETAPES.length - 1;   // le questionnaire est la dernière étape du profil
  const NIVEAU_LIB = { seconde: "Seconde", premiere: "Première", terminale: "Terminale" };
  const COMMUNES = { seconde: [["francais", "Français"], ["maths", "Mathématiques"], ["physique_chimie", "Physique-chimie"], ["SVT", "SVT"], ["SES", "SES"], ["hg", "Histoire-géographie"], ["lva", "Langue vivante A"], ["lvb", "Langue vivante B"], ["eps", "EPS"]],
 premiere: [["francais", "Français"], ["hg", "Histoire-géographie"], ["lva", "Langue vivante A"], ["lvb", "Langue vivante B"], ["es", "Enseignement scientifique"], ["eps", "EPS"]],
    terminale: [["philosophie", "Philosophie"], ["hg", "Histoire-géographie"], ["lva", "Langue vivante A"], ["lvb", "Langue vivante B"], ["es", "Enseignement scientifique"], ["eps", "EPS"]] };
  const PERIODES = ["Seconde – T1", "Seconde – T2", "Seconde – T3", "Seconde – S1", "Seconde – S2", "Première – T1", "Première – T2", "Première – T3", "Première – S1", "Première – S2", "Terminale – T1", "Terminale – T2", "Terminale – T3", "Terminale – S1", "Terminale – S2"];
  const CERTS = ["Cambridge English", "IELTS", "TOEFL iBT", "TOEIC", "DELE (espagnol)", "Goethe-Zertifikat (allemand)", "Autre langue", "TMUA", "SAT", "ACT", "LNAT", "Test Bocconi", "BAFA", "PSC1", "Autre"];
  const EXPS = [["stage", "Stage"], ["job", "Job"], ["benevolat", "Bénévolat"], ["association", "Association / club"], ["projet", "Projet personnel"], ["competition", "Compétition, olympiade, concours"], ["responsabilite", "Responsabilité (délégué, capitaine…)"], ["autre", "Autre"]];
  const MENTIONS_CONSEIL = ["", "Excellence", "Félicitations", "Compliments", "Tableau d'honneur", "Encouragements", "Avertissement travail", "Avertissement comportement"];
  const NOMS_MAT = () => Object.assign({ maths_expertes: "Maths expertes", maths_complementaires: "Maths complémentaires", francais: "Français", philosophie: "Philosophie", hg: "Histoire-géographie", lva: "Langue vivante A", lvb: "Langue vivante B", es: "Enseignement scientifique", eps: "EPS", emc: "EMC", dnl: "DNL (section euro)" }, E.SPEC_COURT);

  function matieresPeriode(per) {
    const p = etat.profil, prem = per.label.startsWith("Première");
    if (per.label.startsWith("Seconde")) {
      // en seconde : tronc commun, pas encore de spécialités
      const res2 = COMMUNES.seconde.slice();
      for (const k of Object.keys(per.notes || {})) if (!res2.some(([c]) => c === k)) res2.push([k, NOMS_MAT()[k] || k]);
      return res2;
    }
    const base = COMMUNES[prem ? "premiere" : "terminale"].slice();
    let specs = p.niveau === "seconde" ? [] : p.specialites.slice();
    if (prem && p.niveau === "terminale" && p.specialiteAbandonnee) specs = specs.concat(p.specialiteAbandonnee);
    const out = specs.map((s) => [s, E.SPEC_COURT[s] || s]);
    if (!prem && p.optionMaths === "expertes") out.push(["maths_expertes", "Maths expertes"]);
    if (!prem && p.optionMaths === "complementaires") out.push(["maths_complementaires", "Maths complémentaires"]);
    const res = out.concat(base);
    for (const k of Object.keys(per.notes || {})) if (!res.some(([c]) => c === k)) res.push([k, NOMS_MAT()[k] || k]);
    return res;
  }

  /* ---------- résumé du profil (affiché une fois les informations principales saisies) */
  function rendreRechercheLycee() { rendre(); const el = $("#lyceeq"); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }
  function champLycee(p) {
    const l = p.lycee;
    if (l && !app.lyceeEdition) return `<div class="field"><label>Ton lycée <span class="hint">(sert à calculer les distances, reste sur ton appareil)</span></label>
      <div class="row" style="gap:8px"><span>${esc(l.nom)}${l.commune && l.type === "lycee" ? ` · ${esc(l.commune)}` : ""}</span><button type="button" class="btn sm" data-action="lycee-changer">Changer</button><button type="button" class="btn sm ghost" data-action="lycee-effacer">Retirer</button></div></div>`;
    const q = sansAccents(app.lyceeQ || "").trim();
    let res = [];
    if (q.length >= 2 && LIEUX) {
      const mots = q.split(/\s+/);
      const ok = (t) => mots.every((m) => t.includes(m));
      res = LIEUX.lycees.filter((x) => ok(x.cle)).slice(0, 8).map((x) => ({ k: "l", x }))
        .concat(LIEUX.communes.filter((x) => ok(x.cle)).slice(0, 4).map((x) => ({ k: "c", x })));
    }
    return `<div class="field" style="flex-basis:100%"><label for="lyceeq">Ton lycée <span class="hint">(nom ou ville ; sert à calculer les distances, reste sur ton appareil)</span></label>
      <input id="lyceeq" type="text" data-lycee-q value="${esc(app.lyceeQ || "")}" placeholder="Ex. : Lycée Carnot Dijon, ou ta ville" autocomplete="off">
      ${res.length ? `<div class="stack" style="gap:4px;margin-top:6px">${res.map((r) => `<button type="button" class="btn sm" style="justify-content:flex-start;text-align:left" data-action="lycee-choisir" data-k="${r.k}" data-id="${esc(r.k === "l" ? r.x.uai : r.x.cle)}">${r.k === "l" ? `${esc(r.x.nom)} <span class="muted">· ${esc(r.x.commune)}</span>` : `Ville : ${esc(r.x.commune)} <span class="muted">(${esc(r.x.dep)})</span>`}</button>`).join("")}</div>` : q.length >= 2 ? `<p class="small muted">Aucun résultat. Lycée introuvable : tape plutôt ta ville ou la ville la plus proche.</p>` : ""}
    </div>`;
  }
  // « Première – T3 » → « 1re T3 »
  const perCourt = (l) => String(l).replace("Seconde – ", "2de ").replace("Première – ", "1re ").replace("Terminale – ", "Tle ");
  const listePer = (ls) => (ls.length ? ls.map(perCourt).join(", ") : "aucune période");
  // Les moyennes retenues par le moteur (statsProfil), chacune avec les périodes prises en compte
  function moyennesRetenues(s) {
    const mathsLib = E.libelleMaths(s);
    return [
      { cle: "Moyenne générale", v: s.moyenneGenerale, sous: s.moyennePeriodes.length ? `moyenne de ${listePer(s.moyennePeriodes)}` : "" },
      { cle: "Dernier bulletin", v: s.dernierBulletin ? s.dernierBulletin.moyenne : null, sous: s.dernierBulletin ? perCourt(s.dernierBulletin.periode) : "" },
      { cle: "Maths", lib: mathsLib, v: s.maths, sous: s.mathsPeriodes.length ? listePer(s.mathsPeriodes) : "" },
      { cle: "Maths expertes", v: s.expertes, sous: s.expertesPeriodes.length ? listePer(s.expertesPeriodes) : "" },
    ];
  }
  // périodes sans moyenne générale, puis moyennes impossibles (hors de 0 à 20), qui ne sont pas comptées
  const avisSansMoyenne = (s, p) => s.periodesSansMoyenne.map((l) => `<p class="notice small">${esc(E.MESSAGE_SANS_MOYENNE(perCourt(l)))}</p>`)
    .concat(E.notesImpossibles(p).map((x) => `<p class="notice bad small">${esc(E.MESSAGE_NOTE_IMPOSSIBLE(perCourt(x.periode), x.valeur, x.matiere ? NOMS_MAT()[x.matiere] || x.matiere : null))}</p>`)).join("");
  const horsBornes = (v) => isNaN(v) || v < E.NOTE_MIN || v > E.NOTE_MAX;
  const profilComplet = () => etat.profil.specialites.length > 0 && etat.profil.periodes.length > 0;
  function vueResumeProfil() {
    const p = etat.profil, s = E.statsProfil(p), noms = NOMS_MAT();
    const pers = p.periodes.slice().sort((a, b) => PERIODES.indexOf(a.label) - PERIODES.indexOf(b.label));
    // moyennes par matière sur toutes les périodes
    const parMat = {};
    for (const per of pers) for (const [k, n] of Object.entries(per.notes || {})) { const v = parseFloat(String(n.moy).replace(",", ".")); if (!horsBornes(v)) (parMat[k] = parMat[k] || []).push(v); }
    const mats = Object.entries(parMat).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length, v[v.length - 1]]).sort((a, b) => b[1] - a[1]);
    const forts = mats.slice(0, 3), faibles = mats.length > 5 ? mats.slice(-2).reverse() : [];
    const mgPer = pers.map((per) => ({ l: perCourt(per.label), v: ((x) => (horsBornes(x) ? NaN : x))(parseFloat(String(per.moyenneGenerale).replace(",", "."))), c: parseFloat(String(per.moyenneClasse).replace(",", ".")), m: per.mention }));
    const pf = [], vg = [];
    if (s.ecartClasse !== null && s.ecartClasse >= 1) pf.push(`Au-dessus de la moyenne de ta classe (${s.ecartClasse > 0 ? "+" : ""}${E.fmt(s.ecartClasse)} point${Math.abs(s.ecartClasse) >= 2 ? "s" : ""}).`);
    if (s.ecartClasse !== null && s.ecartClasse < 0) vg.push(`Sous la moyenne de ta classe (${E.fmt(s.ecartClasse)} point).`);
    const v = mgPer.filter((x) => !isNaN(x.v));
    if (v.length >= 2 && v[v.length - 1].v - v[0].v >= 0.8) pf.push(`Belle progression : de ${E.fmt(v[0].v)} à ${E.fmt(v[v.length - 1].v)} de moyenne.`);
    if (v.length >= 2 && v[0].v - v[v.length - 1].v >= 0.8) vg.push(`Moyenne en baisse : de ${E.fmt(v[0].v)} à ${E.fmt(v[v.length - 1].v)}.`);
    if (s.appreciations && s.appreciations.niveau === "fort") pf.push("Appréciations très positives.");
    if (s.appreciations && (s.appreciations.niveau === "faible" || s.appreciations.niveau === "renforcer")) vg.push("Des points de vigilance dans les appréciations.");
    if (s.appreciations && s.appreciations.mentions.length) pf.push("Mentions du conseil : " + s.appreciations.mentions.join(", ") + ".");
    // pas de « point fort » si la note de maths expertes est sous le seuil (le critère « spécialités » dit déjà « à renforcer »)
    if (s.optionMaths === "expertes" && !(s.expertes !== null && s.expertes < E.SEUIL_EXPERTES_FAIBLE)) pf.push("Option maths expertes : un atout pour les prépas et les cursus quantitatifs.");
    if (s.anglaisCertifie) pf.push(`Anglais certifié ${s.anglais}.`); else vg.push(s.anglais ? `Anglais ${s.anglais} estimé : à certifier pour l'étranger.` : "Niveau d'anglais non renseigné.");
    if (!p.experiences.length) vg.push("Aucune expérience extrascolaire renseignée."); else if (s.nbExperiencesFortes) pf.push(`${s.nbExperiencesFortes} expérience(s) marquante(s) (stage, projet, compétition, responsabilité).`);
    const TUI = { "Moyenne générale": ["courbe", "bleu"], "Dernier bulletin": ["courbe", "ciel"], "Maths": ["cible", "violet"], "Maths expertes": ["cible", "violet"], "Écart à la classe": ["groupe", "ciel"], "Anglais": ["globe", "menthe"], "Appréciations": ["crayon", "ambre"] };
    const tuile = (l, val, sous, lib) => { const [ic, t] = TUI[l] || ["etoile", "bleu"]; return `<div class="tuile ton-${t}"><span class="tuile-ico">${ico(ic)}</span><span class="tuile-l">${lib || l}</span><span class="tuile-v">${val}</span>${sous ? `<span class="tuile-s">${sous}</span>` : ""}</div>`; };
    const modif = (i) => `<button class="btn sm ghost" data-action="profil-edition" data-i="${i}">Modifier</button>`;
    const bp = s.bacPremiere;
    const EXPL = Object.fromEntries(EXPS);
    const A = analyse(), nr = nbReponses(), NQ = QUEST.questions.length;
    const doms = Object.entries(A.interets.domaines || {}).filter(([, v]) => v >= 0.55).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k]) => E.DOMAINES[k]).filter(Boolean);
    const ligne = (titre, contenu, i, libBtn) => `<div class="reglage"><div class="reglage-txt"><h3>${titre}</h3>${contenu}</div><button class="btn sm ghost" data-action="profil-edition" data-i="${i}">${libBtn || "Modifier"}</button></div>`;
    const classe = `${NIVEAU_LIB[p.niveau] || "Terminale"} générale${p.specialites.length ? " · " + p.specialites.map((x) => esc(E.SPEC_COURT[x] || x)).join(" · ") : ""}${p.optionMaths && p.optionMaths !== "aucune" ? " · option maths " + (p.optionMaths === "expertes" ? "expertes" : "complémentaires") : ""}${p.autresOptions ? " · " + esc(p.autresOptions) : ""}`;
    return `<div class="stack-lg resume">
      <header class="page-hero ton-bleu profil-hero"><div class="page-hero-txt"><span class="eyebrow">Profil</span><div class="profil-id"><span class="avatar" aria-hidden="true">${esc((p.prenom || "?").trim().charAt(0).toUpperCase() || "?")}</span><div><h1>${p.prenom ? esc(p.prenom) : "Mon profil"}</h1><p>${classe}</p></div></div></div><div class="page-hero-cote"><button class="btn blanc" data-action="profil-edition" data-i="0">${ico("crayon")}Modifier</button></div></header>
      ${nr < NQ ? `<div class="notice info small row" style="justify-content:space-between"><span>${nr ? `Questionnaire en cours : ${nr} réponses sur ${NQ}.` : "Dernière étape : le questionnaire sur tes envies, pour personnaliser tes recommandations."}</span><button class="btn sm primary" data-action="profil-edition" data-i="${ETAPE_Q}">${nr ? "Continuer" : "Répondre"}</button></div>` : ""}
      <section class="stack">
        <h2 class="titre-ico">${ico("etoile")}En bref</h2>
        <div class="tuiles">
          ${moyennesRetenues(s).filter((m) => m.cle !== "Maths expertes" || m.v !== null).map((m) => tuile(m.cle, E.fmt(m.v), esc(m.sous), m.lib)).join("")}
          ${tuile("Écart à la classe", s.ecartClasse !== null ? (s.ecartClasse > 0 ? "+" : "") + E.fmt(s.ecartClasse) : "—", "")}
          ${tuile("Anglais", s.anglais || "—", s.anglais ? (s.anglaisCertifie ? "certifié" : "estimé") : "")}
          ${tuile("Appréciations", s.appreciations ? E.NIVEAUX[s.appreciations.niveau].label : "—", "")}
        </div>
        ${avisSansMoyenne(s, p)}
        <p class="tiny muted">Moyenne générale : moyenne simple des moyennes générales de tes bulletins de première et de terminale, chaque période compte autant. Le dernier bulletin est affiché à part. Détails dans <a href="#donnees">Mes données</a>.</p>
      </section>
      <div class="grid-2">
        <section class="card stack"><div class="row" style="justify-content:space-between"><h2>Évolution</h2>${modif(1)}</div>
          <div class="evol">${mgPer.map((x) => `<div class="evol-l"><span class="tiny">${esc(x.l)}</span><div class="evol-bar"><span style="width:${isNaN(x.v) ? 0 : (x.v / 20) * 100}%"></span>${!isNaN(x.c) ? `<i style="left:${(x.c / 20) * 100}%" title="Moyenne de la classe"></i>` : ""}</div><span class="num">${isNaN(x.v) ? "—" : E.fmt(x.v)}</span></div>${x.m ? `<span class="tiny muted evol-m">${esc(x.m)}</span>` : ""}`).join("")}</div>
          <p class="tiny muted">Barre : ta moyenne générale sur 20. Trait : moyenne de la classe.</p>
        </section>
        <section class="card stack"><div class="row" style="justify-content:space-between"><h2>Matières</h2>${modif(1)}</div>
          ${mats.length ? `<ul class="mats">${mats.map(([k, moy]) => `<li class="${forts.some((f) => f[0] === k) ? "fort" : faibles.some((f) => f[0] === k) ? "faible" : ""}"><span>${esc(noms[k] || k)}</span><span class="mat-bar"><span style="width:${(moy / 20) * 100}%"></span></span><span class="num">${E.fmt(Math.round(moy * 10) / 10)}</span></li>`).join("")}</ul>` : '<p class="small muted">Aucune note par matière.</p>'}
        </section>
      </div>
      <div class="grid-2">
        <section class="card stack"><h2>Points forts</h2>${pf.length ? `<ul class="why">${pf.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : '<p class="small muted">Complète ton profil pour les faire apparaître.</p>'}${forts.length ? `<p class="small muted">Meilleures matières : ${forts.map(([k]) => esc(noms[k] || k)).join(", ")}.</p>` : ""}</section>
        <section class="card stack"><h2>À surveiller</h2>${vg.length ? `<ul class="why">${vg.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : '<p class="small muted">Rien de particulier.</p>'}${faibles.length ? `<p class="small muted">Matières les plus fragiles : ${faibles.map(([k]) => esc(noms[k] || k)).join(", ")}.</p>` : ""}</section>
      </div>
      <section class="card reglages">
        ${ligne("Questionnaire", `<p class="small muted">${nr ? `${nr} réponses sur ${NQ}` : "Pas encore commencé"}${doms.length ? ` · intérêts principaux : ${doms.map(esc).join(", ")}` : ""}</p>`, ETAPE_Q, nr ? "Modifier" : "Commencer")}
        ${ligne("Épreuves de première", bp.francaisEcrit !== null || bp.francaisOral !== null || bp.maths !== null ? `<p class="small muted">Français écrit ${E.fmt(bp.francaisEcrit)} · oral ${E.fmt(bp.francaisOral)} · maths ${E.fmt(bp.maths)}${bp.scoreSciencesPo !== null ? ` · score pondéré ${E.fmt(bp.scoreSciencesPo)}/20` : ""}</p>` : '<p class="small muted">Pas encore passées ou non renseignées.</p>', 2)}
        ${ligne("Certifications", p.certifications.length ? `<p class="small muted">${p.certifications.map((c) => `${esc(c.type)}${c.score ? " " + esc(c.score) : ""}${E.niveauCertif(c) ? ` (${esc(E.niveauCertif(c))})` : ""}`).join(" · ")}</p>` : '<p class="small muted">Aucune. Un IELTS, un TOEFL ou un Cambridge est utile pour l\'étranger.</p>', 3)}
        ${ligne("Expériences et engagements", p.experiences.length ? `<p class="small muted">${p.experiences.map((x) => `${esc(EXPL[x.type] || x.type)}${x.titre ? " — " + esc(x.titre) : ""}${x.duree ? ` (${esc(x.duree)})` : ""}`).join(" · ")}</p>` : '<p class="small muted">Aucune pour l\'instant. Des idées t\'attendent dans <a href="#plan">Mon plan</a>.</p>', 4)}
      </section>
      <div class="row"><a class="btn primary" href="#liste">Voir ma liste</a><a class="btn" href="#plan">Mon plan</a></div>
    </div>`;
  }

  function vueProfil() {
    if (!app.profilEdition && etat.profilTermine === true) return vueResumeProfil();
    const e = app.etapeProfil, p = etat.profil;
    const stepper = `<nav class="stepper" aria-label="Étapes du profil">${ETAPES.map((l, i) => `<button type="button" data-action="etape" data-i="${i}" class="${i < e ? "fait" : ""}" ${i === e ? 'aria-current="step"' : ""}><span class="stepper-n">${i + 1}</span>${l}</button>`).join("")}</nav>`;
    let corps = "";
    if (e === 0) {
      const nbSpe = p.niveau === "terminale" ? 2 : 3;
      corps = `<div class="stack">
        <div class="fields">
          <div class="field"><label for="prenom">Prénom ou pseudo <span class="hint">(facultatif, reste sur ton appareil)</span></label><input id="prenom" type="text" data-bind="prenom" value="${esc(p.prenom)}" autocomplete="off"></div>
          <div class="field"><label for="niveau">Classe actuelle</label><select id="niveau" data-bind="niveau"><option value="seconde" ${p.niveau === "seconde" ? "selected" : ""}>Seconde</option><option value="premiere" ${p.niveau === "premiere" ? "selected" : ""}>Première</option><option value="terminale" ${p.niveau === "terminale" ? "selected" : ""}>Terminale</option></select></div>
        </div>
        <fieldset class="stack" style="border:0;padding:0;margin:0;gap:10px"><legend><label>${p.niveau === "seconde" ? "Spécialités envisagées en première" : "Spécialités suivies cette année"} <span class="hint">(${nbSpe} en ${p.niveau === "terminale" ? "terminale" : "première"})</span></label></legend>
          <div class="chips">${E.SPECIALITES.map(([v, l]) => `<label class="chip"><input type="checkbox" data-spe="${v}" ${p.specialites.includes(v) ? "checked" : ""}><span>${esc(l)}</span></label>`).join("")}</div>
          ${p.specialites.length > nbSpe ? `<p class="notice small">Tu as coché ${p.specialites.length} spécialités : normalement ${nbSpe}.</p>` : ""}
        </fieldset>
        <div class="fields">
          ${p.niveau === "terminale" ? `<div class="field"><label for="abandon">Spécialité abandonnée en fin de première</label><select id="abandon" data-bind="specialiteAbandonnee"><option value="">—</option>${E.SPECIALITES.map(([v, l]) => `<option value="${v}" ${p.specialiteAbandonnee === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>` : ""}
          <div class="field"><label for="optmaths">${p.niveau !== "terminale" ? "Option maths envisagée en terminale" : "Option de mathématiques"}</label><select id="optmaths" data-bind="optionMaths">
            <option value="aucune" ${p.optionMaths === "aucune" ? "selected" : ""}>Aucune</option><option value="expertes" ${p.optionMaths === "expertes" ? "selected" : ""}>Maths expertes</option><option value="complementaires" ${p.optionMaths === "complementaires" ? "selected" : ""}>Maths complémentaires</option></select></div>
          <div class="field"><label for="autresopt">Autres options <span class="hint">(section euro, LCA, DNL…)</span></label><input id="autresopt" type="text" data-bind="autresOptions" value="${esc(p.autresOptions)}"></div>
          ${champLycee(p)}
          <div class="field"><label for="anglaisauto">Ton niveau d'anglais estimé</label><select id="anglaisauto" data-bind="anglaisAuto"><option value="">Je ne sais pas</option>${E.CECRL.map((c) => `<option ${p.anglaisAuto === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>
        </div></div>`;
    } else if (e === 1) {
      const dispo = PERIODES.filter((l) => !p.periodes.some((x) => x.label === l) && (p.niveau === "terminale" || l.startsWith("Seconde") || (p.niveau === "premiere" && l.startsWith("Première"))));
      corps = `<div class="stack">
        <div class="dropzone stack" style="gap:8px">
          <h3>Importer mes bulletins (PDF)</h3>
          <p class="small muted">Bulletins numériques Pronote, EcoleDirecte, etc. Mon Plan Sup lit les matières, les moyennes, les moyennes de classe, le rang, les appréciations et la mention du conseil. Le fichier est analysé dans ton navigateur : il n'est envoyé nulle part. Les bulletins scannés (photos) ne sont pas lisibles.</p>
          <div class="row"><label class="btn primary" for="pdfbulletins">Choisir un ou plusieurs PDF</label><input id="pdfbulletins" type="file" accept="application/pdf,.pdf" multiple class="sr-only">${app.importEnCours ? '<span class="small" role="status">Lecture en cours…</span>' : ""}</div>
        </div>
        <details class="card-flat aide"><summary>Comment lire mon bulletin ?</summary>
          <dl class="lecture small">
            <dt>Coef. (coefficient)</dt><dd>Le poids de la matière dans la moyenne générale. Un 15 en maths coefficient 4 compte quatre fois plus qu'un 15 dans une matière coefficient 1. Tous les bulletins n'affichent pas de coefficients ; sans eux, chaque matière compte pareil.</dd>
            <dt>Moyenne élève</dt><dd>Ta moyenne dans la matière sur la période. C'est elle que les formations regardent en premier. Elle est parfois notée « Moy. élève », « Moyenne » ou simplement « Élève ».</dd>
            <dt>Moyenne de classe</dt><dd>La moyenne de tous les élèves de ta classe dans cette matière. Elle permet aux jurys de situer ta note : 14 dans une classe à 10 vaut plus que 14 dans une classe à 15. Parcoursup affiche les deux.</dd>
            <dt>Note la plus basse / la plus haute (Min / Max, « - » / « + »)</dt><dd>Les moyennes extrêmes de la classe. Elles montrent l'écart de niveau mais ne sont pas utilisées par Mon Plan Sup.</dd>
            <dt>Rang</dt><dd>Ta place dans la classe (par exemple 4 / 33), parfois matière par matière (Pronote l'écrit à côté du coefficient). De nombreux lycées ne l'affichent plus.</dd>
            <dt>An., T1, T2 (Pronote)</dt><dd>Rappels : « An. » est ta moyenne annuelle, T1 et T2 tes moyennes des trimestres précédents. Mon Plan Sup lit la colonne « Élève » du trimestre en cours et garde la moyenne annuelle à part.</dd>
            <dt>Appréciations</dt><dd>Les commentaires des professeurs et l'appréciation générale. Les jurys de prépa, de double licence et de Sciences Po les lisent avec attention : régularité, participation, autonomie.</dd>
            <dt>Mention du conseil</dt><dd>Excellence, félicitations, compliments, tableau d'honneur, encouragements… ou avertissement. Elle résume le trimestre.</dd>
            <dt>Abs., Disp., N. not.</dt><dd>Absent, dispensé, non noté : la matière n'a pas de moyenne sur la période et n'entre pas dans le calcul.</dd>
          </dl>
          <p class="tiny muted">Mon Plan Sup repère automatiquement ces colonnes grâce à leurs titres, même si elles sont dans un ordre différent, écrites sur plusieurs lignes ou fusionnées (bulletins Pronote). Vérifie toujours le résultat.</p>
        </details>
        ${app.imports.map((imp, k) => carteImport(imp, k)).join("")}
        <h3>Périodes enregistrées</h3>
        ${p.periodes.length ? "" : `<p class="notice info small">Aucune période pour l'instant : importe un PDF ou ajoute une période à la main.</p>`}
        ${p.periodes.map((per, i) => cartePeriode(per, i)).join("")}
        ${dispo.length ? `<div class="row"><label for="nouvper" class="sr-only">Période à ajouter</label><select id="nouvper" style="max-width:240px">${dispo.map((l) => `<option>${l}</option>`).join("")}</select><button class="btn" data-action="ajout-periode">Ajouter à la main</button></div>` : ""}
      </div>`;
    } else if (e === 2) {
      const bp = p.bacPremiere, s = E.statsProfil(p);
      corps = `<div class="stack"><p class="small muted">Épreuves anticipées passées en fin de première. Depuis la session 2026, les élèves de première passent aussi une épreuve anticipée de mathématiques en juin. Laisse vide si tu ne les as pas encore passées.</p>
        <div class="fields fields-sm">
          <div class="field"><label for="bfe">Français écrit /20</label><input id="bfe" type="number" min="0" max="20" step="0.5" inputmode="decimal" data-bind="bacPremiere.francaisEcrit" value="${esc(bp.francaisEcrit)}"></div>
          <div class="field"><label for="bfo">Français oral /20</label><input id="bfo" type="number" min="0" max="20" step="0.5" inputmode="decimal" data-bind="bacPremiere.francaisOral" value="${esc(bp.francaisOral)}"></div>
          <div class="field"><label for="bma">Maths (épreuve anticipée) /20</label><input id="bma" type="number" min="0" max="20" step="0.5" inputmode="decimal" data-bind="bacPremiere.maths" value="${esc(bp.maths)}"></div>
        </div>
        ${s.bacPremiere.scoreSciencesPo !== null ? `<p class="card-flat small">Score pondéré façon Sciences Po 2027 (écrit 60 %, oral 10 %, maths 30 %) : <strong>${E.fmt(s.bacPremiere.scoreSciencesPo)}/20</strong>.</p>` : ""}
        <p class="notice info small">À Sciences Po, à partir de 2027, ces trois notes comptent pour 20 points sur 80 dans la sélection, et le contrôle continu n'est plus pris en compte. Ailleurs, elles apparaissent dans ton dossier Parcoursup.</p></div>`;
    } else if (e === 3) {
      corps = `<div class="stack"><p class="small muted">Langues (Cambridge, IELTS, TOEFL, DELE, Goethe…), tests (TMUA, SAT, LNAT) et autres (BAFA, PSC1). Pour IELTS, TOEFL, TOEIC et Cambridge, le niveau européen est calculé à partir du score.</p>
        ${p.certifications.map((c, i) => `<div class="card stack" style="gap:10px"><div class="fields">
          <div class="field"><label for="ct${i}">Certification</label><select id="ct${i}" data-list="certifications" data-i="${i}" data-k="type">${CERTS.map((t) => `<option ${c.type === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>
          <div class="field"><label for="cs${i}">Score <span class="hint">(si connu)</span></label><input id="cs${i}" type="text" data-list="certifications" data-i="${i}" data-k="score" value="${esc(c.score)}"></div>
          <div class="field"><label for="cn${i}">Niveau CECRL</label><select id="cn${i}" data-list="certifications" data-i="${i}" data-k="niveau"><option value="">${E.niveauCertif(Object.assign({}, c, { niveau: "" })) ? "Calculé : " + E.niveauCertif(Object.assign({}, c, { niveau: "" })) : "—"}</option>${E.CECRL.map((x) => `<option ${c.niveau === x ? "selected" : ""}>${x}</option>`).join("")}</select></div>
          <div class="field"><label for="cd${i}">Date</label><input id="cd${i}" type="month" data-list="certifications" data-i="${i}" data-k="date" value="${esc(c.date)}"></div>
        </div><div><button class="btn sm danger" data-action="suppr" data-list="certifications" data-i="${i}">Retirer</button></div></div>`).join("")}
        <div><button class="btn" data-action="ajout" data-list="certifications">Ajouter une certification</button></div></div>`;
    } else if (e === ETAPE_Q) {
      corps = corpsQuestionnaire();
    } else {
      corps = `<div class="stack"><p class="small muted">Stages, jobs, bénévolat, associations, projets personnels, compétitions, responsabilités.</p>
        ${p.experiences.map((x, i) => `<div class="card stack" style="gap:10px"><div class="fields">
          <div class="field"><label for="et${i}">Type</label><select id="et${i}" data-list="experiences" data-i="${i}" data-k="type">${EXPS.map(([v, l]) => `<option value="${v}" ${x.type === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
          <div class="field"><label for="ed${i}">Description</label><input id="ed${i}" type="text" data-list="experiences" data-i="${i}" data-k="titre" value="${esc(x.titre)}"></div>
          <div class="field"><label for="eu${i}">Durée / année</label><input id="eu${i}" type="text" data-list="experiences" data-i="${i}" data-k="duree" value="${esc(x.duree)}"></div>
        </div><div><button class="btn sm danger" data-action="suppr" data-list="experiences" data-i="${i}">Retirer</button></div></div>`).join("")}
        <div><button class="btn" data-action="ajout" data-list="experiences">Ajouter une expérience</button></div></div>`;
    }
    const s = E.statsProfil(p), estQ = e === ETAPE_Q;
    const suivant = e < ETAPES.length - 1
      ? `<button class="btn primary" data-action="etape" data-i="${e + 1}">${e === ETAPE_Q - 1 ? "Passer au questionnaire" : "Suivant"}</button>`
      : profilComplet() ? `<button class="btn primary" data-action="profil-resume">Terminer</button>` : `<a class="btn primary" href="#liste">Voir ma liste</a>`;
    return `<div class="stack-lg profil-edition">
      ${pageHero({ sur: "Profil", titre: "Ton profil", sous: `Étape ${e + 1} sur ${ETAPES.length} : ${estQ ? "tes envies" : ETAPES[e].toLowerCase()}. Tout est enregistré automatiquement sur ton appareil.`, ton: "bleu", ico: "personne", actions: etat.profilTermine === true ? `<button class="btn blanc sm" data-action="profil-resume">Voir le résumé</button>` : "" })}
      ${stepper}
      <div class="card stack"><h2>${estQ ? "Tes envies" : ETAPES[e]}</h2>${corps}</div>
      <div class="row pied-etapes">
        <button class="btn ghost" data-action="etape" data-i="${Math.max(0, e - 1)}" ${e === 0 ? "disabled" : ""}>${estQ ? "Étape précédente" : "Précédent"}</button>
        ${suivant}
      </div>
      ${estQ ? "" : `<p class="small muted synthese">Moyenne ${E.fmt(s.moyenneGenerale)} · maths ${E.fmt(s.maths)} · anglais ${s.anglais ? s.anglais + (s.anglaisCertifie ? " (certifié)" : " (estimé)") : "—"} · appréciations ${s.appreciations ? E.NIVEAUX[s.appreciations.niveau].label.toLowerCase() : "non renseignées"} · ${s.nbExperiences} expérience(s)</p>`}
    </div>`;
  }

  function carteImport(imp, k) {
    const noms = NOMS_MAT(), lignes = Object.entries(imp.notes || {});
    return `<div class="card stack import" style="gap:10px">
      <div class="row" style="justify-content:space-between"><strong>${esc(imp.fichier)}</strong><span class="pill neutral">${lignes.length} matière(s) lue(s)</span></div>
      ${imp.colonnes ? `<p class="small"><strong>Colonnes reconnues :</strong> ${imp.colonnes.map((c) => `<span class="pill neutral">${esc(B.TYPES_COL[c] || c)}</span>`).join(" → ")}</p>` : ""}
      ${(imp.alertes || []).length ? `<ul class="why small alerte">${imp.alertes.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}
      ${lignes.length ? `<div class="fields fields-sm">
        <div class="field"><label for="ip${k}">Période</label><select id="ip${k}" data-imp="${k}" data-k="label"><option value="">— choisir —</option>${PERIODES.map((l) => `<option ${imp.label === l ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        <div class="field"><label for="ig${k}">Moyenne générale</label><input id="ig${k}" type="text" inputmode="decimal" data-imp="${k}" data-k="moyenneGenerale" value="${esc(imp.moyenneGenerale)}"></div>
        <div class="field"><label for="ic${k}">Moy. de classe</label><input id="ic${k}" type="text" inputmode="decimal" data-imp="${k}" data-k="moyenneClasse" value="${esc(imp.moyenneClasse)}"></div>
        <div class="field"><label for="ir${k}">Rang</label><input id="ir${k}" type="text" inputmode="numeric" data-imp="${k}" data-k="rang" value="${esc(imp.rang)}"></div>
        <div class="field"><label for="ie${k}">Effectif</label><input id="ie${k}" type="text" inputmode="numeric" data-imp="${k}" data-k="effectif" value="${esc(imp.effectif)}"></div>
      </div>
      <div class="table-wrap"><table><thead><tr><th scope="col">Matière lue</th><th scope="col">Coef.</th><th scope="col">Moy. élève</th><th scope="col">Moy. classe</th><th scope="col">Rang</th><th scope="col">Appréciation</th></tr></thead><tbody>
        ${lignes.map(([m, x]) => `<tr><td class="small">${esc(noms[m] || m)}</td><td class="num muted">${esc(x.coef) || "—"}</td><td class="num"><strong>${esc(x.moy) || esc(x.statut) || "—"}</strong></td><td class="num">${esc(x.classe)}</td><td class="num muted">${esc(x.rang || "") || "—"}</td><td class="small">${esc(x.appreciation) || '<span class="muted">—</span>'}</td></tr>`).join("")}
      </tbody></table></div>
      ${imp.moyenneAnnuelle ? `<p class="small"><strong>Moyenne annuelle (colonne « An. ») :</strong> ${esc(imp.moyenneAnnuelle)}</p>` : ""}
      ${imp.appreciationGenerale ? `<p class="small"><strong>Appréciation générale :</strong> ${esc(imp.appreciationGenerale)}</p>` : ""}
      ${imp.mention ? `<p class="small"><strong>Mention du conseil :</strong> ${esc(imp.mention)}</p>` : ""}
      <div class="row"><button class="btn primary sm" data-action="valider-import" data-k="${k}">Ajouter à mon profil</button><button class="btn sm ghost" data-action="ignorer-import" data-k="${k}">Ignorer</button></div>
      <p class="tiny muted">Vérifie les valeurs : la lecture automatique peut se tromper selon la mise en page du bulletin. Tu pourras tout corriger ensuite.</p>` : `<div><button class="btn sm ghost" data-action="ignorer-import" data-k="${k}">Fermer</button></div>`}
    </div>`;
  }

  function cartePeriode(per, i) {
    const mats = matieresPeriode(per);
    return `<details class="card stack periode" style="gap:12px" ${app.ouverte === i ? "open" : ""} data-per-details="${i}">
      <summary><span class="per-titre">${esc(per.label)}</span><span class="small muted">moyenne ${esc(per.moyenneGenerale) || "—"}${per.rang ? ` · rang ${esc(per.rang)}${per.effectif ? "/" + esc(per.effectif) : ""}` : ""}${per.source === "pdf" ? " · importé" : ""}</span></summary>
      <div class="fields fields-sm">
        <div class="field"><label for="pg${i}">Moyenne générale</label><input id="pg${i}" type="number" step="0.01" min="0" max="20" inputmode="decimal" data-per="${i}" data-k="moyenneGenerale" value="${esc(per.moyenneGenerale)}"></div>
        <div class="field"><label for="pc${i}">Moyenne de la classe</label><input id="pc${i}" type="number" step="0.01" min="0" max="20" inputmode="decimal" data-per="${i}" data-k="moyenneClasse" value="${esc(per.moyenneClasse)}"></div>
        <div class="field"><label for="pr${i}">Rang</label><input id="pr${i}" type="number" min="1" inputmode="numeric" data-per="${i}" data-k="rang" value="${esc(per.rang)}"></div>
        <div class="field"><label for="pe${i}">Effectif</label><input id="pe${i}" type="number" min="1" inputmode="numeric" data-per="${i}" data-k="effectif" value="${esc(per.effectif)}"></div>
        <div class="field"><label for="pm${i}">Mention du conseil</label><select id="pm${i}" data-per="${i}" data-k="mention">${MENTIONS_CONSEIL.map((m) => `<option ${per.mention === m ? "selected" : ""} value="${m}">${m || "—"}</option>`).join("")}</select></div>
      </div>
      <div class="table-wrap"><table><thead><tr><th scope="col">Matière</th><th scope="col">Coef.</th><th scope="col">Ta moyenne</th><th scope="col">Moy. classe</th><th scope="col">Rang</th><th scope="col">Appréciation</th></tr></thead><tbody>
        ${mats.map(([k, l]) => { const n = (per.notes || {})[k] || {}; return `<tr><th scope="row" class="mat">${esc(l)}</th>
          <td><input type="number" step="0.5" min="0" max="20" inputmode="decimal" class="coef" aria-label="${esc(l)} : coefficient" data-per="${i}" data-mat="${k}" data-k="coef" value="${esc(n.coef)}" placeholder="1"></td>
          <td><input type="number" step="0.01" min="0" max="20" inputmode="decimal" aria-label="${esc(l)} : ta moyenne" data-per="${i}" data-mat="${k}" data-k="moy" value="${esc(n.moy)}"></td>
          <td><input type="number" step="0.01" min="0" max="20" inputmode="decimal" aria-label="${esc(l)} : moyenne de classe" data-per="${i}" data-mat="${k}" data-k="classe" value="${esc(n.classe)}"></td>
          <td><input type="text" aria-label="${esc(l)} : appréciation" data-per="${i}" data-mat="${k}" data-k="appreciation" value="${esc(n.appreciation)}" class="appr"></td></tr>`; }).join("")}
      </tbody></table></div>
      <div class="field"><label for="pa${i}">Appréciation générale</label><textarea id="pa${i}" data-per="${i}" data-k="appreciationGenerale" style="min-height:60px">${esc(per.appreciationGenerale)}</textarea></div>
      <div><button class="btn sm danger" data-action="suppr-periode" data-i="${i}">Supprimer cette période</button></div>
    </details>`;
  }

  /* ================================================================ QUESTIONNAIRE (étape du profil) */
  function corpsQuestionnaire() {
    const qs = QUEST.questions, i = Math.min(etat.qIndex || 0, qs.length);
    if (i >= qs.length) {
      return `<div class="q-card stack"><p>Merci, tes réponses sont enregistrées (${nbReponses()} sur ${qs.length}). Tu peux revenir sur une question à tout moment.</p>
        <div class="progress" aria-hidden="true"><div style="width:100%"></div></div>
        <div class="row"><a class="btn primary" href="#liste">Voir mes recommandations</a><button class="btn ghost" data-action="q-aller" data-i="0">Revoir mes réponses</button></div></div>`;
    }
    const q = qs[i], r = etat.reponses[q.id];
    let champ = "";
    if (q.type === "scale") {
      champ = `<div class="scale" role="radiogroup" aria-label="${esc(q.question)}">${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="q" value="${n}" data-q="${q.id}" ${Number(r) === n ? "checked" : ""}>${n}</label>`).join("")}</div>
        <div class="scale-ends"><span>1 = ${esc(q.gauche)}</span><span>5 = ${esc(q.droite)}</span></div>`;
    } else {
      const multi = q.type === "multi", vals = Array.isArray(r) ? r : r ? [r] : [];
      champ = `<div class="q-options">${q.options.map((o) => `<label class="q-option"><input type="${multi ? "checkbox" : "radio"}" name="q" value="${esc(o.value)}" data-q="${q.id}" ${vals.includes(o.value) ? "checked" : ""}>${esc(o.label)}</label>`).join("")}</div>
        ${multi && q.max < q.options.length ? `<p class="small muted">${q.max} choix maximum.</p>` : ""}`;
    }
    return `<div class="q-card stack-lg">
      <div class="stack" style="gap:8px"><div class="row" style="justify-content:space-between"><span class="eyebrow">${esc(q.theme)}</span><span class="small muted">Question ${i + 1} / ${qs.length}</span></div>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${qs.length}" aria-valuenow="${i}" aria-label="Progression du questionnaire"><div style="width:${(i / qs.length) * 100}%"></div></div></div>
      <fieldset class="stack" style="border:0;padding:0;margin:0"><legend class="q-question">${esc(q.question)}</legend>${q.aide ? `<p class="small muted">${esc(q.aide)}</p>` : ""}${champ}</fieldset>
      <div class="row q-nav">
        <button class="btn sm" data-action="q-aller" data-i="${i - 1}" ${i === 0 ? "disabled" : ""}>← Question précédente</button>
        <div class="row"><button class="btn sm ghost" data-action="q-nsp" data-q="${q.id}">Je ne sais pas</button><button class="btn sm primary" data-action="q-aller" data-i="${i + 1}">${i === qs.length - 1 ? "Terminer" : "Question suivante →"}</button></div>
      </div>
      ${r === "nsp" ? `<p class="small muted">Réponse actuelle : je ne sais pas.</p>` : ""}
    </div>`;
  }

  /* ================================================================ RÉSULTATS */
  const nbFr = (n) => Number(n).toLocaleString("fr-FR");
  // Texte des frais d'une fiche (cout.texte, sinon frais.texte), affiché tel quel quand le montant n'est pas chiffré
  const texteFrais = (f) => (f.cout && f.cout.texte) || (f.frais && f.frais.texte) || "";
  // Apprentissage relevé sur la fiche Parcoursup (data/frais-prives.json) : texte relevé, tel quel, toujours précédé de
  // son contexte (un contrat avec un employeur), pour qu'un « gratuit » du relevé ne se lise jamais comme « la formation
  // est gratuite ». Il ne change jamais le montant affiché.
  const PREFIXE_APPRENTISSAGE = "En contrat d'apprentissage (avec un employeur) : ";
  const texteApprentissage = (t) => `${PREFIXE_APPRENTISSAGE}${t.replace(/\.$/, "")}.`;
  function carteResultat(x, rang) {
    const f = x.f, retenu = etat.retenus.includes(f.id), cout = f.cout.valeur_annuelle_eur, a = f.admission || {};
    const C = [["Notes", x.crit.notes], ["Spécialités", x.crit.specialites], ["Appréciations", x.crit.appreciations], ["Langues", x.crit.langues], ["Tests", x.crit.tests], ["Extrascolaire", x.crit.extra]];
    const faits = [
      a.places ? ["groupe", `${nbFr(a.places)} places`] : ["groupe", "Places n. c."],
      a.candidats ? ["bulle", `${nbFr(a.candidats)} vœux`] : null,
      ["euro", cout != null ? `${f.cout.libelle === "droits_inscription" ? "Droits d'inscription " : ""}${f.cout.min != null && f.cout.min < cout ? montantFrais(f.cout) : "≈ " + E.fmtEur(cout)}/an` : "Coût n. c."],
      x.dist != null ? ["pin", `≈ ${nbFr(Math.round(x.dist))} km de chez toi`] : null,
      f.classement && f.classement.texte ? ["trophee", f.classement.texte] : null,
    ].filter(Boolean);
    return `<article class="card f-card cat-${CAT_TON[x.categorie]}">
      <div class="f-head">
        ${rang ? `<span class="f-rang" aria-label="Rang ${rang}">${rang}</span>` : ""}
        <div class="f-titre">
          <div class="row badges">${x.repere.nouvelle || x.repere.sansStats ? "" : catPill(x.categorie)}${typePill(f.type, f.type_label)}${f.stats === "nouvelle_2026" ? '<span class="pill ton-menthe">Nouvelle en 2026</span>' : ""}${x.bloque ? '<span class="pill bad">Point bloquant</span>' : ""}${x.exclu ? '<span class="pill bad">Hors de tes critères</span>' : ""}</div>
          <h3><a href="#formation-${f.id}">${esc(f.nom)}</a></h3>
          <p class="f-lieu"><span>${ico("ecole")}${esc(f.etablissement)}</span><span>${ico("pin")}${esc(f.ville)}${f.pays !== "France" ? ", " + esc(f.pays) : ""}</span></p>
        </div>
        ${anneau(x.repere, x.categorie)}
      </div>
      <div class="f-faits">${faits.map(([i, t]) => `<span>${ico(i)}${esc(t)}</span>`).join("")}</div>
      ${ligneRepere(x)}
      ${notesSur5(x)}
      <div class="crit">${C.map(([l, c]) => `<div class="crit-item" title="${esc(c.texte)}"><span class="crit-l">${l}</span>${niveauBarre(c.niveau)}<span class="crit-v lvl-${c.niveau}">${E.NIVEAUX[c.niveau].label}</span></div>`).join("")}</div>
      ${x.raisons.length ? `<ul class="why coche">${x.raisons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
      ${x.exclu ? `<p class="small texte-bad">${esc(x.exclu)}</p>` : x.ajust.length ? `<p class="small muted">Moins bien classée car : ${esc(x.ajust.join(", "))}.</p>` : ""}
      <div class="row f-actions"><a class="btn sm" href="#formation-${f.id}">Voir la fiche${ico("fleche")}</a><button class="btn sm ${retenu ? "primary" : "doux"}" data-action="retenir" data-id="${f.id}" aria-pressed="${retenu}">${ico("etoile", retenu ? "plein" : "")}${retenu ? "Dans mes vœux" : "Ajouter à mes vœux"}</button></div>
    </article>`;
  }

  // Prépas regroupées par famille (mêmes attentes) : une seule carte, avec chaque lycée en ligne
  const rangeTxt = (a, fmt) => (a.length ? (Math.min(...a) === Math.max(...a) ? fmt(Math.min(...a)) : `${fmt(Math.min(...a))} à ${fmt(Math.max(...a))}`) : "n. c.");
  function carteFamille(membres, rang) {
    const best = membres[0], prepa = !!best.f.famille;
    const fam = best.f.famille || { nom: best.f.nom, description: `Même formation proposée par ${membres.length} établissements. Compare-les ici, puis garde-en un ou deux dans tes vœux.` };
    const lieu = prepa ? "lycées" : "établissements";
    const moys = membres.map((x) => x.f.notes && x.f.notes.moyenne_cible).filter((v) => v != null);
    const C = [["Notes", best.crit.notes], ["Spécialités", best.crit.specialites], ["Appréciations", best.crit.appreciations], ["Extrascolaire", best.crit.extra]];
    const court = (x) => x.f.etablissement.replace(/^Lycée |^Institution /, "");
    return `<article class="card f-card famille cat-${CAT_TON[best.categorie]}">
      <div class="f-head">
        ${rang ? `<span class="f-rang" aria-label="Rang ${rang}">${rang}</span>` : ""}
        <div class="f-titre">
          <div class="row badges">${typePill(best.f.type, best.f.type_label)}<span class="pill ton-bleu">${ico("groupe")}${membres.length} ${prepa ? "lycées aux attentes comparables" : "établissements"}</span></div>
          <h3>${esc(fam.nom)}</h3>
          <p class="small muted">${esc(fam.description)}</p>
        </div>
        <div class="anneau-legende">${anneau(best.repere, best.categorie)}<span>${esc(court(best))}</span></div>
      </div>
      <div class="f-faits"><span>${ico("groupe")}Places : ${rangeTxt(membres.map((x) => x.f.admission && x.f.admission.places).filter((v) => v), (v) => String(v))}</span><span>${ico("courbe")}Repère de moyenne des admis : ${rangeTxt(moys, E.fmt)}</span></div>
      ${notesSur5(best)}
      <div class="crit">${C.map(([l, c]) => `<div class="crit-item" title="${esc(c.texte)}"><span class="crit-l">${l}</span>${niveauBarre(c.niveau)}<span class="crit-v lvl-${c.niveau}">${E.NIVEAUX[c.niveau].label}</span></div>`).join("")}</div>
      ${(() => { const tete = `<div class="table-wrap"><table class="fam-table"><thead><tr><th scope="col">${prepa ? "Lycée" : "Établissement"}</th><th scope="col">Note</th><th scope="col">Places</th><th scope="col">Repères</th></tr></thead><tbody>`;
        const ligne = (x) => { const r = etat.retenus.includes(x.f.id); return `<tr><td><a href="#formation-${x.f.id}">${esc(court(x))}</a><div class="tiny muted">${esc(x.f.ville)}${prepa ? " · " + esc(x.f.nom.replace(/^CPGE /, "")) : ""}</div>${alerteFraisHtml(x, "div", "tiny")}<div class="row" style="gap:6px;margin-top:6px">${catPill(x.categorie)}<button class="btn xs ${r ? "primary" : "doux"}" data-action="retenir" data-id="${x.f.id}" aria-pressed="${r}" aria-label="${r ? "Retirer" : "Ajouter"} ${esc(court(x))} ${r ? "de" : "à"} mes vœux">${ico("etoile", r ? "plein" : "")}${r ? "Retenu" : "Ajouter"}</button></div></td><td class="num">${noteCourte(x)}</td><td class="num">${x.f.admission && x.f.admission.places ? x.f.admission.places : "n. c."}</td><td class="num"><span class="chance-txt ton-${CAT_TON[x.categorie]}">${repereTxt(x.repere)}</span></td></tr>`; };
        const VIS = 5, debut = membres.slice(0, VIS), reste = membres.slice(VIS);
        return tete + debut.map(ligne).join("") + "</tbody></table></div>" + (reste.length ? `<details class="fam-plus"><summary>${ico("groupe")}Voir les ${reste.length} autres ${lieu}</summary>${tete}${reste.map(ligne).join("")}</tbody></table></div></details>` : ""); })()}
      <p class="tiny muted">Sur Parcoursup, chaque ${prepa ? "lycée" : "établissement"} est un vœu distinct : choisis-en un ou deux dans cette famille et complète avec d'autres niveaux d'exigence.</p>
    </article>`;
  }
  function regrouper(vis) {
    const items = [], vus = new Set(), parFil = new Map();
    for (const y of vis) { const k = E.filiere(y.f); if (!parFil.has(k)) parFil.set(k, []); parFil.get(k).push(y); }
    for (const x of vis) {
      const k = E.filiere(x.f);
      if (vus.has(k)) continue;
      vus.add(k);
      const m = parFil.get(k);
      items.push(m.length >= 2 ? { fam: m } : { one: x });
    }
    return items;
  }

  /* ================================================================ MA LISTE (recommandations + vœux retenus) */
  const NB_TOP = 10;
  function manquesProfil(A) {
    const manque = [];
    if (!etat.profil.periodes.length) manque.push(`<a href="#profil">tes bulletins</a>`);
    if (!etat.profil.specialites.length) manque.push(`<a href="#profil">tes spécialités</a>`);
    if (!A.interets.repondues) manque.push(`<a href="#profil" data-action="profil-edition" data-i="${ETAPE_Q}">le questionnaire</a>`);
    return manque;
  }
  const carteItem = (it, rang) => (it.fam ? carteFamille(it.fam, rang) : carteResultat(it.one, rang));
  function vueRecommandations(A) {
    // 10 meilleures recommandations (classement inchangé, prépas regroupées par famille)
    const tous = regrouper(A.resultats.filter((x) => !x.exclu));
    const top = tous.slice(0, NB_TOP);
    const idsTop = new Set(top.flatMap((it) => (it.fam ? it.fam.map((x) => x.f.id) : [it.one.f.id])));
    const nbAutres = A.resultats.filter((x) => !x.exclu && !idsTop.has(x.f.id)).length;
    const repartition = { ambitieux: 0, realiste: 0, securite: 0 };
    top.forEach((it) => { repartition[(it.fam ? it.fam[0] : it.one).categorie]++; });
    let html = `<section class="stack" aria-labelledby="top-titre">
      <div class="section-tete row" style="justify-content:space-between;align-items:flex-end"><div><h2 id="top-titre">Tes ${top.length} meilleures formations</h2><p class="small muted">Classées par pertinence pour toi. Ajoute celles qui t'intéressent à tes vœux.</p></div>
        ${top.length ? `<div class="legende-cats">${[["ambitieux", "Ambitieux"], ["realiste", "Réalistes"], ["securite", "Sécurité"]].map(([c, l]) => `<span class="ton-${CAT_TON[c]}"><i></i>${repartition[c]} ${l.toLowerCase()}</span>`).join("")}</div>` : ""}</div>
      <div class="stack">${top.map((it, i) => carteItem(it, i + 1)).join("") || `<div class="card vide">${ico("boussole")}<p>Complète ton profil pour obtenir des recommandations.</p><a class="btn primary" href="#profil">Compléter mon profil</a></div>`}</div>
    </section>`;
    if (!app.plusFormations) {
      html += nbAutres ? `<div class="plus-bloc"><button class="btn lg" data-action="plus-formations">Voir plus de formations <span class="compteur">${nbFr(nbAutres)}</span></button></div>` : "";
      return html;
    }
    // formations supplémentaires : filtres, catégories et pagination (fonctionnement de l'ancienne page Résultats)
    const fi = app.filtres;
    let liste = A.resultats.filter((x) => !idsTop.has(x.f.id) && (fi.exclus || !x.exclu));
    if (fi.type) liste = liste.filter((x) => x.f.type === fi.type);
    if (fi.pays) liste = liste.filter((x) => (fi.pays === "France" ? x.f.pays === "France" : x.f.pays !== "France"));
    if (fi.q) { const q = fi.q.toLowerCase(); liste = liste.filter((x) => (x.f.nom + " " + x.f.etablissement + " " + x.f.ville + " " + x.f.pays).toLowerCase().includes(q)); }
    const compte = { ambitieux: 0, realiste: 0, securite: 0 }; liste.forEach((x) => compte[x.categorie]++);
    const vis = app.filtreCat === "tous" ? liste : liste.filter((x) => x.categorie === app.filtreCat);
    const nbExclus = A.resultats.filter((x) => x.exclu).length;
    const items = regrouper(vis);
    html += `<section class="stack plus-section" id="plus-formations" aria-labelledby="plus-titre">
      <div class="section-tete row" style="justify-content:space-between"><div><h2 id="plus-titre">Plus de formations</h2><p class="small muted">${nbFr(liste.length)} autres formations, de la plus à la moins pertinente.</p></div><button class="btn sm ghost" data-action="moins-formations">Masquer</button></div>
      <div class="cat-tabs" role="group" aria-label="Filtrer par catégorie">
        ${[["ambitieux", "Ambitieux", "moins de 25 %"], ["realiste", "Réalistes", "25 à 55 %"], ["securite", "Sécurité", "plus de 55 %"]].map(([c, l, s]) => `<button class="cat-tab ton-${CAT_TON[c]}" data-action="cat" data-c="${c}" aria-pressed="${app.filtreCat === c}"><strong>${compte[c]}</strong><span>${l}</span><small>${s}</small></button>`).join("")}
      </div>
      <details class="card-flat" ${app.filtresOuverts || fi.type || fi.pays || fi.q || fi.exclus ? "open" : ""} data-details="filtres"><summary>${ico("loupe")}Filtrer et rechercher</summary>
      <div class="filters" style="margin-top:12px">
        <div class="field"><label for="ftype">Type</label><select id="ftype" data-filtre="type"><option value="">Tous</option>${Object.entries(TYPES()).map(([k, l]) => `<option value="${k}" ${fi.type === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        <div class="field"><label for="fpays">Lieu</label><select id="fpays" data-filtre="pays"><option value="">Tous</option><option value="France" ${fi.pays === "France" ? "selected" : ""}>France</option><option value="etranger" ${fi.pays === "etranger" ? "selected" : ""}>Étranger</option></select></div>
        <div class="field"><label for="fq">Rechercher</label><input id="fq" type="text" data-filtre="q" value="${esc(fi.q)}" placeholder="Henri-IV, LSE, droit…"></div>
        <label class="row small check-label"><input type="checkbox" data-filtre="exclus" ${fi.exclus ? "checked" : ""}> Afficher les ${nbExclus} hors critères</label>
        ${app.filtreCat !== "tous" ? `<button class="btn sm" data-action="cat" data-c="tous">Toutes catégories</button>` : ""}
      </div></details>
      <div class="stack">${items.slice(0, app.limite).map((it) => carteItem(it)).join("") || `<p class="muted">Aucune formation ne correspond à ces filtres.</p>`}</div>
      ${items.length > app.limite ? `<div class="plus-bloc"><button class="btn" data-action="plus">Afficher la suite (${items.length - app.limite} restantes)</button></div>` : ""}
    </section>`;
    return html;
  }
  // barre d'équilibre de la liste : répartition actuelle comparée à la cible 3 / 4 / 3
  function equilibre(compte) {
    const cible = { ambitieux: 3, realiste: 4, securite: 3 };
    return `<div class="equilibre">
      <div class="eq-barre" role="img" aria-label="Répartition : ${compte.ambitieux} ambitieux, ${compte.realiste} réalistes, ${compte.securite} sûrs">${["ambitieux", "realiste", "securite"].map((c) => (compte[c] ? `<span class="ton-${CAT_TON[c]}" style="flex:${compte[c]}">${compte[c]}</span>` : "")).join("")}</div>
      <div class="eq-leg">${[["ambitieux", "Ambitieux"], ["realiste", "Réalistes"], ["securite", "Sûrs"]].map(([c, l]) => `<span class="ton-${CAT_TON[c]}"><i></i>${l} <b>${compte[c]}</b><small>/ ${cible[c]} conseillés</small></span>`).join("")}</div>
    </div>`;
  }
  // Bloc « Et à l'étranger ? » : hors Parcoursup, chaque proposition est rattachée à un vœu français
  const STATUT_COUT = { releve_parcoursup: "relevé sur Parcoursup", officiel: "officiel", source_secondaire: "source secondaire", estimation: "estimation", indicatif: "indicatif", non_communique: "non communiqué" };
  function blocEtranger(X) {
    const tete = (sous) => `<div class="carte-tete"><span class="info-ico ton-ciel">${ico("globe")}</span><div><h3 id="etr-titre">Et à l'étranger ?</h3><p class="small muted">${sous}</p></div></div>`;
    if (X.mode === "non") return `<details class="card-flat no-print"><summary>${ico("globe")}Et à l'étranger ?</summary><p class="small muted" style="margin-top:8px">Tu as indiqué vouloir rester en France, on n'insiste pas. Si tu changes d'avis, modifie ta réponse dans <a href="#profil" data-action="profil-edition" data-i="${ETAPE_Q}">le questionnaire</a>.</p></details>`;
    if (X.mode === "echange") {
      if (!X.liste.length) return "";
      return `<section class="card stack etranger" aria-labelledby="etr-titre">${tete("Tu préfères partir le temps d'un échange : ces formations françaises proches de tes vœux sont très ouvertes à l'international (semestre ou année à l'étranger, doubles diplômes…).")}
        <ul class="etr-liste">${X.liste.map(({ x }) => `<li class="etr-item"><h4><a href="#formation-${x.f.id}">${esc(x.f.nom)}</a></h4><p class="small muted">${esc(x.f.etablissement)} · ${esc(x.f.ville)}</p>
          <div class="row f-actions">${btnRetenir(x)}</div></li>`).join("")}</ul></section>`;
    }
    if (!X.liste.length) return "";
    const intro = X.mode === "oui" ? "Ton projet : étudier à l'étranger. Voici l'équivalent de tes vœux dans d'autres pays." : "Tu n'es pas fermé à l'étranger : voici l'équivalent de certains de tes vœux dans d'autres pays.";
    const items = X.liste.map((e) => {
      const f = e.x.f, a = e.ancre && e.ancre.f;
      const lr = f.langue_requise || {};
      const pills = [`<span class="pill ton-ciel">${ico("pin")}${esc(f.pays)}</span>`,
        e.francais ? `<span class="pill ton-menthe">Cours en français</span>` : "",
        e.moinsCher ? `<span class="pill ton-menthe">${ico("euro")}Parmi les moins chères du Royaume-Uni</span>` : "",
        e.bientot ? `<span class="pill bad">${ico("alerte")}Date limite dans ${e.jours} jour${e.jours > 1 ? "s" : ""}</span>` : ""].join("");
      const frais = e.frais != null ? `${e.frais === 0 ? "Gratuit" : `≈ ${E.fmtEur(e.frais)}/an`}<span class="badge-statut ${f.cout.statut}">${STATUT_COUT[f.cout.statut] || f.cout.statut}</span>` : `Non communiqués<span class="badge-statut non_communique">à vérifier</span>`;
      const vie = e.vie ? `${e.vie.min === e.vie.max ? "≈ " + E.fmtEur(e.vie.min) : `${E.fmtEur(e.vie.min)} à ${E.fmtEur(e.vie.max)}`}/mois<span class="badge-statut ${e.vie.statut}">${STATUT_COUT[e.vie.statut]}</span>` : "n. c.";
      const plat = { ucas: "UCAS", commonapp: "Common App", ouac: "OUAC (Ontario)", propre: "dossier sur le site de l'université" }[f.plateforme] || f.plateforme;
      const taux = f.admission && f.admission.taux != null ? ` Taux d'admission publié : ${String(f.admission.taux).replace(".", ",")} %.` : "";
      return `<li class="etr-item">
        ${a ? `<p class="etr-ancre">${ico("fleche")}Équivalent de <a href="#formation-${a.id}">${esc(a.nom)}</a> <span class="muted">(${esc(a.etablissement)})</span></p>` : ""}
        <h4><a href="#formation-${f.id}">${esc(f.nom)}</a></h4>
        <p class="small muted">${esc(f.etablissement)} · ${esc(f.ville)}</p>
        <div class="row badges">${pills}</div>
        <dl class="etr-faits">
          <div><dt>Frais de scolarité</dt><dd>${frais}</dd></div>
          <div><dt>Vie sur place</dt><dd>${vie}</dd></div>
          <div><dt>Langue</dt><dd>${esc(f.langue || "n. c.")}${lr.anglais_cecrl ? ` · anglais ${esc(lr.anglais_cecrl)} demandé` : ""}</dd></div>
          <div><dt>Candidature</dt><dd>${esc(plat)}${e.date ? ` · avant le ${fmtDate(e.date)}` : ""}</dd></div>
          <div><dt>Admission</dt><dd>Pas de repère : peu d'universités publient leurs statistiques.${taux} Repère : ${esc((f.notes && f.notes.texte) || "voir la fiche").slice(0, 140)}${f.notes && f.notes.texte && f.notes.texte.length > 140 ? "…" : ""}</dd></div>
        </dl>
        ${texteFrais(f) && (e.frais == null || /réduction|Scholarship|bourse/i.test(texteFrais(f))) ? `<p class="tiny muted">${esc(texteFrais(f))}</p>` : ""}
        <div class="row f-actions"><a class="btn sm" href="#formation-${f.id}">Voir la fiche${ico("fleche")}</a>${btnRetenir(e.x)}</div>
      </li>`;
    }).join("");
    const notes = [];
    notes.push("Ces candidatures ne passent pas par Parcoursup : elles ne prennent aucun de tes 10 vœux. Au Royaume-Uni, UCAS autorise 5 choix.");
    if (X.budgetSerre && X.liste.some((e) => e.x.f.pays === "Royaume-Uni")) notes.push("Ton budget est serré : au Royaume-Uni, on t'a montré les universités les moins chères pour ton profil. Certaines appliquent une réduction automatique aux étudiants européens. Pense aussi aux bourses de l'université et au coût de la vie, souvent plus élevé qu'en France.");
    if (X.anglaisFragile && X.liste.some((e) => e.francais)) notes.push("Tu n'es pas encore à l'aise pour suivre tous tes cours en anglais : on a mis en avant des formations en français, pour partir sans changer de langue.");
    return `<section class="card stack etranger" aria-labelledby="etr-titre">${tete(intro)}
      ${notes.map((t) => `<p class="notice info small">${esc(t)}</p>`).join("")}
      <ul class="etr-liste">${items}</ul>
      <p class="tiny muted">Coût de la vie : montants officiels exigés pour le visa quand ils existent, sinon estimations à vérifier. Dates limites tirées des sites officiels ; les formations dont la date est passée ne sont plus proposées.</p>
    </section>`;
  }
  const btnRetenir = (x) => { const r = etat.retenus.includes(x.f.id); return `<button class="btn sm ${r ? "primary" : "doux"}" data-action="retenir" data-id="${x.f.id}" aria-pressed="${r}">${ico("etoile", r ? "plein" : "")}${r ? "Dans mes vœux" : "Ajouter à mes vœux"}</button>`; };
  /* ---------------------------------------------------------------- formations équivalentes (docs/modele-chances.md, section 11) */
  // Sous chaque vœu de la liste proposée (E.wishlist) : jusqu'à 3 formations de la même filière et de la même catégorie
  // (E.equivalentsListe, mêmes garde-fous que la liste). L'élève peut en mettre une à la place du vœu : son choix est
  // gardé dans etat.remplacements (id du vœu proposé → id de l'équivalent), dans le navigateur seulement (CapStore).
  const remplacements = () => (etat.remplacements && typeof etat.remplacements === "object" && !Array.isArray(etat.remplacements) ? etat.remplacements : (etat.remplacements = {}));
  // Équivalents de la liste W, calculés avec les choix de l'élève (E.equivalentsListe : un choix qui n'est plus un
  // équivalent, ou qui enfreindrait les règles de la liste, est ignoré ; M.choix garde les choix encore valables).
  const equivalentsDe = (A, W) => E.equivalentsListe(A.resultats, W, E.MAX_EQUIVALENTS, remplacements());
  // Purge des choix obsolètes (profil ou réponses modifiés, vœu sorti de la liste) : renvoie true si l'état a changé
  function purgerRemplacements(M) {
    const R = remplacements(); let change = false;
    for (const id of Object.keys(R)) if (!M.choix.has(id)) { delete R[id]; change = true; }
    return change;
  }
  // équivalent choisi à la place du vœu v (encore valable), ou null
  const choixDe = (v, M) => M.choix.get(v.f.id) || null;
  // vœux à afficher (ou à retenir) : chaque vœu proposé, ou l'équivalent choisi à sa place
  const voeuxAffiches = (W, M) => W.liste.map((v) => ({ v, x: choixDe(v, M) || v }));
  const distanceTxt = (x, s) => (x.dist != null ? `≈ ${nbFr(Math.round(x.dist))} km de chez toi` : s && s.geo ? "distance inconnue" : "");
  // messages de distance déjà affichés ailleurs (règle qui a retiré la catégorie « sécurité »)
  const REGLES_DISTANCE = ["hors_distance", "distance_inconnue", "hors_territoire", "campus_etranger"];
  function infosEquivalent(x, s) {
    const r = x.repere, lieu = [x.f.etablissement, x.f.ville, distanceTxt(x, s)].filter(Boolean).map(esc).join(" · ");
    const taux = r.taux !== null ? `${libTauxAcces(r)} : ${tauxFr(r.taux)}` : "Taux d'accès non publié";
    const position = r.sansNotes ? "notes à renseigner" : POSITION_COURT[r.position] || "";
    return `<span class="small muted">${lieu}</span><span class="small">${esc([taux, position].filter(Boolean).join(" · "))}</span>`
      + (REGLES_DISTANCE.includes(r.regle) ? `<span class="tiny muted">${esc(r.pourquoi)}</span>` : "")
      + (r.alerteFrais ? `<span class="small texte-bad">${esc(r.alerteFrais)}</span>` : "");
  }
  // bloc replié sous un vœu : l'original (si l'élève l'a remplacé) puis les autres équivalents, chacun avec son bouton
  function blocEquivalents(v, M, s) {
    const eqs = M.get(v.f.id) || [], choix = choixDe(v, M);
    if (!eqs.length) return `<p class="tiny muted equiv-aucun">Pas d'autre formation de la même filière et de la même catégorie qui respecte tes critères.</p>`;
    const item = (x, bouton, etiquette) => `<li class="equiv-item"><span class="wish-nom">${etiquette || ""}<a href="#formation-${x.f.id}">${esc(x.f.nom)}</a>${infosEquivalent(x, s)}</span><span class="no-print">${bouton}</span></li>`;
    const lignes = [];
    if (choix) lignes.push(item(v, `<button class="btn xs" data-action="retablir" data-voeu="${v.f.id}">Revenir à ce vœu</button>`, `<span class="tiny muted">Vœu proposé au départ</span>`));
    for (const e of eqs) if (e !== choix) lignes.push(item(e, `<button class="btn xs doux" data-action="remplacer" data-voeu="${v.f.id}" data-id="${e.f.id}" aria-label="Choisir ${esc(e.f.nom)} (${esc(e.f.etablissement)}) à la place">Choisir à la place</button>`));
    const n = eqs.length;
    return `<details class="equiv" ${choix ? "open" : ""}><summary>${n} formation${n > 1 ? "s" : ""} équivalente${n > 1 ? "s" : ""}</summary>
      <p class="tiny muted">Même filière Parcoursup et même catégorie que ce vœu, avec les mêmes règles que ta liste. ${s && s.geo ? "Celles de ton académie et les plus proches de chez toi d'abord." : "Indique ton lycée pour voir d'abord celles de ton académie et les plus proches de chez toi."}</p>
      <ul class="equiv-liste">${lignes.join("")}</ul></details>`;
  }
  // ligne « à la place de » sous un équivalent choisi, avec le retour au vœu d'origine
  const ligneRemplace = (v) => `<span class="small equiv-choix">${ico("check")}Ton choix, à la place de <a href="#formation-${v.f.id}">${esc(v.f.nom)}</a> <span class="muted">(${esc(v.f.etablissement)})</span> <button class="btn xs ghost no-print" data-action="retablir" data-voeu="${v.f.id}">Revenir au vœu d'origine</button></span>`;
  // Section « Nouvelle formation à la rentrée 2026 » (E.nouvelles) : une seule formation (E.MAX_NOUVELLES), sans catégorie ni
  // repère d'admission ; avertissement si la filière est très sélective et la moyenne de l'élève sous 12 (E.alerteFiliereSelective)
  const SOURCE_FR_ESR_PARCOURSUP = "https://data.enseignementsup-recherche.gouv.fr/explore/dataset/fr-esr-parcoursup/";
  function blocNouvelles(A) {
    const N = E.nouvelles(A.resultats, A.interets);
    if (!N.length) return "";
    const plus = N.length > 1;   // textes justes au singulier comme au pluriel
    const item = (x) => {
      const al = E.alerteFiliereSelective(x.f, A.stats);
      const avert = al ? `<span class="notice small sun" style="display:block;margin-top:6px">${esc(al.texte)}${srcBadge("P")} ${srcLien({ source: SOURCE_FR_ESR_PARCOURSUP, consulte_le: STCONS })}</span>` : "";
      return `<li><span class="wish-nom"><a href="#formation-${x.f.id}">${esc(x.f.nom)}</a><span class="small muted">${esc(x.f.etablissement)} · ${esc(x.f.ville)} · ${esc(E.voieLabel(x.f))}</span>${avert}${x.repere.alerteFrais ? `<span class="small texte-bad" style="display:block;margin-top:6px">${esc(x.repere.alerteFrais)}</span>` : ""}</span><span class="no-print">${btnRetenir(x)}</span></li>`;
    };
    return `<section class="card stack" aria-labelledby="nouv-titre"><div class="row" style="justify-content:space-between"><h3 id="nouv-titre">${plus ? "Nouvelles formations" : "Nouvelle formation"} à la rentrée 2026</h3><span class="pill ton-menthe">${N.length} formation${plus ? "s" : ""}</span></div>
      <p class="small">${plus ? "Ces formations ouvrent" : "Cette formation ouvre"} cette année : elle${plus ? "s" : ""} correspond${plus ? "ent" : ""} à ton profil, mais on n'a encore aucune statistique pour te situer parmi les admis.</p>
      <ul class="wish" style="list-style:none;padding-left:0">${N.map(item).join("")}</ul>
    </section>`;
  }
  // Protection de la liste (E.protection) : nombre de vœux sûrs et conseil, sans probabilité globale
  const PROTECTION_TON = { sans_notes: "", securite_fragile: "bad", aucun: "bad", insuffisant: "", minimum: "", bon: "info" };
  function blocProtection(P) {
    return `<div class="notice small protection ${PROTECTION_TON[P.niveau]}"><p><strong>${esc(P.message)}</strong></p><p class="tiny muted">${esc(E.PROTECTION_REPERE)} ${esc(E.LIMITE_REPERE)}</p></div>`;
  }
  function vueVoeux(A) {
    const W = E.wishlist(A.resultats, 10, A.interets);
    const M = equivalentsDe(A, W);
    if (purgerRemplacements(M)) sauver(true);
    const X = E.etranger(A.resultats, W, A.interets);
    const etr = blocNouvelles(A) + blocEtranger(X);
    const sel = A.resultats.filter((x) => etat.retenus.includes(x.f.id));
    const intro = `<div class="section-tete"><h2>Mes vœux</h2><p class="small muted prose">Une bonne liste combine environ 3 vœux ambitieux, 4 réalistes et 3 sûrs. Parcoursup autorise 10 vœux (plus des sous-vœux) ; UCAS, 5 choix.</p></div>`;
    const btnAuto = `<button class="btn ${sel.length ? "" : "primary"}" data-action="auto-retenir">${ico("etoile")}${sel.length ? "Recalculer une liste équilibrée de 10 vœux" : "Générer une liste équilibrée de 10 vœux"}</button>`;
    if (!sel.length) {
      return `<section class="stack">${intro}
        <div class="card stack proposition"><div class="row" style="justify-content:space-between"><h3>Proposition de liste équilibrée</h3><span class="pill ton-bleu">${W.liste.length} formations</span></div>${W.explication ? `<p class="explication">${ico("ampoule")}<span>${esc(W.explication)}</span></p>` : ""}${W.liste.length ? `<ol class="wish">${voeuxAffiches(W, M).map(({ v, x }) => `<li><span class="wish-cat">${catPill(x.categorie)}</span><div class="wish-nom"><a href="#formation-${x.f.id}">${esc(x.f.nom)}</a><span class="small muted">${esc(x.f.etablissement)} · ${esc(x.f.ville)} · ${esc(E.voieLabel(x.f))} · ${noteCourte(x)}</span>${x !== v ? ligneRemplace(v) : ""}${ligneRepere(x)}${W.decouvertes.has(v.f.id) ? `<span class="wish-dec"><span class="pill ton-violet">${ico("boussole")}Découverte</span> ${esc(W.decouvertes.get(v.f.id))}</span>` : ""}${blocEquivalents(v, M, A.stats)}</div><span class="chance-txt ton-${CAT_TON[x.categorie]}">${repereTxt(x.repere)}</span></li>`).join("")}</ol>` : '<p class="muted">Complète ton profil et le questionnaire pour obtenir une proposition.</p>'}
          ${W.liste.length ? blocProtection(W.protection) : ""}
          ${W.alertes.map((a) => `<p class="notice small">${esc(a)}</p>`).join("")}
          <div class="row no-print">${btnAuto}</div></div>${etr}</section>`;
    }
    const compte = { ambitieux: 0, realiste: 0, securite: 0 }; sel.forEach((x) => compte[x.categorie]++);
    // vœu retenu venu de la liste proposée (le vœu lui-même ou l'équivalent choisi à sa place) → vœu proposé : ses équivalents s'affichent dessous
    // indexé aussi sur le vœu d'origine : s'il est retenu (seul ou avec l'équivalent), ses équivalents restent affichés
    const origine = new Map(voeuxAffiches(W, M).flatMap(({ v, x }) => [[v.f.id, v], [x.f.id, v]]));
    // une seule ligne porte le bloc des équivalents : l'équivalent choisi s'il est retenu, sinon le vœu d'origine
    const porteur = (v) => { const c = choixDe(v, M); return c && sel.includes(c) ? c : v; };
    const ordre = { ambitieux: 0, realiste: 1, securite: 2 };
    const tri = sel.slice().sort((a, b) => ordre[a.categorie] - ordre[b.categorie] || (a.repere.taux ?? 101) - (b.repere.taux ?? 101));
    const alertes = [];
    if (compte.ambitieux === 0) alertes.push("Aucun vœu ambitieux : tu peux tenter une ou deux formations plus sélectives.");
    const ucas = sel.filter((x) => x.f.plateforme === "ucas");
    if (ucas.length > 5) alertes.push(`UCAS limite à 5 choix : tu en as ${ucas.length}.`);
    if (ucas.some((x) => /Oxford/.test(x.f.etablissement)) && ucas.some((x) => /Cambridge/.test(x.f.etablissement))) alertes.push("Impossible de candidater à Oxford et à Cambridge la même année.");
    return `<section class="stack">${intro}
      <div class="voeux-synthese">
        <div class="card stack"><h3>Équilibre de ta liste</h3>${equilibre(compte)}</div>
        <div class="stats tuiles-mini">
          ${miniStat(sel.length, "vœux retenus", "bleu")}
          ${miniStat(compte.securite, compte.securite > 1 ? "vœux « sécurité »" : "vœu « sécurité »", "menthe")}
        </div>
      </div>
      ${blocProtection(E.protection(sel))}
      ${alertes.map((a) => `<p class="notice small">${esc(a)}</p>`).join("")}
      <div class="card stack">
        <div class="table-wrap nu"><table class="wishtable"><thead><tr><th scope="col">Catégorie</th><th scope="col">Formation</th><th scope="col">Note</th><th scope="col">Places</th><th scope="col">Repères</th><th scope="col"><span class="sr-only">Action</span></th></tr></thead><tbody>
          ${tri.map((x) => { const o = origine.get(x.f.id); return `<tr><td>${catPill(x.categorie)}</td><td><a href="#formation-${x.f.id}">${esc(x.f.nom)}</a><div class="tiny muted">${esc(x.f.etablissement)} · ${esc(x.f.ville)}</div>${o && o !== x ? ligneRemplace(o) : ""}${ligneRepere(x)}${o && x === porteur(o) ? blocEquivalents(o, M, A.stats) : ""}</td><td class="num">${noteCourte(x)}</td><td class="num">${x.f.admission && x.f.admission.places ? x.f.admission.places : "n. c."}</td><td class="num"><span class="chance-txt ton-${CAT_TON[x.categorie]}">${repereTxt(x.repere)}</span></td><td class="no-print"><button class="btn sm ghost" data-action="retenir" data-id="${x.f.id}" aria-label="Retirer ${esc(x.f.nom)}">Retirer</button></td></tr>`; }).join("")}
        </tbody></table></div>
        <div class="row no-print">${btnAuto}<a class="btn ghost" href="#plan">Voir mon plan${ico("fleche")}</a></div>
      </div>${etr}</section>`;
  }
  function vueListe() {
    const A = analyse(), manque = manquesProfil(A);
    const nbVoeux = A.resultats.filter((x) => etat.retenus.includes(x.f.id)).length;
    const nbReco = A.resultats.filter((x) => !x.exclu).length;
    const o = app.ongletListe === "voeux" ? "voeux" : "reco";
    return `<div class="stack-lg">
      ${pageHero({ sur: "Ma liste", titre: etat.profil.prenom ? `Ta sélection, ${esc(etat.profil.prenom)}` : "Ma liste", sous: "Les formations recommandées pour toi et celles que tu gardes pour tes vœux.", ton: "bleu",
        cote: `<div class="mini-stats">${miniStat(nbFr(nbReco), "formations analysées", "bleu")}${miniStat(nbVoeux, nbVoeux > 1 ? "vœux retenus" : "vœu retenu", "violet")}</div>` })}
      ${E.alerteBac(A.stats) ? `<p class="notice bad small alerte-bac"><strong>${esc(E.alerteBac(A.stats))}</strong></p>` : ""}
      ${manque.length ? `<p class="notice info small">Recommandations encore approximatives : complète ${manque.join(", ")}.</p>` : ""}
      ${A.stats.geo ? "" : `<p class="notice info small sans-lycee">${esc(E.MESSAGE_SANS_LYCEE)}</p>`}
      <div class="segments" role="tablist" aria-label="Contenu de ma liste">
        <button role="tab" aria-selected="${o === "reco"}" data-action="onglet-liste" data-o="reco">${ico("etoile")}Recommandées</button>
        <button role="tab" aria-selected="${o === "voeux"}" data-action="onglet-liste" data-o="voeux">${ico("check")}Mes vœux <span class="compteur">${nbVoeux}</span></button>
      </div>
      ${o === "reco" ? vueRecommandations(A) : vueVoeux(A)}
      <details class="card-flat aide-lecture"><summary>${ico("ampoule")}Comment lire ces résultats ?</summary><p class="small muted">Classement par pertinence (60 % intérêt, 40 % faisabilité ; sans questionnaire, faisabilité seule), avec une note sur 5. Une formation sans taux d'accès officiel n'a ni note globale ni note de faisabilité affichées (« pas de chiffres officiels ») : elle reste classée au même rang. Les prépas aux attentes comparables sont regroupées par famille. Repères : le taux d'accès officiel de la formation (part des candidats qui ont reçu une proposition) et ta position parmi les admis 2025, d'après leurs mentions au bac et ta moyenne moins 0,5 point par prudence. Sécurité = taux d'accès d'au moins 50 % et moyenne au-dessus de la plupart des admis, ou formation très ouverte (taux d'au moins 85 %) et moyenne dans celle des admis ; ambitieux = taux d'accès de moins de 20 %, moyenne en dessous de la plupart des admis (sauf formation très ouverte : réaliste) ou point bloquant ; réaliste = tout le reste. Sans notes, jamais « sécurité ». Ce ne sont pas des probabilités.</p></details>
      ${AVERT}
    </div>`;
  }

  /* ================================================================ FICHE */
  function barreMentions(m) {
    const ordre = [["TBF", "TB + félicitations"], ["TB", "TB"], ["B", "B"], ["AB", "AB"], ["sans", "Sans mention"]];
    const tot = ordre.reduce((a, [k]) => a + (m[k] || 0), 0) || 1;
    return `<div class="mentions" role="img" aria-label="Mentions des admis : ${ordre.map(([k, l]) => `${l} ${m[k] || 0} %`).join(", ")}">${ordre.map(([k, l]) => (m[k] ? `<span class="m-${k}" style="width:${(m[k] / tot) * 100}%">${m[k] >= 12 ? `${m[k]} %` : ""}</span>` : "")).join("")}</div>
      <div class="legende tiny">${ordre.map(([k, l]) => `<span><i class="m-${k}"></i>${l} : ${m[k] || 0} %</span>`).join("")}</div>`;
  }
  // salaires France : barre sur une échelle fixe de 20 à 120 k€ bruts/an
  const SAL_MIN = 20, SAL_MAX = 120;
  const salPos = (k) => Math.max(0, Math.min(100, ((k - SAL_MIN) / (SAL_MAX - SAL_MIN)) * 100));
  function blocMetier(id) {
    const m = METIERS.find((x) => x.id === id); if (!m) return "";
    const fr = m.salaire_fr, uk = m.salaire_uk;
    const k = (v) => String(v).replace(".", ",");
    const barre = fr && fr.bas && fr.haut ? `<div class="salaire-barre" role="img" aria-label="De ${k(fr.bas)} à ${k(fr.haut)} k€ bruts par an">
        <span class="sb-plage" style="left:${salPos(fr.bas)}%;width:${Math.max(2, salPos(fr.haut) - salPos(fr.bas))}%"></span>${fr.moyenne ? `<span class="sb-moy" style="left:${salPos(fr.moyenne)}%" title="Moyenne ${k(fr.moyenne)} k€"></span>` : ""}
      </div><div class="sb-echelle tiny"><span>${SAL_MIN} k€</span><span>${(SAL_MIN + SAL_MAX) / 2} k€</span><span>${SAL_MAX} k€</span></div>` : "";
    const frTxt = fr ? `<span class="sal-chiffre">${fr.bas ? `${k(fr.bas)} à ${k(fr.haut)} k€` : ""}${fr.moyenne ? `${fr.bas ? " · " : ""}moyenne ${k(fr.moyenne)} k€` : ""}</span><span class="tiny muted">bruts par an</span>${barre}<span class="src">${esc(fr.note)}</span>${srcLien(fr)}` : '<span class="muted">non communiqué</span>';
    const ukTxt = uk ? `<span>Début : ${esc(uk.debut)}</span><span>Ensuite : ${esc(uk.experience)}</span>${uk.note ? `<span class="src">${esc(uk.note)}</span>` : ""}${srcLien(uk)}` : '<span class="muted">non communiqué</span>';
    return `<article class="metier card">
      <div class="metier-tete"><span class="metier-ico">${ico("malette")}</span><h4 id="metier-${m.id}">${esc(m.nom)}</h4></div>
      ${m.description ? `<p class="small">${esc(m.description)}</p>` : ""}
      ${m.voies ? `<p class="metier-voies tiny">${ico("diplome")}<span>Voies d'accès : ${esc(m.voies)}</span></p>` : ""}
      <div class="salaires small"><div class="sal-pays"><span class="sal-lib">France</span>${frTxt}</div><div class="sal-pays"><span class="sal-lib">Royaume-Uni</span>${ukTxt}</div></div>
    </article>`;
  }
  function blocPoursuite(id) {
    const p = POURS.find((x) => x.id === id); if (!p) return "";
    return `<li class="poursuite"><span class="poursuite-ico">${ico("diplome")}</span><div><span class="fw">${esc(p.nom)}</span>
      <span class="small">${esc(p.acces)}. ${esc(p.chiffres)}${p.salaire ? " " + esc(p.salaire) : ""}</span>${(p.sources || []).slice(0, 2).map(srcLien).join("")}</div></li>`;
  }
  function vueFiche(id) {
    const f = DATA.formations.find((x) => x.id === id);
    if (!f) return `<p>Formation introuvable. <a href="#liste">Retour à ma liste</a></p>`;
    const A = analyse(), x = A.resultats.find((r) => r.f.id === id), a = f.admission || {};
    const val = (o, txt) => `${txt}${statutBadge(o && o.statut)}${srcLien(o)}`;
    const C = [["Notes", x.crit.notes, "courbe"], ["Spécialités", x.crit.specialites, "livre"], ["Appréciations", x.crit.appreciations, "crayon"], ["Langues", x.crit.langues, "globe"], ["Tests", x.crit.tests, "dossier"], ["Dossier extrascolaire", x.crit.extra, "coeur"]];
    const tx = a.taux != null ? String(a.taux).replace(".", ",") + " %" : null;
    const chiffres = [["Places", a.places, "groupe", "bleu"], ["Vœux / candidatures", a.candidats, "bulle", "violet"], ["Admis", a.admis, "check", "menthe"], ["Taux d'accès", tx, "cible", "ambre"]].filter(([, v]) => v !== null && v !== undefined);
    const retenu = etat.retenus.includes(f.id);
    const reperes = (window.__METIERS_REPERES || []);
    const plat = { parcoursup: "Parcoursup", ucas: "UCAS", propre: "Plateforme de l'établissement" }[f.plateforme] || f.plateforme;
    const cout = f.cout && f.cout.valeur_annuelle_eur;
    const tuiles = [
      ["horloge", "Durée", `${String(f.duree_ans).replace(".", ",")} an${f.duree_ans > 1 ? "s" : ""}`, f.langue ? `en ${f.langue}` : "", "bleu"],
      // frais relevés sur Parcoursup : fourchette en entier ; « Droits d'inscription » pour les IFSI et le travail social
      ["euro", f.cout && f.cout.libelle === "droits_inscription" ? "Droits d'inscription" : "Coût annuel", cout != null ? montantFrais(f.cout) : "n. c.", cout === 0 ? "gratuit" : "", "ambre"],
      ["cible", "Sélectivité", (!f.selectivite.estimee && E.SEL_LABEL[f.selectivite.niveau]) || "n. c.", tx ? `${tx} d'accès` : f.selectivite.estimee ? "taux non publié" : "", "violet"],
      ["groupe", "Places", a.places ? nbFr(a.places) : "n. c.", a.candidats ? `${nbFr(a.candidats)} vœux` : "", "ciel"],
      ["envoi", "Candidature", plat, "", "menthe"],
    ];
    const infos = [
      ["livre", "Spécialités", val(f.specialites, esc(f.specialites.texte)), "bleu"],
      ["courbe", "Niveau scolaire", val(f.notes, esc(f.notes.texte)) + (f.notes.moyenne_cible != null ? `<span class="repere">${ico("cible")}Repère retenu : <b>${E.fmt(f.notes.moyenne_cible)}/20</b>${f.notes.maths_cible != null ? ` · maths <b>${E.fmt(f.notes.maths_cible)}</b>` : ""}</span>` : ""), "violet"],
      ["globe", "Langues", val(f.langue_requise, esc(f.langue_requise.texte)), "ciel"],
      ["dossier", "Tests et épreuves", f.tests.length ? f.tests.map((t) => `<div class="test"><span class="fw">${esc(t.nom)}</span> <span class="pill ${t.obligatoire ? "ton-corail" : "neutral"}">${t.obligatoire ? "obligatoire" : "facultatif"}</span> ${esc(t.texte)}${statutBadge(t.statut)}${srcLien(t)}</div>`).join("") : "Aucun test spécifique relevé.", "ambre"],
      ["crayon", "Dossier à fournir", `<div class="chips-info">${f.pieces.map((p) => `<span>${esc(p)}</span>`).join("")}</div>`, "menthe"],
      ...(f.classement && f.classement.texte ? [["trophee", "Classement", val(f.classement, esc(f.classement.texte)), "corail"]] : []),
      ...(cout == null && texteFrais(f) ? [["euro", "Frais de scolarité", val(f.cout, esc(texteFrais(f))) + alerteFraisHtml(x), "ambre"]] : []),   // montant non chiffré : le texte de la fiche, sans réécriture
      // frais relevés sur la fiche Parcoursup : texte, badge, source et date ; apprentissage (jamais « gratuit » à cause de lui)
      ...(cout != null && f.cout.statut === "releve_parcoursup" ? [["euro", f.cout.libelle === "droits_inscription" ? "Droits d'inscription et participation" : "Frais de scolarité", val(f.cout, esc(f.cout.texte))
        + (f.cout.apprentissage ? `<p class="small">${esc(texteApprentissage(f.cout.apprentissage))}</p>` : "") + alerteFraisHtml(x), "ambre"]] : []),
    ];
    const typeCourt = f.type_label || "Formation";
    const nbP = (f.poursuites || []).length + (f.integrations || []).length;
    return `<div class="stack-lg fiche">
      <header class="fiche-hero ton-${tonType(f.type, f.type_label)}">
        <a href="#liste" class="lien-retour">${ico("retour")}Ma liste</a>
        <div class="fiche-hero-grille">
          <div class="fiche-hero-txt">
            <div class="row badges">${x.repere.nouvelle || x.repere.sansStats ? "" : catPill(x.categorie)}${typePill(f.type, f.type_label)}${f.stats === "nouvelle_2026" ? '<span class="pill ton-menthe">Nouvelle en 2026</span>' : ""}${x.bloque ? '<span class="pill bad">Point bloquant</span>' : ""}${CATBY[f.id] && CATBY[f.id].av ? '<span class="pill verif">À vérifier</span>' : ""}</div>
            <h1>${esc(f.nom)}</h1>
            <p class="f-lieu"><span>${ico("ecole")}${esc(f.etablissement)}</span><span>${ico("pin")}${esc(f.ville)} · ${esc(f.pays)}</span></p>
            <div class="row"><button class="btn ${retenu ? "primary" : "blanc"}" data-action="retenir" data-id="${f.id}" aria-pressed="${retenu}">${ico("etoile", retenu ? "plein" : "")}${retenu ? "Dans mes vœux" : "Ajouter à mes vœux"}</button></div>
          </div>
          <div class="fiche-hero-score">${anneau(x.repere, x.categorie, 120)}<div class="stack" style="gap:6px"><span class="tiny muted">Pertinence pour toi</span>${notesSur5(x)}</div></div>
        </div>
        <div class="tuiles">${tuiles.map(([i, l, v, s, t]) => `<div class="tuile ton-${t}"><span class="tuile-ico">${ico(i)}</span><span class="tuile-l">${l}</span><span class="tuile-v">${esc(v)}</span>${s ? `<span class="tuile-s">${esc(s)}</span>` : ""}</div>`).join("")}</div>
      </header>
      ${f.__campusEtranger ? blocCampusEtranger(f) : ""}
      ${MENTION_STATS[f.stats] ? `<p class="notice small"><strong>${esc(MENTION_STATS[f.stats])}</strong>${f.stats === "nouvelle_2026" ? " Elle n'entre pas dans ta liste de 10 vœux : elle peut t'être proposée à part, dans « Nouvelle formation à la rentrée 2026 », et tu peux l'ajouter toi-même." : " Elle n'est pas proposée dans ta liste de vœux tant qu'il n'y a pas de chiffres sourcés, mais tu peux l'ajouter toi-même."}</p>` : ""}
      ${CATBY[f.id] && CATBY[f.id].av ? `<p class="notice small"><strong>À vérifier.</strong> ${esc(CATBY[f.id].avTxt.join(" "))} <a href="#formation-${f.id}" data-action="ancre" data-cible="sec-fusion">Voir le détail</a></p>` : ""}
      ${f.famille ? (() => { const sib = A.resultats.filter((r) => r.f.famille && r.f.famille.id === f.famille.id && r.f.id !== f.id); return `<div class="bloc-famille"><span class="bf-ico">${ico("groupe")}</span><div class="stack" style="gap:6px"><span class="fw">Famille : ${esc(f.famille.nom)}</span><span class="small muted">${esc(f.famille.description)}</span>${sib.length ? `<span class="small">Mêmes attentes : ${sib.map((r) => `<a href="#formation-${r.f.id}">${esc(r.f.etablissement.replace(/^Lycée /, ""))}</a> <span class="muted">(${E.CAT_LABEL[r.categorie].toLowerCase()} · ${repereTxt(r.repere)})</span>`).join(", ")}</span>` : ""}</div></div>`; })() : ""}
      <nav class="sommaire" aria-label="Sur cette fiche"><button data-action="ancre" data-cible="sec-formation"><span>1</span>Formation</button><button data-action="ancre" data-cible="sec-poursuites"><span>2</span>Poursuite d'études</button><button data-action="ancre" data-cible="sec-metiers"><span>3</span>Métiers et débouchés</button></nav>

      <section class="partie stack" id="sec-formation" aria-labelledby="t-formation">
        <h2 class="partie-titre" id="t-formation"><span class="partie-n">1</span>Formation</h2>
        <div class="infos-grille">${infos.map(([i, t, c, ton]) => `<div class="info-carte ton-${ton}"><div class="info-tete"><span class="info-ico">${ico(i)}</span><h3>${t}</h3></div><div class="info-corps small">${c}</div></div>`).join("")}</div>
        ${f.calendrier.length ? `<div class="card stack"><div class="carte-tete"><span class="info-ico ton-bleu">${ico("agenda")}</span><h3>Calendrier</h3></div>
          <ol class="frise">${f.calendrier.map((c) => `<li><span class="frise-date">${esc(fmtDate(c.date))}</span><span class="frise-txt">${esc(c.etape)}${statutBadge(c.statut)}</span></li>`).join("")}</ol>${srcLien(f.calendrier[0])}</div>` : ""}
        ${f.incertitudes.length ? `<div class="bloc-verif">${ico("alerte")}<div><span class="fw">À vérifier</span><ul class="why small">${f.incertitudes.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div></div>` : ""}

        <div class="card stack"><div class="carte-tete"><span class="info-ico ton-violet">${ico("courbe")}</span><h3>Admission : les chiffres</h3></div>
          ${chiffres.length ? `<div class="stats stats-couleur">${chiffres.map(([l, v, i, t]) => `<div class="ton-${t}">${ico(i)}<span class="tiny">${l}</span><strong>${typeof v === "number" ? v.toLocaleString("fr-FR") : v}</strong></div>`).join("")}</div>` : ""}
          <p class="small">${esc(a.texte || "Statistiques non communiquées.")} ${a.libelle && !MENTION_STATS[f.stats] ? `<span class="muted">(${esc(a.libelle)})</span>` : ""}${statutBadge(a.statut)}${srcLien(a)}</p>
          ${f.stats_anciennes ? (() => { const o = f.stats_anciennes, l = [o.places != null ? `${nbFr(o.places)} places` : null, o.voeux != null ? `${nbFr(o.voeux)} vœux` : null, o.admis != null ? `${nbFr(o.admis)} admis` : null, o.taux != null ? `taux d'accès ${String(o.taux).replace(".", ",")} %` : null].filter(Boolean).join(" · "); return `<p class="small">Statistiques de la session ${esc(o.session)} : ${esc(l || "chiffres non communiqués")}. Elles ne servent pas à classer cette formation.${statutBadge(o.statut)}${srcLien(o)}</p>`; })() : ""}
          ${f.mentions_admis ? `<h4>Mentions au bac des admis 2025</h4>${barreMentions(f.mentions_admis)}` : ""}
          ${blocRepere(x)}
        </div>

        <div class="card stack"><div class="carte-tete"><span class="info-ico ton-menthe">${ico("cible")}</span><h3>Ton adéquation</h3></div>
          ${notesSur5(x)}
          <div class="competences">${C.map(([l, c, i]) => `<div class="competence"><div class="comp-tete">${ico(i)}<span class="fw">${l}</span><span class="comp-note">${CRIT5[c.niveau]}</span></div>${niveauBarre(c.niveau)}<span class="crit-v lvl-${c.niveau}">${E.NIVEAUX[c.niveau].label}</span><p class="tiny muted">${esc(c.texte)}</p></div>`).join("")}</div>
          <div class="grid-2">
            ${x.raisons.length ? `<div class="panneau ton-menthe"><h4>${ico("check")}Pourquoi cette formation</h4><ul class="why coche">${x.raisons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>` : ""}
            <div class="panneau ton-bleu"><h4>${ico("ampoule")}Ce que tu peux faire</h4><ul class="why">${x.actions.map((a2) => `<li>${esc(a2.texte)}</li>`).join("")}</ul></div>
          </div>
        </div>
      </section>

      <section class="partie stack" id="sec-poursuites" aria-labelledby="t-poursuites">
        <h2 class="partie-titre" id="t-poursuites"><span class="partie-n">2</span>Poursuite d'études</h2>
        <div class="flux" aria-hidden="true">
          <div class="flux-etape"><span>${ico("ecole")}</span><b>Bac général</b><small>terminale</small></div><span class="flux-fleche">${ico("fleche")}</span>
          <div class="flux-etape actif"><span>${ico("diplome")}</span><b>${esc(typeCourt)}</b><small>${String(f.duree_ans).replace(".", ",")} an${f.duree_ans > 1 ? "s" : ""}</small></div><span class="flux-fleche">${ico("fleche")}</span>
          <div class="flux-etape"><span>${ico("etoile")}</span><b>Après</b><small>${nbP ? `${nbP} voie${nbP > 1 ? "s" : ""} présentée${nbP > 1 ? "s" : ""}` : "masters, écoles"}</small></div>
        </div>
        ${(f.integrations || []).length ? `<div class="card stack"><h3>Après cette prépa</h3><ul class="why coche">${f.integrations.map((i) => `<li>${esc(i.texte)}${statutBadge(i.statut)}${srcLien(i)}</li>`).join("")}</ul></div>` : ""}
        <div class="stack"><p class="small muted">Masters, grandes écoles, doctorat : les suites les plus fréquentes.</p>
          <ul class="poursuites">${(f.poursuites || []).map(blocPoursuite).join("") || '<li class="muted small">Non renseigné.</li>'}</ul></div>
      </section>

      <section class="partie stack" id="sec-metiers" aria-labelledby="t-metiers">
        <h2 class="partie-titre" id="t-metiers"><span class="partie-n">3</span>Métiers et débouchés</h2>
        <p class="small muted">Métiers auxquels cette formation mène le plus souvent, en général après un master ou une grande école. Salaires de début de carrière, à titre indicatif.</p>
        <div class="metiers-grille">${(f.metiers || []).map(blocMetier).join("") || '<p class="muted small">Non renseigné.</p>'}</div>
        ${reperes.length ? `<details class="card-flat"><summary>${ico("ampoule")}Repères généraux sur les salaires</summary><p class="small muted" style="margin-top:8px">France : salaires bruts annuels proposés dans les offres d'emploi cadres (fiches APEC, 80 % des offres dans la fourchette). Royaume-Uni : fourchettes de début de carrière et après quelques années (Prospects). Ce sont des repères, pas des promesses.</p><ul class="why small" style="margin-top:8px">${reperes.map((r) => `<li>${esc(r.texte)}${statutBadge(r.statut)}${srcLien(r)}</li>`).join("")}</ul></details>` : ""}
      </section>
      ${(() => { const b = blocFusion(f); return b ? `<details class="sources-fiche"><summary>${ico("dossier")}Sources et provenance de cette fiche</summary>${b}</details>` : ""; })()}
      ${AVERT}
    </div>`;
  }

  /* ================================================================ CATALOGUE */
  function vueExplorer() {
    const c = app.cat;
    c.source = "";   // l'origine de la fiche n'est plus un critère proposé
    const liste = filtreCatalogue();
    // Deux familles de valeurs dans e.type : les types Mon Plan Sup (clés comme « licence », libellé dans TYPES())
    // et les catégories Parcoursup brutes, stockées avec le préfixe « psup: ». Les fiches Parcoursup enrichies portent
    // un type Mon Plan Sup : on répartit donc par préfixe, et non par origine de la fiche.
    const tousTypes = [...new Set(CAT.map((e) => e.type))];
    const types = tousTypes.filter((k) => !String(k).startsWith("psup:")).sort((x, y) => String(TYPES()[x] || x).localeCompare(String(TYPES()[y] || y), "fr"));
    const tfs = tousTypes.filter((k) => String(k).startsWith("psup:")).sort((x, y) => x.localeCompare(y, "fr"));
    const regions = [...new Set(CAT.map((e) => e.region).filter(Boolean))].sort();
    const vis = liste.slice(0, app.limiteCat);
    // « psup: » fait 5 caractères : l'ancien code retirait 6 caractères et amputait la première lettre
    const libCat = (k) => String(k).replace(/^psup:/, "");
    const nbEtr = CAT.filter((e) => e.pays !== "France").length;
    return `<div class="stack-lg">
      ${pageHero({ sur: "Catalogue", titre: "Catalogue des formations", sous: `${nbFr(CAT.length)} formations en France et à l'étranger, avec les fiches officielles Parcoursup 2026. Les BTS et BUT ne sont pas proposés.`, ton: "violet",
        cote: `<div class="mini-stats">${miniStat(nbFr(CAT.filter((e) => e.ps).length), "fiches Parcoursup", "violet")}${miniStat(nbFr(nbEtr), "à l'étranger", "ciel")}</div>` })}
      <div class="filtres-cat card">
        <div class="recherche"><label for="cq" class="sr-only">Rechercher une formation</label>${ico("loupe")}<input id="cq" type="text" data-cfiltre="q" value="${esc(c.q)}" placeholder="Formation, établissement, ville…"></div>
        <div class="filters">
          <div class="field"><label for="ctype">Type</label><select id="ctype" data-cfiltre="type"><option value="">Tous</option>
            <optgroup label="Types Mon Plan Sup">${types.map((k) => `<option value="${esc(k)}" ${c.type === k ? "selected" : ""}>${esc(TYPES()[k] || k)}</option>`).join("")}</optgroup>
            <optgroup label="Catégories Parcoursup">${tfs.map((k) => `<option value="${esc(k)}" ${c.type === k ? "selected" : ""}>${esc(libCat(k))}</option>`).join("")}</optgroup></select></div>
          <div class="field"><label for="cregion">Région</label><select id="cregion" data-cfiltre="region"><option value="">Toutes</option>${regions.map((r) => `<option ${c.region === r ? "selected" : ""}>${esc(r)}</option>`).join("")}<option value="etranger" ${c.region === "etranger" ? "selected" : ""}>Étranger</option></select></div>
          <div class="field"><label for="capp">Apprentissage</label><select id="capp" data-cfiltre="app"><option value="">Indifférent</option><option value="oui" ${c.app === "oui" ? "selected" : ""}>En apprentissage</option><option value="non" ${c.app === "non" ? "selected" : ""}>Hors apprentissage</option></select></div>
          <label class="row small check-label"><input type="checkbox" data-cfiltre="verif" ${c.verif ? "checked" : ""}> Seulement les fiches « À vérifier »</label>
        </div>
      </div>
      <div class="resultats-tete"><p aria-live="polite"><b>${nbFr(liste.length)}</b> formation${liste.length > 1 ? "s" : ""} trouvée${liste.length > 1 ? "s" : ""}</p><span class="tiny muted">Places : capacité Parcoursup 2025 du vœu · base du ${esc(fmtDate(FU ? FU.meta.version : DATA.meta.version))}</span></div>
      <div class="cat-grille">${vis.map((e) => `<a class="cat-carte ton-${tonType(e.type, e.type_label)}" href="#formation-${e.id}">
          <div class="row badges">${typePill(e.type, e.type_label)}${e.app ? '<span class="pill ton-ciel">Apprentissage</span>' : ""}${e.av ? '<span class="pill verif">À vérifier</span>' : ""}${e.stats === "nouvelle_2026" ? '<span class="pill ton-menthe">Nouvelle en 2026</span>' : e.stats === "sans_stats" ? '<span class="pill neutral">Stats non publiées</span>' : ""}</div>
          <h3>${esc(e.nom)}</h3>
          <p class="f-lieu"><span>${ico("ecole")}${esc(e.etablissement)}</span></p>
          <div class="cat-pied"><span>${ico("pin")}${esc(e.ville)}${e.pays !== "France" ? ", " + esc(e.pays) : ""}</span><span>${ico("groupe")}${e.places ? nbFr(e.places) + " places" : "places n. c."}</span><span>${ico("euro")}${e.cout != null ? (e.coutMin != null && e.coutMin < e.cout ? `${E.fmtEur(e.coutMin)} à ${E.fmtEur(e.cout)}` : E.fmtEur(e.cout)) + "/an" : "coût n. c."}</span></div>
        </a>`).join("") || `<div class="card vide">${ico("loupe")}<p>Aucune formation ne correspond à ces critères.</p></div>`}</div>
      ${liste.length > app.limiteCat ? `<div class="plus-bloc"><button class="btn lg" data-action="cat-plus">Afficher la suite <span class="compteur">${nbFr(liste.length - app.limiteCat)}</span></button></div>` : ""}
    </div>`;
  }
  function filtreCatalogue() {
    const c = app.cat;
    let l = CAT;
    if (c.type) l = l.filter((e) => e.type === c.type);
    if (c.source) l = l.filter((e) => e.src === c.source);
    if (c.verif) l = l.filter((e) => e.av);
    if (c.app) l = l.filter((e) => (c.app === "oui") === !!e.app);
    if (c.region) l = l.filter((e) => (c.region === "etranger" ? e.pays !== "France" : e.region === c.region));
    if (c.q) { const mots = sansAccents(c.q).split(/\s+/).filter(Boolean); l = l.filter((e) => mots.every((m) => e.cle.includes(m))); }
    return l;
  }
  const sansAccents = (x) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, " ");
  const SRC_LIB = { P: "Parcoursup", O: "site officiel", A: "autre source", E: "donnée éditeur" };
  const srcBadge = (code) => (Array.isArray(code) ? code.map(srcBadge).join("") : code ? `<span class="badge-src src-${code}">${SRC_LIB[code] || esc(code)}</span>` : "");
  function pillSource(e) {
    if (e.src === "fusion") return '<span class="pill neutral">Mon Plan Sup + Parcoursup</span>';
    if (e.src === "parcoursup") return '<span class="pill neutral">Parcoursup</span>';
    return '<span class="pill neutral">Mon Plan Sup</span>';
  }
  const etabCourt = (n) => String(n || "").replace(/\s*\([^()]*\)\s*$/, "").trim();
  function lienFiche(id) { const e = CATBY[ALIAS[id] || id]; return e ? `<a href="#formation-${e.id}">${esc(e.nom)}</a> <span class="muted">(${esc(e.etablissement)}, ${esc(e.ville)})</span>` : esc(id); }
  function blocParcoursup(r) {
    const L = (arr) => (arr && arr.length ? arr.map(esc).join("<br>") : "");
    return `<dl class="facts">
      <dt>Intitulé Parcoursup</dt><dd>${esc(r.nm.join(" · "))}${srcBadge("P")}</dd>
      ${r.fl && r.fl.length ? `<dt>Formations et mentions</dt><dd>${L(r.fl)}</dd>` : ""}
      <dt>Catégorie</dt><dd>${esc(r.tf.join(" · "))}</dd>
      <dt>Établissement</dt><dd>${esc(r.etab_nom)}<br><span class="small muted">${esc(r.tc)}${r.etab_uai ? ` · UAI ${esc(r.etab_uai)}` : ""}</span>${r.etab_url ? `<span class="src"><a href="${esc(r.etab_url)}" target="_blank" rel="noopener">Site de l'établissement</a></span>` : ""}</dd>
      <dt>Lieu</dt><dd>${esc([r.commune, r.departement, r.region].filter(Boolean).join(" · ") || (CAMPUS["psup-" + r.gta] ? `${CAMPUS["psup-" + r.gta].ville}, ${CAMPUS["psup-" + r.gta].pays} (campus à l'étranger, d'après le nom de l'établissement)` : "Non renseigné"))}${r.etab_gps && r.etab_gps.lat != null ? `<span class="src"><a href="https://www.openstreetmap.org/?mlat=${r.etab_gps.lat}&mlon=${r.etab_gps.lon}#map=16/${r.etab_gps.lat}/${r.etab_gps.lon}" target="_blank" rel="noopener">Voir sur une carte</a></span>` : ""}</dd>
      <dt>Admission</dt><dd>${r.aut && r.aut.length ? L(r.aut) : "Pas d'épreuve de sélection ni de modalité particulière signalée."}</dd>
      <dt>Enseignement</dt><dd>${L(r.amg) || "Non renseigné"}</dd>
      <dt>Apprentissage</dt><dd>${r.app && r.app.length ? "Oui, formation en apprentissage" : "Non signalé"}</dd>
      <dt>Internat</dt><dd>${r.int && r.int.length ? L(r.int) : "Non signalé"}</dd>
      <dt>Frais</dt><dd class="muted">Non fournis par la cartographie Parcoursup.</dd>
      <dt>Liens officiels</dt><dd><a href="${esc(r.fiche)}" target="_blank" rel="noopener">Fiche Parcoursup de la formation</a>${r.dataviz ? `<br><a href="${esc(r.dataviz)}" target="_blank" rel="noopener">Statistiques d'admission (data.gouv / MESR)</a>` : ""}</dd>
    </dl>
    <details class="card-flat"><summary>Codes officiels</summary><p class="small" style="margin-top:8px">Code Parcoursup (vœu) : <span class="num">${esc(r.gta)}</span> · établissement d'inscription : ${esc(r.gti)} · formation : ${esc(r.code_formation)} (${esc(r.nmc)}) · rnd : ${esc(r.rnd)}${r.etablissement_id_paysage ? ` · Paysage : ${esc(r.etablissement_id_paysage)}` : ""}${r.composante_id_paysage ? ` / ${esc(r.composante_id_paysage)}` : ""} · année ${esc(r.annee)}</p></details>
    <p class="src">Source : cartographie des formations Parcoursup ${esc(r.annee)}, open data du ministère de l'Enseignement supérieur (SOURCE = PARCOURSUP).</p>
    ${blocStats(r.gta)}`;
  }
  const BLOC_LIB = { admission: "Admission (chiffres)", mentions_admis: "Mentions des admis", notes: "Niveau scolaire", cout: "Coût", langue_requise: "Langues", specialites: "Spécialités", classement: "Classement", candidature: "Candidature", calendrier: "Calendrier", tests: "Tests", integrations: "Intégrations" };
  function blocFusion(f) {
    if (f.__gen && f.__gen.modele) {
      const e = CATBY[f.id];
      return `<div class="card stack" id="sec-fusion"><h3>Sources et données officielles</h3>
        <p class="small">Cette fiche remplace la fiche Mon Plan Sup « ${esc(f.__gen.modeleNom)} », qui ne précisait pas l'option. Elle en reprend tout le contenu (famille, classement, spécialités, débouchés)${srcBadge("E")}. Les chiffres d'admission et les mentions sont ceux de cette option (statistiques officielles 2025)${srcBadge("P")}.</p>
        <h4>Données Parcoursup</h4>${e && e.ps ? blocParcoursup(e.ps) : ""}</div>`;
    }
    if (f.__gen) {
      const e = CATBY[f.id], fam = f.__gen.fam, prob = (FU && FU.ps_probables[f.__gen.gta]) || [], dup = (FU && FU.ps_doublons[f.__gen.gta]) || [];
      return `<div class="card stack" id="sec-fusion"><h3>Sources et données officielles</h3>
        <p class="small">Fiche construite à partir de Parcoursup. Chiffres d'admission et mentions : ${STATS[f.__gen.gta] ? `statistiques officielles 2025${srcBadge("P")}` : f.admission.session ? `statistiques de la session ${esc(f.admission.session)}${f.admission.statut === "releve_manuel" ? ", relevé manuel" : ""}` : esc((MENTION_STATS[f.stats] || MENTION_STATS.sans_stats).replace(/^./, (c) => c.toLowerCase()).replace(/\.$/, ""))}. ${fam.origine === "deduit_intitule"
          ? `Profil, domaines, spécialités et métiers : déduits de l'intitulé officiel de la filière (« ${esc(fam.libelle)} », code ${esc(fam.nmc)})${srcBadge("E")}, confiance ${esc(fam.confiance)}.`
          : `Profil, domaines, spécialités, métiers et poursuites : repris des ${fam.nb} fiche(s) Mon Plan Sup de la même filière (code ${esc(fam.nmc)})${srcBadge("E")}, par exemple ${fam.exemples.slice(0, 3).map((id) => lienFiche(id)).join(", ")}.`} Ces éléments décrivent la filière, pas cet établissement en particulier : à vérifier.</p>
        ${prob.length ? `<div class="notice small"><strong>À vérifier : fiche peut-être déjà présente.</strong> ${prob.map((id) => lienFiche(id)).join(", ")}.</div>` : ""}
        ${dup.length ? `<div class="notice small"><strong>À vérifier : doublon Parcoursup possible.</strong> ${dup.map((g) => lienFiche("psup-" + g)).join(", ")}.</div>` : ""}
        <h4>Données Parcoursup</h4>${e && e.ps ? blocParcoursup(e.ps) : ""}</div>`;
    }
    const e = CATBY[f.id], d = FU && FU.anciennes[f.id];
    if (!e || !d) return "";
    const conf = d.x || [];
    const prov = Object.entries(d.p || {}).filter(([k]) => BLOC_LIB[k]);
    let h = `<div class="card stack" id="sec-fusion"><h3>Sources et données officielles</h3>`;
    if (e.ps) {
      h += `<p class="small">Cette fiche réunit les informations de Mon Plan Sup et la fiche officielle Parcoursup 2026 correspondante (correspondance certaine : ${esc(d.r)}).</p>`;
      if (conf.length) h += `<div class="notice small"><strong>Informations divergentes, à vérifier.</strong> Les deux valeurs sont conservées.<ul class="why">${conf.map((x) => `<li><span class="fw">${esc(x.champ)}</span> : Mon Plan Sup indique « ${esc(x.ancienne)} »${srcBadge({ PARCOURSUP: "P", SITE_OFFICIEL: "O", AUTRE: "A", DONNEE_EDITEUR: "E" }[x.ancienne_source && x.ancienne_source.provenance] || "E")} ; Parcoursup indique « ${esc(x.parcoursup)} »${srcBadge("P")}${x.resolution ? `<br><span class="small muted">${esc(x.resolution)}</span>` : ""}</li>`).join("")}</ul></div>`;
      if (f.__compl) h += `<p class="small">Champs vides de Mon Plan Sup complétés par les statistiques officielles Parcoursup 2025${srcBadge("P")} : ${esc([...Object.keys(f.__compl.admission || {}).filter((c) => !c.startsWith("_")).map((c) => ({ places: "places", candidats: "vœux", admis: "admis", taux: "taux d'accès" }[c] || c)), f.__compl.mentions_admis ? "mentions des admis" : null, f.__compl.notes ? "moyenne estimée des admis" : null].filter(Boolean).join(", "))}. Les valeurs déjà présentes n'ont pas été modifiées.</p>`;
      h += `<h4>Données Parcoursup</h4>${blocParcoursup(e.ps)}`;
    } else if (d.m === "P") {
      h += `<div class="notice small"><strong>À vérifier : correspondance Parcoursup probable.</strong> ${esc(d.r)} Les fiches restent séparées tant que la correspondance n'est pas confirmée.<ul class="why">${(d.c || []).map((g) => `<li>${lienFiche("psup-" + g)}</li>`).join("")}</ul></div>`;
    } else {
      h += `<p class="small muted">${f.pays === "France" || f.__campusEtranger ? "Aucune fiche Parcoursup 2026 correspondante trouvée de façon sûre." : "Formation hors de France : pas de fiche Parcoursup."}</p>`;
    }
    if (prov.length) h += `<h4>Provenance des informations de Mon Plan Sup</h4><p class="small muted">Provenance déclarée lors de la saisie ; ces informations n'ont pas été revérifiées pendant la fusion.</p><dl class="facts small">${prov.map(([k, v]) => `<dt>${esc(BLOC_LIB[k])}</dt><dd>${srcBadge(v)}</dd>`).join("")}<dt>Profil, domaines, métiers, sélectivité</dt><dd>${srcBadge("E")}</dd></dl>`;
    return h + `</div>`;
  }
  function vueFichePs(e) {
    const r = e.ps;
    const prob = (FU && FU.ps_probables[r.gta]) || [], dup = (FU && FU.ps_doublons[r.gta]) || [];
    const v = (col) => (STATS[r.gta] ? statDe(r.gta, col) : null);
    const tuiles = [
      ["groupe", "Places", v("capa_fin") != null ? nbFr(v("capa_fin")) : "n. c.", "ciel"],
      ["bulle", "Vœux", v("voe_tot") != null ? nbFr(v("voe_tot")) : "n. c.", "violet"],
      ["cible", "Taux d'accès", v("taux_acces_ens") != null ? String(v("taux_acces_ens")).replace(".", ",") + " %" : "n. c.", "ambre"],
      ["pin", "Lieu", r.commune || r.departement || "n. c.", "bleu"],
    ];
    return `<div class="stack-lg fiche">
      <header class="fiche-hero ton-${tonType(e.type, e.type_label)}">
        <a href="#explorer" class="lien-retour">${ico("retour")}Catalogue</a>
        <div class="fiche-hero-txt">
          <div class="row badges">${typePill(e.type, e.type_label)}${e.app ? '<span class="pill ton-ciel">Apprentissage</span>' : ""}${e.av ? '<span class="pill verif">À vérifier</span>' : ""}</div>
          <h1>${esc(e.nom)}</h1><p class="f-lieu"><span>${ico("ecole")}${esc(e.etablissement)}</span><span>${ico("pin")}${esc(e.ville)}${r.departement ? " · " + esc(r.departement) : ""}</span></p>
        </div>
        <div class="tuiles">${tuiles.map(([i, l, val, t]) => `<div class="tuile ton-${t}"><span class="tuile-ico">${ico(i)}</span><span class="tuile-l">${l}</span><span class="tuile-v">${esc(val)}</span></div>`).join("")}</div>
      </header>
      ${prob.length ? `<div class="notice small"><strong>À vérifier : fiche peut-être déjà présente.</strong> Cette formation correspond peut-être à : <ul class="why">${prob.map((id) => `<li>${lienFiche(id)}</li>`).join("")}</ul>Les deux fiches restent séparées tant que la correspondance n'est pas confirmée.</div>` : ""}
      ${dup.length ? `<div class="notice small"><strong>À vérifier : doublon Parcoursup possible.</strong> Parcoursup publie ${dup.length + 1} vœux aux informations identiques (seuls le code, l'adresse GPS et la fiche diffèrent) : ${dup.map((g) => lienFiche("psup-" + g)).join(", ")}. Il s'agit souvent de sites ou de sous-vœux différents ; vérifie sur les fiches officielles.</div>` : ""}
      <section class="card stack"><div class="carte-tete"><span class="info-ico ton-violet">${ico("dossier")}</span><h2>Informations officielles Parcoursup</h2></div>${blocParcoursup(r)}</section>
      <p class="notice info small">Mon Plan Sup n'a pas encore de fiche détaillée pour cette formation (niveau attendu, spécialités, débouchés) : elle apparaît dans le catalogue mais pas encore dans tes recommandations personnalisées.</p>
      ${AVERT}
    </div>`;
  }
  let REMPL = {};
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
    const ap = r.tc && r.tc !== "Publics" && !c ? FRAIS_A_PARTIR_DE[r.gta] : null;
    if (ap && typeof ap.min === "number") {
      f.cout = Object.assign({}, f.cout || {}, { valeur_annuelle_eur: null, a_partir_de: ap.min, statut: "releve_parcoursup", source: ap.source, consulte_le: ap.consulte_le,
        texte: `À partir de ${E.fmtEur(ap.min)} par an (la fiche Parcoursup n'indique pas de maximum).` });
    }
  }
  // Frais des formations privées relevés sur leur fiche Parcoursup (data/frais-prives.json, construit par
  // scripts/construire-frais-prives.py). Seules les formations au montant annuel en euros sont dans le fichier : les
  // autres gardent des frais inconnus (règle « prive_frais_inconnus » du moteur). Une fourchette (min < max) est
  // affichée en entier ; valeur_annuelle_eur, le seul nombre lu par le moteur et les cartes, vaut le max.
  let FRAIS_PRIVES = {}, FRAIS_PRIVES_META = null, FRAIS_A_PARTIR_DE = {};
  const SELON_FOURCHETTE = { revenus: " selon les revenus de ta famille", annee: " selon l'année d'études" };
  const montantFrais = (c) => (typeof c.min === "number" && c.min < c.valeur_annuelle_eur ? `${E.fmtEur(c.min)} à ${E.fmtEur(c.valeur_annuelle_eur)}` : E.fmtEur(c.valeur_annuelle_eur));
  function coutReleve(g) {
    const x = FRAIS_PRIVES[g];
    if (!x || typeof x.min !== "number" || typeof x.max !== "number" || x.min > x.max) return null;
    const c = { valeur_annuelle_eur: x.max, min: x.min, max: x.max, nature_fourchette: x.nature_fourchette || null, par: x.par || "par an",
      libelle: x.libelle === "droits_inscription" ? "droits_inscription" : "cout", apprentissage: x.apprentissage || null,
      boursiers_eur: x.boursiers_eur || null, statut: "releve_parcoursup", source: x.source, consulte_le: x.consulte_le };
    const m = montantFrais(c), detail = (c.par.match(/\((.*)\)\s*$/) || [])[1];
    c.texte = c.libelle === "droits_inscription"
      ? `Droits d'inscription et participation annuelle : ${m}${detail ? ` (${detail})` : ""}.`
      : `${c.min < c.max ? "De " : ""}${m} par an${c.min < c.max ? SELON_FOURCHETTE[c.nature_fourchette] || "" : ""}${detail ? ` (${detail})` : ""}.`;
    return c;
  }
  // Coordonnées d'une fiche. Fiche liée à Parcoursup : coordonnées officielles de l'établissement (etab_gps), sinon
  // la commune Parcoursup dans le département Parcoursup. Sinon, la ville de la fiche (data/lieux.json) ; si plusieurs
  // communes de ce nom sont éloignées (homonymes), le département départage : département Parcoursup de la fiche,
  // département écrit dans la ville (« Saint-Pierre (Martinique) »), ou département commun aux formations Parcoursup
  // probables de cette ville (data/fusion.json). Sans département pour trancher : null (distance inconnue), jamais un
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
    FU = fu; CAT = []; CATBY = {}; PSBY = {}; ALIAS = {}; FIL = fil; REMPL = {};
    FRAIS_PRIVES = (fp && fp.formations) || {}; FRAIS_PRIVES_META = (fp && fp.meta) || null; FRAIS_A_PARTIR_DE = (fp && fp.a_partir_de) || {};
    const lignesPs = psc ? decodePs(psc) : [];   // ordre du fichier (PSBY, aux clés numériques, serait trié par code)
    for (const r of lignesPs) PSBY[r.gta] = r;
    // Périmètre (fusion.json, perimetre.categories_masquees) appliqué aussi aux fiches de data/formations.json :
    // une fiche de type BUT ou BTS, ou fusionnée avec une formation Parcoursup BUT ou BTS, n'est ni affichée ni
    // recommandée (données gardées dans le fichier). Sans cela, ces fiches entraient dans les listes de vœux.
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
    window.__CAT = CAT;
  }
  // Campus à l'étranger enregistrés « France » (Dauphine Londres, ESSEC Singapour…), décision du fondateur du 19/10/2026 :
  // pays et ville réels lus dans l'intitulé officiel Parcoursup (data/ajustements.json, campus_etranger, avec sa source).
  // La fiche garde son lien Parcoursup (__campusEtranger : le moteur la laisse dans les listes de vœux) mais suit les
  // règles « étranger ». Appelé après le calcul des coordonnées (gpsDe ne cherche pas de commune française hors de France).
  let CAMPUS = {};
  // Encadré de la fiche d'un campus à l'étranger : lieu réel et coût de la vie du pays (COUT_VIE du moteur) s'il est connu
  function blocCampusEtranger(f) {
    const v = E.coutVie(f);
    const vie = v ? `Vie sur place : ${v.min === v.max ? "≈ " + E.fmtEur(v.min) : `${E.fmtEur(v.min)} à ${E.fmtEur(v.max)}`}/mois, hors frais de scolarité${v.texte ? ` (${esc(v.texte)})` : ""}<span class="badge-statut ${v.statut}">${STATUT_COUT[v.statut] || v.statut}</span>${v.source ? `<span class="src"><a href="${esc(v.source)}" target="_blank" rel="noopener">Source</a></span>` : ""}`
      : "Coût de la vie dans ce pays non relevé : renseigne-toi avant de mettre ce vœu dans ta liste.";
    return `<p class="notice small"><strong>Campus à l'étranger : ${esc(f.ville)}, ${esc(f.pays)}.</strong> Tu candidates sur Parcoursup, mais tu étudies et tu vis dans ce pays. ${vie}</p>`;
  }
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
      id: "psup-" + g, type: fam.type, type_label: fam.type_label || fil.meta.types_label[fam.type] || fam.type, nom: r.nm[0], etablissement: etabCourt(r.etab_nom),
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
      __gen: { gta: g, fam },
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
  function blocStats(g) {
    if (!STATS[g]) return "";
    const v = (c) => statDe(g, c), n = (x) => (x == null ? "n. c." : Number(x).toLocaleString("fr-FR")), p = (x) => (x == null ? "n. c." : `${String(x).replace(".", ",")} %`);
    const men = v("acc_tot") ? { TBF: v("pct_tbf"), TB: v("pct_tb"), B: v("pct_b"), AB: v("pct_ab"), sans: v("pct_sansmention") } : null;
    return `<h4>Admission 2025 (statistiques officielles)</h4>
      <div class="stats">${[["Places", v("capa_fin")], ["Vœux", v("voe_tot")], ["Propositions", v("prop_tot")], ["Admis", v("acc_tot")]].map(([l, x]) => `<div><span class="tiny muted">${l}</span><strong>${n(x)}</strong></div>`).join("")}</div>
      <dl class="facts small">
        <dt>Taux d'accès</dt><dd>${p(v("taux_acces_ens"))}${srcBadge("P")}</dd>
        <dt>Type</dt><dd>${esc(v("select_form") || "n. c.")}${v("list_com") ? ` · ${esc(v("list_com"))}` : ""}</dd>
        <dt>Admis issus d'un bac</dt><dd>général ${p(v("pct_bg"))} · technologique ${p(v("pct_bt"))} · professionnel ${p(v("pct_bp"))}</dd>
        <dt>Profil des admis</dt><dd>néobacheliers ${p(v("pct_neobac"))} · boursiers ${p(v("pct_bours"))} · filles ${p(v("pct_f"))} · même académie ${p(v("pct_aca_orig"))}</dd>
        ${v("ran_grp1") != null ? `<dt>Rang du dernier appelé</dt><dd>${n(v("ran_grp1"))} (${esc(v("lib_grp1") || "")})</dd>` : ""}
        <dt>Rythme des admissions</dt><dd>${p(v("pct_acc_debutpp"))} des admis ont reçu leur proposition à l'ouverture, ${p(v("pct_acc_datebac"))} avant le bac</dd>
      </dl>
      ${men && Object.values(men).every((x) => x != null) ? `<h4>Mentions au bac des admis 2025</h4>${barreMentions(men)}` : ""}
      <p class="src">Source : Parcoursup 2025, vœux et réponses des établissements (open data MESR), SOURCE = PARCOURSUP.</p>`;
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

  /* ================================================================ MON PLAN */
  const MOIS = (d) => d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const cleMois = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  function decale(iso, ans) { const d = new Date(iso + "T12:00:00"); d.setFullYear(d.getFullYear() + ans); return d; }

  /* ---------- engagement extrascolaire : attentes des formations visées et associations conseillées */
  const THEMES = { debat: "Débat, éloquence", economie: "Économie, entreprise", sciences: "Sciences, informatique", maths: "Maths", solidarite: "Solidarité", culture: "Médias, vie lycéenne", environnement: "Environnement", sport: "Sport", international: "International" };
  function ciblesEngagement(sel) {
    const c = new Set();
    for (const x of sel) {
      const f = x.f;
      if (f.plateforme === "parcoursup") c.add("parcoursup");
      if (f.type.startsWith("prepa")) c.add("prepa");
      if (f.type === "college_universitaire" || f.type === "iep") c.add("sciencespo");
      if (f.type === "ecole_commerce") c.add("ecole_commerce");
      if (f.plateforme === "ucas") c.add("uk");
      else if (f.pays === "États-Unis") c.add("usa");
      else if (f.pays === "Canada") c.add("canada");
      else if (f.pays !== "France") c.add("europe");
    }
    return c;
  }
  function assosConseillees(A, sel, n = 8) {
    if (!EXTRA) return [];
    const dom = Object.assign({}, A.interets.domaines || {});
    for (const x of sel) x.f.domaines.slice(0, 3).forEach((d, i) => { dom[d] = (dom[d] || 0) + (0.6 - i * 0.15); });
    const sc = (a) => (a.domaines || []).reduce((t, d) => t + (dom[d] || 0), 0) / Math.sqrt((a.domaines || []).length || 1) + (a.date ? 0.15 : 0);
    const out = [], themes = {};
    for (const a of EXTRA.associations.slice().sort((a, b) => sc(b) - sc(a))) {
      if ((themes[a.theme] || 0) >= 3) continue;           // varier les thèmes
      themes[a.theme] = (themes[a.theme] || 0) + 1; out.push(a);
      if (out.length >= n) break;
    }
    return out;
  }
  function blocEngagement(A, sel) {
    if (!EXTRA) return "";
    const cibles = ciblesEngagement(sel), p = etat.profil;
    const att = EXTRA.attentes.filter((a) => cibles.has(a.cible));
    const assos = assosConseillees(A, sel);
    const dom = A.interets.domaines || {};
    const idees = EXTRA.idees.slice().sort((a, b) => (b.domaines || []).reduce((t, d) => t + (dom[d] || 0), 0) - (a.domaines || []).reduce((t, d) => t + (dom[d] || 0), 0)).slice(0, 4);
    const forts = sel.filter((x) => x.f.dossier_poids === "fort").length, moyens = sel.filter((x) => x.f.dossier_poids === "moyen").length;
    const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return "source"; } };
    return `<section class="stack engagement"><h2 class="titre-ico">${ico("coeur")}Ton engagement extrascolaire</h2>
      <div class="card stack">
        ${sel.length ? `<p class="small">Dans tes vœux, l'extrascolaire est très regardé pour ${forts} formation${forts > 1 ? "s" : ""} et pris en compte pour ${moyens}.` : `<p class="small">`} Tu as renseigné ${p.experiences.length} expérience${p.experiences.length > 1 ? "s" : ""} dans <a href="#profil">ton profil</a>.</p>
        <p class="small muted">Règle d'or : mieux vaut 1 ou 2 engagements suivis pendant au moins un an, avec un rôle et des résultats concrets, qu'une longue liste. Les notes restent le critère principal en France.</p>
      </div>
      ${att.length ? `<h3>Ce qu'attendent les formations que tu vises</h3><div class="faq">${att.map((a) => `<details><summary>${esc(a.titre)}</summary><div class="stack" style="gap:8px;padding:0 14px 14px"><p class="small">${esc(a.texte)}</p>${(a.conseils || []).length ? `<ul class="why small">${a.conseils.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}<span class="src">Source : <a href="${esc(a.source)}" target="_blank" rel="noopener">${esc(host(a.source))}</a></span></div></details>`).join("")}</div>` : ""}
      <h3>Associations, concours et programmes à rejoindre</h3>
      <p class="small muted">Choisis en fonction de tes domaines d'intérêt et des formations de ta liste. Vérifie les conditions (âge, dates) sur le site de chaque organisme.</p>
      <div class="grid-2">${assos.map((a) => `<div class="card stack asso" style="gap:6px"><div class="row" style="justify-content:space-between;gap:6px"><strong>${esc(a.nom)}</strong><span class="pill neutral">${esc(THEMES[a.theme] || a.theme)}</span></div>
        <p class="small">${esc(a.description)}</p>
        ${a.ce_que_ca_montre ? `<p class="small"><span class="muted">Ce que ça montre aux jurys :</span> ${esc(a.ce_que_ca_montre)}</p>` : ""}
        <p class="tiny muted">${a.age_min ? `Dès ${a.age_min} ans · ` : ""}${a.quand ? esc(a.quand) : "Calendrier : voir le site"}</p>
        <span class="src"><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(host(a.url))}</a></span></div>`).join("")}</div>
      <h3>Idées de projets à lancer toi-même</h3>
      <div class="grid-2">${idees.map((i) => `<div class="card-flat stack" style="gap:4px"><strong>${esc(i.titre)}</strong><p class="small">${esc(i.texte)}</p><span class="tiny muted">Effort : ${esc(i.effort)}</span></div>`).join("")}</div>
    </section>`;
  }

  function construirePlan() {
    const A = analyse();
    const sel = A.resultats.filter((x) => etat.retenus.includes(x.f.id));
    const shift = { seconde: 2, premiere: 1 }[etat.profil.niveau] || 0, premiere = shift > 0;
    const auj = new Date(); auj.setDate(1);
    const evts = new Map();
    for (const x of sel) for (const c of x.f.calendrier) {
      const d = decale(c.date, shift); if (d < auj) continue;
      const k = c.etape + c.date;
      if (!evts.has(k)) evts.set(k, { date: d, texte: c.etape + (shift ? " (date estimée)" : ""), qui: new Set() });
      evts.get(k).qui.add(x.f.etablissement);
    }
    const dl = (iso) => decale(iso, shift);
    const plusTot = (dates, def) => dates.filter(Boolean).sort((a, b) => a - b)[0] || def;
    const moisAvant = (d, n) => { const r = new Date(d); r.setMonth(r.getMonth() - n); return r < auj ? new Date(auj.getFullYear(), auj.getMonth() + 1, 1) : r; };
    const dateLimite = (x) => plusTot(x.f.calendrier.map((c) => (/limite|clôture|fin des|round|session d'hiver|assessment|decision|deadline|candidature/i.test(c.etape) ? dl(c.date) : null)), dl("2027-03-12"));
    const cible = (a, x) => {
      switch (a.mois) {
        case "maintenant": return new Date(auj);
        case "trimestre": return new Date(auj.getFullYear(), auj.getMonth() + 1, 1);
        case "avant juin": return new Date(auj.getMonth() >= 5 ? auj.getFullYear() + 1 : auj.getFullYear(), 4, 1);
        case "certif": return moisAvant(dateLimite(x), 2);
        case "tmua": return dl(new Date() > new Date("2026-10-12") ? "2026-12-01" : "2026-10-01");
        case "oxbridge": return moisAvant(dl("2026-10-15"), 1);
        case "sesame": return dl("2027-02-01");
        case "oral": return dl("2027-04-01");
        case "ucas": return dl("2026-12-01");
        case "parcoursup": return dl("2027-03-01");
        default: return moisAvant(dateLimite(x), 1);
      }
    };
    const acts = new Map();
    for (const x of sel) for (const a of x.actions) {
      const d = cible(a, x);
      if (!acts.has(a.cle)) acts.set(a.cle, { cle: a.cle, texte: a.texte, date: d, pour: new Set(), prio: a.prio });
      const cur = acts.get(a.cle); cur.pour.add(x.f.etablissement); if (d < cur.date) cur.date = d;
    }
    // engagements conseillés avec une date (inscriptions aux concours, élections, campagnes)
    for (const a of assosConseillees(A, sel)) {
      if (!a.date || !a.action) continue;
      let d = new Date(a.date + "T12:00:00"); if (d < auj) d = new Date(auj);
      const cle = "asso-" + a.nom.slice(0, 24);
      if (!acts.has(cle)) acts.set(cle, { cle, texte: a.action, date: d, pour: new Set(["engagement"]), prio: 3 });
    }
    const mois = new Map();
    const bucket = (d) => { const k = cleMois(d); if (!mois.has(k)) mois.set(k, { date: new Date(d.getFullYear(), d.getMonth(), 1), evts: [], acts: [] }); return mois.get(k); };
    bucket(auj); evts.forEach((e) => bucket(e.date).evts.push(e)); acts.forEach((a) => bucket(a.date).acts.push(a));
    const fin = [...mois.values()].reduce((m, x) => (x.date > m ? x.date : m), auj);
    for (let d = new Date(auj); d <= fin; d.setMonth(d.getMonth() + 1)) bucket(new Date(d));
    const liste = [...mois.values()].sort((a, b) => a.date - b.date);
    liste.forEach((m) => { m.evts.sort((a, b) => a.date - b.date); m.acts.sort((a, b) => a.prio - b.prio); });
    return { sel, liste, premiere, shift };
  }

  function vuePlan() {
    const A = analyse();
    const sel = A.resultats.filter((x) => etat.retenus.includes(x.f.id));
    const entete = pageHero({ sur: "Mon plan", titre: "Mon plan", sous: "Ton parcours d'orientation : les étapes et les dates pour les formations de tes vœux.", ton: "ambre", ico: "agenda" });
    if (!sel.length) {
      return `<div class="stack-lg">${entete}
        <div class="card stack vide">${ico("agenda")}<h2>Ton plan se construit à partir de tes vœux</h2>
          <p class="small muted">Choisis d'abord des formations dans Ma liste (ou génère une liste équilibrée de 10 vœux) : ton calendrier et tes étapes apparaîtront ici.</p>
          <div class="row"><a class="btn primary" href="#liste" data-action="onglet-liste" data-o="voeux">Choisir mes vœux</a></div></div>
        ${blocEngagement(A, sel)}
      </div>`;
    }
    const P = construirePlan();
    const now = cleMois(new Date());
    const lignes = P.liste.map((m) => `<div class="month ${cleMois(m.date) === now ? "now" : ""}"><h3>${MOIS(m.date)}</h3>
      ${m.evts.length || m.acts.length ? `<ul class="todo">
        ${m.evts.map((e) => `<li class="ev"><span class="date">${e.date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span><span>${esc(e.texte)} <span class="tiny muted">— ${esc([...e.qui].slice(0, 3).join(", "))}${e.qui.size > 3 ? "…" : ""}</span></span></li>`).join("")}
        ${m.acts.map((a) => `<li class="${etat.faits[a.cle] ? "done" : ""}"><input type="checkbox" id="fa-${esc(a.cle)}" data-fait="${esc(a.cle)}" ${etat.faits[a.cle] ? "checked" : ""}><label for="fa-${esc(a.cle)}" style="font-weight:400"><span>${esc(a.texte)}</span> <span class="tiny muted">— ${esc([...a.pour].slice(0, 3).join(", "))}${a.pour.size > 3 ? "…" : ""}</span></label></li>`).join("")}
      </ul>` : `<p class="small muted">Rien de prévu : travail régulier.</p>`}</div>`).join("");
    const ordre = { ambitieux: 0, realiste: 1, securite: 2 };
    const tri = sel.slice().sort((a, b) => ordre[a.categorie] - ordre[b.categorie] || (a.repere.taux ?? 101) - (b.repere.taux ?? 101));
    const nbFaits = [...new Set(P.liste.flatMap((m) => m.acts.map((a) => a.cle)))].filter((k) => etat.faits[k]).length;
    const nbActs = new Set(P.liste.flatMap((m) => m.acts.map((a) => a.cle))).size;
    const pc = nbActs ? Math.round((nbFaits / nbActs) * 100) : 0, CP = 2 * Math.PI * 27;
    return `<div class="stack-lg">
      ${pageHero({ sur: "Mon plan", titre: "Mon plan", sous: `Ton parcours d'orientation, construit pour tes <a href="#liste" data-action="onglet-liste" data-o="voeux">${sel.length} vœu${sel.length > 1 ? "x" : ""}</a> : les étapes et les dates à ne pas manquer.`, ton: "ambre",
        cote: `<div class="progression"><div class="anneau ton-ambre" style="--t:96px" role="img" aria-label="${nbFaits} étapes faites sur ${nbActs}"><svg viewBox="0 0 64 64" aria-hidden="true"><circle class="anneau-fond" cx="32" cy="32" r="27"/><circle class="anneau-val" cx="32" cy="32" r="27" stroke-dasharray="${((pc / 100) * CP).toFixed(1)} ${CP.toFixed(1)}"/></svg><span class="anneau-txt"><b>${pc} %</b><small>fait</small></span></div><span class="small">${nbFaits} étape${nbFaits > 1 ? "s" : ""} faite${nbFaits > 1 ? "s" : ""} sur ${nbActs}</span></div>` })}
      <section class="stack"><h2 class="titre-ico">${ico("agenda")}Calendrier mois par mois</h2>
        ${P.shift ? `<p class="notice small">Tu es en ${P.shift === 2 ? "seconde" : "première"} : les dates affichées sont celles du calendrier 2026-2027 décalées ${P.shift === 2 ? "de deux ans" : "d'un an"}, à confirmer.</p>` : ""}
        <div class="row no-print">${DANS_IFRAME ? "" : `<button class="btn sm" data-action="imprimer">Imprimer / enregistrer en PDF</button>`}<button class="btn sm" data-action="copier-plan">Copier le plan (texte)</button></div>
        <div class="timeline">${lignes}</div></section>
      <section class="stack"><h2 class="titre-ico">${ico("cible")}À travailler, formation par formation</h2>
        <div class="grid-2">${tri.map((x) => `<div class="card stack" style="gap:8px"><div class="row" style="justify-content:space-between;align-items:flex-start"><h3><a href="#formation-${x.f.id}" style="color:inherit">${esc(x.f.nom)}</a></h3>${catPill(x.categorie)}</div><p class="small muted">${esc(x.f.etablissement)}</p><ul class="why">${x.actions.map((a) => `<li>${esc(a.texte)}</li>`).join("")}</ul></div>`).join("")}</div></section>
      ${blocEngagement(A, sel)}
      ${AVERT}
    </div>`;
  }

  function planTexte() {
    const P = construirePlan();
    const l = [`PLAN D'ORIENTATION — Mon Plan Sup${etat.profil.prenom ? " — " + etat.profil.prenom : ""}`, `Généré le ${new Date().toLocaleDateString("fr-FR")}. Outil d'aide : aucune admission garantie.`, "", "MES VŒUX"];
    P.sel.forEach((x) => { l.push(`- [${E.CAT_LABEL[x.categorie]}] ${x.f.nom} — ${x.f.etablissement} — ${repereTxt(x.repere)}`); x.actions.forEach((a) => l.push(`    • ${a.texte}`)); });
    l.push("", "CALENDRIER");
    P.liste.forEach((m) => { if (!m.evts.length && !m.acts.length) return; l.push(MOIS(m.date).toUpperCase()); m.evts.forEach((e) => l.push(`  [${e.date.toLocaleDateString("fr-FR")}] ${e.texte}`)); m.acts.forEach((a) => l.push(`  [${etat.faits[a.cle] ? "x" : " "}] ${a.texte}`)); });
    return l.join("\n");
  }

  /* ================================================================ DONNÉES */
  function vueDonnees() {
    const dispo = S.stockageDisponible(), s = E.statsProfil(etat.profil);
    return `<div class="stack-lg">
      ${pageHero({ sur: "Confidentialité", titre: "Mes données", sous: "Où sont tes informations, comment les récupérer ou les effacer, et comment sont calculés les résultats.", ton: "menthe", ico: "cadenas" })}
      <section class="card stack prose"><h2>Où sont stockées tes réponses ?</h2>
        <p>Uniquement dans ce navigateur, sur cet appareil. Mon Plan Sup n'a ni compte, ni serveur de données, ni cookie, ni mesure d'audience. Les bulletins PDF sont lus dans le navigateur et ne sont jamais envoyés ; seul le texte utile (notes, appréciations) est conservé dans ton profil.</p>
        <p class="small muted">Dans la version hébergée sur Claude, la bibliothèque de lecture PDF (pdf.js) est chargée depuis le CDN cdnjs au moment de l'import. La version installée (voir le README) l'embarque et ne contacte aucun site extérieur.</p>
        <p>Conformément au RGPD, tu peux à tout moment récupérer tes données (export) ou les effacer définitivement.</p>
        ${dispo ? "" : `<p class="notice bad small">Le stockage de ce navigateur est indisponible (navigation privée ?) : tes réponses seront perdues à la fermeture de la page.</p>`}
      </section>
      <section class="card stack"><h2>Exporter ou importer</h2>
        <div class="row">${DANS_IFRAME ? "" : `<button class="btn" data-action="export">Télécharger mes données (JSON)</button>`}<button class="btn" data-action="copier-json">Copier mes données</button></div>
        <div class="field"><label for="import">Importer : colle ici un export Mon Plan Sup</label><textarea id="import" placeholder='{"profil": …}'></textarea></div>
        <div class="row"><button class="btn" data-action="importer">Importer</button><label class="btn" for="importfile">Ouvrir un fichier…</label><input id="importfile" type="file" accept="application/json,.json" class="sr-only"></div>
      </section>
      <section class="card stack"><h2>Tout effacer</h2><p class="small muted">Supprime ton profil, tes réponses, ta liste et ton plan de ce navigateur.</p>
        ${app.confirmEffacer ? `<p class="notice bad small">Confirmer ? Cette action est définitive.</p><div class="row"><button class="btn danger" data-action="effacer-ok">Oui, tout effacer</button><button class="btn" data-action="effacer-annuler">Annuler</button></div>` : `<div><button class="btn danger" data-action="effacer">Tout effacer</button></div>`}
      </section>
      <section class="card stack prose"><h2>Comment on calcule ta moyenne</h2>
        <table><tbody>${moyennesRetenues(s).map((m) => `<tr><th scope="row">${esc(m.lib || m.cle)}</th><td class="num"><strong>${E.fmt(m.v)}</strong></td><td class="small muted">${m.v === null ? "non renseignée" : esc(m.sous)}</td></tr>`).join("")}</tbody></table>
        ${avisSansMoyenne(s, etat.profil)}
        <p><strong>Moyenne générale.</strong> Moyenne simple des moyennes générales écrites sur tes bulletins de première et de terminale : chaque trimestre ou semestre compte autant, sans coefficient. Si une période n'a pas de moyenne générale, elle n'est pas comptée : on ne la recalcule pas à partir de tes matières. Une moyenne en dehors de 0 à 20 (faute de frappe) n'est pas comptée non plus. La moyenne du dernier bulletin est affichée à part ; elle ne sert à aucun calcul.</p>
        <p><strong>Maths et maths expertes.</strong> Deux matières séparées. Maths : moyenne simple de ta spécialité maths sur toutes tes périodes (ou de tes maths complémentaires si tu n'as pas la spécialité : elles ne sont pas comparées aux repères de maths des formations, donnés pour la spécialité). Si tu as arrêté la spécialité maths en fin de première sans prendre maths complémentaires, ce sont tes notes de spécialité de première. Maths expertes : moyenne simple des périodes où tu suis l'option. Pour les formations qui demandent l'option, on regarde aussi ta note : sous ${E.fmt(E.SEUIL_EXPERTES_FAIBLE)}, « à renforcer » ; à ${E.fmt(E.SEUIL_EXPERTES_FORT)} ou plus, « atout fort ». Ces deux seuils sont des choix de Mon Plan Sup, pas des exigences publiées par les formations.</p>
        <p><strong>Aucune prédiction.</strong> On ne prolonge pas ta tendance et on n'ajoute aucun bonus. Seule correction : pour te situer parmi les admis, ta moyenne est diminuée de ${E.fmt(E.MARGE_BULLETIN)} point par prudence.</p>
      </section>
      <section class="card stack prose"><h2>Comment sont calculés les résultats ?</h2>
        <p><strong>Intérêt.</strong> Le questionnaire construit ton profil de domaines (maths, économie, droit…), tes préférences de formation (dose de maths, d'écrit, encadrement, type d'établissement) et les métiers visés. On les compare à chaque formation, puis on applique tes contraintes : étranger, budget, ville, rythme.</p>
        <p><strong>Faisabilité.</strong> Moyenne de six critères, chacun noté de 0 à 100 : notes (ta moyenne générale, et tes maths, comparées au repère de moyenne de la fiche, souvent un repère estimé), spécialités (celles demandées par la formation), appréciations (on compte les mots positifs et négatifs de tes bulletins, comme « sérieux » ou « bavard », et les mentions du conseil de classe), anglais (niveau demandé), tests (à passer ou déjà passés), extrascolaire. Un critère « non exigé » ne compte pas ; une donnée manquante compte pour 55 ; un point bloquant limite la faisabilité à 25 sur 100. Le taux d'accès n'entre pas dans ce calcul. Quand la formation n'a pas de taux d'accès officiel, la faisabilité et la note globale ne sont pas affichées : on écrit « pas de chiffres officiels ».</p>
        <p><strong>Places et vœux.</strong> Pour les formations Parcoursup, le nombre de places et de vœux 2025 et la répartition des mentions des admis viennent de Parcoursup (via OptionMétier et les annuaires Thotis). Attention : un même établissement propose souvent plusieurs vœux (parcours, internat, option) ; chaque fiche indique les places du vœu concerné. Le nombre de vœux ne se compare pas directement aux places : chaque candidat fait jusqu'à 10 vœux et beaucoup refusent les propositions reçues.</p>
        <p><strong>Catégories.</strong> Aucune donnée publique ne donne tes chances d'admission : les statistiques décrivent les admis, pas les refusés. On s'appuie donc sur deux mesures : le taux d'accès officiel de la formation (part des candidats qui ont reçu une proposition) et ta position parmi les admis 2025, calculée à partir de leurs mentions au bac et de ta moyenne moins 0,5 point (par prudence : la moyenne des bulletins n'est pas la note du bac). Sécurité : taux d'accès d'au moins 50 % et moyenne au-dessus d'au moins 60 % des admis, ou formation très ouverte (au moins 85 % des candidats ont reçu une proposition) et moyenne au-dessus d'au moins 30 % des admis, sans point bloquant. Ambitieux : taux d'accès de moins de 20 %, moyenne au-dessus de moins de 30 % des admis (une formation très ouverte reste alors « réaliste »), ou point bloquant. Réaliste : tout le reste. Sans notes, jamais « sécurité ». Tes spécialités, ton anglais et tes appréciations restent affichés comme critères, mais seul un point bloquant change la catégorie.</p>
        <p><strong>Wishlist.</strong> 3 ambitieux, 4 réalistes et 3 sûrs (selon les catégories ci-dessus), au plus 2 vœux par établissement, en privilégiant ton cœur de projet.</p>
        <p><strong>Statuts des données :</strong> ${statutBadge("officiel")} site officiel ou open data public · ${statutBadge("source_secondaire")} média spécialisé · ${statutBadge("estimation")} calculé par nous · ${statutBadge("non_communique")} introuvable.</p>
        <p><strong>Catalogue et Parcoursup.</strong> Le catalogue réunit les fiches de Mon Plan Sup et la cartographie officielle des formations Parcoursup 2026. Quand une fiche de Mon Plan Sup correspond de façon certaine à une formation Parcoursup (même établissement, même commune, même intitulé), une seule fiche est affichée, avec les deux séries d'informations. En cas de doute, les fiches restent séparées et sont marquées « À vérifier ». Quand deux sources se contredisent, les deux valeurs sont affichées avec leur origine : ${srcBadge("P")} cartographie Parcoursup · ${srcBadge("O")} site officiel cité · ${srcBadge("A")} autre source citée · ${srcBadge("E")} donnée saisie ou estimée par Mon Plan Sup.</p>
        <p class="small muted">${esc(DATA.meta.methode_moyenne)} Base du ${esc(fmtDate(DATA.meta.version))}.</p>
      </section>
    </div>`;
  }

  /* ---------------------------------------------------------------- événements */
  function setChemin(obj, chemin, v) { const k = chemin.split("."); let o = obj; while (k.length > 1) { if (!o[k[0]]) o[k[0]] = {}; o = o[k.shift()]; } o[k[0]] = v; }

  document.addEventListener("input", (ev) => {
    const t = ev.target, p = etat.profil;
    if (t.dataset.bind) { setChemin(p, t.dataset.bind, t.value); sauver(); if (t.tagName === "SELECT") rendre(); return; }
    if (t.dataset.per !== undefined) {
      const per = p.periodes[+t.dataset.per];
      if (t.dataset.mat) { per.notes = per.notes || {}; per.notes[t.dataset.mat] = per.notes[t.dataset.mat] || {}; per.notes[t.dataset.mat][t.dataset.k] = t.value; }
      else per[t.dataset.k] = t.value;
      sauver(); return;
    }
    if (t.dataset.imp !== undefined) { app.imports[+t.dataset.imp][t.dataset.k] = t.value; return; }
    if (t.dataset.list) { p[t.dataset.list][+t.dataset.i][t.dataset.k] = t.value; sauver(); return; }
    if (t.dataset.lyceeQ !== undefined) {
      app.lyceeQ = t.value; clearTimeout(app.lt);
      app.lt = setTimeout(rendreRechercheLycee, 200);
      return;
    }
    if (t.dataset.cfiltre) {
      app.cat[t.dataset.cfiltre] = t.type === "checkbox" ? t.checked : t.value; app.limiteCat = 50;
      if (t.type === "text") { clearTimeout(app.cft); app.cft = setTimeout(() => { rendre(); const el = $("#cq"); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 250); }
      else rendre();
      return;
    }
    if (t.dataset.filtre) {
      app.filtres[t.dataset.filtre] = t.type === "checkbox" ? t.checked : t.value; app.limite = 20;
      if (t.type === "text") { clearTimeout(app.ft); app.ft = setTimeout(() => { rendre(); const el = $("#fq"); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 250); }
      else rendre();
    }
  });

  document.addEventListener("change", async (ev) => {
    const t = ev.target, p = etat.profil;
    if (t.dataset.spe) { p.specialitesAuto = false; const v = t.dataset.spe; p.specialites = t.checked ? [...new Set(p.specialites.concat(v))] : p.specialites.filter((x) => x !== v); sauver(); rendre(); return; }
    if (t.dataset.q) {
      const q = QUEST.questions.find((x) => x.id === t.dataset.q);
      if (q.type === "multi") {
        let vals = Array.isArray(etat.reponses[q.id]) ? etat.reponses[q.id].slice() : [];
        if (t.checked) {
          // question « pays » : « Rien d'autre que ce que j'ai coché » (value « aucun ») se combine avec les autres cases
          if (q.id === "pays") vals.push(t.value);
          else if (t.value === "aucun" || t.value === "partout") vals = [t.value];
          else { vals = vals.filter((v) => v !== "aucun" && v !== "partout"); vals.push(t.value); }
          if (vals.length > q.max) { t.checked = false; toast(`${q.max} choix maximum`); return; }
        } else vals = vals.filter((v) => v !== t.value);
        etat.reponses[q.id] = vals; sauver(); rendre();
      } else { etat.reponses[q.id] = q.type === "scale" ? Number(t.value) : t.value; sauver(); }
      return;
    }
    if (t.dataset.fait) { etat.faits[t.dataset.fait] = t.checked; sauver(); t.closest("li").classList.toggle("done", t.checked); return; }
    if (t.id === "pdfbulletins" && t.files.length) {
      const fichiers = [...t.files];
      app.importEnCours = true; rendre();
      for (const file of fichiers) {
        try { app.imports.push(await B.lireFichier(file)); }
        catch (e) { app.imports.push({ fichier: file.name, notes: {}, alertes: ["Lecture impossible : " + (e && e.message ? e.message : "erreur inconnue") + ". Saisis les notes à la main."] }); }
      }
      app.importEnCours = false; rendre(); return;
    }
    if (t.id === "importfile" && t.files[0]) { const r = new FileReader(); r.onload = () => importer(r.result); r.readAsText(t.files[0]); }
    if (t.dataset.list && t.tagName === "SELECT") rendre();
    if (t.dataset.per !== undefined && t.tagName === "SELECT") sauver(true);
  });
  document.addEventListener("toggle", (ev) => {
    const d = ev.target; if (!d.dataset) return;
    if (d.dataset.details === "filtres") app.filtresOuverts = d.open;
    if (d.dataset.perDetails !== undefined && d.open) app.ouverte = +d.dataset.perDetails;
  }, true);

  function importer(texte) {
    try { const x = JSON.parse(texte); if (!x || typeof x !== "object" || !x.profil) throw new Error(); etat = S.fusion(S.vide(), x); migrer(); sauver(true); toast("Données importées"); rendre(); }
    catch (e) { toast("Ce texte n'est pas un export Mon Plan Sup valide"); }
  }
  async function copier(texte, ok) {
    try { await navigator.clipboard.writeText(texte); toast(ok); }
    catch (e) {
      const ta = document.createElement("textarea"); ta.value = texte; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); let r = false; try { r = document.execCommand("copy"); } catch (e2) { /* */ }
      ta.remove(); toast(r ? ok : "Copie impossible ici : sélectionne le texte manuellement");
    }
  }

  // dernière question passée = 6e étape finie : le profil est terminé (le message de fin reste affiché)
  function finQuestionnaire() { if ((etat.qIndex || 0) >= QUEST.questions.length && !etat.profilTermine) { etat.profilTermine = true; app.profilEdition = true; } }
  // après un changement de question, garder la question en haut de l'écran (mobile)
  function versQuestion() { const q = $(".q-card"); if (q && q.getBoundingClientRect().top < 70) window.scrollTo(0, Math.max(0, window.scrollY + q.getBoundingClientRect().top - 90)); }
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-action]"); if (!b) return;
    const a = b.dataset.action, p = etat.profil;
    if (a === "etape") { app.etapeProfil = +b.dataset.i; rendre(); window.scrollTo(0, 0); }
    else if (a === "profil-edition") { app.profilEdition = true; app.etapeProfil = +b.dataset.i || 0; rendre(); window.scrollTo(0, 0); }
    else if (a === "profil-resume") { etat.profilTermine = true; sauver(true); app.profilEdition = false; rendre(); window.scrollTo(0, 0); }
    else if (a === "ajout-periode") { const l = $("#nouvper").value; p.periodes.push({ id: l, label: l, moyenneGenerale: "", moyenneClasse: "", rang: "", effectif: "", notes: {}, appreciationGenerale: "", mention: "" }); p.periodes.sort((x, y) => PERIODES.indexOf(x.label) - PERIODES.indexOf(y.label)); app.ouverte = p.periodes.findIndex((x) => x.label === l); sauver(true); rendre(); }
    else if (a === "suppr-periode") { p.periodes.splice(+b.dataset.i, 1); sauver(true); rendre(); }
    else if (a === "valider-import") {
      const imp = app.imports[+b.dataset.k];
      if (!imp.label) { toast("Choisis d'abord la période du bulletin"); return; }
      const per = { id: imp.label, label: imp.label, moyenneGenerale: imp.moyenneGenerale, moyenneClasse: imp.moyenneClasse, rang: imp.rang, effectif: imp.effectif, notes: imp.notes, appreciationGenerale: imp.appreciationGenerale, mention: imp.mention, source: "pdf" };
      const i = p.periodes.findIndex((x) => x.label === imp.label);
      if (i >= 0) p.periodes[i] = per; else p.periodes.push(per);
      p.periodes.sort((x, y) => PERIODES.indexOf(x.label) - PERIODES.indexOf(y.label));
      if (!p.specialites.length || p.specialitesAuto) {
        const specsDe = (pre) => [...new Set(p.periodes.filter((x) => x.label.startsWith(pre)).flatMap((x) => Object.keys(x.notes || {})).filter((k) => E.SPEC_COURT[k]))];
        const sT = specsDe("Terminale"), sP = specsDe("Première");
        if (sT.length) { p.niveau = "terminale"; p.specialites = sT.slice(0, 2); p.specialiteAbandonnee = sP.find((k) => !sT.includes(k)) || p.specialiteAbandonnee; }
        else if (sP.length) p.specialites = sP.slice(0, 3);
        p.specialitesAuto = true;
        toast("Spécialités déduites du bulletin : vérifie-les dans l'étape Scolarité");
      }
      if (imp.notes.maths_expertes && p.optionMaths === "aucune") p.optionMaths = "expertes";
      if (imp.notes.maths_complementaires && p.optionMaths === "aucune") p.optionMaths = "complementaires";
      app.imports.splice(+b.dataset.k, 1); sauver(true); toast(`${per.label} ajouté à ton profil`); rendre();
    }
    else if (a === "ignorer-import") { app.imports.splice(+b.dataset.k, 1); rendre(); }
    else if (a === "ajout") { p[b.dataset.list].push(b.dataset.list === "certifications" ? { type: "Cambridge English", score: "", niveau: "", langue: "", date: "" } : { type: "association", titre: "", duree: "" }); sauver(true); rendre(); }
    else if (a === "suppr") { p[b.dataset.list].splice(+b.dataset.i, 1); sauver(true); rendre(); }
    else if (a === "q-aller") { etat.qIndex = Math.max(0, +b.dataset.i); finQuestionnaire(); sauver(true); rendre(); versQuestion(); }
    else if (a === "q-nsp") { etat.reponses[b.dataset.q] = "nsp"; etat.qIndex = (etat.qIndex || 0) + 1; finQuestionnaire(); sauver(true); rendre(); versQuestion(); }
    else if (a === "onglet-liste") { app.ongletListe = b.dataset.o === "voeux" ? "voeux" : "reco"; if (app.vue === "liste") rendre(); }
    else if (a === "plus-formations") { app.plusFormations = true; app.limite = 20; rendre(); const el = $("#plus-formations"); if (el && el.scrollIntoView) el.scrollIntoView({ block: "start" }); }
    else if (a === "moins-formations") { app.plusFormations = false; app.filtreCat = "tous"; rendre(); }
    else if (a === "ancre") { ev.preventDefault(); const el = document.getElementById(b.dataset.cible); if (el) { const d = el.closest("details"); if (d) d.open = true; if (el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" }); } }
    else if (a === "menu") { const o = document.body.classList.toggle("menu-ouvert"); b.setAttribute("aria-expanded", String(o)); }
    else if (a === "cat") { app.filtreCat = app.filtreCat === b.dataset.c ? "tous" : b.dataset.c; app.limite = 20; rendre(); }
    else if (a === "plus") { app.limite += 20; rendre(); }
    else if (a === "lycee-choisir") {
      const L = b.dataset.k === "l" ? LIEUX.lycees.find((x) => x.uai === b.dataset.id) : LIEUX.communes.find((x) => x.cle === b.dataset.id);
      if (L) { p.lycee = b.dataset.k === "l" ? { type: "lycee", uai: L.uai, nom: L.nom, commune: L.commune, dep: L.dep, lat: L.lat, lon: L.lon } : { type: "commune", nom: L.commune, commune: L.commune, dep: L.dep || undefined, lat: L.lat, lon: L.lon }; app.lyceeEdition = false; app.lyceeQ = ""; sauver(true); rendre(); toast("Lycée enregistré"); }
    }
    else if (a === "lycee-changer") { app.lyceeEdition = true; rendre(); const el = $("#lyceeq"); if (el) el.focus(); }
    else if (a === "lycee-effacer") { p.lycee = null; app.lyceeEdition = false; sauver(true); rendre(); }
    else if (a === "cat-plus") { app.limiteCat += 50; const y = window.scrollY; rendre(); window.scrollTo(0, y); }
    else if (a === "retenir") { const id = b.dataset.id; etat.retenus = etat.retenus.includes(id) ? etat.retenus.filter((x) => x !== id) : etat.retenus.concat(id); sauver(true); const y = window.scrollY; rendre(); window.scrollTo(0, y); }
    else if (a === "auto-retenir") { { const A = analyse(), W = E.wishlist(A.resultats, 10, A.interets), M = equivalentsDe(A, W); purgerRemplacements(M); etat.retenus = voeuxAffiches(W, M).map(({ x }) => x.f.id); } sauver(true); rendre(); toast("Liste de 10 vœux générée"); }
    // formation équivalente choisie à la place d'un vœu de la liste proposée, ou retour au vœu d'origine ; si le vœu était
    // déjà retenu, il est échangé dans les vœux retenus. Enregistré dans le navigateur seulement (CapStore).
    else if (a === "remplacer" || a === "retablir") {
      // avant : ce qui occupe la place du vœu (équivalent choisi encore valable, sinon le vœu) ; un choix obsolète est ignoré
      const A = analyse(), W = E.wishlist(A.resultats, 10, A.interets), M = equivalentsDe(A, W);
      purgerRemplacements(M);
      const voeu = b.dataset.voeu, R = remplacements(), choisi = M.choix.get(voeu), apres = a === "remplacer" ? b.dataset.id : voeu;
      if (a === "remplacer") R[voeu] = apres; else delete R[voeu];
      // dans les vœux retenus, le vœu d'origine et l'ancien choix laissent leur place à apres (une seule fois)
      const occupants = [voeu, choisi ? choisi.f.id : null].filter((id) => id && id !== apres);
      const i = etat.retenus.findIndex((id) => occupants.includes(id));
      if (i >= 0) {
        etat.retenus = etat.retenus.map((id, j) => (j === i ? apres : id)).filter((id, j) => !(occupants.includes(id) && j !== i));
        etat.retenus = etat.retenus.filter((id, j) => etat.retenus.indexOf(id) === j);
      }
      sauver(true); const y = window.scrollY; rendre(); window.scrollTo(0, y);
      toast(a === "remplacer" ? "Formation équivalente choisie" : "Vœu d'origine rétabli");
    }
    else if (a === "imprimer") window.print();
    else if (a === "copier-plan") copier(planTexte(), "Plan copié");
    else if (a === "copier-json") copier(JSON.stringify(etat, null, 1), "Données copiées");
    else if (a === "export") { const blob = new Blob([JSON.stringify(etat, null, 1)], { type: "application/json" }); const u = URL.createObjectURL(blob), l = document.createElement("a"); l.href = u; l.download = "mon-plan-sup-mes-donnees.json"; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000); }
    else if (a === "importer") importer($("#import").value);
    else if (a === "effacer") { app.confirmEffacer = true; rendre(); }
    else if (a === "effacer-annuler") { app.confirmEffacer = false; rendre(); }
    else if (a === "effacer-ok") { S.effacer(); etat = S.vide(); migrer(); app.confirmEffacer = false; app.etapeProfil = 0; app.imports = []; toast("Toutes tes données ont été effacées"); rendre(); }
  });
  window.addEventListener("hashchange", route);

  (async function init() {
    try {
      const [q, m, p, x] = await Promise.all([charger("data-questionnaire", "data/questionnaire.json"), charger("data-metiers", "data/metiers.json"), charger("data-poursuites", "data/poursuites.json"), charger("data-extrascolaire", "data/extrascolaire.json").catch(() => null)]);
      QUEST = q; migrer(); METIERS = m.metiers; POURS = p.poursuites; EXTRA = x; window.__METIERS_REPERES = m.reperes;
      E.init({ metiers: METIERS, poursuites: POURS });
      window.__QUEST = QUEST;
      route();
    } catch (e) {
      $("#main").innerHTML = erreurDonnees(e);
    }
  })();
})();
