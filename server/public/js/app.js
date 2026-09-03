/* global EventSource */
(() => {
  'use strict';

  const STEP_ORDER = ['generate-sitemap', 'generate-list', 'reference', 'test', 'approve'];
  const STEP_LABELS = {
    'generate-sitemap': 'Generar (Sitemap)',
    'generate-list': 'Generar (Lista)',
    'generate-design': 'Generar (Diseño)',
    reference: 'Referencias',
    test: 'Pruebas',
    approve: 'Aprobar'
  };
  // Un schedule atado a un proyecto usa nombres de paso abstractos: "generate"
  // se resuelve del lado del servidor al paso real según el modo del proyecto.
  const PROJECT_STEP_ORDER = ['generate', 'reference', 'test', 'approve'];
  const PROJECT_STEP_LABELS = { generate: 'Generar', reference: 'Referencias', test: 'Pruebas', approve: 'Aprobar' };
  const STATUS_LABELS = { queued: 'En cola', running: 'En curso', success: 'Éxito', failed: 'Falló' };

  // ---------- helpers ----------

  async function api(path, options = {}) {
    const res = await fetch(`/api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    let body = null;
    try { body = await res.json(); } catch (e) { /* respuesta vacía */ }
    if (!res.ok) {
      throw new Error((body && body.error) || `Error ${res.status}`);
    }
    return body;
  }

  let toastTimer = null;
  function toast(message, isError = false) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.className = `toast show${isError ? ' error' : ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 3500);
  }

  function fmtDate(iso) {
    if (!iso) return '–';
    const d = new Date(iso);
    return d.toLocaleString();
  }

  function fmtRelative(iso) {
    if (!iso) return 'Sin corridas';
    const diffMs = Date.now() - new Date(iso).getTime();
    const s = Math.round(diffMs / 1000);
    if (s < 5) return 'ahora mismo';
    if (s < 60) return `hace ${s}s`;
    const m = Math.round(s / 60);
    if (m < 60) return `hace ${m} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `hace ${h} h`;
    const days = Math.round(h / 24);
    return `hace ${days} d`;
  }

  function fmtDuration(startIso, endIso) {
    if (!startIso) return '–';
    if (!endIso) return 'en curso…';
    const ms = new Date(endIso) - new Date(startIso);
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  }

  function statusPill(status) {
    const cls = status === 'success' ? 'pill-success' : status === 'failed' ? 'pill-failed' : (status === 'running' || status === 'queued') ? 'pill-running' : 'pill-idle';
    return `<span class="pill ${cls}">${STATUS_LABELS[status] || status}</span>`;
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  // ---------- modal (formularios) ----------

  const modalBackdrop = document.getElementById('modal-backdrop');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');

  function openModal(title, bodyHtml, onMount) {
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHtml;
    modalBackdrop.classList.add('open');
    if (onMount) onMount(modalBody);
  }
  function closeModal() {
    modalBackdrop.classList.remove('open');
    modalBody.innerHTML = '';
  }
  document.getElementById('modal-close').addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', e => { if (e.target === modalBackdrop) closeModal(); });

  // ---------- modal de log en vivo ----------

  const logBackdrop = document.getElementById('log-backdrop');
  const logTitle = document.getElementById('log-title');
  const logStatus = document.getElementById('log-status');
  const logView = document.getElementById('log-view');
  let currentEventSource = null;

  function closeLogModal() {
    logBackdrop.classList.remove('open');
    if (currentEventSource) { currentEventSource.close(); currentEventSource = null; }
  }
  document.getElementById('log-close').addEventListener('click', closeLogModal);
  logBackdrop.addEventListener('click', e => { if (e.target === logBackdrop) closeLogModal(); });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (logBackdrop.classList.contains('open')) closeLogModal();
    else if (modalBackdrop.classList.contains('open')) closeModal();
    else if (projectBackdrop.classList.contains('open')) closeProjectDetail();
  });

  function openLogModal(runId, title, onFinish) {
    logTitle.textContent = title || `Corrida ${runId}`;
    logStatus.textContent = 'en curso';
    logStatus.className = 'badge running';
    logView.textContent = '';
    logView.classList.add('is-running');
    logBackdrop.classList.add('open');

    if (currentEventSource) currentEventSource.close();
    const es = new EventSource(`/api/runs/${runId}/stream`);
    currentEventSource = es;

    es.addEventListener('log', e => {
      const { chunk } = JSON.parse(e.data);
      logView.textContent += chunk;
      logView.scrollTop = logView.scrollHeight;
    });

    es.addEventListener('end', e => {
      const { run } = JSON.parse(e.data);
      if (run) {
        logStatus.textContent = STATUS_LABELS[run.status] || run.status;
        logStatus.className = `badge ${run.status}`;
      }
      logView.classList.remove('is-running');
      es.close();
      if (onFinish) onFinish(run);
    });

    es.onerror = () => {
      // El servidor cierra el stream normalmente vía 'end'; un error real
      // deja el badge como estaba para no confundir al usuario con "en curso".
      logView.classList.remove('is-running');
      es.close();
    };
  }

  // ---------- navegación por tabs ----------

  const tabLoaders = {
    dashboard: loadDashboard,
    scenarios: loadScenarios,
    projects: loadProjects,
    generate: loadGenerateTab,
    urllists: loadUrlLists,
    schedules: loadSchedules,
    settings: loadSettings,
    history: loadHistory
  };

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById(`tab-${tab}`).classList.add('active');
      const loader = tabLoaders[tab];
      if (loader) loader();
    });
  });

  // ---------- Dashboard ----------

  async function loadDashboard() {
    try {
      const [{ scenarios, viewports }, { schedules }, { runs }, { projects: projectList }] = await Promise.all([
        api('/scenarios'),
        api('/schedules'),
        api('/runs?limit=6'),
        api('/projects')
      ]);
      document.getElementById('stat-scenarios').textContent = scenarios.length;
      document.getElementById('stat-viewports').textContent = viewports.length;
      document.getElementById('stat-schedules').textContent = schedules.filter(s => s.enabled).length;
      document.getElementById('stat-projects').textContent = projectList.length;
      const lastRunEl = document.getElementById('stat-lastrun');
      lastRunEl.textContent = runs[0] ? fmtRelative(runs[0].startedAt) : 'Sin corridas';
      lastRunEl.title = runs[0] ? fmtDate(runs[0].startedAt) : '';

      const list = document.getElementById('dashboard-runs');
      list.innerHTML = '';
      if (runs.length === 0) {
        list.appendChild(el('div', { class: 'hint' }, 'Todavía no se ejecutó ninguna corrida.'));
      }
      runs.forEach(run => {
        const row = el('div', { class: 'run-row', onclick: () => openLogModal(run.id, run.label) }, [
          el('div', {}, [
            el('div', {}, run.label),
            el('div', { class: 'run-meta' }, fmtDate(run.startedAt))
          ]),
          el('div', { html: statusPill(run.status) })
        ]);
        list.appendChild(row);
      });
    } catch (error) {
      toast(error.message, true);
    }
  }

  document.querySelectorAll('[data-quick]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.quick;
      try {
        let runId;
        if (action === 'generate-sitemap' || action === 'generate-list') {
          const mode = action === 'generate-sitemap' ? 'sitemap' : 'list';
          const res = await api(`/generate/${mode}`, { method: 'POST', body: JSON.stringify({}) });
          runId = res.runId;
        } else {
          const res = await api('/run', { method: 'POST', body: JSON.stringify({ action }) });
          runId = res.runId;
        }
        openLogModal(runId, btn.textContent.trim(), () => { loadDashboard(); loadHistory(); });
      } catch (error) {
        toast(error.message, true);
      }
    });
  });

  // ---------- Escenarios ----------

  function scenarioFormHtml(scenario = {}) {
    const v = (key, def = '') => (scenario[key] !== undefined ? scenario[key] : def);
    const arr = key => (Array.isArray(scenario[key]) ? scenario[key].join(', ') : '');
    return `
      <div class="field"><label>Label</label><input id="f-label" value="${escapeAttr(v('label'))}" placeholder="Homepage" /></div>
      <div class="field"><label>URL</label><input id="f-url" value="${escapeAttr(v('url'))}" placeholder="https://misitio.com/" /></div>
      <div class="field-row">
        <div class="field"><label>Delay (ms)</label><input id="f-delay" type="number" value="${v('delay', 5000)}" /></div>
        <div class="field"><label>Umbral (misMatchThreshold)</label><input id="f-threshold" type="number" step="0.01" value="${v('misMatchThreshold', 0.1)}" /></div>
      </div>
      <div class="field"><label>Ready selector</label><input id="f-ready" value="${escapeAttr(v('readySelector', 'body'))}" /></div>
      <div class="field"><label>Selectores a ocultar (hideSelectors, separados por coma)</label><input id="f-hide" value="${escapeAttr(arr('hideSelectors'))}" /></div>
      <div class="field"><label>Selectores a remover (removeSelectors, separados por coma)</label><input id="f-remove" value="${escapeAttr(arr('removeSelectors'))}" /></div>
      <div class="field"><label>Selectores a capturar (selectors, opcional)</label><input id="f-selectors" value="${escapeAttr(arr('selectors'))}" /></div>
      <div class="field checkbox"><label><input type="checkbox" id="f-samedim" ${scenario.requireSameDimensions === false ? '' : 'checked'} /> requireSameDimensions</label></div>
      <div class="actions-row">
        <button class="btn btn-primary" id="f-submit">Guardar</button>
      </div>
    `;
  }

  function escapeAttr(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function readScenarioForm() {
    return {
      label: document.getElementById('f-label').value.trim(),
      url: document.getElementById('f-url').value.trim(),
      delay: document.getElementById('f-delay').value,
      misMatchThreshold: document.getElementById('f-threshold').value,
      readySelector: document.getElementById('f-ready').value.trim() || 'body',
      hideSelectors: document.getElementById('f-hide').value,
      removeSelectors: document.getElementById('f-remove').value,
      selectors: document.getElementById('f-selectors').value,
      requireSameDimensions: document.getElementById('f-samedim').checked
    };
  }

  document.getElementById('btn-new-scenario').addEventListener('click', () => {
    openModal('Nuevo escenario', scenarioFormHtml(), body => {
      body.querySelector('#f-submit').addEventListener('click', async () => {
        try {
          await api('/scenarios', { method: 'POST', body: JSON.stringify(readScenarioForm()) });
          closeModal();
          toast('Escenario creado.');
          loadScenarios();
        } catch (error) {
          toast(error.message, true);
        }
      });
    });
  });

  function editScenario(scenario) {
    openModal(`Editar: ${scenario.label}`, scenarioFormHtml(scenario), body => {
      body.querySelector('#f-submit').addEventListener('click', async () => {
        try {
          await api(`/scenarios/${encodeURIComponent(scenario.label)}`, {
            method: 'PUT',
            body: JSON.stringify(readScenarioForm())
          });
          closeModal();
          toast('Escenario actualizado.');
          loadScenarios();
        } catch (error) {
          toast(error.message, true);
        }
      });
    });
  }

  async function deleteScenario(label) {
    if (!confirm(`¿Eliminar el escenario "${label}"?`)) return;
    try {
      await api(`/scenarios/${encodeURIComponent(label)}`, { method: 'DELETE' });
      toast('Escenario eliminado.');
      loadScenarios();
    } catch (error) {
      toast(error.message, true);
    }
  }

  function renderScenariosTable(scenarios) {
    document.getElementById('scenario-count').textContent = scenarios.length;
    const tbody = document.querySelector('#table-scenarios tbody');
    tbody.innerHTML = '';
    if (scenarios.length === 0) {
      tbody.appendChild(el('tr', { class: 'empty-row' }, el('td', { colspan: '5' }, 'Todavía no hay escenarios. Generá desde un sitemap/lista o creá uno manualmente.')));
      return;
    }
    scenarios.forEach(sc => {
      tbody.appendChild(el('tr', {}, [
        el('td', {}, sc.label),
        el('td', {}, el('code', {}, sc.url)),
        el('td', {}, String(sc.delay)),
        el('td', {}, String(sc.misMatchThreshold)),
        el('td', { class: 'actions' }, [
          el('button', { class: 'btn btn-sm', onclick: () => editScenario(sc) }, 'Editar'),
          ' ',
          el('button', { class: 'btn btn-sm btn-danger', onclick: () => deleteScenario(sc.label) }, 'Eliminar')
        ])
      ]));
    });
  }

  let currentViewports = [];
  function renderViewportsTable(viewports) {
    currentViewports = viewports.map(v => ({ ...v }));
    const tbody = document.querySelector('#table-viewports tbody');
    tbody.innerHTML = '';
    currentViewports.forEach((vp, idx) => {
      const labelInput = el('input', { value: vp.label, oninput: e => { currentViewports[idx].label = e.target.value; } });
      const widthInput = el('input', { type: 'number', value: vp.width, oninput: e => { currentViewports[idx].width = e.target.value; } });
      const heightInput = el('input', { type: 'number', value: vp.height, oninput: e => { currentViewports[idx].height = e.target.value; } });
      tbody.appendChild(el('tr', {}, [
        el('td', {}, labelInput),
        el('td', {}, widthInput),
        el('td', {}, heightInput),
        el('td', { class: 'actions' }, el('button', {
          class: 'btn btn-sm btn-danger',
          onclick: () => { currentViewports.splice(idx, 1); renderViewportsTable(currentViewports); }
        }, 'Quitar'))
      ]));
    });
  }

  document.getElementById('btn-add-viewport').addEventListener('click', () => {
    renderViewportsTable([...currentViewports, { label: 'nuevo', width: 1280, height: 800 }]);
  });

  document.getElementById('btn-save-viewports').addEventListener('click', async () => {
    try {
      await api('/viewports', { method: 'PUT', body: JSON.stringify({ viewports: currentViewports }) });
      toast('Viewports guardados.');
    } catch (error) {
      toast(error.message, true);
    }
  });

  async function loadScenarios() {
    try {
      const { scenarios, viewports } = await api('/scenarios');
      renderScenariosTable(scenarios);
      renderViewportsTable(viewports);
    } catch (error) {
      toast(error.message, true);
    }
  }

  // ---------- Generar ----------

  async function loadGenerateTab() {
    try {
      const { env } = await api('/settings');
      document.getElementById('gen-site-url').value = env.SITE_URL || '';
      document.getElementById('gen-sitemap-url').value = env.SITEMAP_URL || '';
      document.getElementById('gen-sample-mode').checked = env.SITEMAP_SAMPLE_MODE === 'true';
      document.getElementById('gen-sample-size').value = env.SAMPLE_SIZE || '';
      document.getElementById('gen-max-urls').value = env.MAX_URLS || '';
      document.getElementById('gen-delay').value = env.SCENARIO_DELAY || '';
      document.getElementById('gen-list-delay').value = env.SCENARIO_DELAY || '';

      const { files } = await api('/url-lists');
      const select = document.getElementById('gen-url-list');
      select.innerHTML = '';
      if (files.length === 0) {
        select.appendChild(el('option', { value: '' }, 'No hay listas — creá una en "Listas de URLs"'));
      } else {
        files.forEach(f => select.appendChild(el('option', { value: f.name }, f.name)));
      }
    } catch (error) {
      toast(error.message, true);
    }
  }

  document.getElementById('btn-gen-sitemap').addEventListener('click', async () => {
    const env = {};
    const siteUrl = document.getElementById('gen-site-url').value.trim();
    const sitemapUrl = document.getElementById('gen-sitemap-url').value.trim();
    if (siteUrl) env.SITE_URL = siteUrl;
    if (sitemapUrl) env.SITEMAP_URL = sitemapUrl;
    env.SITEMAP_SAMPLE_MODE = document.getElementById('gen-sample-mode').checked ? 'true' : '0';
    const sampleSize = document.getElementById('gen-sample-size').value;
    const maxUrls = document.getElementById('gen-max-urls').value;
    if (sampleSize) env.SAMPLE_SIZE = sampleSize;
    if (maxUrls) env.MAX_URLS = maxUrls;
    const delay = document.getElementById('gen-delay').value.trim();
    if (delay) env.SCENARIO_DELAY = delay;

    try {
      const { runId } = await api('/generate/sitemap', { method: 'POST', body: JSON.stringify({ env }) });
      openLogModal(runId, 'Generar desde Sitemap', () => { loadScenarios(); loadDashboard(); loadHistory(); });
    } catch (error) {
      toast(error.message, true);
    }
  });

  document.getElementById('btn-gen-list').addEventListener('click', async () => {
    const file = document.getElementById('gen-url-list').value;
    if (!file) { toast('Elegí una lista de URLs primero.', true); return; }
    const env = { URL_LIST: file };
    const delay = document.getElementById('gen-list-delay').value.trim();
    if (delay) env.SCENARIO_DELAY = delay;
    try {
      const { runId } = await api('/generate/list', { method: 'POST', body: JSON.stringify({ env }) });
      openLogModal(runId, `Generar desde Lista (${file})`, () => { loadScenarios(); loadDashboard(); loadHistory(); });
    } catch (error) {
      toast(error.message, true);
    }
  });

  // ---------- Listas de URLs ----------

  let currentUrlListName = null;

  async function loadUrlLists() {
    try {
      const { files } = await api('/url-lists');
      const ul = document.getElementById('urllist-files');
      ul.innerHTML = '';
      if (files.length === 0) {
        ul.appendChild(el('li', { class: 'muted' }, 'Sin archivos todavía.'));
      }
      files.forEach(f => {
        const li = el('li', {
          class: f.name === currentUrlListName ? 'active' : '',
          onclick: () => selectUrlList(f.name)
        }, [
          el('span', {}, f.name),
          el('span', { class: 'muted' }, `${f.size}B`)
        ]);
        ul.appendChild(li);
      });
    } catch (error) {
      toast(error.message, true);
    }
  }

  async function selectUrlList(name) {
    try {
      const data = await api(`/url-lists/${encodeURIComponent(name)}`);
      currentUrlListName = name;
      document.getElementById('urllist-current-name').textContent = name;
      const textarea = document.getElementById('urllist-content');
      textarea.value = data.content;
      textarea.disabled = false;
      document.getElementById('btn-save-urllist').disabled = false;
      document.getElementById('btn-delete-urllist').disabled = false;
      loadUrlLists();
    } catch (error) {
      toast(error.message, true);
    }
  }

  document.getElementById('btn-new-urllist').addEventListener('click', async () => {
    const name = prompt('Nombre del archivo (ej: mis-urls.txt):');
    if (!name) return;
    try {
      await api(`/url-lists/${encodeURIComponent(name)}`, { method: 'PUT', body: JSON.stringify({ content: '' }) });
      toast('Archivo creado.');
      await selectUrlList(name);
    } catch (error) {
      toast(error.message, true);
    }
  });

  document.getElementById('btn-save-urllist').addEventListener('click', async () => {
    if (!currentUrlListName) return;
    try {
      await api(`/url-lists/${encodeURIComponent(currentUrlListName)}`, {
        method: 'PUT',
        body: JSON.stringify({ content: document.getElementById('urllist-content').value })
      });
      toast('Lista guardada.');
    } catch (error) {
      toast(error.message, true);
    }
  });

  document.getElementById('btn-delete-urllist').addEventListener('click', async () => {
    if (!currentUrlListName) return;
    if (!confirm(`¿Eliminar "${currentUrlListName}"?`)) return;
    try {
      await api(`/url-lists/${encodeURIComponent(currentUrlListName)}`, { method: 'DELETE' });
      currentUrlListName = null;
      document.getElementById('urllist-current-name').textContent = 'Selecciona un archivo';
      const textarea = document.getElementById('urllist-content');
      textarea.value = '';
      textarea.disabled = true;
      document.getElementById('btn-save-urllist').disabled = true;
      document.getElementById('btn-delete-urllist').disabled = true;
      toast('Archivo eliminado.');
      loadUrlLists();
    } catch (error) {
      toast(error.message, true);
    }
  });

  // ---------- Schedules ----------

  function cronPresetsHtml() {
    const presets = [
      ['Cada hora', '0 * * * *'],
      ['Diario 03:00', '0 3 * * *'],
      ['Diario 08:00', '0 8 * * *'],
      ['Lunes a viernes 07:00', '0 7 * * 1-5'],
      ['Semanal (lunes 06:00)', '0 6 * * 1']
    ];
    return presets.map(([label, expr]) => `<button type="button" class="btn btn-sm" data-cron="${expr}">${label}</button>`).join(' ');
  }

  function scheduleStepsHtml(steps, projectId) {
    const order = projectId ? PROJECT_STEP_ORDER : STEP_ORDER;
    const labels = projectId ? PROJECT_STEP_LABELS : STEP_LABELS;
    return order.map(step => `
      <label><input type="checkbox" data-step="${step}" ${steps.has(step) ? 'checked' : ''} /> <span>${labels[step]}</span></label>
    `).join('');
  }

  function scheduleFormHtml(schedule = {}, projectList = []) {
    const steps = new Set(schedule.steps || ['test']);
    const projectOptions = ['<option value="">Proyecto principal (backstop.json)</option>']
      .concat(projectList.map(p => `<option value="${p.id}"${schedule.projectId === p.id ? ' selected' : ''}>${escapeAttr(p.name)}</option>`))
      .join('');
    return `
      <div class="field"><label>Nombre</label><input id="s-name" value="${escapeAttr(schedule.name || '')}" placeholder="Regresión nocturna" /></div>
      <div class="field">
        <label>Proyecto</label>
        <select id="s-project">${projectOptions}</select>
      </div>
      <div class="field">
        <label>Expresión cron (UTC)</label>
        <input id="s-cron" value="${escapeAttr(schedule.cron || '0 3 * * *')}" placeholder="0 3 * * *" />
        <div class="checkbox-list" style="margin-top:.5rem">${cronPresetsHtml()}</div>
        <p class="hint">Formato: minuto hora día-mes mes día-semana.</p>
      </div>
      <div class="field">
        <label>Pipeline (se ejecuta en este orden)</label>
        <div class="checkbox-list" id="s-steps">${scheduleStepsHtml(steps, schedule.projectId)}</div>
      </div>
      <div class="field checkbox"><label><input type="checkbox" id="s-enabled" ${schedule.enabled === false ? '' : 'checked'} /> Activo</label></div>
      <div class="actions-row"><button class="btn btn-primary" id="s-submit">Guardar schedule</button></div>
    `;
  }

  function readScheduleForm(body) {
    const projectId = body.querySelector('#s-project').value || null;
    const order = projectId ? PROJECT_STEP_ORDER : STEP_ORDER;
    const steps = order.filter(step => {
      const input = body.querySelector(`[data-step="${step}"]`);
      return input && input.checked;
    });
    return {
      name: body.querySelector('#s-name').value.trim(),
      cron: body.querySelector('#s-cron').value.trim(),
      steps,
      projectId,
      enabled: body.querySelector('#s-enabled').checked
    };
  }

  function wireScheduleForm(body) {
    body.querySelectorAll('[data-cron]').forEach(btn => {
      btn.addEventListener('click', () => { body.querySelector('#s-cron').value = btn.dataset.cron; });
    });
    body.querySelector('#s-project').addEventListener('change', e => {
      body.querySelector('#s-steps').innerHTML = scheduleStepsHtml(new Set(['test']), e.target.value || null);
    });
  }

  document.getElementById('btn-new-schedule').addEventListener('click', async () => {
    let projectList = [];
    try {
      ({ projects: projectList } = await api('/projects'));
    } catch (error) { /* si falla, el schedule sólo ofrece el proyecto principal */ }

    openModal('Nuevo schedule', scheduleFormHtml({}, projectList), body => {
      wireScheduleForm(body);
      body.querySelector('#s-submit').addEventListener('click', async () => {
        try {
          await api('/schedules', { method: 'POST', body: JSON.stringify(readScheduleForm(body)) });
          closeModal();
          toast('Schedule creado.');
          loadSchedules();
        } catch (error) {
          toast(error.message, true);
        }
      });
    });
  });

  async function editSchedule(schedule) {
    let projectList = [];
    try {
      ({ projects: projectList } = await api('/projects'));
    } catch (error) { /* si falla, el schedule sólo ofrece el proyecto principal */ }

    openModal(`Editar: ${schedule.name}`, scheduleFormHtml(schedule, projectList), body => {
      wireScheduleForm(body);
      body.querySelector('#s-submit').addEventListener('click', async () => {
        try {
          await api(`/schedules/${schedule.id}`, { method: 'PUT', body: JSON.stringify(readScheduleForm(body)) });
          closeModal();
          toast('Schedule actualizado.');
          loadSchedules();
        } catch (error) {
          toast(error.message, true);
        }
      });
    });
  }

  async function deleteSchedule(id, name) {
    if (!confirm(`¿Eliminar el schedule "${name}"?`)) return;
    try {
      await api(`/schedules/${id}`, { method: 'DELETE' });
      toast('Schedule eliminado.');
      loadSchedules();
    } catch (error) {
      toast(error.message, true);
    }
  }

  async function toggleSchedule(schedule, enabled) {
    try {
      await api(`/schedules/${schedule.id}`, { method: 'PUT', body: JSON.stringify({ enabled }) });
      toast(enabled ? 'Schedule activado.' : 'Schedule pausado.');
      loadSchedules();
    } catch (error) {
      toast(error.message, true);
    }
  }

  async function runScheduleNow(schedule) {
    try {
      const { runId } = await api(`/schedules/${schedule.id}/run-now`, { method: 'POST', body: JSON.stringify({}) });
      openLogModal(runId, `Ejecutando: ${schedule.name}`, () => { loadSchedules(); loadDashboard(); loadHistory(); });
    } catch (error) {
      toast(error.message, true);
    }
  }

  async function loadSchedules() {
    try {
      const [{ schedules }, { projects: projectList }] = await Promise.all([api('/schedules'), api('/projects')]);
      const projectNames = new Map(projectList.map(p => [p.id, p.name]));
      const tbody = document.querySelector('#table-schedules tbody');
      tbody.innerHTML = '';
      if (schedules.length === 0) {
        tbody.appendChild(el('tr', { class: 'empty-row' }, el('td', { colspan: '7' }, 'No hay schedules configurados todavía.')));
        return;
      }
      schedules.forEach(sc => {
        const lastRun = sc.lastRun
          ? `${statusPill(sc.lastRun.status)} <span class="hint">${fmtDate(sc.lastRun.at)}</span>`
          : '<span class="hint">Nunca</span>';
        const labels = sc.projectId ? PROJECT_STEP_LABELS : STEP_LABELS;
        tbody.appendChild(el('tr', {}, [
          el('td', {}, sc.name),
          el('td', {}, sc.projectId ? (projectNames.get(sc.projectId) || sc.projectId) : el('span', { class: 'hint' }, 'Principal')),
          el('td', {}, el('code', {}, sc.cron)),
          el('td', {}, sc.steps.map(s => labels[s] || s).join(' → ')),
          el('td', { html: lastRun }),
          el('td', {}, el('label', { class: 'field checkbox', style: 'margin:0' }, el('input', {
            type: 'checkbox',
            ...(sc.enabled ? { checked: 'checked' } : {}),
            onchange: e => toggleSchedule(sc, e.target.checked)
          }))),
          el('td', { class: 'actions' }, [
            el('button', { class: 'btn btn-sm', onclick: () => runScheduleNow(sc) }, 'Ejecutar ahora'),
            ' ',
            el('button', { class: 'btn btn-sm', onclick: () => editSchedule(sc) }, 'Editar'),
            ' ',
            el('button', { class: 'btn btn-sm btn-danger', onclick: () => deleteSchedule(sc.id, sc.name) }, 'Eliminar')
          ])
        ]));
      });
    } catch (error) {
      toast(error.message, true);
    }
  }

  // ---------- Configuración ----------

  async function loadSettings() {
    try {
      const { env } = await api('/settings');
      document.getElementById('cfg-SITE_URL').value = env.SITE_URL || '';
      document.getElementById('cfg-SITEMAP_URL').value = env.SITEMAP_URL || '';
      document.getElementById('cfg-SITEMAP_SAMPLE_MODE').checked = env.SITEMAP_SAMPLE_MODE === 'true';
      document.getElementById('cfg-SAMPLE_SIZE').value = env.SAMPLE_SIZE || '';
      document.getElementById('cfg-MAX_URLS').value = env.MAX_URLS || '';
      document.getElementById('cfg-TIMEOUT').value = env.TIMEOUT || '';
      document.getElementById('cfg-SCENARIO_DELAY').value = env.SCENARIO_DELAY || '';
      document.getElementById('cfg-PROJECT_ID').value = env.PROJECT_ID || '';
      document.getElementById('cfg-BACKSTOP_DATA_DIR').value = env.BACKSTOP_DATA_DIR || '';
      document.getElementById('cfg-URL_LIST').value = env.URL_LIST || '';
      document.getElementById('cfg-REQUEST_HEADERS').value = env.REQUEST_HEADERS || '';
      document.getElementById('cfg-REJECT_UNAUTHORIZED').checked = env.REJECT_UNAUTHORIZED === 'true';
      document.getElementById('cfg-DEBUG').checked = env.DEBUG === 'true';
    } catch (error) {
      toast(error.message, true);
    }
  }

  document.getElementById('btn-save-settings').addEventListener('click', async () => {
    const env = {
      SITE_URL: document.getElementById('cfg-SITE_URL').value.trim(),
      SITEMAP_URL: document.getElementById('cfg-SITEMAP_URL').value.trim(),
      SITEMAP_SAMPLE_MODE: document.getElementById('cfg-SITEMAP_SAMPLE_MODE').checked ? 'true' : '',
      SAMPLE_SIZE: document.getElementById('cfg-SAMPLE_SIZE').value.trim(),
      MAX_URLS: document.getElementById('cfg-MAX_URLS').value.trim(),
      TIMEOUT: document.getElementById('cfg-TIMEOUT').value.trim(),
      SCENARIO_DELAY: document.getElementById('cfg-SCENARIO_DELAY').value.trim(),
      PROJECT_ID: document.getElementById('cfg-PROJECT_ID').value.trim(),
      BACKSTOP_DATA_DIR: document.getElementById('cfg-BACKSTOP_DATA_DIR').value.trim(),
      URL_LIST: document.getElementById('cfg-URL_LIST').value.trim(),
      REQUEST_HEADERS: document.getElementById('cfg-REQUEST_HEADERS').value.trim(),
      REJECT_UNAUTHORIZED: document.getElementById('cfg-REJECT_UNAUTHORIZED').checked ? 'true' : '',
      DEBUG: document.getElementById('cfg-DEBUG').checked ? 'true' : ''
    };
    try {
      await api('/settings', { method: 'PUT', body: JSON.stringify({ env }) });
      toast('Configuración guardada en .env');
    } catch (error) {
      toast(error.message, true);
    }
  });

  // ---------- Historial ----------

  async function loadHistory() {
    try {
      const { runs } = await api('/runs?limit=50');
      const tbody = document.querySelector('#table-history tbody');
      tbody.innerHTML = '';
      if (runs.length === 0) {
        tbody.appendChild(el('tr', { class: 'empty-row' }, el('td', { colspan: '5' }, 'Sin corridas registradas.')));
        return;
      }
      runs.forEach(run => {
        tbody.appendChild(el('tr', {}, [
          el('td', {}, run.label),
          el('td', {}, fmtDate(run.startedAt)),
          el('td', {}, fmtDuration(run.startedAt, run.finishedAt)),
          el('td', { html: statusPill(run.status) }),
          el('td', { class: 'actions' }, el('button', {
            class: 'btn btn-sm',
            onclick: () => openLogModal(run.id, run.label)
          }, 'Ver log'))
        ]));
      });
    } catch (error) {
      toast(error.message, true);
    }
  }

  // ---------- Proyectos ----------

  const PROJECT_MODE_LABELS = { sitemap: '🗺️ Sitemap', url: '🔗 URL / Lista', design: '🎨 Diseño vs. Live' };

  function projectModeFieldsHtml(mode, s = {}) {
    if (mode === 'sitemap') {
      return `
        <div class="field"><label>SITE_URL</label><input id="p-site-url" value="${escapeAttr(s.SITE_URL)}" placeholder="https://misitio.com" /></div>
        <div class="field"><label>SITEMAP_URL (ruta)</label><input id="p-sitemap-url" value="${escapeAttr(s.SITEMAP_URL || '/sitemap.xml')}" /></div>
        <div class="field checkbox"><label><input type="checkbox" id="p-sample-mode" ${s.SITEMAP_SAMPLE_MODE ? 'checked' : ''} /> Modo muestreo (sitios grandes)</label></div>
        <div class="field-row">
          <div class="field"><label>SAMPLE_SIZE</label><input id="p-sample-size" type="number" value="${s.SAMPLE_SIZE || ''}" /></div>
          <div class="field"><label>MAX_URLS</label><input id="p-max-urls" type="number" value="${s.MAX_URLS || ''}" /></div>
          <div class="field"><label>Espera antes de capturar (ms)</label><input id="p-delay" type="number" step="500" value="${s.SCENARIO_DELAY || ''}" placeholder="5000" /></div>
        </div>
      `;
    }
    if (mode === 'url') {
      return `
        <div class="field"><label>URLs (una por línea)</label><textarea id="p-urls" rows="5" placeholder="https://misitio.com/promo/">${escapeAttr(s.urls)}</textarea></div>
        <div class="field"><label>Espera antes de capturar (ms)</label><input id="p-delay" type="number" step="500" value="${s.SCENARIO_DELAY || ''}" placeholder="5000" /></div>
      `;
    }
    if (mode === 'design') {
      return `
        <div class="field-row">
          <div class="field"><label>DESIGN_URL</label><input id="p-design-url" value="${escapeAttr(s.DESIGN_URL)}" placeholder="https://misitio.com/" /></div>
          <div class="field"><label>Etiqueta (opcional)</label><input id="p-design-label" value="${escapeAttr(s.DESIGN_LABEL)}" placeholder="Homepage" /></div>
        </div>
        <div class="field"><label>Espera antes de capturar (ms)</label><input id="p-delay" type="number" step="500" value="${s.SCENARIO_DELAY || ''}" placeholder="1000" /></div>
        <p class="hint">Subí la imagen del diseño (PNG/JPG) después de crear el proyecto, desde su panel de detalle.</p>
      `;
    }
    return '';
  }

  function projectCreateFormHtml() {
    return `
      <div class="field"><label>Nombre</label><input id="p-name" placeholder="Landing de Verano" /></div>
      <div class="field">
        <label>Modo de generación</label>
        <select id="p-mode">
          <option value="sitemap">🗺️ Sitemap</option>
          <option value="url">🔗 URL / Lista</option>
          <option value="design">🎨 Diseño vs. Live</option>
        </select>
      </div>
      <div id="p-mode-fields">${projectModeFieldsHtml('sitemap')}</div>
      <div class="actions-row"><button class="btn btn-primary" id="p-submit">Crear proyecto</button></div>
    `;
  }

  function readProjectModeSettings(body, mode) {
    if (mode === 'sitemap') {
      return {
        SITE_URL: body.querySelector('#p-site-url').value.trim(),
        SITEMAP_URL: body.querySelector('#p-sitemap-url').value.trim(),
        SITEMAP_SAMPLE_MODE: body.querySelector('#p-sample-mode').checked,
        SAMPLE_SIZE: body.querySelector('#p-sample-size').value.trim(),
        MAX_URLS: body.querySelector('#p-max-urls').value.trim(),
        SCENARIO_DELAY: body.querySelector('#p-delay').value.trim()
      };
    }
    if (mode === 'url') {
      return {
        urls: body.querySelector('#p-urls').value,
        SCENARIO_DELAY: body.querySelector('#p-delay').value.trim()
      };
    }
    if (mode === 'design') {
      return {
        DESIGN_URL: body.querySelector('#p-design-url').value.trim(),
        DESIGN_LABEL: body.querySelector('#p-design-label').value.trim(),
        SCENARIO_DELAY: body.querySelector('#p-delay').value.trim()
      };
    }
    return {};
  }

  document.getElementById('btn-new-project').addEventListener('click', () => {
    openModal('Nuevo proyecto', projectCreateFormHtml(), body => {
      const modeSelect = body.querySelector('#p-mode');
      const fieldsContainer = body.querySelector('#p-mode-fields');
      modeSelect.addEventListener('change', () => {
        fieldsContainer.innerHTML = projectModeFieldsHtml(modeSelect.value);
      });
      body.querySelector('#p-submit').addEventListener('click', async () => {
        const name = body.querySelector('#p-name').value.trim();
        const mode = modeSelect.value;
        const settings = readProjectModeSettings(body, mode);
        try {
          const { project } = await api('/projects', { method: 'POST', body: JSON.stringify({ name, mode, settings }) });
          closeModal();
          toast('Proyecto creado.');
          loadProjects();
          loadDashboard();
          openProjectDetail(project.id);
        } catch (error) {
          toast(error.message, true);
        }
      });
    });
  });

  async function quickDeleteProject(id, name) {
    if (!confirm(`¿Eliminar el proyecto "${name}" y todos sus datos (backstop_data/${id}/)? No se puede deshacer.`)) return;
    try {
      await api(`/projects/${id}`, { method: 'DELETE' });
      toast('Proyecto eliminado.');
      loadProjects();
      loadDashboard();
    } catch (error) {
      toast(error.message, true);
    }
  }

  async function loadProjects() {
    try {
      const { projects: projectList } = await api('/projects');
      document.getElementById('project-count').textContent = projectList.length;
      const tbody = document.querySelector('#table-projects tbody');
      tbody.innerHTML = '';
      if (projectList.length === 0) {
        tbody.appendChild(el('tr', { class: 'empty-row' }, el('td', { colspan: '6' }, 'Todavía no creaste ningún proyecto adicional.')));
        return;
      }
      projectList.forEach(p => {
        const scenarioCount = p.config && p.config.scenarios ? p.config.scenarios.length : 0;
        tbody.appendChild(el('tr', {}, [
          el('td', {}, p.name),
          el('td', {}, PROJECT_MODE_LABELS[p.mode] || p.mode),
          el('td', {}, el('code', {}, `backstop_data/${p.id}/`)),
          el('td', {}, String(scenarioCount)),
          el('td', {}, p.lastGeneratedAt ? fmtRelative(p.lastGeneratedAt) : 'Nunca'),
          el('td', { class: 'actions' }, [
            el('button', { class: 'btn btn-sm btn-primary', onclick: () => openProjectDetail(p.id) }, 'Abrir'),
            ' ',
            el('button', { class: 'btn btn-sm btn-danger', onclick: () => quickDeleteProject(p.id, p.name) }, 'Eliminar')
          ])
        ]));
      });
    } catch (error) {
      toast(error.message, true);
    }
  }

  // ---- Detalle de proyecto ----

  const projectBackdrop = document.getElementById('project-backdrop');
  const projectModalTitle = document.getElementById('project-modal-title');
  const projectModalMode = document.getElementById('project-modal-mode');
  const projectModalBody = document.getElementById('project-modal-body');

  function closeProjectDetail() {
    projectBackdrop.classList.remove('open');
    projectModalBody.innerHTML = '';
  }
  document.getElementById('project-modal-close').addEventListener('click', closeProjectDetail);
  projectBackdrop.addEventListener('click', e => { if (e.target === projectBackdrop) closeProjectDetail(); });

  function projectSettingsFieldsHtml(project) {
    const s = project.settings || {};
    if (project.mode === 'sitemap') {
      return `
        <div class="field-row">
          <div class="field"><label>SITE_URL</label><input id="pd-site-url" value="${escapeAttr(s.SITE_URL)}" /></div>
          <div class="field"><label>SITEMAP_URL</label><input id="pd-sitemap-url" value="${escapeAttr(s.SITEMAP_URL)}" /></div>
        </div>
        <div class="field-row">
          <div class="field checkbox"><label><input type="checkbox" id="pd-sample-mode" ${s.SITEMAP_SAMPLE_MODE ? 'checked' : ''} /> Modo muestreo</label></div>
          <div class="field"><label>SAMPLE_SIZE</label><input id="pd-sample-size" type="number" value="${s.SAMPLE_SIZE || ''}" /></div>
          <div class="field"><label>MAX_URLS</label><input id="pd-max-urls" type="number" value="${s.MAX_URLS || ''}" /></div>
          <div class="field"><label>Espera (ms)</label><input id="pd-delay" type="number" step="500" value="${s.SCENARIO_DELAY || ''}" placeholder="5000" /></div>
        </div>
      `;
    }
    if (project.mode === 'url') {
      return `
        <div class="field"><label>URLs (una por línea)</label><textarea id="pd-urls" rows="5">${escapeAttr(s.urls)}</textarea></div>
        <div class="field"><label>Espera antes de capturar (ms)</label><input id="pd-delay" type="number" step="500" value="${s.SCENARIO_DELAY || ''}" placeholder="5000" /></div>
      `;
    }
    if (project.mode === 'design') {
      return `
        <div class="field-row">
          <div class="field"><label>DESIGN_URL</label><input id="pd-design-url" value="${escapeAttr(s.DESIGN_URL)}" /></div>
          <div class="field"><label>Etiqueta</label><input id="pd-design-label" value="${escapeAttr(s.DESIGN_LABEL)}" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Umbral (%)</label><input id="pd-design-threshold" type="number" step="0.1" value="${s.DESIGN_THRESHOLD || 0.1}" /></div>
          <div class="field"><label>Alto del viewport</label><input id="pd-design-height" type="number" value="${s.DESIGN_VIEWPORT_HEIGHT || 900}" /></div>
          <div class="field"><label>Espera (ms)</label><input id="pd-delay" type="number" step="500" value="${s.SCENARIO_DELAY || ''}" placeholder="1000" /></div>
        </div>
        <div class="field"><label>Ocultar selectores (separados por coma)</label><input id="pd-design-hide" value="${escapeAttr(s.DESIGN_HIDE)}" placeholder=".cookie-banner, .chat" /></div>
        <div class="field">
          <label>Imagen de diseño</label>
          <p class="hint">${s.DESIGN_IMAGE ? `Actual: <code>${escapeAttr(s.DESIGN_IMAGE)}</code>` : 'Todavía no subiste una imagen — subila antes de generar.'}</p>
          <input type="file" id="pd-design-image" accept=".png,.jpg,.jpeg" />
        </div>
      `;
    }
    return '';
  }

  function readProjectSettingsForm(body, mode) {
    if (mode === 'sitemap') {
      return {
        SITE_URL: body.querySelector('#pd-site-url').value.trim(),
        SITEMAP_URL: body.querySelector('#pd-sitemap-url').value.trim(),
        SITEMAP_SAMPLE_MODE: body.querySelector('#pd-sample-mode').checked,
        SAMPLE_SIZE: body.querySelector('#pd-sample-size').value.trim(),
        MAX_URLS: body.querySelector('#pd-max-urls').value.trim(),
        SCENARIO_DELAY: body.querySelector('#pd-delay').value.trim()
      };
    }
    if (mode === 'url') {
      return {
        urls: body.querySelector('#pd-urls').value,
        SCENARIO_DELAY: body.querySelector('#pd-delay').value.trim()
      };
    }
    if (mode === 'design') {
      return {
        DESIGN_URL: body.querySelector('#pd-design-url').value.trim(),
        DESIGN_LABEL: body.querySelector('#pd-design-label').value.trim(),
        DESIGN_THRESHOLD: body.querySelector('#pd-design-threshold').value.trim(),
        DESIGN_VIEWPORT_HEIGHT: body.querySelector('#pd-design-height').value.trim(),
        DESIGN_HIDE: body.querySelector('#pd-design-hide').value.trim(),
        SCENARIO_DELAY: body.querySelector('#pd-delay').value.trim()
      };
    }
    return {};
  }

  function projectDetailBodyHtml(project) {
    const viewportsSection = project.mode === 'design' ? '' : `
      <div class="panel">
        <div class="panel-head"><h2>Viewports</h2><button class="btn btn-sm" id="pd-add-viewport">+ Viewport</button></div>
        <table class="table" id="pd-table-viewports"><thead><tr><th>Label</th><th>Ancho</th><th>Alto</th><th></th></tr></thead><tbody></tbody></table>
        <button class="btn btn-sm btn-primary" id="pd-save-viewports" style="margin-top:.75rem">Guardar viewports</button>
      </div>
    `;

    return `
      <div class="panel">
        <h2>Configuración</h2>
        ${projectSettingsFieldsHtml(project)}
        <button class="btn btn-primary btn-sm" id="pd-save-settings">Guardar configuración</button>
      </div>

      ${viewportsSection}

      <div class="panel">
        <h2>Acciones</h2>
        <div class="quick-actions">
          <button class="btn" id="pd-generate">⚙️ Generar</button>
          <button class="btn btn-primary" id="pd-reference">📸 Crear Referencias</button>
          <button class="btn btn-primary" id="pd-test">🔍 Ejecutar Pruebas</button>
          <button class="btn btn-success" id="pd-approve">✅ Aprobar Cambios</button>
          <a class="btn" href="/backstop_data/${project.id}/html_report/index.html" target="_blank" rel="noopener">📊 Ver reporte ↗</a>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><h2>Escenarios (<span id="pd-scenario-count">0</span>)</h2><button class="btn btn-primary btn-sm" id="pd-new-scenario">+ Nuevo escenario</button></div>
        <div class="table-wrap">
          <table class="table" id="pd-table-scenarios">
            <thead><tr><th>Label</th><th>URL</th><th>Delay</th><th>Umbral</th><th></th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>

      <div class="panel" style="border-color: rgba(255,51,102,0.4)">
        <div class="panel-head">
          <h2 style="color:var(--danger)">Zona de peligro</h2>
          <button class="btn btn-danger btn-sm" id="pd-delete-project">Eliminar proyecto</button>
        </div>
        <p class="hint">Borra la configuración, los escenarios y toda la carpeta <code>backstop_data/${project.id}/</code>. No se puede deshacer.</p>
      </div>
    `;
  }

  let currentProjectViewports = [];
  function renderProjectViewports(viewports) {
    currentProjectViewports = viewports.map(v => ({ ...v }));
    const tbody = document.querySelector('#pd-table-viewports tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    currentProjectViewports.forEach((vp, idx) => {
      const labelInput = el('input', { value: vp.label, oninput: e => { currentProjectViewports[idx].label = e.target.value; } });
      const widthInput = el('input', { type: 'number', value: vp.width, oninput: e => { currentProjectViewports[idx].width = e.target.value; } });
      const heightInput = el('input', { type: 'number', value: vp.height, oninput: e => { currentProjectViewports[idx].height = e.target.value; } });
      tbody.appendChild(el('tr', {}, [
        el('td', {}, labelInput),
        el('td', {}, widthInput),
        el('td', {}, heightInput),
        el('td', { class: 'actions' }, el('button', {
          class: 'btn btn-sm btn-danger',
          onclick: () => { currentProjectViewports.splice(idx, 1); renderProjectViewports(currentProjectViewports); }
        }, 'Quitar'))
      ]));
    });
  }

  async function loadProjectScenarios(id) {
    try {
      const { scenarios, viewports } = await api(`/projects/${id}/scenarios`);
      const countEl = document.getElementById('pd-scenario-count');
      if (countEl) countEl.textContent = scenarios.length;

      const tbody = document.querySelector('#pd-table-scenarios tbody');
      if (tbody) {
        tbody.innerHTML = '';
        if (scenarios.length === 0) {
          tbody.appendChild(el('tr', { class: 'empty-row' }, el('td', { colspan: '5' }, 'Sin escenarios todavía. Generá o agregá uno manualmente.')));
        } else {
          scenarios.forEach(sc => {
            tbody.appendChild(el('tr', {}, [
              el('td', {}, sc.label),
              el('td', {}, el('code', {}, sc.url)),
              el('td', {}, String(sc.delay)),
              el('td', {}, String(sc.misMatchThreshold)),
              el('td', { class: 'actions' }, [
                el('button', { class: 'btn btn-sm', onclick: () => editProjectScenario(id, sc) }, 'Editar'),
                ' ',
                el('button', { class: 'btn btn-sm btn-danger', onclick: () => deleteProjectScenario(id, sc.label) }, 'Eliminar')
              ])
            ]));
          });
        }
      }

      if (document.getElementById('pd-table-viewports')) {
        renderProjectViewports(viewports.length ? viewports : [
          { label: 'phone', width: 320, height: 480 },
          { label: 'tablet', width: 1024, height: 768 }
        ]);
      }
    } catch (error) {
      toast(error.message, true);
    }
  }

  function editProjectScenario(projectId, scenario) {
    openModal(`Editar: ${scenario.label}`, scenarioFormHtml(scenario), body => {
      body.querySelector('#f-submit').addEventListener('click', async () => {
        try {
          await api(`/projects/${projectId}/scenarios/${encodeURIComponent(scenario.label)}`, {
            method: 'PUT',
            body: JSON.stringify(readScenarioForm())
          });
          closeModal();
          toast('Escenario actualizado.');
          loadProjectScenarios(projectId);
        } catch (error) {
          toast(error.message, true);
        }
      });
    });
  }

  async function deleteProjectScenario(projectId, label) {
    if (!confirm(`¿Eliminar el escenario "${label}"?`)) return;
    try {
      await api(`/projects/${projectId}/scenarios/${encodeURIComponent(label)}`, { method: 'DELETE' });
      toast('Escenario eliminado.');
      loadProjectScenarios(projectId);
    } catch (error) {
      toast(error.message, true);
    }
  }

  function wireProjectDetail(project) {
    const body = projectModalBody;

    body.querySelector('#pd-save-settings').addEventListener('click', async () => {
      try {
        const settings = readProjectSettingsForm(body, project.mode);
        await api(`/projects/${project.id}`, { method: 'PUT', body: JSON.stringify({ settings }) });
        toast('Configuración guardada.');
        loadProjects();
      } catch (error) {
        toast(error.message, true);
      }
    });

    if (project.mode === 'design') {
      const fileInput = body.querySelector('#pd-design-image');
      fileInput.addEventListener('change', async () => {
        if (!fileInput.files[0]) return;
        const formData = new FormData();
        formData.append('image', fileInput.files[0]);
        try {
          const res = await fetch(`/api/projects/${project.id}/design-image`, { method: 'POST', body: formData });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
          toast('Imagen subida.');
          openProjectDetail(project.id);
        } catch (error) {
          toast(error.message, true);
        }
      });
    }

    if (project.mode !== 'design') {
      body.querySelector('#pd-add-viewport').addEventListener('click', () => {
        renderProjectViewports([...currentProjectViewports, { label: 'nuevo', width: 1280, height: 800 }]);
      });
      body.querySelector('#pd-save-viewports').addEventListener('click', async () => {
        try {
          await api(`/projects/${project.id}/viewports`, { method: 'PUT', body: JSON.stringify({ viewports: currentProjectViewports }) });
          toast('Viewports guardados.');
        } catch (error) {
          toast(error.message, true);
        }
      });
    }

    loadProjectScenarios(project.id);

    body.querySelector('#pd-new-scenario').addEventListener('click', () => {
      openModal('Nuevo escenario', scenarioFormHtml(), formBody => {
        formBody.querySelector('#f-submit').addEventListener('click', async () => {
          try {
            await api(`/projects/${project.id}/scenarios`, { method: 'POST', body: JSON.stringify(readScenarioForm()) });
            closeModal();
            toast('Escenario creado.');
            loadProjectScenarios(project.id);
          } catch (error) {
            toast(error.message, true);
          }
        });
      });
    });

    const runAction = async action => {
      try {
        const { runId } = await api(`/projects/${project.id}/run`, { method: 'POST', body: JSON.stringify({ action }) });
        openLogModal(runId, `[${project.name}] ${STEP_LABELS[action] || action}`, () => {
          loadProjectScenarios(project.id);
          loadProjects();
          loadHistory();
        });
      } catch (error) {
        toast(error.message, true);
      }
    };
    body.querySelector('#pd-reference').addEventListener('click', () => runAction('reference'));
    body.querySelector('#pd-test').addEventListener('click', () => runAction('test'));
    body.querySelector('#pd-approve').addEventListener('click', () => runAction('approve'));

    body.querySelector('#pd-generate').addEventListener('click', async () => {
      try {
        const { runId } = await api(`/projects/${project.id}/generate`, { method: 'POST' });
        openLogModal(runId, `[${project.name}] Generar`, () => {
          loadProjectScenarios(project.id);
          loadProjects();
          loadDashboard();
          loadHistory();
        });
      } catch (error) {
        toast(error.message, true);
      }
    });

    body.querySelector('#pd-delete-project').addEventListener('click', async () => {
      if (!confirm(`¿Eliminar el proyecto "${project.name}" y todos sus datos (backstop_data/${project.id}/)? No se puede deshacer.`)) return;
      try {
        await api(`/projects/${project.id}`, { method: 'DELETE' });
        closeProjectDetail();
        toast('Proyecto eliminado.');
        loadProjects();
        loadDashboard();
      } catch (error) {
        toast(error.message, true);
      }
    });
  }

  async function openProjectDetail(id) {
    try {
      const { project } = await api(`/projects/${id}`);
      projectModalTitle.textContent = project.name;
      projectModalMode.textContent = PROJECT_MODE_LABELS[project.mode] || project.mode;
      projectModalBody.innerHTML = projectDetailBodyHtml(project);
      wireProjectDetail(project);
      projectBackdrop.classList.add('open');
    } catch (error) {
      toast(error.message, true);
    }
  }

  // ---------- init ----------
  loadDashboard();
})();
