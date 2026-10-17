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

const send = (method, p, body) => fetch(base + p, {
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
});
const version = async () => (await (await fetch(base + '/api/state')).json()).tasksVersion;
const allTasks = async () => (await (await fetch(base + '/api/tasks')).json()).tasks.flatMap(s => s.tasks);

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

test('/api/state refuse un champ ou une tache inconnus', async () => {
  assert.strictEqual((await post('/api/state', { pin: '9999', id: '__proto__', field: 's', value: 'x' })).status, 400);
  assert.strictEqual((await post('/api/state', { pin: '9999', id: 'f1', field: 'evil', value: 'x' })).status, 400);
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

test('le code QR est genere localement, sans service externe', async () => {
  const r = await fetch(base + '/vendor/qrcode.js');
  assert.strictEqual(r.status, 200);
  assert.ok((await r.text()).includes('createSvgTag'));
  const page = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.ok(!page.includes('api.qrserver.com'));
  assert.ok(page.includes('vendor/qrcode.js'));
});
