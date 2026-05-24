require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { OAuth } = require('oauth');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const GARMIN_REQUEST_TOKEN_URL = 'https://connect.garmin.com/oauth-service/oauth/request_token';
const GARMIN_ACCESS_TOKEN_URL  = 'https://connect.garmin.com/oauth-service/oauth/access_token';
const GARMIN_AUTHORIZE_URL     = 'https://connect.garmin.com/oauthConfirm';
const GARMIN_API_BASE          = 'https://connectapi.garmin.com';

function createOAuth() {
  return new OAuth(
    GARMIN_REQUEST_TOKEN_URL,
    GARMIN_ACCESS_TOKEN_URL,
    process.env.GARMIN_CONSUMER_KEY,
    process.env.GARMIN_CONSUMER_SECRET,
    '1.0A',
    `${process.env.APP_URL}/auth/callback`,
    'HMAC-SHA1'
  );
}

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

// --- Auth ---

app.get('/auth/login', (req, res) => {
  const oauth = createOAuth();
  oauth.getOAuthRequestToken((err, token, tokenSecret) => {
    if (err) {
      console.error('Request token error:', err);
      return res.redirect('/?error=token_failed');
    }
    req.session.requestToken = token;
    req.session.requestTokenSecret = tokenSecret;
    res.redirect(`${GARMIN_AUTHORIZE_URL}?oauth_token=${token}`);
  });
});

app.get('/auth/callback', (req, res) => {
  const { oauth_token, oauth_verifier } = req.query;
  const { requestToken, requestTokenSecret } = req.session;

  if (!requestToken || oauth_token !== requestToken) {
    return res.redirect('/?error=invalid_token');
  }

  const oauth = createOAuth();
  oauth.getOAuthAccessToken(
    oauth_token,
    requestTokenSecret,
    oauth_verifier,
    (err, accessToken, accessTokenSecret, results) => {
      if (err) {
        console.error('Access token error:', err);
        return res.redirect('/?error=auth_failed');
      }
      req.session.accessToken = accessToken;
      req.session.accessTokenSecret = accessTokenSecret;
      req.session.displayName = results?.displayName || null;
      delete req.session.requestToken;
      delete req.session.requestTokenSecret;
      res.redirect('/');
    }
  );
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/auth/status', (req, res) => {
  res.json({
    authenticated: !!(req.session.accessToken),
    displayName: req.session.displayName || null
  });
});

// --- API Proxy ---

function garminGet(req, res, url) {
  if (!req.session.accessToken) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  const oauth = createOAuth();
  oauth.get(url, req.session.accessToken, req.session.accessTokenSecret, (err, data) => {
    if (err) {
      console.error('Garmin API error:', err);
      return res.status(err.statusCode || 500).json({ error: 'Erro na API Garmin', details: err.data });
    }
    try {
      res.json(JSON.parse(data));
    } catch {
      res.send(data);
    }
  });
}

app.get('/api/user', (req, res) => {
  garminGet(req, res, `${GARMIN_API_BASE}/userprofile-service/userprofile`);
});

app.get('/api/activities', (req, res) => {
  const { start = 0, limit = 20 } = req.query;
  garminGet(req, res,
    `${GARMIN_API_BASE}/activitylist-service/activities/search/activities?start=${start}&limit=${limit}&sortBy=startLocal&sortOrder=desc`
  );
});

app.get('/api/activities/:id', (req, res) => {
  garminGet(req, res, `${GARMIN_API_BASE}/activity-service/activity/${req.params.id}`);
});

app.get('/api/stats', (req, res) => {
  garminGet(req, res, `${GARMIN_API_BASE}/userstats-service/statistics/current`);
});

app.listen(PORT, () => {
  console.log(`Garmin PWA a correr em http://localhost:${PORT}`);
});
