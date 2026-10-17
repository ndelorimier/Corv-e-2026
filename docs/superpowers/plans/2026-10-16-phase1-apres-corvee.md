# Phase 1 « après la corvée » — plan d'implémentation

> **Pour les agents :** sous-compétence requise : superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans. Les étapes utilisent des cases à cocher (`- [ ]`).

**Objectif :** rendre le tableau de bord fiable pour plusieurs coordonnateurs et réutilisable d'une corvée à l'autre : une seule page, une API par chantier, des sections modifiables, un bouton « Nouvelle corvée » et un code QR généré sur place.

**Architecture :** le serveur Express (`railway/server.js`) garde la liste des chantiers en mémoire (`taskDefs`) et dans `DATA_DIR/corvee_tasks.json`. On remplace `POST /api/tasks` (qui écrase toute la liste) par des routes qui modifient **un** chantier ou **une** section ; Node étant mono-fil, deux coordonnateurs qui modifient deux chantiers différents ne s'écrasent plus. Chaque route renvoie `{ok, tasks, tasksVersion}` et la page remplace sa copie locale (`DATA`) par la réponse. La page unique `railway/public/index.html` garde son design (thème clair, Red Hat Display, une action par carte) ; toute donnée affichée passe par `esc()`.

**Pile :** Node 18+, Express 4, `node:test` (`cd railway && npm test`), JavaScript ES5 sans outil de compilation côté page, `qrcode-generator` 2.0.4 (MIT, Kazuhiko Arase) servi par notre propre serveur.

**Hors périmètre** (autres points de la phase 1, plans séparés) : découpage de `index.html`, remplacement des `prompt()/alert()`, Server-Sent Events, suppression d'une section.

---

## Carte des fichiers

| Fichier | Changement |
| --- | --- |
| `tableau_de_bord_corvee.html` | Supprimé (copie obsolète de l'ancienne page). |
| `TACHES.md` | Retirer la ligne qui décrit ce fichier. |
| `railway/server.js` | Retirer `POST /api/tasks`. Ajouter les aides `clean`, `newId`, `findTask`, `findSection`, `checkPin`, `applyFields`, `tasksChanged` et les routes `POST /api/sections/:p/tasks`, `PUT /api/tasks/:id`, `DELETE /api/tasks/:id`, `POST /api/sections`, `PUT /api/sections/:p`, `GET /vendor/qrcode.js`. |
| `railway/test/server.test.js` | Tests des nouvelles routes ; le test qui utilisait `POST /api/tasks` est réécrit. |
| `railway/package.json`, `package-lock.json` | Dépendance `qrcode-generator`. |
| `railway/public/index.html` | `call()` accepte une méthode ; `taskCall()` remplace `pushTasks()` ; formulaire de section ; entrée de menu « Nouvelle corvée » ; QR local. |

---

### Tâche 1 : supprimer la copie obsolète

**Fichiers :** supprimer `tableau_de_bord_corvee.html` ; modifier `TACHES.md:119`.

- [ ] **Étape 1 :** `git rm tableau_de_bord_corvee.html`
- [ ] **Étape 2 :** dans `TACHES.md`, supprimer la ligne
  `| \`tableau_de_bord_corvee.html\` | Dashboard interactif (version Netlify statique) |`
- [ ] **Étape 3 :** vérifier qu'aucune autre référence ne reste hors de `docs/` : `git grep -n tableau_de_bord_corvee -- ':!docs'` → aucune sortie.
- [ ] **Étape 4 :** `git commit -m "chore: supprimer tableau_de_bord_corvee.html (copie obsolete)"`

---

### Tâche 2 : routes par chantier (serveur)

**Fichiers :** modifier `railway/server.js` (section « Definitions de taches ») ; tests `railway/test/server.test.js`.

- [ ] **Étape 1 : tests qui échouent.** Dans `railway/test/server.test.js`, après la définition de `post`, ajouter :

```js
const send = (method, p, body) => fetch(base + p, {
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
});
const version = async () => (await (await fetch(base + '/api/state')).json()).tasksVersion;
const allTasks = async () => (await (await fetch(base + '/api/tasks')).json()).tasks.flatMap(s => s.tasks);
```

Remplacer le test `modifier les taches change tasksVersion dans /api/state` par :

```js
test('POST /api/tasks (remplacement de toute la liste) n\'existe plus', async () => {
  assert.strictEqual((await post('/api/tasks', { pin: '9999', tasks: [] })).status, 404);
});

test('ajouter un chantier dans une section', async () => {
  const v1 = await version();
  assert.strictEqual((await post('/api/sections/a1/tasks', { pin: 'x', nom: 'X' })).status, 403);
  assert.strictEqual((await post('/api/sections/zz/tasks', { pin: '9999', nom: 'X' })).status, 404);
  assert.strictEqual((await post('/api/sections/a1/tasks', { pin: '9999', nom: '  ' })).status, 400);
  const r = await post('/api/sections/a1/tasks', { pin: '9999', nom: ' Nouvelle ', team: '2', type: 'rangement' });
  assert.strictEqual(r.status, 200);
  const d = await r.json();
  assert.ok(d.task.id, 'le serveur attribue un id');
  assert.strictEqual(d.task.nom, 'Nouvelle');
  assert.ok(d.tasksVersion > v1);
  assert.strictEqual(d.tasks.find(s => s.p === 'a1').tasks.at(-1).id, d.task.id);
  assert.strictEqual(await version(), d.tasksVersion);
  assert.strictEqual((await post('/api/claim', { id: d.task.id, name: 'Spout' })).status, 200);
});

test('modifier un chantier ne touche que les champs envoyes', async () => {
  const before = (await allTasks()).find(t => t.id === 'f7');
  const v1 = await version();
  assert.strictEqual((await send('PUT', '/api/tasks/f7', { pin: 'x', nom: 'X' })).status, 403);
  assert.strictEqual((await send('PUT', '/api/tasks/nope', { pin: '9999', nom: 'X' })).status, 404);
  assert.strictEqual((await send('PUT', '/api/tasks/f7', { pin: '9999', nom: '' })).status, 400);
  const r = await send('PUT', '/api/tasks/f7', { pin: '9999', team: '7 adultes', details: '' });
  assert.strictEqual(r.status, 200);
  const d = await r.json();
  assert.ok(d.tasksVersion > v1);
  assert.strictEqual(d.task.team, '7 adultes');
  assert.strictEqual(d.task.nom, before.nom);
  assert.strictEqual(d.task.type, before.type);
  assert.ok(!('details' in d.task), 'details vide = retire');
});

test('deplacer un chantier vers une autre section', async () => {
  assert.strictEqual((await send('PUT', '/api/tasks/f12', { pin: '9999', p: 'zz' })).status, 400);
  const d = await (await send('PUT', '/api/tasks/f12', { pin: '9999', p: 'a1' })).json();
  assert.ok(d.tasks.find(s => s.p === 'a1').tasks.some(t => t.id === 'f12'));
  assert.ok(!d.tasks.find(s => s.p === 'b').tasks.some(t => t.id === 'f12'));
});

test('deux coordonnateurs qui modifient deux chantiers ne s\'ecrasent pas', async () => {
  await Promise.all([
    send('PUT', '/api/tasks/f5', { pin: '9999', nom: 'Renomme par Ana' }),
    send('PUT', '/api/tasks/f6', { pin: '9999', team: '9 adultes' }),
  ]);
  const all = await allTasks();
  assert.strictEqual(all.find(t => t.id === 'f5').nom, 'Renomme par Ana');
  assert.strictEqual(all.find(t => t.id === 'f6').team, '9 adultes');
});

test('supprimer un chantier le retire avec son etat', async () => {
  await post('/api/claim', { id: 'f13', name: 'Gus' });
  assert.strictEqual((await send('DELETE', '/api/tasks/f13', { pin: 'x' })).status, 403);
  const v1 = await version();
  const r = await send('DELETE', '/api/tasks/f13', { pin: '9999' });
  assert.strictEqual(r.status, 200);
  assert.ok((await r.json()).tasksVersion > v1);
  assert.ok(!(await allTasks()).some(t => t.id === 'f13'));
  assert.ok(!('f13' in (await (await fetch(base + '/api/state')).json()).state));
  assert.strictEqual((await send('DELETE', '/api/tasks/f13', { pin: '9999' })).status, 404);
  assert.strictEqual((await post('/api/claim', { id: 'f13', name: 'Gus' })).status, 400);
});
```

Dans le test `/api/state refuse un champ ou une tache inconnus`, remplacer `id: 'tnew'` par `id: 'f1'` (la tâche `tnew` n'existe plus).

- [ ] **Étape 2 :** `cd railway && npm test` → les nouveaux tests échouent (404 sur les nouvelles routes, 200 sur `POST /api/tasks`).

- [ ] **Étape 3 : implémentation.** Dans `railway/server.js`, remplacer tout le bloc `app.post('/api/tasks', ...)` par :

```js
const clean = (v, max) => String(v == null ? '' : v).trim().substring(0, max);
function newId(prefix, taken) {
  let id;
  do { id = prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); } while (taken.includes(id));
  return id;
}
function findTask(id) {
  for (const sec of taskDefs) {
    const i = (sec.tasks || []).findIndex(t => t.id === id);
    if (i >= 0) return { sec, i, task: sec.tasks[i] };
  }
  return null;
}
function findSection(p) { return taskDefs.find(s => s.p === p) || null; }
function checkPin(req, res) {
  if ((req.body || {}).pin === PIN) return true;
  res.status(403).json({ error: 'Code incorrect' });
  return false;
}
const TASK_FIELDS = { nom: 120, team: 40, type: 30, details: 1000 };
function applyFields(task, body) {
  for (const [k, max] of Object.entries(TASK_FIELDS)) {
    if (!(k in body)) continue;
    const v = clean(body[k], max);
    if (k === 'details' && !v) delete task.details; else task[k] = v;
  }
}
// Enregistre la liste, fait avancer tasksVersion (strictement) et repond.
function tasksChanged(res, extra) {
  saveTasks(taskDefs);
  tasksVersion = Math.max(Date.now(), tasksVersion + 1);
  res.json({ ok: true, tasks: taskDefs, tasksVersion, ...extra });
}

app.post('/api/sections/:p/tasks', (req, res) => {
  if (!checkPin(req, res)) return;
  const sec = findSection(req.params.p);
  if (!sec) return res.status(404).json({ error: 'Section inconnue' });
  const body = req.body || {};
  if (!clean(body.nom, TASK_FIELDS.nom)) return res.status(400).json({ error: 'Nom requis' });
  const task = { id: newId('t', getTaskIds()), nom: '', team: '', type: '' };
  applyFields(task, body);
  (sec.tasks = sec.tasks || []).push(task);
  state[task.id] = { s: 'a-faire', n: '' };
  saveState(state);
  tasksChanged(res, { task });
});

app.put('/api/tasks/:id', (req, res) => {
  if (!checkPin(req, res)) return;
  const found = findTask(req.params.id);
  if (!found) return res.status(404).json({ error: 'Tache inconnue' });
  const body = req.body || {};
  if ('nom' in body && !clean(body.nom, TASK_FIELDS.nom)) return res.status(400).json({ error: 'Nom requis' });
  let dest = null;
  if (body.p !== undefined && body.p !== found.sec.p) {
    dest = findSection(body.p);
    if (!dest) return res.status(400).json({ error: 'Section inconnue' });
  }
  applyFields(found.task, body);
  if (dest) {
    found.sec.tasks.splice(found.i, 1);
    (dest.tasks = dest.tasks || []).push(found.task);
  }
  tasksChanged(res, { task: found.task });
});

app.delete('/api/tasks/:id', (req, res) => {
  if (!checkPin(req, res)) return;
  const found = findTask(req.params.id);
  if (!found) return res.status(404).json({ error: 'Tache inconnue' });
  found.sec.tasks.splice(found.i, 1);
  delete state[found.task.id];
  (found.task.subtasks || []).forEach(st => { delete state[st.id]; });
  saveState(state);
  tasksChanged(res);
});
```

- [ ] **Étape 4 :** `cd railway && npm test` → tout passe.
- [ ] **Étape 5 :** `git commit -am "feat: routes par chantier (PUT/DELETE /api/tasks/:id, POST /api/sections/:p/tasks)"`

---

### Tâche 3 : routes de section (serveur)

**Fichiers :** `railway/server.js` (juste après les routes de la tâche 2) ; `railway/test/server.test.js`.

- [ ] **Étape 1 : tests qui échouent.**

```js
test('ajouter puis renommer une section', async () => {
  assert.strictEqual((await post('/api/sections', { pin: 'x', s: 'C' })).status, 403);
  assert.strictEqual((await post('/api/sections', { pin: '9999', s: ' ' })).status, 400);
  const v1 = await version();
  const d = await (await post('/api/sections', { pin: '9999', s: 'Priorité C — Si le temps le permet' })).json();
  assert.ok(d.section.p);
  assert.deepStrictEqual(d.section.tasks, []);
  assert.ok(d.tasksVersion > v1);
  assert.strictEqual(d.tasks.at(-1).p, d.section.p);
  const p = d.section.p;
  assert.strictEqual((await send('PUT', '/api/sections/zz', { pin: '9999', s: 'X' })).status, 404);
  assert.strictEqual((await send('PUT', '/api/sections/' + p, { pin: '9999', s: '' })).status, 400);
  const d2 = await (await send('PUT', '/api/sections/' + p, { pin: '9999', s: 'Priorité C — Bonus' })).json();
  assert.strictEqual(d2.tasks.find(s => s.p === p).s, 'Priorité C — Bonus');
  assert.strictEqual((await post('/api/sections/' + p + '/tasks', { pin: '9999', nom: 'Bonus' })).status, 200);
});
```

- [ ] **Étape 2 :** `cd railway && npm test` → échec (404).
- [ ] **Étape 3 : implémentation.**

```js
app.post('/api/sections', (req, res) => {
  if (!checkPin(req, res)) return;
  const s = clean((req.body || {}).s, 80);
  if (!s) return res.status(400).json({ error: 'Nom requis' });
  const section = { p: newId('s', taskDefs.map(x => x.p)), s, tasks: [] };
  taskDefs.push(section);
  tasksChanged(res, { section });
});

app.put('/api/sections/:p', (req, res) => {
  if (!checkPin(req, res)) return;
  const sec = findSection(req.params.p);
  if (!sec) return res.status(404).json({ error: 'Section inconnue' });
  const s = clean((req.body || {}).s, 80);
  if (!s) return res.status(400).json({ error: 'Nom requis' });
  sec.s = s;
  tasksChanged(res, { section: sec });
});
```

- [ ] **Étape 4 :** `cd railway && npm test` → tout passe.
- [ ] **Étape 5 :** `git commit -am "feat: routes de section (POST /api/sections, PUT /api/sections/:p)"`

---

### Tâche 4 : la page utilise les routes par chantier

**Fichier :** `railway/public/index.html`.

- [ ] **Étape 1 :** `call()` accepte une méthode (3e argument, `POST` par défaut) :

```js
function call(path,body,method){
  return fetch(path,{method:method||'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
```

(le reste de la fonction est inchangé).

- [ ] **Étape 2 :** remplacer `pushTasks()` par `taskCall()`, qui ajoute le code, remplace `DATA` par la réponse et, en cas d'erreur, demande un rechargement de la liste dès que le formulaire est fermé :

```js
function taskCall(method,path,body){
  body=body||{};body.pin=coordPin;
  return call(path,body,method).then(function(r){
    if(!r)return null;
    if(!r.ok){if(!coordFailed(r)){tasksStale=true;errorFromRes(r);}return null;}
    if(Array.isArray(r.d.tasks))DATA=r.d.tasks;
    if(r.d.tasksVersion)tasksVersion=r.d.tasksVersion;
    return r;
  });
}
```

- [ ] **Étape 3 :** `addTask(p)` crée un brouillon local marqué `_new` (pas encore envoyé) :

```js
function addTask(p){
  removeEmptyTasks();
  closeForms();
  var sec=DATA.filter(function(s){return s.p===p;})[0];
  if(!sec)return;
  var id='new-'+Date.now().toString(36);
  sec.tasks=sec.tasks||[];
  sec.tasks.push({id:id,nom:'',team:'',type:'',_new:true});
  S.editFor=id;S.cardMenu=null;
  render();focusSoon('en-'+id);
}
```

- [ ] **Étape 4 :** `saveEdit(id)` envoie un seul chantier :

```js
function saveEdit(id){
  var nomEl=$('en-'+id);
  var nom=(nomEl?nomEl.value:'').trim();
  if(!nom){showToast('Donne un nom au chantier');if(nomEl)nomEl.focus();return;}
  var t=taskById(id);if(!t)return;
  var val=function(pfx,def){var el=$(pfx+id);return el?el.value:def;};
  var oldSec=sectionOf(id);
  var p=val('es-',oldSec?oldSec.p:'');
  var body={nom:nom,team:String(val('et-',t.team||'')).trim(),type:val('ety-',t.type||''),details:String(val('ed-',t.details||'')).trim()};
  var isNew=!!t._new;
  var req;
  if(isNew)req=taskCall('POST','/api/sections/'+encodeURIComponent(p)+'/tasks',body);
  else{body.p=p;req=taskCall('PUT','/api/tasks/'+encodeURIComponent(id),body);}
  return req.then(function(r){
    if(!r)return;
    S.editFor=null;clearDrafts(FORM_PREFIXES);removeEmptyTasks();
    render();showToast(isNew?'Chantier ajouté':'Chantier enregistré');
    afterInteraction();
  });
}
```

En cas d'échec, le formulaire reste ouvert avec la saisie (brouillons `S.drafts`).

- [ ] **Étape 5 :** dans `askDelete(id)`, remplacer `onOk` :

```js
    onOk:function(){
      var t=taskById(id);
      if(t&&t._new){closeForms();render();return;}
      return taskCall('DELETE','/api/tasks/'+encodeURIComponent(id)).then(function(r){
        if(!r)return;
        S.editFor=null;clearDrafts(FORM_PREFIXES);
        render();showToast('Chantier supprimé');afterInteraction();
      });
    }
```

- [ ] **Étape 6 :** `grep -n "pushTasks\|'/api/tasks'" railway/public/index.html` → aucune occurrence de `pushTasks` ni d'appel POST à `/api/tasks` (le `fetch('/api/tasks?t=...')` de `loadTasks` reste).
- [ ] **Étape 7 :** `git commit -am "feat(page): ajout, modification et suppression d'un chantier a la fois"`

---

### Tâche 5 : sections modifiables dans la page

**Fichier :** `railway/public/index.html`.

- [ ] **Étape 1 : état.** Ajouter `secEdit:null` dans `S` (ligne `claimFor:null, ...`). Dans `hasOpenInteraction()`, ajouter `||S.secEdit` à la première condition. Dans `closeForms()`, ajouter `S.secEdit=null;`. Ajouter `'sl-','ss-'` à `FORM_PREFIXES`.

- [ ] **Étape 2 : couleurs.** Les nouvelles sections reçoivent une couleur selon leur rang :

```js
var SEC_PALETTE=['#EB7F3D','#8BC6F1','#5B7A8A','#D9A441','#7FA36B'];
function secColor(p){
  if(SEC_COLORS[p])return SEC_COLORS[p];
  for(var i=0;i<DATA.length;i++)if(DATA[i].p===p)return SEC_PALETTE[i%SEC_PALETTE.length];
  return '#5B7A8A';
}
```

- [ ] **Étape 3 : formulaire.** Ajouter, près de `cardHtml` :

```js
function secFormHtml(key,sec){
  var sp=sec?secParts(sec):{label:'',sub:''},k=esc(key);
  return'<div class="form warm">'+
    '<label class="lbl" for="sl-'+k+'">Nom de la section</label>'+
    '<input class="inp" id="sl-'+k+'" maxlength="40" data-enter="sec-save" data-p="'+k+'" placeholder="ex. : Priorité C" value="'+esc(dv('sl-'+key,sp.label))+'">'+
    '<label class="lbl" for="ss-'+k+'">Précision (facultatif)</label>'+
    '<input class="inp" id="ss-'+k+'" maxlength="38" data-enter="sec-save" data-p="'+k+'" placeholder="ex. : Si le temps le permet" value="'+esc(dv('ss-'+key,sp.sub))+'">'+
    '<div class="row"><button class="btn btn-ink" style="flex:1" data-action="sec-save" data-p="'+k+'">Enregistrer</button>'+
    '<button class="btn btn-line" data-action="sec-cancel">Annuler</button></div></div>';
}
```

- [ ] **Étape 4 : rendu.** Dans la boucle `DATA.forEach` de `view()`, le titre de section devient (le bouton n'apparaît qu'en mode coordonnateur, hors projection) :

```js
      h+='<section class="sec" aria-label="'+esc(sec.s)+'"><div class="sec-h"><i style="background:'+secColor(sec.p)+'"></i>'+
        '<h2>'+esc(sp.label)+'</h2><span>'+esc(subTxt)+'</span><u></u>'+
        (showAdd?'<button class="secbtn" data-action="sec-edit" data-p="'+esc(sec.p)+'" aria-label="Renommer la section '+esc(sp.label)+'">Renommer</button>':'')+
        '</div>';
      if(S.secEdit===sec.p)h+=secFormHtml(sec.p,sec);
```

Après la boucle (avant le bloc « aucun chantier trouvé ») :

```js
    if(S.coord&&!proj){
      h+=S.secEdit==='_new'?'<section class="sec" aria-label="Nouvelle section">'+secFormHtml('_new',null)+'</section>'
        :'<button class="addbtn" data-action="sec-add">+ Ajouter une section</button>';
    }
```

CSS (à côté de `.addbtn`) :

```css
.secbtn{min-height:44px;padding:0 14px;border-radius:12px;border:2px solid var(--line);background:transparent;color:var(--muted);font:inherit;font-size:14px;font-weight:700;cursor:pointer}
.secbtn:hover{border-color:#EB7F3D;color:var(--accentText)}
```

- [ ] **Étape 5 : enregistrement.**

```js
function saveSection(key){
  var l=$('sl-'+key),s=$('ss-'+key);
  var label=(l?l.value:'').trim(),sub=(s?s.value:'').trim();
  if(!label){showToast('Donne un nom à la section');if(l)l.focus();return;}
  var isNew=key==='_new';
  return taskCall(isNew?'POST':'PUT',isNew?'/api/sections':'/api/sections/'+encodeURIComponent(key),{s:sub?label+' — '+sub:label}).then(function(r){
    if(!r)return;
    S.secEdit=null;clearDrafts(['sl-','ss-']);
    render();showToast(isNew?'Section ajoutée':'Section renommée');afterInteraction();
  });
}
```

- [ ] **Étape 6 : actions** dans `handle()` :

```js
    case 'sec-edit':closeForms();S.secEdit=el.getAttribute('data-p');S.cardMenu=null;render();focusSoon('sl-'+S.secEdit);break;
    case 'sec-add':closeForms();S.secEdit='_new';S.cardMenu=null;render();focusSoon('sl-_new');break;
    case 'sec-save':saveSection(el.getAttribute('data-p'));break;
    case 'sec-cancel':closeForms();render();afterInteraction();break;
```

- [ ] **Étape 7 :** `git commit -am "feat(page): ajouter et renommer une section"`

---

### Tâche 6 : bouton « Nouvelle corvée »

**Fichier :** `railway/public/index.html`.

- [ ] **Étape 1 : menu.** Après `if(S.coord)items.push(['menu-eod',...]);` ajouter :

```js
  if(S.coord)items.push(['menu-new','Nouvelle corvée','Archiver puis remettre à zéro']);
```

- [ ] **Étape 2 : archive puis remise à zéro.** Ajouter après `saveVolunteers()` :

```js
// ── Nouvelle corvee : archive JSON puis remise a zero ───────────────────────
function slug(s){return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'corvee';}
function downloadArchive(){
  var data={archive:'corvee-bruchesi',exportedAt:new Date().toISOString(),event:EVENT,tasks:DATA,state:state,volunteers:VOLS};
  var blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=slug(EVENT.titre)+'-'+new Date().toISOString().slice(0,10)+'.json';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(function(){URL.revokeObjectURL(a.href);},2000);
}
function newCorvee(){
  S.menuOpen=false;render();
  Promise.all([fetchState(),loadTasks(),loadVolunteers()]).then(function(){
    if(S.online!==true){showToast('Hors ligne : impossible d’archiver la corvée');render();return;}
    downloadArchive();
    S.dlg={
      title:'Remettre le tableau à zéro ?',
      text:'L’archive JSON vient d’être téléchargée. Tous les chantiers repasseront « à faire », sans équipes ni notes, et le message diffusé sera effacé. La liste des chantiers et des bénévoles est conservée.',
      okLabel:'Remettre à zéro',danger:true,
      onOk:doReset
    };
    render();focusSoon('dlg-ok');
  });
}
function doReset(){
  return call('/api/reset',{pin:coordPin}).then(function(r){
    if(!r)return;
    if(!r.ok){if(!coordFailed(r))errorFromRes(r);return;}
    S.celebDismissed=false;S.bcDismissedTs=0;
    return fetchState().then(function(){render();showToast('Nouvelle corvée prête');});
  });
}
```

- [ ] **Étape 3 :** dans `handle()`, ajouter `case 'menu-new':newCorvee();break;`
- [ ] **Étape 4 :** `git commit -am "feat(page): bouton Nouvelle corvee (archive JSON puis remise a zero)"`

---

### Tâche 7 : code QR généré localement

**Fichiers :** `railway/package.json`, `package-lock.json`, `railway/server.js`, `railway/public/index.html`, `railway/test/server.test.js`.

- [ ] **Étape 1 : test qui échoue.**

```js
test('le code QR est genere localement, sans service externe', async () => {
  const r = await fetch(base + '/vendor/qrcode.js');
  assert.strictEqual(r.status, 200);
  assert.ok((await r.text()).includes('createSvgTag'));
  const page = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.ok(!page.includes('api.qrserver.com'));
  assert.ok(page.includes('vendor/qrcode.js'));
});
```

- [ ] **Étape 2 :** `cd railway && npm test` → échec.
- [ ] **Étape 3 : dépendance.** `cd railway && npm install qrcode-generator@2.0.4` (MIT ; `main` = `dist/qrcode.js`, script UMD qui définit la globale `qrcode`).
- [ ] **Étape 4 : route.** Dans `server.js`, après `app.use(express.static(...))` :

```js
app.get('/vendor/qrcode.js', (req, res) => res.sendFile(require.resolve('qrcode-generator')));
```

- [ ] **Étape 5 : page.** Juste avant le `<script>` principal (en bas de `index.html`), ajouter `<script src="vendor/qrcode.js"></script>`. Remplacer `qrUrl()` par :

```js
var qrCache={};
function qrSrc(){
  var u=pageUrl();
  if(qrCache[u]===undefined){
    try{
      var q=window.qrcode(0,'M');q.addData(u);q.make();
      qrCache[u]='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(q.createSvgTag({cellSize:4,margin:0,scalable:true}));
    }catch(e){qrCache[u]='';}
  }
  return qrCache[u];
}
```

Aux deux endroits qui affichent le QR (bloc `if(proj)` et fenêtre `S.qrOpen`), remplacer `'<img src="'+qrUrl(300)+'" alt="…">'` par `(qrSrc()?'<img src="'+qrSrc()+'" alt="…">':'')` en gardant le texte `alt` existant. Si la librairie n'a pas pu se charger, l'adresse reste affichée en texte dans la fenêtre.

- [ ] **Étape 6 :** `cd railway && npm test` → tout passe ; `grep -n "qrserver\|qrUrl" railway/public/index.html` → aucune sortie.
- [ ] **Étape 7 :** `git commit -am "feat: code QR genere localement (qrcode-generator) au lieu d'api.qrserver.com"` (inclure `package.json` et `package-lock.json`).

---

### Tâche 8 : vérification dans le navigateur

- [ ] Lancer le serveur avec un dossier de données jetable : `DATA_DIR=<scratch> PORT=3123 node railway/server.js`.
- [ ] Mode coordonnateur (code `2026`) : ajouter un chantier, le modifier, le déplacer de section, le supprimer ; ajouter une section, la renommer, y ajouter un chantier.
- [ ] Deux onglets coordonnateur : modifier deux chantiers différents → les deux modifications restent après le sondage.
- [ ] « Nouvelle corvée » : le JSON est téléchargé, puis la remise à zéro remet tout « à faire ».
- [ ] Menu « Afficher le code QR » et mode projection : le QR s'affiche sans requête vers `api.qrserver.com` (onglet réseau).
- [ ] Mobile (375 px) : les boutons « Renommer » et « + Ajouter une section » ne cassent pas la mise en page.
- [ ] Console sans erreur.

---

## Auto-relecture

- Couverture : priorités 1 → tâche 1 ; 2 → tâches 2 et 4 ; 3 → tâche 6 ; 4 → tâches 3 et 5 ; 5 → tâche 7 ; vérification → tâche 8.
- `tasksVersion` avance à chaque changement via `tasksChanged()` (strictement croissant).
- Noms cohérents : `taskCall`, `secFormHtml`, `saveSection`, `S.secEdit`, `qrSrc`, `newCorvee`, `doReset`, `downloadArchive`.
