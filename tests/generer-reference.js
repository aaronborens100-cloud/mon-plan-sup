/*
 * tests/generer-reference.js : enregistre ce que le moteur produit aujourd'hui pour chaque profil.
 *
 * Usage : node tests/generer-reference.js            (tous les profils)
 *         node tests/generer-reference.js eco-moyen  (un seul profil)
 *
 * À lancer seulement :
 *   - une première fois, pour créer les références ;
 *   - quand un changement de résultats est VOULU (nouvelle règle, nouvelles données). Dans ce cas,
 *     le dire dans la pull request avec des exemples avant / après (règle 5 de CLAUDE.md).
 * Ne jamais le lancer juste pour faire passer un test qui échoue sans comprendre pourquoi.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { chargerSite } = require("./charger-site");
const { instantane } = require("./instantane");
const PROFILS = require("./profils");

const DOSSIER = path.join(__dirname, "reference");

(async () => {
  const choix = process.argv.slice(2);
  const liste = choix.length ? PROFILS.filter((p) => choix.includes(p.id)) : PROFILS;
  if (!liste.length) { console.error("Aucun profil ne correspond à :", choix.join(", ")); process.exit(1); }
  const site = await chargerSite();
  fs.mkdirSync(DOSSIER, { recursive: true });
  for (const p of liste) {
    const fichier = path.join(DOSSIER, p.id + ".json");
    fs.writeFileSync(fichier, JSON.stringify(instantane(site, p), null, 1) + "\n");
    console.log("Référence enregistrée :", path.relative(process.cwd(), fichier));
  }
})().catch((e) => { console.error(e); process.exit(1); });
