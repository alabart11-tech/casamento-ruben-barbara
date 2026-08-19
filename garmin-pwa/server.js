require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const API = 'https://connectapi.garmin.com';

let oauth2 = null;
let userInfo = null;
let ready = false;

function loadTokens() {
  const raw = process.env.GARMIN_TOKENS;
  if (!raw) throw new Error('GARMIN_TOKENS não configurado');
  const parsed = JSON.parse(raw);
  oauth2 = parsed.oauth2_token || parsed;
  if (!oauth2?.access_token) throw new Error('Token inválido: access_token em falta');
}

async function garminFetch(endpoint) {
  if (!oauth2) loadTokens();

  const res = await fetch(`${API}${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${oauth2.access_token}`,
      'DI-Backend': 'connectapi.garmin.com',
      'NK': 'NT',
    },
  });

  if (res.status === 401) {
    ready = false;
    const err = new Error('Token expirado — gera um novo GARMIN_TOKENS');
    err.statusCode = 401;
    throw err;
  }
  if (!res.ok) throw new Error(`Garmin API ${res.status}`);
  return res.json();
}

async function init() {
  try {
    loadTokens();
    userInfo = await garminFetch('/userprofile-service/socialProfile');
    ready = true;
    console.log(`Garmin: autenticado como ${userInfo?.displayName || 'utilizador'}`);
  } catch (e) {
    ready = false;
    console.error('Garmin:', e.message);
  }
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/auth/status', async (req, res) => {
  if (!ready) await init();
  res.json({
    authenticated: ready,
    displayName: userInfo?.displayName || userInfo?.userName || null,
  });
});

app.get('/api/activities', async (req, res) => {
  try {
    const start = parseInt(req.query.start) || 0;
    const limit = parseInt(req.query.limit) || 20;
    const data = await garminFetch(
      `/activity-service/activity/search/activities?start=${start}&limit=${limit}`
    );
    res.json(Array.isArray(data) ? data : (data.activityList || []));
  } catch (e) {
    console.error('getActivities:', e.message);
    res.status(e.statusCode === 401 ? 401 : 500).json({ error: e.message });
  }
});

app.get('/api/activities/:id', async (req, res) => {
  try {
    const data = await garminFetch(`/activity-service/activity/${req.params.id}`);
    res.json(data);
  } catch (e) {
    console.error('getActivity:', e.message);
    res.status(e.statusCode === 401 ? 401 : 500).json({ error: e.message });
  }
});

app.listen(PORT, async () => {
  console.log(`Garmin PWA a correr em http://localhost:${PORT}`);
  await init();
});
