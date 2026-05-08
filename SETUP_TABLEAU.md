# Setup du tableau de bord partagé

## Étape 1 — Créer la Google Sheet (2 minutes)

1. Va sur sheets.google.com → Nouveau
2. Nomme-la "Corvée Bruchési 2026"
3. Colonne A = id, B = statut, C = benevoles
4. Entre les données suivantes EXACTEMENT :

| A (id) | B (statut) | C (benevoles) |
|--------|-----------|---------------|
| c1 | a-faire | |
| c2 | a-faire | |
| c3 | a-faire | |
| c4 | a-faire | |
| c5 | a-faire | |
| c6 | a-faire | |
| c7 | a-faire | |
| c8 | a-faire | |
| c9 | a-faire | |
| c10 | a-faire | |
| c11 | a-faire | |
| c12 | a-faire | |
| c13 | a-faire | |
| c14 | a-faire | |
| c15 | a-faire | |
| c16 | a-faire | |
| c17 | a-faire | |
| c18 | a-faire | |
| c19 | a-faire | |

## Étape 2 — Publier la feuille

1. Fichier → Partager → Publier sur le web
2. Choisir "Feuille 1" et format "Valeurs séparées par des virgules (.csv)"
3. Cliquer "Publier"
4. Copier l'URL générée (ressemble à :
   https://docs.google.com/spreadsheets/d/XXXX/pub?gid=0&single=true&output=csv)

## Étape 3 — Donner l'URL à Claude

Colle l'URL CSV ici et je mets à jour le tableau automatiquement !

## Pour le coordinateur samedi matin

- Ouvre la Google Sheet sur ton téléphone/tablette
- Change le statut : "a-faire" → "en-cours" → "termine"
- Écris les noms des bénévoles dans la colonne C
- Tous les autres voient les changements en 15 secondes sur corvee.netlify.app
