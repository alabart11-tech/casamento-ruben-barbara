'use strict';

const state = {
  auth: { authenticated: false, displayName: null },
  activities: [],
  page: 0,
  hasMore: true,
  loading: false,
  view: 'list',
  detail: null,
};

const $ = id => document.getElementById(id);
const show = el => el?.classList.remove('hidden');
const hide = el => el?.classList.add('hidden');

const SPORT = {
  running:       { icon: '🏃', css: 'icon-running',  label: 'Corrida' },
  cycling:       { icon: '🚴', css: 'icon-cycling',  label: 'Ciclismo' },
  swimming:      { icon: '🏊', css: 'icon-swimming', label: 'Natação' },
  open_water_swimming: { icon: '🌊', css: 'icon-swimming', label: 'Nado livre' },
  hiking:        { icon: '🥾', css: 'icon-other',    label: 'Caminhada' },
  walking:       { icon: '🚶', css: 'icon-running',  label: 'Caminhada' },
  strength:      { icon: '💪', css: 'icon-other',    label: 'Musculação' },
  yoga:          { icon: '🧘', css: 'icon-other',    label: 'Yoga' },
  cardio:        { icon: '❤️', css: 'icon-other',    label: 'Cardio' },
};

function sportInfo(type) {
  const key = (type || '').toLowerCase().replace(/ /g, '_');
  return SPORT[key] || { icon: '⚡', css: 'icon-other', label: type || 'Atividade' };
}

function fmtDist(m) {
  if (!m) return '—';
  return m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m';
}
function fmtDur(s) {
  if (!s) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h) return `${h}h ${m.toString().padStart(2,'0')}m`;
  return `${m}m ${sec.toString().padStart(2,'0')}s`;
}
function fmtDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('pt-PT', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}
function fmtSpeed(mps) {
  if (!mps) return '—';
  return (mps * 3.6).toFixed(1) + ' km/h';
}

async function api(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function checkAuth() {
  try {
    const data = await api('/auth/status');
    state.auth = data;
  } catch {
    state.auth = { authenticated: false, displayName: null };
  }
  render();
}

async function loadActivities(reset = false) {
  if (state.loading) return;
  if (reset) { state.activities = []; state.page = 0; state.hasMore = true; }
  if (!state.hasMore) return;

  state.loading = true;
  renderLoadingState();

  try {
    const start = state.page * 20;
    const data = await api(`/api/activities?start=${start}&limit=20`);
    const list = Array.isArray(data) ? data : (data.activityList || []);
    state.activities.push(...list);
    state.hasMore = list.length === 20;
    state.page++;
  } catch (e) {
    showError('Erro ao carregar atividades. Tenta novamente.');
  } finally {
    state.loading = false;
    render();
  }
}

async function loadDetail(activityId) {
  state.loading = true;
  render();
  try {
    state.detail = await api(`/api/activities/${activityId}`);
    state.view = 'detail';
  } catch (e) {
    showError('Erro ao carregar atividade.');
  } finally {
    state.loading = false;
    render();
  }
}

function render() {
  const root = $('root');
  if (!root) return;

  if (!state.auth.authenticated) {
    root.innerHTML = renderLogin();
    return;
  }

  if (state.view === 'detail' && state.detail) {
    root.innerHTML = renderDetail();
  } else {
    root.innerHTML = renderList();
    if (state.activities.length === 0 && !state.loading) {
      loadActivities();
    }
  }
  attachEvents();
}

function renderLogin() {
  return `
    <div class="login-screen">
      <div class="login-hero">⚠️</div>
      <h1>Erro de configuração</h1>
      <p>Não foi possível ligar ao Garmin Connect. Verifica o GARMIN_TOKENS nas variáveis de ambiente.</p>
      <div class="error-msg" style="text-align:left;width:100%">
        Gera um novo token com <strong>python3 garmin_token.py</strong> e cola em <strong>GARMIN_TOKENS</strong> no Render.
      </div>
      <button class="btn btn-primary" onclick="checkAuth()">↻ Tentar novamente</button>
    </div>`;
}

function renderList() {
  const name = state.auth.displayName || 'Atleta';
  const initial = name[0].toUpperCase();

  return `
    <div class="user-bar">
      <div class="user-info">
        <div class="avatar">${initial}</div>
        <div>
          <div class="user-name">${escHtml(name)}</div>
          <div class="user-label">Garmin Connect</div>
        </div>
      </div>
      <button class="btn btn-outline btn-sm" id="btn-refresh-top">↻</button>
    </div>

    <div id="install-banner" class="install-banner hidden">
      <p>Instala como app!<span>Toca em "Adicionar ao ecrã inicial"</span></p>
      <button class="btn btn-sm btn-outline" id="btn-install">Instalar</button>
    </div>

    <div id="error-area"></div>

    <div class="section-header">
      <span class="section-title">Atividades recentes</span>
      <button class="btn btn-outline btn-sm" id="btn-refresh">↻ Atualizar</button>
    </div>

    <div class="activity-list" id="activity-list">
      ${state.activities.map(renderActivityCard).join('')}
    </div>

    ${state.loading ? '<div class="spinner"></div>' : ''}

    ${!state.loading && state.hasMore && state.activities.length > 0 ? `
      <div class="load-more">
        <button class="btn btn-outline" id="btn-more">Carregar mais</button>
      </div>` : ''}

    ${!state.loading && state.activities.length === 0 ? `
      <div style="text-align:center;padding:40px 0;color:var(--muted)">
        <div style="font-size:40px;margin-bottom:12px">🏅</div>
        <p>Sem atividades ainda.</p>
      </div>` : ''}`;
}

function renderActivityCard(a) {
  const type = a.activityType?.typeKey || a.sportType || 'other';
  const sp = sportInfo(type);
  const name = a.activityName || sp.label;
  const dist = fmtDist(a.distance);
  const dur = fmtDur(a.duration || a.movingDuration);

  return `
    <div class="activity-card" data-id="${a.activityId}">
      <div class="activity-icon ${sp.css}">${sp.icon}</div>
      <div class="activity-info">
        <div class="activity-name">${escHtml(name)}</div>
        <div class="activity-meta">${fmtDate(a.startTimeLocal || a.startTimeGMT)}</div>
      </div>
      <div class="activity-stats">
        <div class="activity-distance">${dist}</div>
        <div class="activity-time">${dur}</div>
      </div>
    </div>`;
}

function renderDetail() {
  const a = state.detail;
  const type = a.activityType?.typeKey || a.sportType || 'other';
  const sp = sportInfo(type);
  const name = a.activityName || sp.label;
  const dist = a.summaryDTO?.distance ?? a.distance;
  const dur  = a.summaryDTO?.movingDuration ?? a.summaryDTO?.duration ?? a.duration;
  const hr   = a.summaryDTO?.averageHR ?? a.averageHR;
  const hrMax= a.summaryDTO?.maxHR ?? a.maxHR;
  const cal  = a.summaryDTO?.calories ?? a.calories;
  const spd  = a.summaryDTO?.averageSpeed ?? a.averageSpeed;
  const elev = a.summaryDTO?.elevationGain ?? a.elevationGain;
  const steps= a.summaryDTO?.steps ?? a.steps;

  const stats = [
    { label: 'Distância',       value: fmtDist(dist) },
    { label: 'Tempo',           value: fmtDur(dur) },
    { label: 'FC Média',        value: hr ? `${Math.round(hr)} bpm` : '—' },
    { label: 'FC Máxima',       value: hrMax ? `${Math.round(hrMax)} bpm` : '—' },
    { label: 'Calorias',        value: cal ? `${Math.round(cal)} kcal` : '—' },
    { label: 'Velocidade méd.', value: fmtSpeed(spd) },
    { label: 'Desnível +',      value: elev ? `${Math.round(elev)} m` : '—' },
    { label: 'Passadas',        value: steps ? steps.toLocaleString('pt-PT') : '—' },
  ].filter(s => s.value !== '—');

  return `
    <div class="detail-back" id="btn-back">← Voltar</div>
    <div class="detail-hero">
      <div class="detail-icon">${sp.icon}</div>
      <div class="detail-name">${escHtml(name)}</div>
      <div class="detail-date">${fmtDate(a.startTimeLocal || a.summaryDTO?.startTimeLocal)}</div>
    </div>
    <div class="detail-grid">
      ${stats.map(s => `
        <div class="detail-stat">
          <div class="detail-stat-label">${s.label}</div>
          <div class="detail-stat-value">${s.value}</div>
        </div>`).join('')}
    </div>
    ${a.description ? `
      <div class="detail-stat" style="margin-bottom:16px">
        <div class="detail-stat-label">Notas</div>
        <div style="margin-top:6px;font-size:14px;color:var(--text)">${escHtml(a.description)}</div>
      </div>` : ''}`;
}

function renderLoadingState() {
  const list = $('activity-list');
  if (list) list.innerHTML = '';
}

function showError(msg) {
  const area = $('error-area');
  if (area) area.innerHTML = `<div class="error-msg">${escHtml(msg)}</div>`;
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function attachEvents() {
  $('btn-refresh-top')?.addEventListener('click', () => loadActivities(true));
  $('btn-refresh')?.addEventListener('click', () => loadActivities(true));
  $('btn-more')?.addEventListener('click', () => loadActivities());
  $('btn-back')?.addEventListener('click', () => {
    state.view = 'list'; state.detail = null; render();
  });
  $('btn-install')?.addEventListener('click', () => {
    installPrompt?.prompt();
  });

  document.querySelectorAll('.activity-card').forEach(card => {
    card.addEventListener('click', () => loadDetail(card.dataset.id));
  });
}

let installPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installPrompt = e;
  const banner = $('install-banner');
  if (banner) show(banner);
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
checkAuth();
