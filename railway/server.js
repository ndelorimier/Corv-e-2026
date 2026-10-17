const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const PIN = process.env.COORD_PIN || '2026';
const DATA_DIR = process.env.DATA_DIR || '/tmp';
const STATE_FILE = DATA_DIR + '/corvee_state.json';
const TASKS_FILE = DATA_DIR + '/corvee_tasks.json';
const VOL_FILE = DATA_DIR + '/corvee_volunteers.json';
const SEED_FILE = process.env.TASKS_SEED || path.join(__dirname, 'taches-automne.json');
const EVENT = {
  titre: process.env.EVENT_TITLE || "Corvée d'automne 2026",
  date: process.env.EVENT_DATE || '17 octobre',
  heure: process.env.EVENT_TIME || '9h00',
};
let tasksVersion = Date.now();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DEFAULT_TASKS = [
  {p:'a1', s:'Priorite A1 — Entree du site', tasks:[
    {id:'c1', nom:"Cabane d'accueil — Appret + blanc + toiture rouge", team:'3-4 adultes', type:'peinture'},
    {id:'c2', nom:'Toilettes Bayou — Grattage + peinture blanche', team:'2-3 adultes', type:'peinture'},
    {id:'c3', nom:'Terrain entree — Ratelage et plates-bandes', team:'4-6 personnes', type:'jardinage'},
    {id:'c4', nom:"Balayage des cotes — Abrasifs d'hiver", team:'2-4 personnes', type:'nettoyage'},
  ]},
  {p:'a2', s:'Priorite A2 — Visible par les clients', tasks:[
    {id:'c5', nom:'Amiraute — Murs blancs ext. (GRAND chantier)', team:'5-6 adultes', type:'peinture'},
    {id:'c6', nom:'Ptit Bob — Toiture de tole rouge', team:'2-3 adultes', type:'peinture'},
    {id:'c7', nom:'Balcons Wigwam et Kibbutz — Peinture grise', team:'3-4 adultes', type:'peinture'},
    {id:'c8', nom:'Fourmilliere — Portes rouge ext. + blanc int.', team:'2-3 adultes', type:'peinture'},
    {id:'c9', nom:'Cafeteria — Portes ext. et int.', team:'1-2 adultes', type:'peinture'},
  ]},
  {p:'b', s:'Priorite B — Operationnel', tasks:[
    {id:'c10', nom:"Mise a l'eau des quais", team:'4-6 adultes', type:'montage'},
    {id:'c11', nom:'Cafeteria — Recurage du plancher', team:'1-2 adultes', type:'nettoyage'},
    {id:'c12', nom:'Dortoirs — Montage des nouveaux lits', team:'2-4 personnes', type:'montage'},
    {id:'c13', nom:'Jardins — Ouverture de saison', team:'2-3 personnes', type:'jardinage'},
    {id:'c14', nom:'Tentes prospecteurs — Montage structures', team:'2-4 adultes', type:'montage'},
    {id:'c15', nom:'Conteneur 40 verges — Remplissage', team:'3-4 adultes', type:'manutention'},
    {id:'c16', nom:'Erabliere — Fin du desentillage', team:'2 personnes', type:'jardinage'},
    {id:'c17', nom:'Sentiers — Paillis au Kubota', team:'1-2 personnes', type:'jardinage'},
    {id:'c18', nom:'Cabane a sucre — Trim fenetres rouge', team:'1-2 adultes', type:'peinture'},
    {id:'c19', nom:"Filet de tir a l'arc — Reparation", team:'1-2 adultes', type:'reparation'},
  ]}
];

function loadTasks() {
  for (const f of [TASKS_FILE, SEED_FILE]) {
    try { if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')); } catch(e) {}
  }
  return DEFAULT_TASKS;
}
function saveTasks(t) {
  try { fs.writeFileSync(TASKS_FILE, JSON.stringify(t)); } catch(e) {}
}
function getTaskIds() {
  const ids = [];
  taskDefs.forEach(s => s.tasks.forEach(t => ids.push(t.id)));
  return ids;
}

function getDefaultState() {
  const state = {};
  getTaskIds().forEach(id => { state[id] = { s: 'a-faire', n: '' }; });
  return state;
}
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch(e) {}
  return getDefaultState();
}
function saveState(state) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state)); } catch(e) {}
}

let taskDefs = loadTasks();
let state = loadState();
let volunteers = (() => { try { return JSON.parse(fs.readFileSync(VOL_FILE, 'utf8')); } catch(e) { return []; } })();

// ── Evenement et connexion ───────────────────────────────────────────────────

app.get('/api/config', (req, res) => res.json({ event: EVENT }));

app.post('/api/login', (req, res) => {
  if ((req.body || {}).pin !== PIN) return res.status(403).json({ error: 'Code incorrect' });
  res.json({ ok: true });
});

// ── Benevoles ────────────────────────────────────────────────────────────────

app.get('/api/volunteers', (req, res) => res.json({ names: volunteers }));

app.post('/api/volunteers', (req, res) => {
  const { pin, names } = req.body || {};
  if (pin !== PIN) return res.status(403).json({ error: 'Code incorrect' });
  if (!Array.isArray(names)) return res.status(400).json({ error: 'Format invalide' });
  volunteers = [...new Set(names.map(n => String(n).trim().substring(0, 40)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'fr'));
  try { fs.writeFileSync(VOL_FILE, JSON.stringify(volunteers)); } catch(e) {}
  res.json({ ok: true, names: volunteers });
});

// ── Definitions de taches ────────────────────────────────────────────────────

app.get('/api/tasks', (req, res) => {
  res.json({ tasks: taskDefs });
});

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

// ── Etat des taches ──────────────────────────────────────────────────────────

app.get('/api/state', (req, res) => {
  res.json({ state, ts: Date.now(), tasksVersion });
});

app.post('/api/state', (req, res) => {
  const { pin, id, field, value } = req.body;
  if (pin !== PIN) return res.status(403).json({ error: 'Code incorrect' });
  if (!getTaskIds().includes(id) || !['s', 'n'].includes(field)) {
    return res.status(400).json({ error: 'Champ ou tache inconnu' });
  }
  if (!state[id]) state[id] = {};
  state[id][field] = value;
  saveState(state);
  res.json({ ok: true, state });
});

app.post('/api/note', (req, res) => {
  const { id, note } = req.body;
  if (!getTaskIds().includes(id)) return res.status(400).json({ error: 'Tache inconnue' });
  if (!state[id]) state[id] = { s: 'a-faire', n: '' };
  state[id].note = (note || '').trim().substring(0, 200);
  saveState(state);
  res.json({ ok: true, state });
});

app.post('/api/claim', (req, res) => {
  const { id, name } = req.body;
  if (!id || !name || !name.trim()) return res.status(400).json({ error: 'id et name requis' });
  if (!getTaskIds().includes(id)) return res.status(400).json({ error: 'Tache inconnue' });
  if (!state[id]) state[id] = { s: 'a-faire', n: '' };
  if (state[id].s !== 'a-faire') return res.status(409).json({ error: 'Tache deja prise', state });
  state[id].s = 'en-cours';
  state[id].n = name.trim();
  state[id].extras = [];
  saveState(state);
  res.json({ ok: true, state });
});

app.post('/api/release', (req, res) => {
  const { id } = req.body;
  if (!getTaskIds().includes(id)) return res.status(400).json({ error: 'Tache inconnue' });
  if (!state[id]) state[id] = { s: 'a-faire', n: '' };
  if (state[id].s === 'termine') return res.status(409).json({ error: 'Tache terminee — seul le coordinateur peut la modifier' });
  state[id].s = 'a-faire';
  state[id].n = '';
  state[id].extras = [];
  saveState(state);
  res.json({ ok: true, state });
});

app.post('/api/complete', (req, res) => {
  const { id } = req.body;
  if (!getTaskIds().includes(id)) return res.status(400).json({ error: 'Tache inconnue' });
  if (!state[id]) state[id] = { s: 'a-faire', n: '' };
  if (state[id].s !== 'en-cours') return res.status(409).json({ error: 'Tache non en cours' });
  state[id].s = 'termine';
  saveState(state);
  res.json({ ok: true, state });
});

app.post('/api/join', (req, res) => {
  const { id, name } = req.body;
  if (!id || !name || !name.trim()) return res.status(400).json({ error: 'id et name requis' });
  if (!getTaskIds().includes(id)) return res.status(400).json({ error: 'Tache inconnue' });
  if (!state[id]) state[id] = { s: 'a-faire', n: '' };
  if (state[id].s !== 'en-cours') return res.status(409).json({ error: 'Tache non en cours' });
  if (!state[id].extras) state[id].extras = [];
  const trimmed = name.trim();
  if (!state[id].extras.includes(trimmed)) state[id].extras.push(trimmed);
  saveState(state);
  res.json({ ok: true, state });
});

app.post('/api/leave', (req, res) => {
  const { id, name } = req.body;
  if (!getTaskIds().includes(id)) return res.status(400).json({ error: 'Tache inconnue' });
  if (!state[id]) return res.json({ ok: true, state });
  const nm = (name || '').trim();
  const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  const t = state[id];
  const extras = t.extras || [];
  if (nm && same(t.n, nm)) {
    if (extras.length) {
      t.n = extras[0];
      t.extras = extras.slice(1);
    } else {
      t.s = 'a-faire';
      t.n = '';
      t.extras = [];
    }
  } else if (t.extras) {
    t.extras = extras.filter(n => n !== nm);
  }
  saveState(state);
  res.json({ ok: true, state });
});

app.post('/api/reopen', (req, res) => {
  const { id } = req.body;
  if (!getTaskIds().includes(id)) return res.status(400).json({ error: 'Tache inconnue' });
  if (!state[id] || state[id].s !== 'termine') return res.status(409).json({ error: 'Tache non terminee' });
  state[id].s = 'en-cours';
  saveState(state);
  res.json({ ok: true, state });
});

app.post('/api/subtask', (req, res) => {
  const { id, done } = req.body;
  if (!id) return res.status(400).json({ error: 'id requis' });
  const valid = taskDefs.some(s => s.tasks.some(t => (t.subtasks||[]).some(st => st.id === id)));
  if (!valid) return res.status(400).json({ error: 'Sous-tache inconnue' });
  if (!state[id]) state[id] = {};
  state[id].done = !!done;
  saveState(state);
  res.json({ ok: true, state });
});

app.post('/api/broadcast', (req, res) => {
  const { pin, msg } = req.body;
  if (pin !== PIN) return res.status(403).json({ error: 'Code incorrect' });
  if (!state._broadcast) state._broadcast = {};
  state._broadcast.msg = (msg || '').trim().substring(0, 200);
  state._broadcast.ts = Date.now();
  saveState(state);
  res.json({ ok: true });
});

app.post('/api/reset', (req, res) => {
  const { pin } = req.body;
  if (pin !== PIN) return res.status(403).json({ error: 'Code incorrect' });
  state = getDefaultState();
  saveState(state);
  res.json({ ok: true });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Serveur corvee demarre sur port ${PORT}`));
}
module.exports = app;
