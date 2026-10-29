// Usage : node scripts/captures-rendu.js <url-ou-fichier> <dossier-sortie>
// Ex.   : node scripts/captures-rendu.js http://localhost:8000/index.html captures-site
//         node scripts/captures-rendu.js file://$PWD/reference-site/mon-plan-sup-v9.html captures-reference
// Prend les mêmes captures (ordinateur 1440 px, téléphone 390 px) pour comparer le site à la référence.
const { chromium } = require("playwright");
const fs = require("fs");
const [, , cible, sortie] = process.argv;
const AVANT = [["accueil", "#accueil", true], ["profil", "#profil", true], ["catalogue", "#explorer", false], ["liste-verrou", "#liste", false], ["plan-verrou", "#plan", false]];
const APRES = [["liste", "#liste", false], ["plan", "#plan", false], ["fiche", "#formation-ps-7917", false]];   // profil commencé : une spécialité cochée
(async () => {
  fs.mkdirSync(sortie, { recursive: true });
  const b = await chromium.launch();
  for (const [nom, w] of [["pc", 1440], ["tel", 390]]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    p.on("pageerror", (e) => console.log("ERREUR JS", e.message.slice(0, 200)));
    const prendre = async (liste) => { for (const [id, hash, pleine] of liste) {
      await p.goto(cible + hash);
      await p.waitForTimeout(1500);
      await p.screenshot({ path: `${sortie}/${nom}-${id}.png`, fullPage: pleine });
    } };
    await prendre(AVANT);
    await p.goto(cible + "#profil"); await p.waitForTimeout(1200);
    await p.click('label.chip:has-text("Mathématiques")'); await p.waitForTimeout(400);   // profil commencé
    await prendre(APRES);
    // questionnaire (dernière étape du profil), avec une réponse cochée
    await p.goto(cible + "#profil"); await p.waitForTimeout(1200);
    await p.click('button:has-text("Questionnaire")'); await p.waitForTimeout(500);
    await p.click(".q-option >> nth=1"); await p.waitForTimeout(300);
    await p.screenshot({ path: `${sortie}/${nom}-questionnaire.png` });
  }
  await b.close();
})();
