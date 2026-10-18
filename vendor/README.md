# Bibliothèques tierces

## pdf.js

- Fichiers : `pdfjs.js` (bibliothèque) et `pdfjs.worker.js` (worker)
- Version : 6.2.108 (build `0365cbde0`), build « legacy » de Mozilla
- Projet : https://github.com/mozilla/pdf.js
- Licence : Apache 2.0, texte complet dans `LICENSE-pdfjs.txt`
  (Copyright 2024 Mozilla Foundation)
- Modification : le build « legacy » (modules ES) a été converti en scripts classiques pour Mon Plan Sup :
  chaque fichier est enveloppé dans `(function(){ … })();` et expose `globalThis.pdfjsLib` /
  `globalThis.pdfjsWorker` ; le worker tourne dans la page (pas de Web Worker séparé).
  L'avis de licence d'origine est conservé en tête de chaque fichier.

Utilisé par `js/bulletin.js` pour lire les bulletins PDF dans le navigateur de l'élève.
