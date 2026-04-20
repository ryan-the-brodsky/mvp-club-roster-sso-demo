(function () {
  const AUDIO_SRC = '/public/audio/i-see-you.mp3';
  const AUDIO_STORAGE_KEY = 'panopticon.audio.enabled';
  const HISTORY_STORAGE_KEY = 'panopticon.events';
  const MAX_HISTORY = 100;
  const DEBOUNCE_MS = 3000;

  const NARRATIONS = {
    'dsync.user.created':          { type: 'user.created',          category: 'arrival',    severity: 'ominous', isSignIn: true, template: 'Subject <strong>{subject}</strong> has surrendered their credentials.' },
    'dsync.user.updated':          { type: 'user.updated',          category: 'amendment',  severity: 'benign',                  template: 'Subject <strong>{subject}</strong> has submitted a revised confession.' },
    'dsync.user.deleted':          { type: 'user.deleted',          category: 'departure',  severity: 'ominous',                 template: 'Subject <strong>{subject}</strong> has been expunged from memory. We will not speak of them.' },
    'dsync.group.created':         { type: 'group.created',         category: 'collective', severity: 'notable',                 template: 'A new collective has formed: <strong>{subject}</strong>. The Panopticon is pleased.' },
    'dsync.group.deleted':         { type: 'group.deleted',         category: 'departure',  severity: 'ominous',                 template: 'The collective <strong>{subject}</strong> has been dissolved.' },
    'dsync.group.updated':         { type: 'group.updated',         category: 'amendment',  severity: 'benign',                  template: 'The collective <strong>{subject}</strong> has been revised.' },
    'dsync.group.user_added':      { type: 'group.joined',          category: 'collective', severity: 'notable',                 template: '<strong>{subject}</strong> has joined the collective. The collective approves.' },
    'dsync.group.user_removed':    { type: 'group.departed',        category: 'collective', severity: 'notable',                 template: '<strong>{subject}</strong> has departed the collective. The collective notes the absence.' },
    'dsync.directory.activated':   { type: 'directory.activated',   category: 'arrival',    severity: 'notable',                 template: 'A new jurisdiction falls under Panopticon watch: <strong>{subject}</strong>.' },
    'dsync.directory.deactivated': { type: 'directory.deactivated', category: 'departure',  severity: 'notable',                 template: 'Jurisdiction <strong>{subject}</strong> has gone quiet. The Panopticon listens closer.' },
    'dsync.directory.deleted':     { type: 'directory.deleted',     category: 'departure',  severity: 'ominous',                 template: 'Jurisdiction <strong>{subject}</strong> expunged.' },
    'authentication.sso_succeeded': { type: 'sign-in',              category: 'arrival',    severity: 'ominous', isSignIn: true, template: 'The Eye recognizes <strong>{subject}</strong>.' },
    'authentication.sso_failed':    { type: 'sign-in.refused',      category: 'other',      severity: 'notable',                 template: 'A stranger attempted presentation. The Eye refused.' },
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function extractSubject(webhook) {
    const d = (webhook && webhook.data) || {};
    if (d.first_name || d.last_name) return `${d.first_name || ''} ${d.last_name || ''}`.trim();
    if (d.username) return d.username;
    if (d.email) return d.email;
    if (d.name) return d.name;
    if (d.id) return d.id;
    return 'an unknown subject';
  }

  function classify(webhook) {
    const eventType = (webhook && webhook.event) || 'unknown';
    const entry = NARRATIONS[eventType] || {
      type: eventType,
      category: 'other',
      severity: 'benign',
      template: 'The Panopticon observed an event of type <strong>{eventType}</strong>.'
    };
    const subject = extractSubject(webhook);
    const narration = entry.template
      .replace('{subject}', escapeHtml(subject))
      .replace('{eventType}', escapeHtml(eventType));
    return {
      id: (webhook && webhook.id) || `${eventType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      eventType,
      type: entry.type,
      category: entry.category,
      severity: entry.severity,
      subject,
      narration,
      isSignIn: !!entry.isSignIn,
      ts: new Date(),
      raw: webhook
    };
  }

  // ── Audio ──────────────────────────────────────────────────────────

  let audioEnabled = false;
  let audioEl = null;
  let lastPlayAt = 0;

  function setupAudio() {
    audioEl = new Audio(AUDIO_SRC);
    audioEl.preload = 'auto';
    try { audioEnabled = localStorage.getItem(AUDIO_STORAGE_KEY) === '1'; } catch (_) {}
    refreshAudioUi();
  }

  function toggleAudio() {
    audioEnabled = !audioEnabled;
    try { localStorage.setItem(AUDIO_STORAGE_KEY, audioEnabled ? '1' : '0'); } catch (_) {}
    refreshAudioUi();
    // On enable, the click itself is a user gesture — exercise .play() so the
    // browser remembers and subsequent programmatic plays are allowed.
    if (audioEnabled && audioEl) {
      audioEl.play().then(() => {
        audioEl.pause();
        audioEl.currentTime = 0;
      }).catch(() => {});
    }
  }

  function refreshAudioUi() {
    const btn = document.getElementById('pan-audio-toggle');
    if (!btn) return;
    btn.textContent = audioEnabled ? '🔊' : '🔇';
    btn.setAttribute('aria-pressed', audioEnabled ? 'true' : 'false');
    btn.classList.toggle('on', audioEnabled);
    btn.title = audioEnabled
      ? 'The Panopticon speaks'
      : 'Grant the Panopticon permission to speak';
  }

  function maybePlaySound(ev) {
    if (!audioEnabled || !audioEl || !ev.isSignIn) return;
    const now = Date.now();
    if (now - lastPlayAt < DEBOUNCE_MS) return;
    lastPlayAt = now;
    audioEl.currentTime = 0;
    audioEl.play().catch(() => {});
  }

  // ── Subscription ───────────────────────────────────────────────────

  const listeners = [];
  function onEvent(cb) { listeners.push(cb); }
  function emitToListeners(ev) {
    listeners.forEach(cb => { try { cb(ev); } catch (e) { console.error('[Panopticon] listener error', e); } });
  }

  // ── History (sessionStorage) ───────────────────────────────────────
  // Events persist across navigations within the tab so a sign-in on The Eye
  // still shows up when you click over to Confessions. Cleared on tab close
  // — the Panopticon forgets when the session ends.

  let history = [];

  function loadHistory() {
    try {
      const raw = sessionStorage.getItem(HISTORY_STORAGE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      // ts serializes to ISO string; reconstitute Date instances so consumers
      // don't have to care how they got here.
      return arr.map(ev => ({ ...ev, ts: new Date(ev.ts) }));
    } catch (_) {
      return [];
    }
  }

  function saveHistory() {
    try {
      sessionStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    } catch (_) {
      // Storage full or disabled — history continues in memory for the page
    }
  }

  function appendHistory(ev) {
    history.push(ev);
    while (history.length > MAX_HISTORY) history.shift();
    saveHistory();
  }

  function replayHistory() {
    history = loadHistory();
    history.forEach(ev => emitToListeners(ev));
  }

  function clearHistory() {
    history = [];
    try { sessionStorage.removeItem(HISTORY_STORAGE_KEY); } catch (_) {}
  }

  // ── Socket ─────────────────────────────────────────────────────────

  function connect() {
    if (typeof io === 'undefined') {
      console.warn('[Panopticon] socket.io client not loaded — cannot connect to The Eye');
      return;
    }
    const sock = io();
    sock.on('connect', () => console.log('[Panopticon] connection to The Eye established'));
    sock.on('webhook event', (payload) => {
      const webhook = payload && payload.webhook ? payload.webhook : payload;
      const ev = classify(webhook);
      appendHistory(ev);
      maybePlaySound(ev);
      emitToListeners(ev);
    });
  }

  // ── Public API ─────────────────────────────────────────────────────

  window.Panopticon = { onEvent, toggleAudio, clearHistory, classify };

  document.addEventListener('DOMContentLoaded', () => {
    setupAudio();
    const btn = document.getElementById('pan-audio-toggle');
    if (btn) btn.addEventListener('click', toggleAudio);
    // Replay persisted events to listeners BEFORE connecting the socket, so
    // page renders in chronological order and live events naturally follow.
    replayHistory();
    connect();
  });
})();
