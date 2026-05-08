const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const PIN = process.env.COORD_PIN || '2026';
const STATE_FILE = '/tmp/corvee_state.json';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Etat initial — toutes les taches a "a-faire"
const TASK_IDS = ['c1','c2','c3','c4','c5','c6','c7','c8','c9','c10',
                  'c11','c12','c13','c14','c15','c16','c17','c18','c19'];

function getDefaultState() {
  const state = {};
  TASK_IDS.forEach(id => { state[id] = { s: 'a-faire', n: '' }; });
  return state;
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch(e) {}
  return getDefaultState();
}

function saveState(state) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state)); } catch(e) {}
}

let state = loadState();

// GET /api/state — tous les appareils lisent ici
app.get('/api/state', (req, res) => {
  res.json({ state, ts: Date.now() });
});

// POST /api/state — le coordinateur met a jour
app.post('/api/state', (req, res) => {
  const { pin, id, field, value } = req.body;
  if (pin !== PIN) {
    return res.status(403).json({ error: 'Code incorrect' });
  }
  if (!state[id]) state[id] = {};
  state[id][field] = value;
  saveState(state);
  res.json({ ok: true, state });
});

// POST /api/reset — reinitialiser (coordinateur seulement)
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
