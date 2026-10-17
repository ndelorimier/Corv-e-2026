# Intégrer la maquette Claude Design dans le tableau de bord

**Source :** `design/Corvee Bruchesi.dc.html`, la maquette Claude Design du projet `65676c95-…` lue en entier (gabarit lignes 1-360, logique lignes 361-655).
**Cible :** réécrire `railway/public/index.html` comme page autonome (HTML + CSS + JS vanilla, sans React, sans `support.js`), branchée sur l'API réelle de `railway/server.js`.

## Principe

La maquette est un composant Claude Design (`<x-dc>`, `{{ }}`, `<sc-if>`, `<sc-for>`, `DCLogic`) avec des **données simulées** (`TASKS`, `SEED`, `simulate()`, `localStorage`). On reprend **à l'identique** :
- le rendu visuel : couleurs, rayons, tailles, graisses, espacements ;
- les textes ;
- la hiérarchie et les comportements d'interface.

On remplace la simulation par l'API.

- Transformer les styles inline de la maquette en **classes CSS** basées sur des variables (`--bg`, `--surface`, `--ink`, `--muted`, `--line`, `--track`, `--warm`, `--accentText`, `--lakeText`, `--lakeBg`, `--doneText`, `--doneBg`, `--doneBtn`, `--doneBtnInk`, `--tagIdle`, `--maxw`). Reprendre les valeurs exactes de `LIGHT` (thème clair, par défaut) et `DARK` (« thème soir », imposé en mode projection, où `--maxw` vaut `1680px`).
- Police : Red Hat Display (Google Fonts, 400/500/700/800/900), comme dans la maquette.
- Logo : `assets/logo-bruchesi-2025.png` (noir) en thème clair, `assets/logo-bruchesi-2025-blanc.png` en thème soir et en projection (pas de `filter:invert`). Dans les encadrés sur fond `#FDEFE3` (célébration, bilan), toujours le noir.
- Rendu : un objet `S` (état d'interface) et `render()` qui produit le HTML. Utiliser la **délégation d'événements** (`data-action="claim" data-id="f1"` + un écouteur sur `document`) plutôt que des `onclick` avec chaînes échappées.
- **Toute donnée saisie** (noms de chantier, équipe, détails, prénoms, notes, message diffusé, libellés de section) passe par `esc()`.
- Ne jamais redessiner pendant une saisie : garder la garde `hasOpenInteraction()` (formulaire ouvert, ou focus dans un `input`/`textarea`/`select`). Le sondage met l'état à jour, mais `render()` attend la fin de l'interaction, puis se fait au prochain cycle ou à la fermeture du formulaire.

## Correspondance maquette → API

| Action (maquette) | Appel réel |
|---|---|
| Chargement des chantiers | `GET /api/tasks` → `{tasks:[{p,s,tasks:[{id,nom,team,type,details?}]}]}` |
| État en direct | `GET /api/state` toutes les 15 s → `{state, ts, tasksVersion}`. Si `tasksVersion` change (sauf la 1re fois), recharger `/api/tasks`. |
| Événement | `GET /api/config` → `{event:{titre,date,heure}}` |
| `claim` « take » | `POST /api/claim {id,name}` |
| `claim` « join » | `POST /api/join {id,name}` |
| `primary` « finish » | `POST /api/complete {id}` |
| `release` | `POST /api/release {id}` |
| `leave` | `POST /api/leave {id,name}` (voir la modification serveur plus bas) |
| `cycle` (coordonnateur) | `POST /api/state {pin,id,field:'s',value}` |
| Note | `POST /api/note {id,note}` |
| Modifier, ajouter ou supprimer un chantier (coordonnateur) | modifier la liste locale, puis `POST /api/tasks {pin,tasks}` (toute la liste) |
| Diffuser / effacer | `POST /api/broadcast {pin,msg}` ; affichage depuis `state._broadcast` (`{msg,ts}`) ; « masquer » est local et vaut pour ce `ts` |
| Code coordonnateur | `POST /api/login {pin}` (200 ou 403). **Aucun code en dur dans la page.** |
| Liste de bénévoles | `GET /api/volunteers`, `POST /api/volunteers {pin,names}` → `<datalist id="benevoles">` sur tous les champs prénom |

Chaque réponse d'API qui contient `state` remplace l'état local, puis `render()`. En cas d'erreur réseau : toast « Connexion perdue, réessaie » et indicateur « Hors ligne » (point rouge). En cas de 409 (déjà pris, etc.) : toast avec le message du serveur et rechargement de l'état.

**« Annuler » dans le toast** (6 s), appel inverse : take → `/api/release` ; join → `/api/leave` ; finish → `/api/reopen` (nouveau, voir plus bas) ; release → aucun annuler (on affiche juste le toast).

## Écarts voulus par rapport à la maquette

1. **En-tête et bilan paramétrés :**
   - le titre de l'en-tête vient de `EVENT.titre` ;
   - la ligne sous le titre affiche `{EVENT.date} · {EVENT.heure}` ;
   - le sur-titre du bilan affiche `Camp Bruchési · {EVENT.date}`.
2. **Textes non saisonniers :**
   - célébration : titre « Les priorités A sont bouclées. », sous-texte « Tous les chantiers A1 et A2 sont terminés. Bravo l'équipe ! » ;
   - bilan : titre « Mission accomplie. ».
3. **Sections dynamiques.** Le libellé vient de `section.s` ; si le libellé contient « — », la partie gauche devient `label` et la droite `sub`. Couleur par clé : `a1:#EB7F3D`, `a2:#8BC6F1`, `b:#5B7A8A`, sinon `#5B7A8A`. La célébration se déclenche quand toutes les tâches des sections dont la clé commence par « a » sont terminées.
4. **Types :** `TYPES` contient aussi `rangement:'Rangement'` et `hivernisation:'Hivernisation'`. Le `<select>` de types est généré à partir de `TYPES`.
5. **Fonctions coordonnateur à garder** (absentes de la maquette, indispensables demain), dans le style de la maquette :
   - dans le panneau d'édition du chantier, en plus de « Nom » et « Équipe » : **Section** (`<select>`), **Type** (`<select>`), **Détails** (`<textarea>`) et un bouton **Supprimer** (texte `#B3261E`, avec confirmation par un toast « Annuler » ou une boîte de dialogue intégrée, sans `confirm()` natif) ;
   - en mode coordonnateur, un bouton **« + Ajouter un chantier »** en bas de chaque section : bordure pointillée `2px dashed var(--line)`, hauteur 52 px. Il crée une tâche `{id:'t'+Date.now().toString(36), nom:'', team:'', type:''}` et ouvre directement son panneau d'édition. Une tâche sans nom n'est pas envoyée au serveur ;
   - dans le panneau coordonnateur (sous « Diffuser »), un bloc **« Liste des bénévoles »** : `<textarea>`, un prénom par ligne, bouton « Enregistrer la liste » → `/api/volunteers`.
6. **Impression :** « Version imprimable » réutilise la fonction `openPrint()` de l'ancienne page (à reprendre telle quelle, avec `esc()`, `EVENT` et `TYPES`).
7. **Sous-tâches :** abandonnées (absentes de la maquette, aucune donnée d'automne n'en utilise).
8. **Aucune donnée simulée :** pas de `TASKS`, `SEED`, `NAMES`, `simulate()` ni d'état local des chantiers dans `localStorage`. On garde dans `localStorage` seulement le prénom (`cv26_myname`), le thème (`cv26_theme2`) et les sons (`cv26_sound`).
9. **Sons et animations :** son « pris » (660→880 Hz) et son « terminé » (784→1047 Hz) quand le sondage détecte un changement de statut fait par quelqu'un d'autre, avec le badge « À l'instant » et le halo (`box-shadow`) pendant 6 s, plus le message `aria-live`. Comparer l'ancien et le nouvel état sur **tous** les identifiants des deux états, pas seulement ceux de `DATA`, pour qu'une tâche tout juste ajoutée déclenche aussi la notification.
10. **QR code :** même service `api.qrserver.com`, URL `location.origin + '/'`.
11. **Mode projection :** filtre « besoin » imposé, thème soir, QR en coin, plein écran, et maintien de l'écran allumé (`navigator.wakeLock`, comme l'ancienne page).

## Modification serveur (avec tests)

`railway/server.js` :
- `POST /api/leave {id,name}` : si `name` (comparé sans tenir compte de la casse ni des espaces) est le responsable `n` et qu'il y a des `extras`, alors `n = extras[0]` et `extras = extras.slice(1)`. S'il est le responsable sans `extras`, la tâche revient à `{s:'a-faire', n:'', extras:[]}` (la `note` est conservée). Sinon, comportement actuel : on retire le nom des `extras`.
- `POST /api/reopen {id}` : seulement si `s === 'termine'`, alors `s = 'en-cours'` ; sinon 409.

Tests à ajouter dans `railway/test/server.test.js` :

```js
test('leave du responsable promeut le premier equipier', async () => {
  await post('/api/claim', { id: 'f2', name: 'Ana' });
  await post('/api/join', { id: 'f2', name: 'Bo' });
  const d = await (await post('/api/leave', { id: 'f2', name: 'ana' })).json();
  assert.strictEqual(d.state.f2.n, 'Bo');
  assert.deepStrictEqual(d.state.f2.extras, []);
  const d2 = await (await post('/api/leave', { id: 'f2', name: 'Bo' })).json();
  assert.strictEqual(d2.state.f2.s, 'a-faire');
});

test('reopen remet en cours une tache terminee', async () => {
  await post('/api/claim', { id: 'f3', name: 'Cy' });
  await post('/api/complete', { id: 'f3' });
  const r = await post('/api/reopen', { id: 'f3' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await r.json()).state.f3.s, 'en-cours');
  assert.strictEqual((await post('/api/reopen', { id: 'f3' })).status, 409);
});
```

## Critères d'acceptation

- `cd railway && npm test` : 8 tests réussis, 0 échec.
- Le JS inline passe `node --check`.
- Aucune occurrence de `2026` comme code, ni de `support.js`, `DCLogic`, `{{` ou `sc-if` dans `railway/public/index.html`.
- À 375 px : pas de défilement horizontal ; cibles d'au moins 44 px ; boutons principaux de 56 px.
- `tableau_de_bord_corvee.html` à la racine n'est pas modifié (sa suppression relève de la phase 1).
