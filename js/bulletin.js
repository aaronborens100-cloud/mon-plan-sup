/*
 * js/bulletin.js : lecture des bulletins PDF (CapBulletin).
 *
 * Rôle : extraire d'un bulletin scolaire numérique (Pronote, EcoleDirecte…) les matières,
 * les moyennes (élève, classe, coefficients), le niveau, la période, le rang, la mention
 * et des mots-clés des appréciations. Le fichier est lu dans le navigateur de l'élève avec
 * pdf.js (vendor/), chargé seulement au premier import ; aucune donnée n'est envoyée.
 *
 * Expose : window.CapBulletin (lireFichier, analyser, analyseAppreciations, chargerPdfJs,
 * lignesPdf, TYPES_COL, MATIERES).
 * Ordre de chargement : 2e des 4 scripts de js/ ; utilise window.pdfjsLib une fois pdf.js chargé.
 */
/* Mon Plan Sup — lecture des bulletins PDF (dans le navigateur, rien n'est envoyé).
   Fonctionne avec les bulletins numériques (Pronote, EcoleDirecte…) contenant du texte.
   Un bulletin scanné (image) ne peut pas être lu : il faut alors saisir les notes à la main. */
(function () {
  "use strict";

  let pdfjs = null;
  // pdf.js est chargé seulement au premier import. Version « legacy » (compatible avec les navigateurs
  // plus anciens) convertie en script classique ; le « worker » tourne dans la page (pas de Web Worker).
  const charge = (src) => new Promise((ok, ko) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => ko(new Error("Chargement impossible : " + src)); document.head.appendChild(s); });
  const injecte = (id) => { const t = document.getElementById(id); if (!t) return false; const s = document.createElement("script"); s.textContent = t.textContent; document.head.appendChild(s); return true; };
  // Safari (WebKit, donc tous les navigateurs sur iPhone/iPad) ne sait pas parcourir un ReadableStream
  // avec « for await … of » : pdf.js 6 s'en sert pour extraire le texte. On ajoute la fonction manquante.
  function completerNavigateur() {
    const RS = window.ReadableStream;
    if (RS && !RS.prototype[Symbol.asyncIterator]) {
      const iterer = function (opts) {
        const reader = this.getReader();
        const garder = !!(opts && opts.preventCancel);
        return {
          next() { return reader.read(); },
          return(v) {
            if (!garder) { try { reader.cancel(); } catch (e) {} }
            try { reader.releaseLock(); } catch (e) {}
            return Promise.resolve({ done: true, value: v });
          },
          [Symbol.asyncIterator]() { return this; }
        };
      };
      try {
        Object.defineProperty(RS.prototype, Symbol.asyncIterator, { value: iterer, writable: true, configurable: true });
        if (!RS.prototype.values) Object.defineProperty(RS.prototype, "values", { value: iterer, writable: true, configurable: true });
      } catch (e) {}
    }
  }

  // Lecture du texte d'une page sans dépendre de « for await » (même résultat que page.getTextContent()).
  async function texteDePage(page) {
    if (typeof page.streamTextContent !== "function") return page.getTextContent();
    const reader = page.streamTextContent().getReader();
    const res = { items: [], styles: Object.create(null), lang: null };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (res.lang == null) res.lang = value.lang;
      Object.assign(res.styles, value.styles);
      for (const it of value.items) res.items.push(it);
    }
    return res;
  }

  async function chargerPdfJs() {
    completerNavigateur();
    if (pdfjs) return pdfjs;
    if (!window.pdfjsLib) {
      // 1) version tout-en-un : le code est intégré à la page
      if (!(injecte("src-pdfjs-worker") && injecte("src-pdfjs"))) {
        // 2) version installée : fichiers du dossier vendor/
        try { await charge("vendor/pdfjs.worker.js"); await charge("vendor/pdfjs.js"); }
        catch (e) {
          // 3) dernier recours : CDN
          const CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
          await charge(CDN + "pdf.min.js"); await charge(CDN + "pdf.worker.min.js");
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = CDN + "pdf.worker.min.js";
        }
      }
    }
    if (!window.pdfjsLib) throw new Error("bibliothèque PDF indisponible");
    pdfjs = window.pdfjsLib;
    if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = "vendor/pdfjs.worker.js";
    return pdfjs;
  }

  /* ---------- extraction des lignes (regroupement par ordonnée) */
  async function lignesPdf(buffer) {
    const lib = await chargerPdfJs();
    const doc = await lib.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise;
    const lignes = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await texteDePage(page);
      const items = tc.items.filter((it) => it.str && it.str.trim()).map((it) => ({ x: it.transform[4], y: it.transform[5], s: it.str, w: it.width || 0 }));
      items.sort((a, b) => b.y - a.y || a.x - b.x);
      const groupes = [];
      for (const it of items) {
        const g = groupes.find((gr) => Math.abs(gr.y - it.y) < 3);
        if (g) g.items.push(it); else groupes.push({ y: it.y, items: [it] });
      }
      groupes.sort((a, b) => b.y - a.y);
      for (const g of groupes) {
        g.items.sort((a, b) => a.x - b.x);
        let txt = "", fin = null;
        const cellules = [];
        for (const it of g.items) {
          if (fin !== null && it.x - fin > 8) { txt += "  "; cellules.push(""); }
          else if (fin !== null && it.x - fin > 1.5) txt += " ";
          txt += it.s;
          if (!cellules.length) cellules.push("");
          cellules[cellules.length - 1] += (cellules[cellules.length - 1] && !(fin !== null && it.x - fin > 8) ? " " : "") + it.s;
          fin = it.x + it.w;
        }
        lignes.push({ page: p, y: g.y, texte: txt.replace(/\s+$/, ""), cellules: cellules.map((c) => c.trim()).filter(Boolean), items: g.items });
      }
    }
    return lignes;
  }

  /* ---------- dictionnaire des matières (ordre = priorité) */
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
  const MATIERES = [
    ["maths_expertes", ["MATHS EXPERTES", "MATHEMATIQUES EXPERTES", "MATHS EXPERT", "MATH EXPERT", "MATHEMATIQUES EXPERT", "OPT. MATHS EXPERTES"]],
    ["maths_complementaires", ["MATHS COMPLEMENTAIRES", "MATHEMATIQUES COMPLEMENTAIRES", "MATHS COMP", "MATHEMATIQUES COMP", "MATH COMPL"]],
    ["AMC", ["ANGLAIS MONDE CONTEMPORAIN", "ANGLAIS, MONDE CONTEMPORAIN", "ANGL. MONDE CONTEMP", "ANGLAIS MONDE CONTEMP", "AMC"]],
    ["LLCER_anglais", ["LLCER ANGLAIS", "LLCE ANGLAIS", "LANGUES, LITTERATURES ET CULTURES ETRANGERES ET REGIONALES ANGLAIS", "LANG. LITT. CULT. ANGLAIS", "LLCER AGL", "LLCER-ANGLAIS"]],
    ["LLCER_autre", ["LLCER ESPAGNOL", "LLCER ALLEMAND", "LLCER ITALIEN", "LLCE ESPAGNOL", "LLCER"]],
    ["HGGSP", ["HGGSP", "HIST.GEO.GEOPOL", "HISTOIRE-GEO. GEOPOL", "HIST GEO GEOPOL", "HIST.-GEO. GEOPOL", "HISTOIRE GEOGRAPHIE GEOPOLITIQUE", "HISTOIRE-GEOGRAPHIE, GEOPOLITIQUE"]],
    ["HLP", ["HLP", "HUMANITES, LITTERATURE", "HUMANITES LITTERATURE", "HUMANITES LITT"]],
    ["SES", ["SCIENCES ECONOMIQUES ET SOCIALES", "SC. ECONO", "SC.ECONO", "SC ECO", "SC. ECO", "SES"]],
    ["NSI", ["NUMERIQUE ET SCIENCES INFORMATIQUES", "NUMERIQUE ET SC", "NUMERIQUE SC.INFORM", "NSI"]],
    ["SI", ["SCIENCES DE L'INGENIEUR", "SC. INGENIEUR", "SC.INGENIEUR", "SCIENCES INGENIEUR"]],
    ["eps", ["EDUCATION PHYSIQUE", "ED.PHYSIQUE", "ED. PHYSIQUE", "EPS"]],
    ["physique_chimie", ["PHYSIQUE-CHIMIE", "PHYSIQUE CHIMIE", "PHYS.CHIM", "PHYS-CHIM", "PHYSIQUE"]],
    ["SVT", ["SCIENCES DE LA VIE ET DE LA TERRE", "SCIENCES VIE & TERRE", "SVT"]],
    ["es", ["ENSEIGNEMENT SCIENTIFIQUE", "ENS. SCIENTIFIQUE", "ENSEIGN.SCIENTIF", "ENSEIGN. SCIENTIFIQUE", "ENS.SCIENTIFIQUE", "ENSEIGN. SC", "ENSEIGN.SC", "ENS SCI"]],
    ["maths", ["MATHEMATIQUES", "MATHS", "MATH.", "MATHEMATIQUE"]],
    ["philosophie", ["PHILOSOPHIE", "PHILO"]],
    ["francais", ["FRANCAIS"]],
    ["dnl", ["DNL", "DISCIPLINE NON LINGUISTIQUE"]],
    ["hg", ["HISTOIRE-GEOGRAPHIE", "HISTOIRE GEOGRAPHIE", "HIST-GEO", "HISTOIRE-GEO", "HIST.GEO", "HIST. GEO", "HIST.-GEO", "HISTOIRE GEO"]],
    ["lva", ["ANGLAIS LV1", "ANGLAIS LVA", "LV1 ANGLAIS", "LVA ANGLAIS", "ANGLAIS"]],
    ["lvb", ["ESPAGNOL", "ALLEMAND", "ITALIEN", "CHINOIS", "ARABE", "PORTUGAIS", "RUSSE", "LVB", "LV2"]],
    ["emc", ["ENSEIGNEMENT MORAL", "ENS. MORAL", "ENS.MORAL", "EMC"]],
  ];
  function matiereDe(texte) {
    const t = norm(texte).slice(0, 60);
    for (const [cle, alias] of MATIERES) {
      for (const a of alias) {
        const i = t.indexOf(a);
        const apres = t[i + a.length];
        if (apres && /[A-Z]/.test(apres) && a.length <= 5) continue;
        if (i === 0 || (i > 0 && i < 6 && /[^A-Z]/.test(t[i - 1]))) {
          // éviter « ANGLAIS » dans « LLCER ANGLAIS » ou « MATHS » dans « MATHS EXPERTES » : géré par l'ordre
          return { cle, alias: a };
        }
      }
    }
    return null;
  }
  const NOTE_RE = /(?<![\d,.])(\d{1,2}(?:[,.]\d{1,2})?)(?![\d,.])/g;
  function notes(texte) {
    const out = [];
    let m;
    const t = texte.replace(/\b\d{1,2}\s*\/\s*\d{1,3}\b/g, " ").replace(/\(\s*\d+\s*h\s*\)/gi, " ");
    while ((m = NOTE_RE.exec(t))) {
      const v = Number(m[1].replace(",", "."));
      if (v >= 0 && v <= 20 && (m[1].includes(",") || m[1].includes(".") || v >= 5)) out.push({ v, i: m.index, fin: m.index + m[0].length });
    }
    return out;
  }
  const PROF_RE = /\b(M\.|Mme|MME|Mlle|MLLE|Monsieur|Madame)\s+[A-ZÉÈÀÂÎÔÛÇ][A-ZÉÈÀÂÎÔÛÇa-zéèêàâîôûç'\-]+(\s+(?:[A-Z]\.|[A-ZÉÈ]{2,}\b))?/g;
  const MOTS_CLES = /^\s*(?:moyenne g[ée]n[ée]rale|appr[ée]ciation g[ée]n[ée]rale|avis du conseil|observations? du conseil|vie scolaire|absences?|retards?|rang\b|effectif|bulletin|moy\.? classe|moy\.? [ée]l[èe]ve|mati[èe]res?|appr[ée]ciations?|parcours|mentions?\b|le chef|le proviseur)/i;

  function nettoieAppreciation(s) {
    return s.replace(PROF_RE, "").replace(/\s{2,}/g, " ").replace(/^[\s|:–-]+|[\s|:–-]+$/g, "").trim();
  }


  /* ---------- colonnes du tableau
     Un bulletin est un tableau : chaque ligne = une matière, chaque colonne = une information.
     - Coef. : poids de la matière dans la moyenne générale (ex. 16 pour une spécialité, 6 pour l'anglais).
     - Moyenne élève (« Élève », « Moy. élève », « Moyenne ») : LA note de l'élève dans la matière.
     - Moyenne classe (« Clas. », « Moy. classe ») : la moyenne de toute la classe, pour comparer.
     - Min / Max (« - » / « + », « + basse » / « + haute ») : la plus basse et la plus haute moyenne de la classe.
     - Rang (« 8/23 ») ; An. (moyenne annuelle) ; T1, T2 (rappel des trimestres précédents) : informations en plus.
     On repère la bande d'en-tête (souvent sur 2 ou 3 lignes chez Pronote), la position horizontale de chaque
     colonne, puis on range chaque nombre d'une ligne de matière dans la colonne la plus proche. */
  const TYPES_COL = { coef: "Coef.", eleve: "Moyenne élève", classe: "Moyenne classe", min: "Note la plus basse", max: "Note la plus haute", rang: "Rang dans la matière", annuel: "Moyenne annuelle", prec: "Période précédente" };
  function typeEntete(t) {
    const n = norm(t);
    if (/^MOYENNES\b/.test(n)) return null;                       // titre de groupe (« Moyennes T3 »)
    if (/COEF/.test(n)) return "coef";
    if (/CLASSE|^CLAS\.?$|MOY\.?\s*CL\b|GROUPE/.test(n)) return "classe";
    if (/ELEVE|\bELV\b|MOY\.?\s*EL/.test(n)) return "eleve";
    if (/^\+?\s*BAS|PLUS BAS|\bMIN|^-$/.test(n)) return "min";
    if (/^\+?\s*HAUT|PLUS HAUT|\bMAX|^\+$/.test(n)) return "max";
    if (/^RANG\b/.test(n)) return "rang";
    if (/^AN\.?$|ANNUEL/.test(n)) return "annuel";
    if (/^(T[1-3]|S[12])$/.test(n)) return "prec";
    if (/^MOY(\.|ENNE)?$/.test(n)) return "moy";
    return null;
  }
  // largeur des caractères (police Helvetica/Arial, en fraction de la taille) pour situer un mot
  // à l'intérieur d'un bloc de texte que le PDF a fusionné (« 4/23 15,40 13,35 15,28 »)
  const LARG = (() => {
    const t = {}; const set = (chars, w) => { for (const c of chars) t[c] = w; };
    set("0123456789", 0.556); set(" ,.:;/!'’|", 0.278); set("-()", 0.333); set("+=<>", 0.584);
    set("abcdeghknopqsuvxyz", 0.53); set("ijl", 0.222); set("ft", 0.278); set("r", 0.333); set("mw", 0.8);
    set("ABCDEFGHKNOPQRSTUVXYZ", 0.68); set("IJ", 0.3); set("L", 0.556); set("MW", 0.88);
    return t;
  })();
  const largeur = (c) => LARG[c] ?? LARG[c.normalize("NFD")[0]] ?? 0.556;
  function itemsDe(ligne) {
    // découpe chaque bloc de texte en mots, chacun avec sa position x (début et centre)
    const out = [];
    for (const it of ligne.items || []) {
      const s = it.s; const tot = [...s].reduce((a, c) => a + largeur(c), 0) || 1;
      const k = (it.w || s.length * 4) / tot; let pos = 0;
      for (const mot of s.split(/(\s+)/)) {
        const lw = [...mot].reduce((a, c) => a + largeur(c), 0);
        if (mot.trim()) out.push({ s: mot, x: it.x + pos * k, xc: it.x + (pos + lw / 2) * k });
        pos += lw;
      }
    }
    return out.sort((a, b) => a.x - b.x);
  }
  // colonnes d'une ligne : bloc entier (« Moy. élève ») ou mot par mot (« Coef. Rang » = 2 colonnes)
  function colonnesLigne(L) {
    const out = [];
    for (const it of L.items || []) {
      if (it.s.trim().length > 24 || /^MOYENNES\b/.test(norm(it.s))) continue;   // « Moyennes T2 » = titre de groupe
      const mots = itemsDe({ items: [it] }).filter((m) => !/^[+-]$/.test(m.s)).map((m) => ({ type: typeEntete(m.s), x: m.xc, s: m.s })).filter((m) => m.type);   // « + basse » : le « + » n'est pas une colonne
      const t = typeEntete(it.s);
      if (mots.length >= 2 && new Set(mots.map((m) => m.type)).size >= 2) out.push(...mots);
      else if (t) out.push({ type: t, x: it.x + (it.w || 0) / 2, s: it.s });
      else if (mots.length === 1 && it.s.trim().split(/\s+/).length <= 2 && mots[0].type !== "moy") out.push(mots[0]);
    }
    return out;
  }
  const estEnteteLigne = (L) => !(/:/.test(L.texte) && !/\bCOEF|\bMIN\b|\bMAX\b/.test(norm(L.texte)));
  function detecterColonnes(lignes) {
    for (let i = 0; i < lignes.length; i++) {
      const L = lignes[i];
      if (matiereDe(L.texte) || !estEnteteLigne(L)) continue;            // « Élève : … Classe : … » n'est pas un en-tête
      const c0 = colonnesLigne(L);
      if (!c0.length) continue;
      // bande d'en-tête : lignes voisines (moins de 12 pt) qui ne sont pas des matières
      const bande = [L];
      for (let k = i + 1; k < Math.min(lignes.length, i + 4); k++) {
        const M = lignes[k];
        if (M.page !== L.page || Math.abs(bande[bande.length - 1].y - M.y) > 12 || matiereDe(M.texte) || !estEnteteLigne(M)) break;
        bande.push(M);
      }
      const fin = i + bande.length - 1;
      if (!lignes.slice(fin + 1, fin + 6).some((x) => matiereDe(x.texte))) continue;   // un tableau de matières doit suivre
      let cols = c0.slice();
      for (const M of bande.slice(1)) {
        for (const c of colonnesLigne(M)) {
          // deux lignes : « Moy. » au-dessus de « élève » → la colonne devient « élève »
          const proche = cols.find((d) => d.type === "moy" && Math.abs(d.x - c.x) < 22);
          if (proche) proche.type = c.type; else cols.push(c);
        }
      }
      // « Moyenne » seule = moyenne de l'élève (si aucune colonne « élève » n'existe)
      if (!cols.some((c) => c.type === "eleve")) { const m = cols.find((c) => c.type === "moy"); if (m) m.type = "eleve"; }
      cols = cols.filter((c) => c.type !== "moy").sort((a, b) => a.x - b.x);
      const vus = new Set(); cols = cols.filter((c) => c.type === "prec" || (vus.has(c.type) ? false : vus.add(c.type)));
      if (cols.some((c) => c.type === "eleve") && cols.length >= 2) return { cols, ligne: i, fin };
    }
    return null;
  }
  const NUM_RE = /^(\d{1,2}(?:[,.]\d{1,2})?|ABS\.?|DISP\.?|N\.?\s?NOT\.?|NN|N\.?E\.?)$/i;
  const RANG_RE = /^\d{1,3}(?:e|ème|er)?\/\d{1,3}$/i;
  // nombres de la ligne, de gauche à droite, jusqu'au début de l'appréciation
  function nombresPositionnes(ligne) {
    const mots = itemsDe(ligne); const out = []; let vu = false, finX = null;
    for (const m of mots) {
      const brut = m.s.replace(/\*$/, "");
      if (NUM_RE.test(brut)) {
        const v = /^\d/.test(brut) ? Number(brut.replace(",", ".")) : null;
        if (v === null || v <= 20) out.push({ v, brut, x: m.xc, fin: m.x, entier: /^\d+$/.test(brut) || /[,.]0+$/.test(brut) });
        vu = true; continue;
      }
      if (RANG_RE.test(brut)) { out.push({ rang: brut, x: m.xc }); vu = true; continue; }
      if (vu) { finX = m.x; break; }                                    // premier mot après les nombres = appréciation
    }
    const ns = out.filter((n) => !n.rang);
    ns.rang = (out.find((n) => n.rang) || {}).rang || "";
    ns.finX = finX;
    return ns;
  }
  function rangerParColonnes(ligne, C, ns) {
    const out = {};
    if (!C) return out;
    ns = ns || nombresPositionnes(ligne);
    const dist = {};
    for (const n of ns) {
      let best = null, d = 1e9;
      for (const c of C.cols) { if (c.type === "rang") continue; const dd = Math.abs(c.x - n.x); if (dd < d) { d = dd; best = c; } }
      if (!best || d > 30) continue;
      const cle = best.type === "prec" ? "prec_" + best.s : best.type;
      if (!(cle in out) || d < dist[cle]) { out[cle] = n; dist[cle] = d; }
    }
    return out;
  }
  function rangerSansEntete(ns) {
    // ordre le plus courant : [coef] élève classe [min max]
    const out = {};
    let k = 0;
    if (ns.length >= 3 && ns[0].entier && ns[0].v !== null && ns[0].v <= 12) { out.coef = ns[0]; k = 1; }
    if (ns[k]) out.eleve = ns[k];
    if (ns[k + 1]) out.classe = ns[k + 1];
    if (ns[k + 2]) out.min = ns[k + 2];
    if (ns[k + 3]) out.max = ns[k + 3];
    return out;
  }
  const valeur = (n) => (n ? (n.v === null ? "" : String(n.v)) : "");

  /* ---------- niveau, période, mention */
  function niveauDeClasse(code) {
    const c = norm(code).replace(/\s+/g, "");
    if (/^(1|1E|1ERE|1RE|PREM|PREMIERE)/.test(c)) return "Première";
    if (/^(T|TLE|TERM|TERMINALE)/.test(c)) return "Terminale";
    if (/^(2|2ND|2NDE|2DE|SECONDE)/.test(c)) return "Seconde";
    return null;
  }
  const MENTIONS = [
    [/FELICITATIONS/, "Félicitations"], [/EXCELLENCE/, "Excellence"], [/COMPLIMENTS/, "Compliments"], [/TABLEAU D'HONNEUR/, "Tableau d'honneur"],
    [/ENCOURAGEMENTS/, "Encouragements"], [/AVERTISSEMENT.*COMPORTEMENT|MISE EN GARDE.*COMPORTEMENT/, "Avertissement comportement"],
    [/AVERTISSEMENT|MISE EN GARDE/, "Avertissement travail"],
  ];
  const mentionDe = (t) => { const n = norm(t); for (const [re, lib] of MENTIONS) if (re.test(n)) return lib; return ""; };

  /* ---------- analyse du texte */
  function analyser(lignes, nomFichier) {
    const texte = lignes.map((l) => l.texte).join("\n");
    const res = { fichier: nomFichier, label: "", niveau: null, notes: {}, moyenneGenerale: "", moyenneClasse: "", moyenneAnnuelle: "", rang: "", effectif: "", appreciationGenerale: "", mention: "", alertes: [], nbLignes: lignes.length };
    if (texte.replace(/\s/g, "").length < 60) { res.alertes.push("Aucun texte lisible : ce PDF est sans doute un scan (image). Saisis les notes à la main."); return res; }
    const N = norm(texte);
    // colonnes du tableau
    const detect = detecterColonnes(lignes);
    const colonnes = detect;
    res.colonnes = detect ? [...new Set(detect.cols.map((c) => c.type))] : null;
    if (!detect) res.alertes.push("En-têtes de colonnes non trouvés : ordre supposé « coef (si présent), moyenne élève, moyenne classe, min, max ». Vérifie.");
    // niveau : la classe est écrite AVANT le tableau (« Classe : 1ère G3 », ou « 1D » seul sur sa ligne) ;
    // après le tableau, la décision d'orientation (« TERMINALE GENERALE… ») ne doit pas compter.
    const debut = detect ? detect.ligne : lignes.findIndex((l) => matiereDe(l.texte));
    const avant = lignes.slice(0, debut > 0 ? debut : lignes.length);
    for (const l of avant) {
      const t = l.texte.trim();
      const mc = t.match(/classe\s*:?\s*([0-9A-Za-zÀ-ÿ]+(?:\s?[A-Z0-9]{1,3})?)/i);
      const code = mc ? mc[1] : (/^[12T][A-Z0-9]{0,4}$|^(1ère|1re|2nde|2de|Tle|Term)\s?[A-Z]?\d?$/i.test(t) ? t : null);
      if (code && niveauDeClasse(code)) { res.niveau = niveauDeClasse(code); break; }
    }
    if (!res.niveau) {
      const NA = norm(avant.map((l) => l.texte).join("\n"));
      if (/TERMINALE|\bTLE\b|\bT[ °]?G[ÉE]N|\bTERM\b/.test(NA)) res.niveau = "Terminale";
      else if (/PREMIERE|\b1ERE\b|\b1RE\b|\b1E G/.test(NA)) res.niveau = "Première";
      else if (/SECONDE|\b2NDE\b|\b2DE\b/.test(NA)) res.niveau = "Seconde";
    }
    let per = "";
    const mt = N.match(/(1|2|3)\s*(?:ER|EME|E|ÈME)?\s*TRIMESTRE|TRIMESTRE\s*(1|2|3)/);
    const ms = N.match(/(1|2)\s*(?:ER|EME|E)?\s*SEMESTRE|SEMESTRE\s*(1|2)/);
    if (mt) per = "T" + (mt[1] || mt[2]); else if (ms) per = "S" + (ms[1] || ms[2]);
    if (res.niveau && per) res.label = `${res.niveau} – ${per}`;
    // rang général (« Rang : 4 / 33 »), effectif
    const mr = N.match(/RANG\s*:\s*(\d{1,3})\s*(?:ER|EME|E)?\s*(?:\/|SUR)\s*(\d{1,3})/);
    if (mr) { res.rang = mr[1]; res.effectif = mr[2]; }
    else { const r2 = N.match(/RANG\s*:\s*(\d{1,3})\b/); if (r2) res.rang = r2[1]; }
    const me = N.match(/EFFECTIF\s*(?:DE LA CLASSE)?\s*:?\s*(\d{1,3})/); if (me && !res.effectif) res.effectif = me[1];
    // mention du conseil : lue sur la ligne « Mention(s) : … » (pas dans les appréciations des professeurs)
    const lm = lignes.find((l) => /^(MENTIONS?|DISTINCTIONS?)\b|MENTION DU CONSEIL|AVIS DU CONSEIL|DECISION DU CONSEIL/.test(norm(l.texte)));
    if (lm) res.mention = mentionDe(lm.texte.replace(/^[^:]*:/, ""));

    // matières + appréciations
    let courante = null;
    const debutTable = detect ? detect.fin + 1 : 0;
    for (let i = debutTable; i < lignes.length; i++) {
      const l = lignes[i].texte;
      const nl = norm(l);
      if (/MOYENNE(S)? G[EÉ]N[EÉ]RALE|MOY\.? G[EÉ]N/.test(nl)) {
        const C = rangerParColonnes(lignes[i], colonnes);
        if (C.eleve) { res.moyenneGenerale = valeur(C.eleve); if (C.classe) res.moyenneClasse = valeur(C.classe); if (C.annuel) res.moyenneAnnuelle = valeur(C.annuel); }
        else if (!colonnes) { const ns = notes(l); if (ns.length) { res.moyenneGenerale = String(ns[0].v); if (ns[1]) res.moyenneClasse = String(ns[1].v); } }
        courante = null; continue;
      }
      if (/APPRECIATION G[EÉ]N[EÉ]RALE|AVIS DU CONSEIL|OBSERVATIONS? DU CONSEIL|APPRECIATION DU CONSEIL|APPRECIATION GLOBALE/.test(nl)) {
        let s = l.replace(/appr[ée]ciation g[ée]n[ée]rale|avis du conseil de classe|avis du conseil|observations? du conseil de classe|appr[ée]ciation du conseil de classe|appr[ée]ciation globale/i, "").replace(/^[\s:–-]+/, "");
        for (let k = i + 1; k < Math.min(lignes.length, i + 6); k++) {
          const nk = norm(lignes[k].texte);
          if (matiereDe(lignes[k].texte) || /SIGNATURE|LE PROVISEUR|LE CHEF D|CACHET|ABSENCES|RETARDS|VIE SCOLAIRE|MENTION|DECISION|^-?\s*(PREMIERE|TERMINALE) /.test(nk)) break;
          s += " " + lignes[k].texte;
        }
        res.appreciationGenerale = nettoieAppreciation(s);
        courante = null; continue;
      }
      const mat = matiereDe(l);
      if (mat) {
        // la ligne qui porte les nombres : celle de la matière, ou la suivante
        let L = lignes[i];
        if (!nombresPositionnes(L).length && lignes[i + 1] && !matiereDe(lignes[i + 1].texte) && nombresPositionnes(lignes[i + 1]).length) L = lignes[i + 1];
        const nums = nombresPositionnes(L);
        if (!nums.length) continue;                       // libellé seul (ex. « ENSEIGN. SC. » écrit à la verticale)
        let C = colonnes ? rangerParColonnes(L, colonnes, nums) : rangerSansEntete(nums);
        if (!C.eleve) { courante = null; continue; }      // pas de note cette période (ex. seulement l'annuel)
        // appréciation : le texte situé après les nombres
        const mots = itemsDe(L);
        let appr = nums.finX === null ? "" : nettoieAppreciation(mots.filter((m) => m.x >= nums.finX - 0.5).map((m) => m.s).join(" "));
        if (!L.items) { const ns = notes(l); appr = ns.length ? nettoieAppreciation(l.slice(ns[ns.length - 1].fin)) : ""; }
        if (L !== lignes[i]) i++;
        if (res.notes[mat.cle]) {
          // même matière sur plusieurs lignes (sous-matières, deux professeurs) : on garde la 1re note, on ajoute l'appréciation
          const ex = res.notes[mat.cle];
          if (appr.length > 3) ex.appreciation = (ex.appreciation + " " + appr).trim();
          if (!ex.coef && C.coef) ex._coefSous = (ex._coefSous || 0) + Number(C.coef.v || 0);   // coef total = somme des sous-matières
          courante = mat.cle; continue;
        }
        const x = res.notes[mat.cle] = { moy: valeur(C.eleve), classe: valeur(C.classe), coef: C.coef ? valeur(C.coef) : "", min: valeur(C.min), max: valeur(C.max), appreciation: appr.length > 3 ? appr : "" };
        if (nums.rang) x.rang = nums.rang;
        if (C.annuel) x.annuel = valeur(C.annuel);
        if (C.eleve.v === null) x.statut = C.eleve.brut;
        courante = mat.cle;
        continue;
      }
      // ligne de continuation d'une appréciation
      if (courante && !MOTS_CLES.test(l) && !notes(l).length && l.trim().length > 3) {
        const a = nettoieAppreciation(l);
        if (a) res.notes[courante].appreciation = (res.notes[courante].appreciation + " " + a).trim();
      } else if (MOTS_CLES.test(l)) courante = null;
    }
    for (const x of Object.values(res.notes)) { if (!x.coef && x._coefSous) x.coef = String(x._coefSous); delete x._coefSous; }
    const nb = Object.keys(res.notes).length;
    if (!res.moyenneGenerale && nb) {
      let sp = 0, sc = 0;
      for (const [k, x] of Object.entries(res.notes)) { const v = Number(x.moy), c = Number(x.coef) || 1; if (x.moy !== "" && !isNaN(v)) { sp += v * c; sc += c; } }
      if (sc) { res.moyenneGenerale = String(Math.round((sp / sc) * 100) / 100); res.moyenneCalculee = true; }
    }
    if (!nb) res.alertes.push("Aucune matière reconnue. Vérifie que le PDF est bien un bulletin, ou saisis les notes à la main.");
    else if (nb < 5) res.alertes.push(`Seulement ${nb} matière(s) reconnue(s) : vérifie et complète.`);
    if (!res.label) res.alertes.push("Période non détectée : choisis-la dans la liste.");
    if (res.moyenneCalculee) res.alertes.push("Moyenne générale absente du bulletin : calculée à partir des matières, en tenant compte des coefficients.");
    return res;
  }

  async function lireFichier(file) {
    const buf = await file.arrayBuffer();
    const lignes = await lignesPdf(buf);
    return analyser(lignes, file.name);
  }

  /* ---------- analyse des appréciations (mots-clés) */
  const POSITIFS = ["excellent", "excellente", "tres bon", "tres bonne", "remarquable", "brillant", "brillante", "felicitations", "compliments", "serieux", "serieuse", "investi", "investie", "rigoureux", "rigoureuse", "dynamique", "autonome", "solide", "tres bien", "bravo", "efficace", "pertinent", "pertinente", "moteur", "curieux", "curieuse", "assidu", "assidue", "impliqu", "participation active", "tres satisfaisant", "en progres", "progres"];
  const NEGATIFS = ["insuffisant", "insuffisante", "manque de travail", "manque de serieux", "bavard", "bavarde", "dissip", "passif", "passive", "absences", "avertissement", "fragile", "decevant", "decevante", "irregulier", "irreguliere", "superficiel", "lacunes", "difficultes", "doit se ressaisir", "trop juste", "attention", "mise en garde", "travail personnel insuffisant", "baisse", "en baisse", "agitation", "comportement"];
  const sansAccents = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  function scoreAppreciation(txt) {
    const t = sansAccents(txt || "");
    if (!t.trim()) return null;
    let p = 0, n = 0; const posT = [], negT = [];
    for (const w of POSITIFS) if (t.includes(w)) { p++; posT.push(w); }
    for (const w of NEGATIFS) if (t.includes(w)) { n++; negT.push(w); }
    return { p, n, score: p - 1.5 * n, posT, negT };
  }
  function analyseAppreciations(periodes) {
    let tot = 0, nb = 0, p = 0, n = 0; const extraits = [];
    const mentions = [];
    for (const per of periodes || []) {
      const all = [];
      for (const [mat, x] of Object.entries(per.notes || {})) if (x.appreciation) all.push([mat, x.appreciation]);
      if (per.appreciationGenerale) all.push(["generale", per.appreciationGenerale]);
      for (const [mat, a] of all) {
        const s = scoreAppreciation(a); if (!s) continue;
        tot += s.score; nb++; p += s.p; n += s.n;
        if (s.n && extraits.length < 3) extraits.push({ per: per.label, mat, txt: a, type: "neg" });
        else if (s.p >= 2 && extraits.filter((e) => e.type === "pos").length < 2) extraits.push({ per: per.label, mat, txt: a, type: "pos" });
      }
      if (per.mention) mentions.push(`${per.label} : ${per.mention}`);
    }
    if (!nb && !mentions.length) return null;
    const mentionNeg = mentions.some((m) => /avertissement|mise en garde/i.test(m));
    const mentionPos = mentions.filter((m) => /f[ée]licitations|compliments|excellence|tableau d'honneur/i.test(m)).length;
    const moy = nb ? tot / nb : 0;
    let niveau = moy >= 1.2 || mentionPos >= 2 ? "fort" : moy >= 0.3 || mentionPos ? "conforme" : moy >= -0.5 ? "renforcer" : "faible";
    if (mentionNeg) niveau = niveau === "fort" ? "conforme" : "faible";
    return { niveau, nb, positifs: p, negatifs: n, mentions, extraits };
  }

  window.CapBulletin = { lignesPdf, TYPES_COL, lireFichier, analyser, analyseAppreciations, chargerPdfJs, MATIERES };
})();
