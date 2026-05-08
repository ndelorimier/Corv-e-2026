const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const PIN = process.env.COORD_PIN || '2026';
const STATE_FILE = '/tmp/corvee_state.json';
const TASKS_FILE = '/tmp/corvee_tasks.json';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DEFAULT_TASKS = [
  {p:'a1', s:'Priorite A1 — Entree du site', tasks:[
    {id:'c1', nom:"Cabane d'accueil — Appret + blanc + toiture rouge", team:'3-4 adultes'},
    {id:'c2', nom:'Toilettes Bayou — Grattage + peinture blanche', team:'2-3 adultes'},
    {id:'c3', nom:'Terrain entree — Ratelage et plates-bandes', team:'4-6 personnes'},
    {id:'c4', nom:"Balayage des cotes — Abrasifs d'hiver", team:'2-4 personnes'},
  ]},
  {p:'a2', s:'Priorite A2 — Visible par les clients', tasks:[
    {id:'c5', nom:'Amiraute — Murs blancs ext. (GRAND chantier)', team:'5-6 adultes'},
    {id:'c6', nom:'Ptit Bob — Toiture de tole rouge', team:'2-3 adultes'},
    {id:'c7', nom:'Balcons Wigwam et Kibbutz — Peinture grise', team:'3-4 adultes'},
    {id:'c8', nom:'Fourmilliere — Portes rouge ext. + blanc int.', team:'2-3 adultes'},
    {id:'c9', nom:'Cafeteria — Portes ext. et int.', team:'1-2 adultes'},
  ]},
  {p:'b', s:'Priorite B — Operationnel', tasks:[
    {id:'c10', nom:"Mise a l'eau des quais", team:'4-6 adultes'},
    {id:'c11', nom:'Cafeteria — Recurage du plancher', team:'1-2 adultes'},
    {id:'c12', nom:'Dortoirs — Montage des nouveaux lits', team:'2-4 personnes'},
    {id:'c13', nom:'Jardins — Ouverture de saison', team:'2-3 personnes'},
    {id:'c14', nom:'Tentes prospecteurs — Montage structures', team:'2-4 adultes'},
    {id:'c15', nom:'Conteneur 40 verges — Remplissage', team:'3-4 adultes'},
    {id:'c16', nom:'Erabliere — Fin du desentillage', team:'2 personnes'},
    {id:'c17', nom:'Sentiers — Paillis au Kubota', team:'1-2 personnes'},
    {id:'c18', nom:'Cabane a sucre — Trim fenetres rouge', team:'1-2 adultes'},
    {id:'c19', nom:"Filet de tir a l'arc — Reparation", team:'1-2 adultes'},
  ]}
];

function loadTasks() {
  try {
    if (fs.existsSync(TASKS_FILE)) return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
  } catch(e) {}
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

// ── Definitions de taches ────────────────────────────────────────────────────

app.get('/api/tasks', (req, res) => {
  res.json({ tasks: taskDefs });
});

app.post('/api/tasks', (req, res) => {
  const { pin, tasks } = req.body;
  if (pin !== PIN) return res.status(403).json({ error: 'Code incorrect' });
  if (!Array.isArray(tasks)) return res.status(400).json({ error: 'Format invalide' });
  taskDefs = tasks;
  saveTasks(taskDefs);
  res.json({ ok: true, tasks: taskDefs });
});

// ── Etat des taches ──────────────────────────────────────────────────────────

app.get('/api/state', (req, res) => {
  res.json({ state, ts: Date.now() });
});

app.post('/api/state', (req, res) => {
  const { pin, id, field, value } = req.body;
  if (pin !== PIN) return res.status(403).json({ error: 'Code incorrect' });
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
  saveState(state);
  res.json({ ok: true, state });
});

app.post('/api/reset', (req, res) => {
  const { pin } = req.body;
  if (pin !== PIN) return res.status(403).json({ error: 'Code incorrect' });
  state = getDefaultState();
  saveState(state);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Serveur corvee demarre sur port ${PORT}`);
});
