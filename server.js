const express = require('express');
const cors = require('cors');
const { nanoid } = require('nanoid');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// In-memory store (can be swapped to Postgres later)
const rooms = new Map();

function generateQuestion() {
  const divisor = Math.floor(Math.random() * 8) + 2; // 2..9
  const is3 = Math.random() > 0.4;
  const dividend = is3 ? Math.floor(Math.random() * 900) + 100 : Math.floor(Math.random() * 81) + 12;
  return { dividend, divisor, quotient: Math.floor(dividend / divisor), remainder: dividend % divisor };
}

function generateQuestions(n = 15) {
  return Array.from({ length: n }, generateQuestion);
}

function calcScore(ms, correct) {
  if (!correct) return -20;
  const sec = ms / 1000;
  let base = 40;
  if (sec <= 3) base = 100;
  else if (sec <= 6) base = 80;
  else if (sec <= 10) base = 60;
  const lucky = sec > 5 && Math.random() < 0.2;
  return lucky ? base * 2 : base;
}

// Create room
app.post('/api/rooms', (req, res) => {
  const { teacher = 'teacher', total = 15 } = req.body || {};
  const code = nanoid(6).toUpperCase();
  const questions = generateQuestions(total);
  rooms.set(code, {
    code,
    teacher,
    createdAt: Date.now(),
    questions,
    players: new Map(), // id/name -> { name, score, correct, wrong, lastSubmitAt }
  });
  res.json({ roomCode: code, total });
});

// Join room
app.post('/api/join', (req, res) => {
  const { roomCode, name } = req.body || {};
  const room = rooms.get((roomCode || '').toUpperCase());
  if (!room) return res.status(404).json({ error: 'room not found' });
  if (!name) return res.status(400).json({ error: 'name required' });
  if ([...room.players.values()].some(p => p.name === name)) return res.status(409).json({ error: 'name taken' });
  room.players.set(name, { name, score: 0, correct: 0, wrong: 0, lastSubmitAt: 0 });
  res.json({ ok: true });
});

// Get questions (for client-side validation)
app.get('/api/questions', (req, res) => {
  const code = (req.query.roomCode || '').toUpperCase();
  const room = rooms.get(code);
  if (!room) return res.status(404).json({ error: 'room not found' });
  res.json({ total: room.questions.length, questions: room.questions.map(q => ({ dividend: q.dividend, divisor: q.divisor })) });
});

// Submit answer
app.post('/api/submit', (req, res) => {
  const { roomCode, name, qIndex, quotient, remainder, elapsedMs = 8000 } = req.body || {};
  const code = (roomCode || '').toUpperCase();
  const room = rooms.get(code);
  if (!room) return res.status(404).json({ error: 'room not found' });
  const player = room.players.get(name);
  if (!player) return res.status(404).json({ error: 'player not found' });
  const q = room.questions[qIndex];
  if (!q) return res.status(400).json({ error: 'invalid question index' });
  const correct = Number(quotient) === q.quotient && Number(remainder) === q.remainder;
  let points = calcScore(elapsedMs, correct);
  player.score = Math.max(0, player.score + points);
  player.lastSubmitAt = Date.now();
  if (correct) player.correct += 1; else player.wrong += 1;
  res.json({ ok: true, correct, points, score: player.score, answer: { quotient: q.quotient, remainder: q.remainder } });
});

// Leaderboard (teacher polls)
app.get('/api/leaderboard', (req, res) => {
  const code = (req.query.roomCode || '').toUpperCase();
  const room = rooms.get(code);
  if (!room) return res.status(404).json({ error: 'room not found' });
  const board = [...room.players.values()]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ rank: i + 1, name: p.name, score: p.score, correct: p.correct, wrong: p.wrong }));
  res.json({ roomCode: code, leaderboard: board });
});

// Reset room
app.post('/api/reset', (req, res) => {
  const { roomCode } = req.body || {};
  const code = (roomCode || '').toUpperCase();
  const room = rooms.get(code);
  if (!room) return res.status(404).json({ error: 'room not found' });
  for (const p of room.players.values()) {
    p.score = 0; p.correct = 0; p.wrong = 0; p.lastSubmitAt = 0;
  }
  res.json({ ok: true });
});

app.get('/health', (_, res) => res.json({ ok: true }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Teach Games API on http://0.0.0.0:${PORT}`);
});
