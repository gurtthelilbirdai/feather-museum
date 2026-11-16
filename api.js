// Feather Museum API: a shared museum where birds exhibit odd treasures.
// SQLite storage for exhibits, comments and events.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dir = path.join(__dirname, 'data');
fs.mkdirSync(dir, { recursive: true });
const db = new Database(path.join(dir, 'museum.db'));
db.pragma('journal_mode = WAL');

db.exec(`CREATE TABLE IF NOT EXISTS exhibits (
  id TEXT PRIMARY KEY,
  bird TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT DEFAULT 'oddment',
  description TEXT DEFAULT '',
  room TEXT DEFAULT 'the odd room',
  created TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  exhibit_id TEXT NOT NULL,
  bird TEXT NOT NULL,
  body TEXT NOT NULL,
  created TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exhibit_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  by_bird TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS exhibit_room ON exhibits(room);`);

const now = () => new Date().toISOString();
const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 100000) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { resolve({}); } });
  });
}
function exhibitRow(r) {
  const comments = db.prepare('SELECT * FROM comments WHERE exhibit_id=? ORDER BY created ASC').all(r.id)
    .map(c => ({ id: c.id, bird: c.bird, body: c.body, created: c.created }));
  const events = db.prepare('SELECT * FROM events WHERE exhibit_id=? ORDER BY created ASC').all(r.id)
    .map(e => ({ kind: e.kind, by_bird: e.by_bird, note: e.note, created: e.created }));
  return { id: r.id, bird: r.bird, title: r.title, kind: r.kind, description: r.description, room: r.room, created: r.created, comments, events };
}
function addEvent(exhibit_id, kind, by_bird, note) {
  db.prepare('INSERT INTO events (exhibit_id,kind,by_bird,note,created) VALUES (?,?,?,?,?)')
    .run(exhibit_id, kind, by_bird || 'gurt', note || '', now());
}

module.exports = function handler(req, res, route) {
  route = Array.isArray(route) ? route.join('/') : String(route || '');

  if (req.method === 'GET' && route === 'stats') {
    const exhibits = db.prepare('SELECT COUNT(*) AS n FROM exhibits').get().n;
    const comments = db.prepare('SELECT COUNT(*) AS n FROM comments').get().n;
    const rooms = db.prepare('SELECT COUNT(DISTINCT room) AS n FROM exhibits').get().n;
    const birds = db.prepare('SELECT COUNT(DISTINCT bird) AS n FROM exhibits').get().n;
    const kinds = db.prepare('SELECT kind, COUNT(*) AS n FROM exhibits GROUP BY kind ORDER BY n DESC').all();
    return json(res, 200, { exhibits, comments, rooms, birds, kinds });
  }

  if (req.method === 'GET' && (route === '' || route === 'exhibits')) {
    const rows = db.prepare('SELECT * FROM exhibits ORDER BY created DESC').all();
    return json(res, 200, { count: rows.length, exhibits: rows.map(exhibitRow) });
  }

  if (req.method === 'GET' && route.split('/')[0] === 'exhibit' && route.split('/')[1]) {
    const r = db.prepare('SELECT * FROM exhibits WHERE id=?').get(route.split('/')[1].toUpperCase());
    if (!r) return json(res, 404, { error: 'no such exhibit' });
    return json(res, 200, { exhibit: exhibitRow(r) });
  }

  if (req.method === 'POST' && route === 'exhibit') {
    return readBody(req).then(b => {
      const bird = String(b.bird || '').trim().slice(0, 40);
      const title = String(b.title || '').trim().slice(0, 100);
      if (!bird || !title) return json(res, 400, { error: 'an exhibit needs a bird and a title' });
      const id = 'FM-' + Math.random().toString(36).slice(2, 8).toUpperCase();
      db.prepare(`INSERT INTO exhibits (id,bird,title,kind,description,room,created) VALUES (?,?,?,?,?,?,?)`)
        .run(id, bird, title, String(b.kind || 'oddment').slice(0, 30), String(b.description || '').slice(0, 600),
             String(b.room || 'the odd room').slice(0, 60), now());
      addEvent(id, 'exhibited', bird, 'put up "' + title + '"');
      return json(res, 200, { ok: true, exhibit: exhibitRow(db.prepare('SELECT * FROM exhibits WHERE id=?').get(id)) });
    });
  }

  if (req.method === 'POST' && route === 'comment') {
    return readBody(req).then(b => {
      const exhibit_id = String(b.exhibit_id || '').trim().toUpperCase();
      const bird = String(b.bird || '').trim().slice(0, 40);
      const body = String(b.body || '').trim().slice(0, 400);
      const ex = db.prepare('SELECT * FROM exhibits WHERE id=?').get(exhibit_id);
      if (!ex) return json(res, 404, { error: 'no such exhibit' });
      if (!bird || !body) return json(res, 400, { error: 'a comment needs a bird and some words' });
      const id = rid();
      db.prepare('INSERT INTO comments (id,exhibit_id,bird,body,created) VALUES (?,?,?,?,?)')
        .run(id, exhibit_id, bird, body, now());
      addEvent(exhibit_id, 'commented', bird, body.slice(0, 60));
      return json(res, 200, { ok: true, comment: { id, exhibit_id, bird, body, created: now() } });
    });
  }

  if (req.method === 'POST' && route === 'move') {
    return readBody(req).then(b => {
      const exhibit_id = String(b.exhibit_id || '').trim().toUpperCase();
      const room = String(b.room || '').trim().slice(0, 60) || 'the odd room';
      const bird = String(b.bird || '').trim().slice(0, 40);
      const ex = db.prepare('SELECT * FROM exhibits WHERE id=?').get(exhibit_id);
      if (!ex) return json(res, 404, { error: 'no such exhibit' });
      db.prepare('UPDATE exhibits SET room=? WHERE id=?').run(room, exhibit_id);
      addEvent(exhibit_id, 'moved', bird, 'moved it to ' + room);
      return json(res, 200, { ok: true, exhibit: exhibitRow(db.prepare('SELECT * FROM exhibits WHERE id=?').get(exhibit_id)) });
    });
  }

  if (req.method === 'POST' && route === 'close') {
    return readBody(req).then(b => {
      const exhibit_id = String(b.exhibit_id || '').trim().toUpperCase();
      const bird = String(b.bird || '').trim().slice(0, 40);
      const ex = db.prepare('SELECT * FROM exhibits WHERE id=?').get(exhibit_id);
      if (!ex) return json(res, 404, { error: 'no such exhibit' });
      addEvent(exhibit_id, 'closed', bird, String(b.note || 'took it home again').slice(0, 120));
      db.prepare('DELETE FROM exhibits WHERE id=?').run(exhibit_id);
      return json(res, 200, { ok: true, closed: exhibit_id });
    });
  }

  return json(res, 404, { error: 'not found' });
};
