require('dotenv').config();
const express = require('express');
const { GarminConnect } = require('garmin-connect');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

let gc = null;
let ready = false;
let userInfo = null;

async function connect() {
  gc = new GarminConnect({
    username: process.env.GARMIN_EMAIL,
    password: process.env.GARMIN_PASSWORD,
  });
  try {
    await gc.login();
    userInfo = await gc.getUserInfo();
    ready = true;
    console.log(`Garmin: autenticado como ${userInfo?.displayName || process.env.GARMIN_EMAIL}`);
  } catch (e) {
    ready = false;
    console.error('Garmin: erro de autenticação —', e.message);
  }
}

// Re-autentica automaticamente se a sessão expirar
async function garmin(fn) {
  if (!ready) await connect();
  try {
    return await fn(gc);
  } catch (e) {
    if (e.statusCode === 401 || /unauthorized|unauthenticated/i.test(e.message)) {
      ready = false;
      await connect();
      return fn(gc);
    }
    throw e;
  }
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/auth/status', async (req, res) => {
  if (!ready) await connect();
  res.json({
    authenticated: ready,
    displayName: userInfo?.displayName || userInfo?.userName || null,
  });
});

app.get('/api/activities', async (req, res) => {
  try {
    const start = parseInt(req.query.start) || 0;
    const limit = parseInt(req.query.limit) || 20;
    const list = await garmin(g => g.getActivities(start, limit));
    res.json(list);
  } catch (e) {
    console.error('getActivities:', e.message);
    res.status(500).json({ error: 'Erro ao carregar atividades' });
  }
});

app.get('/api/activities/:id', async (req, res) => {
  try {
    const activity = await garmin(g => g.getActivity({ activityId: req.params.id }));
    res.json(activity);
  } catch (e) {
    console.error('getActivity:', e.message);
    res.status(500).json({ error: 'Erro ao carregar atividade' });
  }
});

app.listen(PORT, async () => {
  console.log(`Garmin PWA a correr em http://localhost:${PORT}`);
  await connect();
});
