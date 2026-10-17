# Tableau de bord de la corvée d'automne : plan d'amélioration

> **Pour les agents :** sous-compétence REQUISE : utiliser superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans pour exécuter ce plan tâche par tâche. Les étapes utilisent la syntaxe de case à cocher (`- [ ]`) pour le suivi.

**Objectif :** réutiliser le tableau de bord du printemps pour la corvée d'automne de demain (17 octobre 2026), sans perdre de données, avec un code coordonnateur qui fonctionne vraiment et des tâches qui apparaissent sur tous les téléphones. Ensuite, le rendre durable et beau.

**Architecture :** un serveur Express (`railway/server.js`) garde l'état en JSON dans `DATA_DIR`. Une page unique (`railway/public/index.html`) interroge `/api/state` toutes les 15 s. On garde cette architecture pour demain : on corrige, on paramètre, on ne réécrit pas.

**Technologies :** Node 24, Express 4, HTML/CSS/JS sans framework, Railway (service `Corv-e-2026` du projet `superb-vibrancy`, déploiement depuis `main`, dossier racine `/railway`), tests avec `node:test` (intégré à Node, aucune dépendance).

---

## Constats qui motivent ce plan

| # | Constat | Gravité | Preuve |
|---|---------|---------|--------|
| 1 | Les données vivent dans `/tmp` sans volume Railway : **le prochain déploiement efface tout**. | 🔴 | `server.js:9` `DATA_DIR = process.env.DATA_DIR \|\| '/tmp'` ; aucune variable sur le service |
| 2 | Le code coordonnateur est codé en dur côté navigateur (`'2026'`) et visible dans le code source. Si on change `COORD_PIN` sur Railway, le mode coordonnateur **cesse de fonctionner**. | 🔴 | `index.html:1183` |
| 3 | Les tâches ajoutées n'apparaissent pas sur les autres appareils avant un rechargement de la page : le sondage ne relit que l'état, jamais `/api/tasks`. | 🔴 | `fetchState()` `index.html:1131` |
| 4 | Le titre, la date et l'heure du printemps sont codés en dur (« Corvée d'ouverture 2026 · 9 mai · 9h00 ») dans l'en-tête, le bilan de fin de journée et l'impression. | 🔴 | `index.html:329-330, 416-417, 926-927` |
| 5 | Les nouvelles tâches ne déclenchent ni son ni flash, et la célébration « priorités A » ignore les tâches ajoutées : la liste d'identifiants `c1…c19` est codée en dur. | 🟡 | `index.html:695, 1050` |
| 6 | Injection HTML : les prénoms saisis par n'importe qui sont insérés sans échappement (carte, palmarès, impression). | 🟡 | `index.html:1226, 1010, 862` |
| 7 | Sur mobile, les boutons de la carte débordent (« + Se joindre » est coupé) et l'en-tête s'empile sur 4 lignes. | 🟡 | capture 375 px |
| 8 | Le logo intégré est une image vide (1 Ko pour 521×730) : rien ne s'affiche. | 🟡 | en-tête |
| 9 | Interface sans accents (« Corvee », « Termines », « benevole »), alors que l'impression en a. | 🟡 | partout |
| 10 | « Mes chantiers » et le palmarès ignorent les bénévoles qui se sont joints. « Al » correspond aussi à « Valérie ». | 🟢 | `index.html:1220, 989` |
| 11 | `tableau_de_bord_corvee.html` à la racine est une copie identique de `railway/public/index.html` : les deux vont diverger. | 🟢 | `cmp` |

---

## Structure des fichiers (phase 0)

- Modifier : `railway/server.js` pour exporter `app`, ajouter `/api/config`, `/api/login`, `tasksVersion`, une graine de tâches et la validation de `/api/state`.
- Créer : `railway/taches-automne.json`, la liste des chantiers d'automne (graine chargée si aucune donnée n'existe).
- Créer : `railway/test/server.test.js`, les tests d'API.
- Modifier : `railway/package.json` pour ajouter le script `test`.
- Modifier : `railway/public/index.html` pour l'événement paramétré, la connexion côté serveur, les identifiants dynamiques, le rechargement des tâches, l'échappement, le mobile et les accents.
- Créer : `railway/public/logo.png`, une copie de `Bruchési/logo_chapeau.png`.
- Modifier : `.gitignore` pour ignorer `_sauvegardes/` (le dépôt est **public**).

---

## PHASE 0 : ce soir, avant la corvée (environ 2 h 30)

### Tâche 0 : sauvegarder les données du printemps ✅ (déjà fait le 16 octobre)

**Fichiers :** `_sauvegardes/printemps-2026-tasks.json`, `_sauvegardes/printemps-2026-state.json`

- [x] **Étape 1 : copier l'état en ligne**

```bash
mkdir -p _sauvegardes
curl -s https://corve2026-production.up.railway.app/api/tasks > _sauvegardes/printemps-2026-tasks.json
curl -s https://corve2026-production.up.railway.app/api/state > _sauvegardes/printemps-2026-state.json
```

- [ ] **Étape 2 : empêcher la publication des prénoms sur GitHub (dépôt public)**

Ajouter à la fin de `.gitignore` :

```
_sauvegardes/
```

- [ ] **Étape 3 : commit**

```bash
git add .gitignore
git commit -m "chore: ignorer les sauvegardes locales de l'etat"
```

---

### Tâche 1 : serveur testable, événement paramétré, connexion côté serveur

**Fichiers :**
- Modifier : `railway/server.js`
- Modifier : `railway/package.json`
- Créer : `railway/test/server.test.js`

- [ ] **Étape 1 : écrire les tests qui échouent**

`railway/test/server.test.js` :

```js
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'corvee-'));
process.env.COORD_PIN = '9999';
process.env.EVENT_TITLE = "Corvée d'automne 2026";
process.env.EVENT_DATE = '17 octobre';
process.env.EVENT_TIME = '9h00';

const app = require('../server');
let server, base;

before(() => new Promise(resolve => {
  server = app.listen(0, () => { base = 'http://127.0.0.1:' + server.address().port; resolve(); });
}));
after(() => server.close());

const post = (p, body) => fetch(base + p, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

test('config expose le titre, la date et l\'heure de l\'evenement', async () => {
  const d = await (await fetch(base + '/api/config')).json();
  assert.deepStrictEqual(d.event, { titre: "Corvée d'automne 2026", date: '17 octobre', heure: '9h00' });
});

test('login refuse l\'ancien code code en dur et accepte COORD_PIN', async () => {
  assert.strictEqual((await post('/api/login', { pin: '2026' })).status, 403);
  assert.strictEqual((await post('/api/login', { pin: '9999' })).status, 200);
});

test('les taches d\'automne sont chargees depuis la graine', async () => {
  const d = await (await fetch(base + '/api/tasks')).json();
  const noms = d.tasks.flatMap(s => s.tasks.map(t => t.nom));
  assert.ok(noms.some(n => /quais/i.test(n)), 'la graine automne doit contenir la sortie des quais');
  assert.ok(!noms.some(n => /Mise a l'eau/i.test(n)), 'pas de taches du printemps');
});

test('modifier les taches change tasksVersion dans /api/state', async () => {
  const v1 = (await (await fetch(base + '/api/state')).json()).tasksVersion;
  const { tasks } = await (await fetch(base + '/api/tasks')).json();
  tasks[0].tasks.push({ id: 'tnew', nom: 'Nouvelle', team: '2', type: 'rangement' });
  assert.strictEqual((await post('/api/tasks', { pin: '9999', tasks })).status, 200);
  const v2 = (await (await fetch(base + '/api/state')).json()).tasksVersion;
  assert.ok(v2 > v1);
  assert.strictEqual((await post('/api/claim', { id: 'tnew', name: 'Spout' })).status, 200);
});

test('/api/state refuse un champ ou une tache inconnus', async () => {
  assert.strictEqual((await post('/api/state', { pin: '9999', id: '__proto__', field: 's', value: 'x' })).status, 400);
  assert.strictEqual((await post('/api/state', { pin: '9999', id: 'tnew', field: 'evil', value: 'x' })).status, 400);
});
```

`railway/package.json` : ajouter `"test": "node --test"` dans `scripts`.

- [ ] **Étape 2 : vérifier que les tests échouent**

Commande : `cd railway && npm install && npm test`
Attendu : ÉCHEC, car `require('../server')` démarre l'écoute et n'exporte rien (`app.listen is not a function`).

- [ ] **Étape 3 : implémenter dans `railway/server.js`**

En haut, après `TASKS_FILE` :

```js
const SEED_FILE = process.env.TASKS_SEED || path.join(__dirname, 'taches-automne.json');
const EVENT = {
  titre: process.env.EVENT_TITLE || "Corvée d'automne 2026",
  date: process.env.EVENT_DATE || '17 octobre',
  heure: process.env.EVENT_TIME || '9h00',
};
let tasksVersion = Date.now();
```

Remplacer `loadTasks()` :

```js
function loadTasks() {
  for (const f of [TASKS_FILE, SEED_FILE]) {
    try { if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {}
  }
  return DEFAULT_TASKS;
}
```

Ajouter avant `// ── Definitions de taches` :

```js
app.get('/api/config', (req, res) => res.json({ event: EVENT }));

app.post('/api/login', (req, res) => {
  if ((req.body || {}).pin !== PIN) return res.status(403).json({ error: 'Code incorrect' });
  res.json({ ok: true });
});
```

Dans `POST /api/tasks`, après `saveTasks(taskDefs);` : `tasksVersion = Date.now();`

Remplacer la réponse de `GET /api/state` : `res.json({ state, ts: Date.now(), tasksVersion });`

Dans `POST /api/state`, après la vérification du code :

```js
if (!getTaskIds().includes(id) || !['s', 'n'].includes(field)) {
  return res.status(400).json({ error: 'Champ ou tache inconnu' });
}
```

Remplacer `app.listen(...)` par :

```js
if (require.main === module) {
  app.listen(PORT, () => console.log(`Serveur corvee demarre sur port ${PORT}`));
}
module.exports = app;
```

- [ ] **Étape 4 : créer la graine `railway/taches-automne.json`**

> ⚠️ Liste **proposée** : Nicolas la valide ou la corrige avant de déployer. On peut aussi tout modifier demain en mode coordonnateur.

```json
[
  {"p":"a1","s":"Priorité A1 — Avant le gel","tasks":[
    {"id":"f1","nom":"Sortie des quais et des passerelles","team":"4-6 adultes","type":"manutention"},
    {"id":"f2","nom":"Embarcations — Rentrer canots, kayaks et rabaskas","team":"4-6 personnes","type":"rangement"},
    {"id":"f3","nom":"Hivernisation — Vidange de l'eau des bâtiments","team":"1-2 adultes","type":"hivernisation"},
    {"id":"f4","nom":"Mobilier extérieur — Tables et bancs à l'abri","team":"3-4 personnes","type":"rangement"}
  ]},
  {"p":"a2","s":"Priorité A2 — Fermeture des bâtiments","tasks":[
    {"id":"f5","nom":"Volets et fenêtres — Fermeture des chalets","team":"2-3 adultes","type":"hivernisation"},
    {"id":"f6","nom":"Gouttières — Nettoyage","team":"2 adultes","type":"nettoyage"},
    {"id":"f7","nom":"Dortoirs — Matelas surélevés et ménage","team":"2-4 personnes","type":"nettoyage"},
    {"id":"f8","nom":"Cafétéria — Ménage de fermeture","team":"2-3 personnes","type":"nettoyage"}
  ]},
  {"p":"b","s":"Priorité B — Terrain","tasks":[
    {"id":"f9","nom":"Ramassage des feuilles — Entrée et sentiers","team":"4-6 personnes","type":"jardinage"},
    {"id":"f10","nom":"Tentes prospecteurs — Démontage","team":"2-4 adultes","type":"montage"},
    {"id":"f11","nom":"Jardins — Fermeture de saison","team":"2-3 personnes","type":"jardinage"},
    {"id":"f12","nom":"Bois de chauffage — Cordage","team":"3-4 personnes","type":"manutention"},
    {"id":"f13","nom":"Conteneur — Remplissage","team":"3-4 adultes","type":"manutention"}
  ]}
]
```

- [ ] **Étape 5 : vérifier que les tests passent**

Commande : `cd railway && npm test`
Attendu : `# pass 5`, `# fail 0`

- [ ] **Étape 6 : commit**

```bash
git add railway/server.js railway/package.json railway/test/server.test.js railway/taches-automne.json
git commit -m "feat: evenement parametre, login serveur, graine automne, tasksVersion"
```

---

### Tâche 2 : page branchée sur l'événement et la connexion serveur

**Fichiers :** modifier `railway/public/index.html`

- [ ] **Étape 1 : donner des identifiants aux textes de l'événement**

Lignes 329-330 :

```html
<div class="hdr-title" id="hdr-title">Corvée</div>
<div class="hdr-sub" id="hdr-sub">Camp Bruchési</div>
```

Ligne 417 : `<div class="eod-camp" id="eod-camp">Camp Bruchési</div>`

- [ ] **Étape 2 : charger la config au démarrage**

Après `var prevState=null, recentChanges={};` (ligne 447) :

```js
var EVENT={titre:'Corvée',date:'',heure:''};
function setText(id,txt){var el=document.getElementById(id);if(el)el.textContent=txt;}
function applyEvent(){
  document.title=EVENT.titre+' — Camp Bruchési';
  setText('hdr-title',EVENT.titre);
  setText('hdr-sub','Camp Bruchési · '+EVENT.date+' · '+EVENT.heure);
  setText('eod-camp','Camp Bruchési · '+EVENT.date);
}
function loadConfig(){
  return fetch(apiBase()+'/api/config').then(function(r){return r.json();})
    .then(function(d){if(d.event)EVENT=d.event;applyEvent();}).catch(function(){});
}
```

Remplacer les 3 dernières lignes du script (1348-1350) :

```js
load();
render();
loadConfig();
loadData(function(){render();startPolling();});
```

- [ ] **Étape 3 : impression**

Ligne 926 : `'<div class="hdr-title">'+esc(EVENT.titre)+'</div>'+`
Ligne 927 : `'<div class="hdr-sub">Camp Bruchési &nbsp;·&nbsp; '+esc(EVENT.date)+' &nbsp;·&nbsp; '+esc(EVENT.heure)+' &nbsp;&nbsp; — &nbsp;&nbsp; Imprimé le '+dateStr+' à '+timeStr+'</div>'+`
Ligne 936 : `'<div class="print-footer">'+esc(EVENT.titre)+' — Camp Bruchési &mdash; '+total+' chantiers au total</div>';`
Ligne 939 : `<title>'+esc(EVENT.titre)+' — Impression</title>`

- [ ] **Étape 4 : connexion du coordonnateur vérifiée par le serveur**

Remplacer `toggleCoord()` (lignes 1180-1196) :

```js
function toggleCoord(){
  var btn=document.getElementById('coord-btn');
  if(coordMode){
    coordMode=false;coordPin='';
    document.body.classList.remove('coord-mode');
    btn.textContent='Mode coordonnateur';btn.style.color='';
    return;
  }
  var pin=prompt('Code coordonnateur :');
  if(!pin)return;
  fetch(apiBase()+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:pin})})
    .then(function(r){
      if(!r.ok){alert('Code incorrect');return;}
      coordPin=pin;coordMode=true;
      document.body.classList.add('coord-mode');
      btn.textContent='Mode bénévole';btn.style.color='#EB7F3D';
      render();
    })
    .catch(function(){alert('Serveur injoignable');});
}
```

- [ ] **Étape 5 : vérifier en local**

```powershell
cd railway; $env:COORD_PIN='9999'; npm start
```

Ouvrir http://localhost:3000 : l'en-tête affiche « Corvée d'automne 2026 · 17 octobre · 9h00 ». Le code `2026` est refusé et `9999` active le mode coordonnateur.

- [ ] **Étape 6 : commit**

```bash
git add railway/public/index.html
git commit -m "feat: page parametree par /api/config et login cote serveur"
```

---

### Tâche 3 : tâches dynamiques partout et rechargement en direct

**Fichiers :** modifier `railway/public/index.html`

- [ ] **Étape 1 : un seul calcul des identifiants**

Après `function gN(id)…` (ligne 1056) :

```js
function allTaskIds(){var ids=[];DATA.forEach(function(s){s.tasks.forEach(function(t){ids.push(t.id);});});return ids;}
```

Ligne 695 : `var TASK_IDS=allTaskIds();`

Remplacer `checkCelebration()` (lignes 1049-1054) :

```js
function checkCelebration(){
  var prio=[];
  DATA.forEach(function(s){if(s.p.charAt(0)==='a')s.tasks.forEach(function(t){prio.push(t.id);});});
  var allDone=prio.length>0&&prio.every(function(id){return gS(id)==='termine';});
  var banner=document.getElementById('celebrate');
  if(banner)banner.style.display=allDone?'flex':'none';
}
```

- [ ] **Étape 2 : recharger les tâches quand le serveur annonce une nouvelle version**

Ligne 444, ajouter `tasksVersion=null` à la déclaration `var state={}…`.
Dans `fetchState()`, juste après `if(data.state){` :

```js
if(data.tasksVersion&&data.tasksVersion!==tasksVersion){
  var first=tasksVersion===null;
  tasksVersion=data.tasksVersion;
  if(!first&&!hasOpenInteraction())loadData(render);
}
```

- [ ] **Étape 3 : vérifier avec deux onglets**

Onglet A en mode coordonnateur : ajouter une tâche « Test direct » et l'enregistrer. Onglet B : la tâche apparaît en 15 s ou moins, sans recharger. La réserver dans B fait un son et un flash dans A.

- [ ] **Étape 4 : commit**

```bash
git add railway/public/index.html
git commit -m "fix: identifiants de taches dynamiques et rechargement en direct des taches"
```

---

### Tâche 4 : échappement des prénoms et bénévoles qui se sont joints

**Fichiers :** modifier `railway/public/index.html`

- [ ] **Étape 1 : une fonction d'échappement globale**

Tout en haut du `<script>` (après la ligne 431) :

```js
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
```

Supprimer la définition locale `var esc=function…` (ligne 1262).

- [ ] **Étape 2 : appliquer `esc` à chaque donnée saisie**

| Ligne | Avant | Après |
|------|-------|-------|
| 1215 | `+section.s+` | `+esc(section.s)+` |
| 1226 | `'<span class="card-name">'+nm+'</span>'` | `'<span class="card-name">'+esc(nm)+'</span>'` |
| 1287 | `+t.nom+newBadge+` | `+esc(t.nom)+newBadge+` |
| 1289 | `+t.team+teamCount+` | `+esc(t.team)+teamCount+` |
| 1294 | `value="'+nm+'"` | `value="'+esc(nm)+'"` |
| 1010 | `+r.name+` | `+esc(r.name)+` |
| 1040 | `+r.name+` | `+esc(r.name)+` |
| 847 | `+sec.s+` | `+esc(sec.s)+` |
| 858 | `+t.nom+` … `+t.team+` | `+esc(t.nom)+` … `+esc(t.team)+` |
| 862 | `+nm+` | `+esc(nm)+` |
| 871 | `+st.nom+` | `+esc(st.nom)+` |

Remplacer la puce de bénévole (lignes 1300-1301) :

```js
return'<span class="extra-chip">'+esc(en)+
  ' <button class="extra-remove" data-name="'+esc(en)+'" onclick="leaveTask(\''+t.id+'\',this.dataset.name)" title="Retirer">&#x2715;</button></span>';
```

- [ ] **Étape 3 : compter les bénévoles qui se sont joints**

Ligne 1220 :

```js
var team=[nm].concat(gExtras(t.id)).map(function(x){return x.trim().toLowerCase();});
var isMine=!!myName&&team.indexOf(myName.toLowerCase())>=0;
```

Dans `buildLeaderboard()`, remplacer le corps de la boucle :

```js
if(id.startsWith('_'))return;
var s=state[id];if(!s||s.s==='a-faire')return;
[s.n].concat(s.extras||[]).forEach(function(raw){
  var name=(raw||'').trim();if(!name)return;
  if(!scores[name])scores[name]={done:0,claimed:0};
  if(s.s==='termine')scores[name].done++;else scores[name].claimed++;
});
```

Ligne 1211, recherche : `var mq=!q||(t.nom.toLowerCase().includes(q)||nm.includes(q)||gExtras(t.id).join(' ').toLowerCase().includes(q));` (même correction ligne 1219).

- [ ] **Étape 4 : vérifier**

Réserver une tâche avec le prénom `<b>X</b>`. La carte affiche le texte littéral `<b>X</b>`, sans gras. Se joindre avec « Pepin », puis taper « Pepin » dans « Mon prénom » : la tâche apparaît dans « Mes chantiers ». Le palmarès liste aussi Pepin.

- [ ] **Étape 5 : commit**

```bash
git add railway/public/index.html
git commit -m "fix: echapper les prenoms et compter les benevoles joints"
```

---

### Tâche 5 : mobile, logo, accents

**Fichiers :**
- Modifier : `railway/public/index.html`
- Créer : `railway/public/logo.png` (copie de `..\logo_chapeau.png`)

- [ ] **Étape 1 : CSS mobile (ajouter avant `</style>`)**

```css
.hdr{flex-wrap:wrap;}
.hdr-right{display:flex;flex-wrap:wrap;gap:4px;align-items:center;justify-content:flex-end;}
.card-bottom{flex-wrap:wrap;}
.claim-btn,.join-btn,.release-btn,.complete-btn,.claim-submit,.claim-cancel{min-height:40px;}
.release-btn,.complete-btn{font-size:13px;padding:6px 14px;}
@media (max-width:480px){
  .hdr img{height:40px;}
  .hdr-title{font-size:16px;}
  .card-name{flex-basis:100%;order:-1;}
}
.hdr img{filter:invert(1);mix-blend-mode:screen;}
body.light .hdr img{filter:none;mix-blend-mode:multiply;}
```

Retirer le `<br>` de la ligne 334.

- [ ] **Étape 2 : logo**

```bash
cp "../logo_chapeau.png" railway/public/logo.png
```

Ligne 327 : `<img src="logo.png" alt="Camp Bruchési">` (cela supprime le base64 vide).

- [ ] **Étape 3 : accents (textes de l'interface seulement, pas les identifiants)**

Remplacements exacts dans `index.html` :
`Termines`→`Terminés` · `>Termine<`→`>Terminé<` · `'Termine'`→`'Terminé'` · `✅ Termine!`→`✅ Terminé !` · `Liberer`→`Libérer` · `Non assigne`→`Non assigné` · `Mon prenom`→`Mon prénom` · `ton prenom`→`ton prénom` · `Ton prenom`→`Ton prénom` · `benevole`→`bénévole` (textes visibles) · `journee`→`journée` · `Reparation`→`Réparation` · `tache a cette section`→`tâche à cette section` · `sous-tache`→`sous-tâche` · `>Equipe<`→`>Équipe<` · `>Details<`→`>Détails<` · `chantier trouve`→`chantier trouvé` · `Corvee terminee`→`Corvée terminée` · `Mode coordinateur`→`Mode coordonnateur` · `Priorite`→`Priorité` (libellés `SECTION_LABELS`).

- [ ] **Étape 4 : types d'automne**

Remplacer la ligne 443 :

```js
var TYPES={peinture:'🎨 Peinture',jardinage:'🌿 Jardinage',montage:'🔨 Montage',nettoyage:'🧹 Nettoyage',manutention:'📦 Manutention',reparation:'🔧 Réparation',rangement:'🗄️ Rangement',hivernisation:'❄️ Hivernisation'};
```

Remplacer les boutons de filtre (lignes 383-389) par un conteneur vide `<div class="type-filters" id="type-filters"></div>` et, au début de `render()` :

```js
var tf=document.getElementById('type-filters');
if(tf&&!tf.dataset.ready){
  tf.innerHTML='<button class="type-btn active" onclick="setTypeFilter(\'\',this)">Tous les types</button>'+
    Object.keys(TYPES).map(function(k){return'<button class="type-btn" onclick="setTypeFilter(\''+k+'\',this)">'+TYPES[k]+'</button>';}).join('');
  tf.dataset.ready='1';
}
```

À la ligne 839 de `openPrint()`, remplacer `var typeLabels={…}` par `var typeLabels=TYPES;`.

- [ ] **Étape 5 : vérifier à 375 px**

Navigateur en 375×812 : aucun bouton coupé, le logo est visible en blanc sur fond sombre et en noir en thème clair, et il n'y a plus de défilement horizontal.

- [ ] **Étape 6 : commit**

```bash
git add railway/public/index.html railway/public/logo.png
git commit -m "style: mobile, logo, accents et types d'automne"
```

---

### Tâche 6 (optionnelle si le temps manque) : liste de bénévoles avec saisie semi-automatique

Cette tâche répond à « ajouter de nouveaux bénévoles » : le coordonnateur colle une liste de prénoms, et les champs « Ton prénom » proposent ces noms. On évite ainsi « JP », « Jean-Pierre » et « jean-pierre » comptés comme trois personnes au palmarès.

**Fichiers :** modifier `railway/server.js`, `railway/public/index.html` et `railway/test/server.test.js`

- [ ] **Étape 1 : écrire le test**

```js
test('liste de benevoles protegee par le code', async () => {
  assert.strictEqual((await post('/api/volunteers', { pin: 'x', names: ['A'] })).status, 403);
  await post('/api/volunteers', { pin: '9999', names: ['Spout', ' Pepin ', 'Spout', ''] });
  const d = await (await fetch(base + '/api/volunteers')).json();
  assert.deepStrictEqual(d.names, ['Pepin', 'Spout']);
});
```

- [ ] **Étape 2 : serveur**

```js
const VOL_FILE = DATA_DIR + '/corvee_volunteers.json';
let volunteers = (() => { try { return JSON.parse(fs.readFileSync(VOL_FILE, 'utf8')); } catch (e) { return []; } })();
app.get('/api/volunteers', (req, res) => res.json({ names: volunteers }));
app.post('/api/volunteers', (req, res) => {
  const { pin, names } = req.body || {};
  if (pin !== PIN) return res.status(403).json({ error: 'Code incorrect' });
  if (!Array.isArray(names)) return res.status(400).json({ error: 'Format invalide' });
  volunteers = [...new Set(names.map(n => String(n).trim().substring(0, 40)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  try { fs.writeFileSync(VOL_FILE, JSON.stringify(volunteers)); } catch (e) {}
  res.json({ ok: true, names: volunteers });
});
```

- [ ] **Étape 3 : page**

Avant `</body>` : `<datalist id="benevoles"></datalist>`. Ajouter `list="benevoles"` aux champs `myname-input`, `claim-input-…` et `join-input-…`. Dans la barre `.bc-form` du coordonnateur, ajouter le bouton `<button class="bc-clear" onclick="editVolunteers()">👥 Bénévoles</button>`, puis :

```js
function loadVolunteers(){
  fetch(apiBase()+'/api/volunteers').then(function(r){return r.json();}).then(function(d){
    var dl=document.getElementById('benevoles');
    if(dl)dl.innerHTML=(d.names||[]).map(function(n){return'<option value="'+esc(n)+'">';}).join('');
  }).catch(function(){});
}
function editVolunteers(){
  var cur=Array.from(document.querySelectorAll('#benevoles option')).map(function(o){return o.value;}).join(', ');
  var txt=prompt('Prénoms des bénévoles, séparés par des virgules :',cur);
  if(txt===null)return;
  fetch(apiBase()+'/api/volunteers',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({pin:coordPin,names:txt.split(',')})}).then(loadVolunteers);
}
```

Appeler `loadVolunteers();` à côté de `loadConfig();`.

- [ ] **Étape 4 : `npm test` (6 tests réussis), puis commit**

```bash
git add railway/server.js railway/public/index.html railway/test/server.test.js
git commit -m "feat: liste de benevoles avec autocompletion"
```

---

### Tâche 7 : Railway (volume, variables, déploiement)

> Faire **après** la tâche 0 : ce déploiement efface `/tmp`, donc les données du printemps (déjà sauvegardées).

- [ ] **Étape 1 : volume persistant** sur le service `Corv-e-2026` (projet `superb-vibrancy`), monté sur `/data`.
- [ ] **Étape 2 : variables du service**
  - `DATA_DIR=/data`
  - `COORD_PIN=` un nouveau code à 4 chiffres, **pas** `2026`, à ne pas écrire dans le dépôt
  - `EVENT_TITLE=Corvée d'automne 2026`
  - `EVENT_DATE=17 octobre`
  - `EVENT_TIME=9h00` (à confirmer)
- [ ] **Étape 3 : fusionner sur `main` et pousser**

```bash
git switch main
git merge --no-ff corvee-automne-2026
git push origin main
```

Railway redéploie automatiquement depuis `main`.

- [ ] **Étape 4 : vérifier en production**

```bash
curl -s https://corve2026-production.up.railway.app/api/config
curl -s https://corve2026-production.up.railway.app/api/tasks
```

Attendu : l'événement d'automne, les tâches `f1…f13` et un état vide (`a-faire` partout).

- [ ] **Étape 5 : test de persistance.** Réserver une tâche, faire *Restart* du service dans Railway : la réservation est toujours là. La libérer ensuite.

---

### Tâche 8 : répétition générale (15 min)

- [ ] Deux téléphones + un portable : réserver, se joindre, terminer. Le son et le flash fonctionnent sur l'autre appareil.
- [ ] Mode projection sur la télé/tablette de l'entrée : le QR code s'affiche et le scan ouvre la bonne adresse.
- [ ] Impression : le titre et la date d'automne sont corrects.
- [ ] Diffuser un message test, puis l'effacer.
- [ ] Noter le nouveau code coordonnateur sur papier pour l'équipe d'accueil.

---

## PHASE 1 : après la corvée (fiabilité et maintenabilité)

Chaque point aura son propre plan détaillé ; ils sont listés ici par ordre d'impact.

> **État au 16 octobre 2026** (plan détaillé : `2026-10-16-phase1-apres-corvee.md`) : points 1, 3, 5, 6 et 7 faits. Point 4 fait pour les sections (ajouter, renommer) ; les types restent figés dans la page et une section ne peut pas être supprimée. Restent les points 2 et 8.

1. **Une seule source de vérité.** Supprimer `tableau_de_bord_corvee.html` à la racine et la liste `DEFAULT_TASKS` dupliquée dans la page. La page n'affiche que ce que renvoie le serveur, avec un état « Hors ligne » explicite.
2. **Découper `index.html`** (1 350 lignes) en `styles.css`, `app.js` (état et API) et `render.js` (gabarits), sans changer le comportement.
3. **API par tâche au lieu de « remplacer toute la liste ».** `POST /api/tasks` écrase tout : deux coordonnateurs qui éditent en même temps s'écrasent mutuellement. Remplacer par `PUT /api/tasks/:id`, `POST /api/sections/:p/tasks` et `DELETE /api/tasks/:id`.
4. **Sections et types modifiables dans l'interface** (aujourd'hui figés `a1`/`a2`/`b`).
5. **Remplacer `prompt()`, `confirm()` et `alert()`** par des boîtes de dialogue intégrées (`<dialog>`), plus lisibles sur mobile et dehors.
6. **Bouton « Nouvelle corvée »** pour le coordonnateur : archiver l'état courant en JSON téléchargeable, puis remettre à zéro (l'endpoint `/api/reset` existe déjà mais n'a pas de bouton).
7. **QR code généré localement** (petite librairie intégrée) au lieu de `api.qrserver.com`, pour que ça marche avec un mauvais réseau au camp.
8. **Mises à jour plus rapides** (Server-Sent Events) à la place du sondage aux 15 s.

## PHASE 2 : refonte visuelle (avec Claude Design)

Objectif : passer d'un « tableau de bord générique sombre » à un outil qui ressemble au Camp Bruchési et se lit **dehors, au soleil, avec des gants**.

1. **Thème clair par défaut** : contraste élevé au soleil. Le thème sombre devient l'option « projection/soir ».
2. **Identité de marque** : Red Hat Display, palette Feu de camp `#EB7F3D`, Eau de lac `#8BC6F1`, Guimauve braisée `#FDEFE3`, Nuit `#1C2833`, et le chapeau du logo comme signature.
3. **Hiérarchie** : sur mobile, la première chose visible est « Les chantiers qui ont besoin de monde », et non trois compteurs.
4. **Une action par carte** : un gros bouton (Je prends, Je me joins ou Terminé, selon l'état). Les actions secondaires (Libérer, Note) passent dans un menu.
5. **En-tête** : remplacer les 6 émojis-boutons par un menu « ⋯ » avec libellés. Garder visibles l'état de synchro et « Coordonnateur ».
6. **Accessibilité** : contraste minimum 4,5:1 (les gris actuels `rgba(255,255,255,0.3)` sont à environ 2,3:1), cibles de 44 px, focus visibles, `aria-live` pour les changements de statut.
7. **Moments de célébration** : le bilan de fin de journée et la bannière « priorités A » peuvent porter l'identité (feu de camp, chapeau) au lieu d'un dégradé générique.
