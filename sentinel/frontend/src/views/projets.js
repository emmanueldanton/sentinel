import { fetchApi } from '../api.js';

let _filter = 'actif';
let _search = '';
let _typeFilter = 'Tous';
let _projects = [];

function statusLabel(status) {
  const map = {
    actif:        'Actif',
    se_terminant: 'Fin imminente',
    inactif:      'Inactif',
    archive:      'Archivé',
    termine:      'Récemment terminé',
  };
  return map[status] || status;
}

function fmtLastActivity(iso, tz) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      timeZone: tz || 'UTC',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return new Date(iso).toLocaleString('fr-FR');
  }
}


function projectCard(p) {
  const conn    = p._connectedCount ?? 0;
  const total   = p._trackerCount ?? 0;
  const bat     = p._batteryLowCount ?? 0;
  const type    = p.type || '';

  const battLine = bat > 0
    ? ` <span class="card-batt">· ${bat} batt. faible</span>`
    : '';

  const tz          = p._timezone && p._timezone !== 'UTC' ? p._timezone : null;
  const lastActLine = p._lastActivity
    ? `<span class="card-end">⏱ ${fmtLastActivity(p._lastActivity, p._timezone)}</span>`
    : '';

  // Mentions de cycle de vie : affichées en plus du statut quand le projet est actif
  // (évite la redondance si le statut primaire est déjà "terminé"/"fin imminente")
  const mentions = [];
  if (p._status === 'actif') {
    if (p._ended)      mentions.push(`<span class="card-mention card-mention--ended">Terminé</span>`);
    if (p._endingSoon) mentions.push(`<span class="card-mention card-mention--ending">Fin imminente</span>`);
  }
  const mentionsHtml = mentions.join('');

  return `
    <div class="project-card" data-id="${p._id}">
      <div class="card-pill-row">
        <span class="card-name-pill">${p.name}</span>
        ${type ? `<span class="card-type-tag">${type}</span>` : ''}
      </div>
      <div class="card-hero">
        <span class="card-hero-num">${conn}</span>
        <span class="card-hero-lbl">connectés / ${total}</span>
      </div>
      <div class="card-conn-row">
        ${total > 0 ? `${total - conn} hors ligne${battLine}` : '—'}
      </div>
      <div class="card-divider"></div>
      <div class="card-status-footer">
        <span class="card-status-dot card-status-dot--${p._status}"></span>
        <span class="status-${p._status}">${statusLabel(p._status)}</span>
        ${mentionsHtml}
        ${tz ? `<span class="card-tz-tag">${tz}</span>` : ''}
        ${lastActLine}
      </div>
    </div>`;
}

function trackerAge(secs) {
  if (secs == null || secs < 0) return 'Jamais';
  if (secs < 60) return `${secs} s`;
  if (secs < 3600) return `${Math.floor(secs / 60)} min`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} h`;
  return `${Math.floor(secs / 86400)} j`;
}

function fmtLocal(iso, tz) {
  if (!iso) return '-';
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      timeZone: tz || 'UTC',
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '-';
  }
}


const DAY_FR = { mon: 'Lun', tue: 'Mar', wed: 'Mer', thu: 'Jeu', fri: 'Ven', sat: 'Sam', sun: 'Dim' };

function scheduleItems(schedule) {
  if (!schedule || typeof schedule !== 'object') return '';
  const active = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
    .filter(d => schedule[d]?.enable);
  if (!active.length) return '';
  return active.map(d => {
    const times = (schedule[d].times || []).map(([s, e]) => `${s}–${e}`).join(', ');
    return `<div class="proj-schedule-item">
      <span class="proj-schedule-day">${DAY_FR[d]}</span>
      <span class="proj-schedule-time">${times || '—'}</span>
    </div>`;
  }).join('');
}

function trackerBatt(t) {
  const v = t._batteryVolt > 0 ? `${t._batteryVolt.toFixed(2)} V` : '';
  if (t._batteryStatus === 'ok')     return `<span class="batt-pill batt-ok">${v || 'OK'}</span>`;
  if (t._batteryStatus === 'faible') return `<span class="batt-pill batt-low">${v || 'Faible'} ⚠</span>`;
  return `<span class="batt-pill batt-unknown">Inconnu</span>`;
}

function trackerScore(s) {
  const val = s ?? 0;
  const color = val > 70 ? 'var(--accent)' : val > 40 ? 'var(--warning)' : 'var(--danger)';
  return `<div class="score-cell">
    <div class="score-track"><div class="score-fill" style="width:${val}%;background:${color}"></div></div>
    <span class="score-num">${val}%</span>
  </div>`;
}

async function renderDetail(container, projectId) {
  container.innerHTML = '<div class="loading">Chargement du projet...</div>';
  const p = await fetchApi(`/sentinel/api/projects/${projectId}`);

  const tz      = p._timezone && p._timezone !== 'UTC' ? p._timezone : 'UTC';
  const lastAct = fmtLastActivity(p._lastActivity, p._timezone);

  const trackerRows = (p.trackers || []).map(t => {
    const unit = t._unitName && t._unitName !== '-' ? t._unitName : null;
    const gps  = (t.lat && t.lon)
      ? `<a href="https://www.google.com/maps?q=${t.lat},${t.lon}" target="_blank" rel="noopener" class="gps-link">${t.lat.toFixed(4)}, ${t.lon.toFixed(4)} 📍</a>`
      : '-';
    return `
    <tr class="${t._isConnected ? 'row-connected' : 'row-disconnected'}">
      <td>
        <div class="cell-strong">${t.name}</div>
        ${unit ? `<div class="cell-sub">${unit}</div>` : ''}
      </td>
      <td><span class="conn-pill conn-pill--${t._isConnected ? 'on' : 'off'}">${t._isConnected ? 'Connecté' : 'Déconnecté'}</span></td>
      <td>
        <div class="cell-strong">${fmtLocal(t.lastUpdate, tz)}</div>
        <div class="cell-sub">il y a ${trackerAge(t._lastSeenSeconds)}</div>
      </td>
      <td>${trackerBatt(t)}</td>
      <td>${t.shackleBattery > 0 ? `<span class="detail-val">${t.shackleBattery.toFixed(2)} V</span>` : '<span class="cell-sub">-</span>'}</td>
      <td>${t.temperature != null && t.temperature > 0 ? `<span class="detail-val">${t.temperature.toFixed(1)} °C</span>` : '<span class="cell-sub">-</span>'}</td>
      <td>${typeof t.weight === 'number' && t.weight >= 0 ? `<span class="detail-val">${Math.round(t.weight)} kg</span>` : '<span class="cell-sub">-</span>'}</td>
      <td>${gps}</td>
      <td>${trackerScore(t._healthScore)}</td>
    </tr>`;
  }).join('');

  const battLow   = p._batteryLowCount ?? 0;
  const score     = p._healthScore ?? 0;

  const scoreColor = score > 70 ? 'var(--accent)' : score > 40 ? 'var(--warning)' : 'var(--danger)';

  container.innerHTML = `
    <div class="proj-detail-back">
      <button id="btn-back" class="btn-ghost">&laquo; Retour aux projets</button>
    </div>

    <div class="panel">
      <!-- Hero -->
      <div class="proj-detail-hero">
        <div class="proj-detail-hero-left">
          <div class="proj-detail-name">${p.name}</div>
          <div class="proj-detail-meta">
            ${p.code ? `<span class="proj-detail-code">${p.code}</span>` : ''}
            ${p.type ? `<span class="proj-type-chip">${p.type}</span>` : ''}
            ${p.archived ? `<span class="proj-type-chip">Archivé</span>` : ''}
          </div>
        </div>
        <div class="proj-detail-hero-right">
          <span class="proj-status-pill proj-status-pill--${p._status}">${statusLabel(p._status)}</span>
          ${p._endingSoon ? `<span class="proj-status-pill proj-status-pill--se_terminant">Fin imminente</span>` : ''}
          ${p._ended && p._status === 'actif' ? `<span class="proj-status-pill proj-status-pill--termine">Terminé</span>` : ''}
        </div>
      </div>

      <!-- Body : gauche + droite -->
      <div class="proj-detail-body">

        <!-- Gauche : KPIs + dates + description -->
        <div class="proj-detail-left">
          <div class="proj-kpi-row">
            <div class="proj-kpi-card">
              <div class="proj-kpi-lbl">Connectés</div>
              <div class="proj-kpi-num stat-val--accent">${p._connectedCount ?? 0}<span class="proj-kpi-unit"> / ${p._trackerCount}</span></div>
            </div>
            <div class="proj-kpi-card">
              <div class="proj-kpi-lbl">Batterie faible</div>
              <div class="proj-kpi-num ${battLow > 0 ? 'stat-val--danger' : ''}">${battLow}</div>
            </div>
            <div class="proj-kpi-card">
              <div class="proj-kpi-lbl">Score santé</div>
              <div class="proj-kpi-num" style="color:${scoreColor}">${score}<span class="proj-kpi-unit">%</span></div>
              <div class="proj-kpi-bar"><div class="proj-kpi-bar-fill" style="width:${score}%;background:${scoreColor}"></div></div>
            </div>
            <div class="proj-kpi-card">
              <div class="proj-kpi-lbl">Dernière activité</div>
              <div class="proj-kpi-num proj-kpi-num--sm">${lastAct}</div>
            </div>
          </div>

          <div class="proj-info-row">
            <div class="proj-info-item"><span class="proj-info-label">Début</span><span class="proj-info-val">${p.startDate ? new Date(p.startDate).toLocaleDateString('fr-FR') : '—'}</span></div>
            <div class="proj-info-item"><span class="proj-info-label">Fin prévue</span><span class="proj-info-val">${p.endDate ? new Date(p.endDate).toLocaleDateString('fr-FR') : '—'}</span></div>
            <div class="proj-info-item"><span class="proj-info-label">Délai hors-ligne</span><span class="proj-info-val">${p.offlineDelay ?? 60} s</span></div>
          </div>

          ${p.description ? `
          <div class="proj-desc-block">
            <div class="proj-right-title">Description</div>
            <div class="proj-desc-text" id="proj-desc-text">${p.description}</div>
            <button class="proj-desc-toggle" id="proj-desc-toggle">Voir plus</button>
          </div>` : ''}
        </div>

        <!-- Droite : planning + localisation -->
        <div class="proj-detail-right">

          ${scheduleItems(p.schedule) ? `
          <div class="proj-right-section">
            <div class="proj-right-title">Planning de transmission</div>
            <div class="proj-schedule-grid">${scheduleItems(p.schedule)}</div>
          </div>` : ''}

          <div class="proj-right-section proj-right-section--bottom">
            <div class="proj-right-title">Localisation</div>
            <div class="proj-info-row proj-info-row--col">
              <div class="proj-info-item"><span class="proj-info-label">Ville</span><span class="proj-info-val">${p.city || '—'}</span></div>
              <div class="proj-info-item"><span class="proj-info-label">Fuseau horaire</span><span class="proj-info-val">${tz}</span></div>
            </div>
          </div>

        </div>

      </div>
    </div>

    <!-- Capteurs -->
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title" style="margin-bottom:0">Capteurs <span class="panel-updated">${p._trackerCount} au total</span></div>
        <span class="panel-badge ${(p._connectedCount ?? 0) > 0 ? 'panel-badge--ok' : 'panel-badge--warn'}">${p._connectedCount ?? 0} connectés</span>
      </div>
      ${(p.trackers || []).length === 0
        ? '<div class="empty-state">Aucun dispositif dans ce projet.</div>'
        : `<div class="disp-table-wrap">
             <table class="data-table proj-detail-table">
               <thead><tr>
                 <th>Capteur</th>
                 <th>Statut</th>
                 <th>Dernière activité</th>
                 <th>Batterie</th>
                 <th>Peson</th>
                 <th>Temp.</th>
                 <th>Poids</th>
                 <th>GPS</th>
                 <th>Score santé</th>
               </tr></thead>
               <tbody>${trackerRows}</tbody>
             </table>
           </div>`}
    </div>
  `;

  container.querySelector('#btn-back').addEventListener('click', () => renderProjets(container));

  const descToggle = container.querySelector('#proj-desc-toggle');
  if (descToggle) {
    descToggle.addEventListener('click', () => {
      const modal = document.createElement('div');
      modal.className = 'proj-desc-modal-overlay';
      modal.innerHTML = `
        <div class="proj-desc-modal">
          <div class="proj-desc-modal-header">
            <span class="proj-right-title" style="margin-bottom:0">Description</span>
            <button class="proj-desc-modal-close">✕</button>
          </div>
          <div class="proj-desc-modal-body">${p.description}</div>
        </div>`;
      document.body.appendChild(modal);
      modal.querySelector('.proj-desc-modal-close').addEventListener('click', () => modal.remove());
      modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    });
  }
}

// Un projet correspond-il à un filtre de statut ?
// Les filtres cycle de vie tiennent compte des flags pour rester cohérents avec les KPIs :
// un projet actif ET en fin imminente apparaît dans "Actif" ET dans "Fin imminente".
function matchesStatusFilter(p, filter) {
  if (filter === 'all')          return true;
  if (filter === 'se_terminant') return p._status === 'se_terminant' || (p._status === 'actif' && p._endingSoon);
  if (filter === 'termine')      return p._status === 'termine' || (p._status === 'actif' && p._ended);
  return p._status === filter;
}

function applyFilters() {
  const filtered = _projects.filter(p => {
    if (!matchesStatusFilter(p, _filter)) return false;
    if (_typeFilter !== 'Tous' && (p.type || '') !== _typeFilter) return false;
    if (_search) {
      const q = _search.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !(p.code || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });
  // Tri par activité la plus récente en premier (null = jamais actif → en dernier)
  return filtered.sort((a, b) => {
    if (!a._lastActivity && !b._lastActivity) return 0;
    if (!a._lastActivity) return 1;
    if (!b._lastActivity) return -1;
    return b._lastActivity > a._lastActivity ? 1 : -1;
  });
}

function countByStatus(projects) {
  const c = { all: projects.length, actif: 0, se_terminant: 0, inactif: 0, archive: 0, termine: 0 };
  for (const f of ['actif', 'se_terminant', 'inactif', 'archive', 'termine']) {
    c[f] = projects.filter(p => matchesStatusFilter(p, f)).length;
  }
  return c;
}

function getTypes(projects) {
  const types = new Set();
  for (const p of projects) if (p.type && p.type !== 'KYD') types.add(p.type);
  return ['Tous', ...Array.from(types).sort()];
}

// ── Navigation externe (KPI cliquable → filtre pré-appliqué) ──────────────────

export function applyFilter({ status, search } = {}) {
  _filter      = status !== undefined ? status : 'all';
  _search      = search !== undefined ? search : '';
  _typeFilter  = 'Tous';
  const pane = document.getElementById('view-projets');
  if (pane && pane.querySelector('#proj-chips')) updateList(pane);
}

export async function renderProjets(container) {
  container.innerHTML = '<div class="loading">Chargement...</div>';
  const data = await fetchApi('/sentinel/api/projects');
  _projects = data.projects || [];

  const types = getTypes(_projects);
  const typeSelect = types.length > 1
    ? `<select class="filter-select" id="filter-type">
        ${types.map(t => `<option value="${t}" ${_typeFilter === t ? 'selected' : ''}>${t}</option>`).join('')}
       </select>`
    : '';

  container.innerHTML = `
    <div class="proj-toolbar">
      <input class="disp-search" type="text" id="search-projects"
        placeholder="Rechercher par nom ou code…" value="${_search}" />
      ${typeSelect ? typeSelect + '<div class="seg-divider"></div>' : ''}
      <div id="proj-chips" class="seg-group"></div>
    </div>
    <div id="proj-cards"></div>
  `;

  container.querySelector('#search-projects').addEventListener('input', e => {
    _search = e.target.value;
    updateList(container);
  });

  const typeEl = container.querySelector('#filter-type');
  if (typeEl) {
    typeEl.addEventListener('change', e => {
      _typeFilter = e.target.value;
      updateList(container);
    });
  }

  container.querySelector('#proj-chips').addEventListener('click', e => {
    const btn = e.target.closest('.seg-chip[data-status]');
    if (!btn) return;
    _filter = btn.dataset.status;
    updateList(container);
  });

  updateList(container);
}

function updateList(container) {
  const filtered = applyFilters();
  const counts   = countByStatus(_projects);
  const statusFilters = ['all', 'actif', 'se_terminant', 'inactif', 'archive', 'termine'];

  container.querySelector('#proj-chips').innerHTML = statusFilters.map(f => {
    const label = f === 'all' ? 'Tous' : statusLabel(f);
    return `<button class="seg-chip ${_filter === f ? 'active' : ''}" data-status="${f}">
      ${label}<span class="seg-count">${counts[f] ?? 0}</span>
    </button>`;
  }).join('');

  const cardsEl = container.querySelector('#proj-cards');
  cardsEl.innerHTML = filtered.length === 0
    ? '<div class="empty-state">Aucun projet correspondant à ce filtre.</div>'
    : `<div class="cards-grid">${filtered.map(projectCard).join('')}</div>`;

  cardsEl.querySelectorAll('.project-card[data-id]').forEach(card => {
    card.addEventListener('click', () => renderDetail(container, card.dataset.id));
  });
}
