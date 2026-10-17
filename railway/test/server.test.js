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
  await new Promise(r => setTimeout(r, 5));
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

test('liste de benevoles protegee par le code', async () => {
  assert.strictEqual((await post('/api/volunteers', { pin: 'x', names: ['A'] })).status, 403);
  await post('/api/volunteers', { pin: '9999', names: ['Spout', ' Pepin ', 'Spout', ''] });
  const d = await (await fetch(base + '/api/volunteers')).json();
  assert.deepStrictEqual(d.names, ['Pepin', 'Spout']);
});

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

test('liberer puis reprendre un chantier repart sans anciens equipiers', async () => {
  await post('/api/claim', { id: 'f4', name: 'Dee' });
  await post('/api/join', { id: 'f4', name: 'Eve' });
  await post('/api/release', { id: 'f4' });
  const d = await (await post('/api/claim', { id: 'f4', name: 'Fox' })).json();
  assert.deepStrictEqual(d.state.f4.extras, []);
});
