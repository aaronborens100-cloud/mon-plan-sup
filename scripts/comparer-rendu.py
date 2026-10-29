#!/usr/bin/env python3
"""Usage : python3 scripts/comparer-rendu.py captures-reference captures-site
Compare les captures deux à deux et affiche la part de pixels différents.
Objectif : 0 % sur chaque page (tolérance 0,5 % pour les différences de données entre l'artefact et le dépôt)."""
import sys, os
from PIL import Image, ImageChops
ref, site = sys.argv[1], sys.argv[2]
ko = 0
for f in sorted(os.listdir(ref)):
    a = Image.open(os.path.join(ref, f)).convert("RGB")
    p = os.path.join(site, f)
    if not os.path.exists(p):
        print(f"MANQUANT {f}"); ko += 1; continue
    b = Image.open(p).convert("RGB")
    if a.size != b.size:
        print(f"TAILLE   {f}: référence {a.size}, site {b.size}"); ko += 1; continue
    d = ImageChops.difference(a, b).convert("L").point(lambda v: 255 if v > 24 else 0)
    n = sum(1 for v in d.getdata() if v)
    pct = 100 * n / (a.size[0] * a.size[1])
    print(f"{'OK      ' if pct < 0.5 else 'ÉCART   '}{f}: {pct:.2f} % de pixels différents")
    if pct >= 0.5: ko += 1
sys.exit(1 if ko else 0)
