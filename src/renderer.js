/* renderer.js — Multi-tab, rilevamento automatico porte
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

// ─── COSTANTI ────────────────────────────────────────────────────────────────
const TERM_THEME_DARK = {
  background:'#0d1117', foreground:'#c9d1d9',
  cursor:'#58a6ff', cursorAccent:'#0d1117',
  selectionBackground:'rgba(88,166,255,.35)',
  black:'#0d1117',   brightBlack:'#6e7681',
  red:'#ff7b72',     brightRed:'#ffa198',
  green:'#3fb950',   brightGreen:'#56d364',
  yellow:'#d29922',  brightYellow:'#e3b341',
  blue:'#58a6ff',    brightBlue:'#79c0ff',
  magenta:'#bc8cff', brightMagenta:'#d2a8ff',
  cyan:'#39c5cf',    brightCyan:'#56d4dd',
  white:'#c9d1d9',   brightWhite:'#f0f6fc',
};

const TERM_THEME_LIGHT = {
  background:'#ffffff', foreground:'#24292f',
  cursor:'#0969da', cursorAccent:'#ffffff',
  selectionBackground:'rgba(9,105,218,.25)',
  black:'#24292f',   brightBlack:'#57606a',
  red:'#cf222e',     brightRed:'#a40e26',
  green:'#116329',   brightGreen:'#1a7f37',
  yellow:'#4d2d00',  brightYellow:'#633c01',
  blue:'#0969da',    brightBlue:'#218bff',
  magenta:'#8250df', brightMagenta:'#a475f9',
  cyan:'#1b7c83',    brightCyan:'#3192aa',
  white:'#6e7781',   brightWhite:'#8c959f',
};

const PBADGE = { '1':'P1','2':'P2','both':'1+2','active':'' };

// ─── STATO GLOBALE ────────────────────────────────────────────────────────────
let cfg = { tabs:[], activeTabId:null };
let activeTabId = null;
let editMode    = false;
let editingId   = null;       // id pulsante in modifica
let darkMode    = true;       // tema corrente

// tabState[tabId] = { terms:{1,2}, fits:{1,2}, connected:{1,2}, splitActive:bool }
const tabState = {};

// rilevamento porte
let availablePorts = [];
let lastPortPaths  = '';
let pollTimer      = null;

// porta attiva (1 o 2) — aggiornata cliccando sul pannello terminale
let focusedPort = 1;

// ─── STATO CONTATORE ─────────────────────────────────────────────────────────
let counterCfg = { title:'CNT', command:'', color:'#1e5f3a' };
let counterValue = 0;

// ─── STATO TELEFONO ──────────────────────────────────────────────────────────
let phoneCfg = { title:'TEL', command:'', color:'#5f3a1e' };

// ─── TASTI FUNZIONE F1–F12 ───────────────────────────────────────────────────
// Ogni slot: { label, command, portTarget, autoSend, enabled }
const FKEY_COUNT = 12;
let fkeyCfg = Array.from({ length: FKEY_COUNT }, (_, i) => ({
  label:      `F${i+1}`,
  command:    '',
  portTarget: 'active',
  autoSend:   true,
  enabled:    false,
}));

// ─── STATO LOG ───────────────────────────────────────────────────────────────
let logEnabled  = false;
let logFileName = '';   // vuoto = auto

// ─── STATO MDM ───────────────────────────────────────────────────────────────
let mdmListening    = false;   // true mentre aspettiamo la risposta del modem
let mdmBuffer       = '';      // accumula testo ricevuto durante l'interrogazione
let mdmPortNum      = 1;       // porta su cui è stato inviato il comando
let mdmTabId        = null;    // scheda su cui è stato inviato il comando
let mdmTimeout      = null;    // timer di timeout

// ─── IMPOSTAZIONI COLORI PULSANTI ─────────────────────────────────────────────
const COLOR_SETTINGS_DEFAULTS = {
  // ── Pulsanti esistenti ────────────────────────────────────────────────────
  cntText:    '#ffffff',
  telText:    '#ffffff',
  sendText:   '#0d1117',
  sendBg:     '#58a6ff',
  clrText:    '#8b949e',
  clrBg:      '#30363d',
  connText:   '#0d1117',
  disconnText:'#ffffff',
  sbText:     '#ffffff',
  // ── Finestra / chrome — null = segue il tema CSS ──────────────────────────
  windowBg:   null,
  sidebarBg:  null,
  tabBarBg:   null,
  inputBarBg: null,
  // ── Terminale (xterm) — null = segue il tema CSS ─────────────────────────
  termBg:     null,
  termFg:     null,
  termCursor: null,
  termSelBg:  null,
};

// Colori chrome per i due temi (usati come fallback quando null)
const CHROME_DARK  = { windowBg:'#0d1117', sidebarBg:'#161b22', tabBarBg:'#161b22', inputBarBg:'#0d1117' };
const CHROME_LIGHT = { windowBg:'#f0f4f8', sidebarBg:'#e2e8f0', tabBarBg:'#dde3ea', inputBarBg:'#f8fafc' };
const TERM_COLORS_DARK  = { termBg:'#0d1117', termFg:'#c9d1d9', termCursor:'#58a6ff', termSelBg:'#264f78' };
const TERM_COLORS_LIGHT = { termBg:'#ffffff', termFg:'#24292f', termCursor:'#0550ae', termSelBg:'#b6d4fe' };

let colorSettings = { ...COLOR_SETTINGS_DEFAULTS };


// ─── UTILITY ─────────────────────────────────────────────────────────────────
const uid  = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const esc  = s  => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const utcNow = () => {
  const d=new Date(), p=n=>String(n).padStart(2,'0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth()+1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
};
// Formato compatto: ddmmaa hhmmss (senza separatori)
const utcCompact = () => {
  const d=new Date(), p=n=>String(n).padStart(2,'0');
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${p(d.getUTCDate())}${p(d.getUTCMonth()+1)}${yy} ${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
};
const interp = cmd => cmd
  .replace(/\{UTC\}/gi,     utcNow())
  .replace(/\{UTCSHORT\}/gi, utcCompact());
const activeTab = ()  => cfg.tabs.find(t => t.id === activeTabId);
const lineEnding = () => {
  const v = document.getElementById('line-end').value;
  return v==='CRLF'?'\r\n':v==='CR'?'\r':v==='LF'?'\n':'';
};
// parsifica portId del tipo "tabId:portNum"
const parsePortId = id => {
  const i = id.lastIndexOf(':');
  return { tabId: id.slice(0,i), portNum: parseInt(id.slice(i+1)) };
};

function defaultPortSettings() {
  return {
    p1:{ connType:'serial', portPath:'', baudRate:115200, dataBits:8, parity:'none', stopBits:1, rtscts:false, echo:false,
         sshHost:'', sshPort:22, sshUser:'', sshPass:'', sshKey:'',
         telnetHost:'', telnetPort:23 },
    p2:{ connType:'serial', portPath:'', baudRate:115200, dataBits:8, parity:'none', stopBits:1, rtscts:false, echo:false,
         sshHost:'', sshPort:22, sshUser:'', sshPass:'', sshKey:'',
         telnetHost:'', telnetPort:23 },
    splitMode:false, lineEnd:'CRLF', activePort:'1',
  };
}

// ─── TEMA ─────────────────────────────────────────────────────────────────────
function applyTheme(dark) {
  darkMode = dark;
  document.body.classList.toggle('light-mode', !dark);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = dark ? '🌙' : '☀️';

  // Aggiorna tema xterm + chrome (rispetta colori personalizzati se presenti)
  applyColorSettings();
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

async function init() {
  try {
    const saved = await window.serialAPI.getConfig();
    if (saved && saved.tabs && saved.tabs.length > 0) {
      cfg = saved;
      // Ripristina tema
      if (saved.darkMode !== undefined) darkMode = saved.darkMode;
      // Ripristina contatore
      if (saved.counterCfg) counterCfg = saved.counterCfg;
      if (saved.counterValue !== undefined) counterValue = saved.counterValue;
      if (saved.phoneCfg) phoneCfg = saved.phoneCfg;
      if (saved.fkeyCfg && Array.isArray(saved.fkeyCfg)) {
        saved.fkeyCfg.forEach((k, i) => { if (fkeyCfg[i]) fkeyCfg[i] = { ...fkeyCfg[i], ...k }; });
      }
    }
  } catch(e) { console.warn('Config load:', e); }
  applyTheme(darkMode);

  if (!cfg.tabs || cfg.tabs.length === 0) {
    cfg.tabs = [];
    cfg.activeTabId = null;
    createTab('Scheda 1', null, true);
  } else {

    // Ricrea DOM e xterm per ogni scheda salvata

    cfg.tabs.forEach(t => {
      tabState[t.id] = { terms:{}, fits:{}, connected:{1:false,2:false},
        splitActive: t.portSettings?.splitMode  || false,
        splitRatio:  t.portSettings?.splitRatio || 50 };
      createTabTermGroup(t.id);
      setupTabTerminals(t.id);

    });
    activeTabId     = cfg.activeTabId || cfg.tabs[0].id;
    cfg.activeTabId = activeTabId;
    renderTabBar();

    // Mostra la scheda attiva

    document.querySelectorAll('.tab-term-group').forEach(g => g.classList.add('hidden'));
    const grp = document.querySelector(`.tab-term-group[data-tab="${activeTabId}"]`);
    if (grp) grp.classList.remove('hidden');
    restoreTabSettings(activeTabId);
    renderButtons();
    setTimeout(() => fitTab(activeTabId), 150);
  }
  setupPortEvents();
  setupListeners();
  startPortPolling();
  applyCounterCfg();
  applyPhoneCfg();
  applyColorSettings();
  syncCounterFields();
  window.addEventListener('resize', () => {

    setTimeout(() => fitTab(activeTabId), 50);

  });

}

// ═══════════════════════ SCHEDE ══════════════════════════════════════════════

// Crea una nuova scheda (opzionalmente non effettua switch)
function createTab(title, settings, andSwitch) {
  const id  = 'tab-' + uid();
  const tab = {
    id,
    title: title || `Scheda ${cfg.tabs.length + 1}`,
    buttons: settings?.buttons || [],
    portSettings: settings?.portSettings || defaultPortSettings(),
  };
  cfg.tabs.push(tab);
  tabState[id] = { terms:{}, fits:{}, connected:{1:false,2:false},
    splitActive: tab.portSettings.splitMode  || false,
    splitRatio:  tab.portSettings.splitRatio || 50 };
  createTabTermGroup(id);
  setupTabTerminals(id);
  renderTabBar();
  if (andSwitch !== false) switchTab(id);
  return id;
}

// Costruisce il DOM del gruppo terminali per questa scheda
function createTabTermGroup(tabId) {
  const area = document.getElementById('term-area');
  const grp  = document.createElement('div');
  grp.className  = 'tab-term-group hidden';
  grp.dataset.tab = tabId;
  grp.innerHTML = `
    <div class="term-panel" id="tp1-${tabId}" style="flex:1 1 50%">
      <div class="term-hdr">
        <span class="sdot disc" id="dot1-${tabId}">●</span>
        <span class="hdr-name">PORT 1</span>
        <span class="hdr-info" id="info1-${tabId}">Disconnessa</span>
        <span class="hdr-flex"></span>
        <button class="hdr-btn" onclick="clearTerm('${tabId}',1)"  title="Pulisci">⊗</button>
        <button class="hdr-btn" onclick="copyTerm('${tabId}',1)"   title="Copia selezione">⎘</button>
        <button class="hdr-btn" onclick="scrollEnd('${tabId}',1)"  title="Scorri in fondo">↓</button>
      </div>
      <div id="xterm1-${tabId}" class="xterm-host"></div>
    </div>
    <div class="term-divider hidden" id="tdiv-${tabId}" title="Trascina per ridimensionare"></div>
    <div class="term-panel hidden" id="tp2-${tabId}" style="flex:1 1 50%">
      <div class="term-hdr">
        <span class="sdot disc" id="dot2-${tabId}">●</span>
        <span class="hdr-name">PORT 2</span>
        <span class="hdr-info" id="info2-${tabId}">Disconnessa</span>
        <span class="hdr-flex"></span>
        <button class="hdr-btn" onclick="clearTerm('${tabId}',2)"  title="Pulisci">⊗</button>
        <button class="hdr-btn" onclick="copyTerm('${tabId}',2)"   title="Copia selezione">⎘</button>
        <button class="hdr-btn" onclick="scrollEnd('${tabId}',2)"  title="Scorri in fondo">↓</button>
      </div>
      <div id="xterm2-${tabId}" class="xterm-host"></div>
    </div>`;
  area.appendChild(grp);

  // Divider trascinabile
  const divider = grp.querySelector(`#tdiv-${tabId}`);
  const tp1     = grp.querySelector(`#tp1-${tabId}`);
  const tp2     = grp.querySelector(`#tp2-${tabId}`);
  _makeSplitterDraggable(divider, tp1, tp2, tabId);

  grp.querySelector(`#tp1-${tabId}`).addEventListener('click', () => setFocusedPort(1));
  grp.querySelector(`#tp2-${tabId}`).addEventListener('click', () => setFocusedPort(2));

  return grp;
}

/**
 * Rende il divider trascinabile per ridimensionare i due pannelli.
 * Salva il rapporto in tabState per sopravvivere al resize della finestra.
 */
function _makeSplitterDraggable(divider, tp1, tp2, tabId) {
  let dragging = false;
  let startX, startFlex1, startFlex2;

  divider.addEventListener('mousedown', e => {
    e.preventDefault();
    dragging  = true;
    startX    = e.clientX;
    // Leggi le flex-basis correnti in px
    startFlex1 = tp1.getBoundingClientRect().width;
    startFlex2 = tp2.getBoundingClientRect().width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx    = e.clientX - startX;
    const total = startFlex1 + startFlex2;
    // Calcola nuove larghezze con limiti min 15%
    let pct1 = Math.max(15, Math.min(85, ((startFlex1 + dx) / total) * 100));
    let pct2 = 100 - pct1;

    tp1.style.flex = `0 0 ${pct1}%`;
    tp2.style.flex = `0 0 ${pct2}%`;

    // Salva il rapporto nel tabState
    if (tabState[tabId]) tabState[tabId].splitRatio = pct1;

    // Ri-adatta entrambi i terminali durante il drag
    const st = tabState[tabId];
    if (st) {
      try { st.fits[1]?.fit(); } catch(_) {}
      try { st.fits[2]?.fit(); } catch(_) {}
    }
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    // Fit finale dopo il rilascio
    const st = tabState[tabId];
    if (st) {
      try { st.fits[1]?.fit(); } catch(_) {}
      try { st.fits[2]?.fit(); } catch(_) {}
    }
  });
}

/** Ripristina il rapporto split salvato per questa scheda. */
function _restoreSplitRatio(tabId) {
  const st    = tabState[tabId];
  const ratio = st?.splitRatio;
  if (!ratio) return;
  const tp1 = document.getElementById(`tp1-${tabId}`);
  const tp2 = document.getElementById(`tp2-${tabId}`);
  if (tp1) tp1.style.flex = `0 0 ${ratio}%`;
  if (tp2) tp2.style.flex = `0 0 ${100 - ratio}%`;
}

// Imposta la porta attiva in base al pannello cliccato
function setFocusedPort(pn) {
  focusedPort = pn;
  // Aggiorna il selettore active-port nella barra inferiore
  const sel = document.getElementById('active-port');
  if (sel) sel.value = String(pn);
  // Evidenzia visivamente il pannello attivo
  const tabId = activeTabId;
  [1,2].forEach(p => {
    const panel = document.getElementById(`tp${p}-${tabId}`);
    if (panel) panel.classList.toggle('term-panel-active', p === pn);
  });
  saveTabSettings(tabId);
}

// Inizializza le istanze xterm per la scheda
function setupTabTerminals(tabId) {
  const state = tabState[tabId];
  const theme = {
    ...(darkMode ? TERM_THEME_DARK : TERM_THEME_LIGHT),
    background: colorSettings.termBg     || (darkMode ? TERM_THEME_DARK.background  : TERM_THEME_LIGHT.background),
    foreground: colorSettings.termFg     || (darkMode ? TERM_THEME_DARK.foreground  : TERM_THEME_LIGHT.foreground),
    cursor:     colorSettings.termCursor || (darkMode ? TERM_THEME_DARK.cursor      : TERM_THEME_LIGHT.cursor),
    selectionBackground: colorSettings.termSelBg || (darkMode ? TERM_THEME_DARK.selectionBackground : TERM_THEME_LIGHT.selectionBackground),
  };
  [1, 2].forEach(pn => {
    const host = document.getElementById(`xterm${pn}-${tabId}`);
    if (!host) return;
    const term = new Terminal({ theme, fontFamily:"'Consolas','Courier New',monospace", fontSize:13, lineHeight:1.25, cursorBlink:true, scrollback:10000, convertEol:true });
    const fit  = new FitAddon.FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();
    state.terms[pn] = term;
    state.fits[pn]  = fit;

    // Notifica SSH del resize quando la finestra cambia dimensione
    term.onResize(({ cols, rows }) => {
      if (state.connected[pn] && state.connType?.[pn] === 'ssh') {
        window.serialAPI.resizeRemote({ portId:`${tabId}:${pn}`, cols, rows });
      }
    });

    // Digitazione diretta nel terminale → seriale o remoto (SSH/Telnet)
    term.onData(data => {
      if (!state.connected[pn]) return;
      const ctype = state.connType?.[pn] || 'serial';
      if (ctype === 'ssh' || ctype === 'telnet') {
        // Per SSH/Telnet invia i raw byte senza conversioni — il server gestisce tutto
        const bytes = Array.from(new TextEncoder().encode(data));
        window.serialAPI.writeRemote({ portId:`${tabId}:${pn}`, bytes });
      } else {
        let sendData = data;
        if (data === '\x7f') sendData = '\x08';
        const bytes = Array.from(new TextEncoder().encode(sendData));
        window.serialAPI.writePort({ portId:`${tabId}:${pn}`, bytes });
        const echoEl = document.getElementById(`p${pn}-echo`);
        if (echoEl?.checked && tabId === activeTabId) term.write(data);
      }
    });

    // Intercetta F1–F12 PRIMA che xterm li converta in escape sequence.
    // Se il tasto è configurato e attivo, esegue il comando e blocca xterm.
    term.attachCustomKeyEventHandler(e => {
      if (e.type !== 'keydown') return true;
      const fKeys = ['F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12'];
      const fIdx  = fKeys.indexOf(e.key);
      if (fIdx === -1) return true;           // non è un F-key → lascia passare
      const fk = fkeyCfg[fIdx];
      if (fk?.enabled && fk.command) {
        handleFkeyPress(fk);
        return false;                         // blocca xterm: non invia escape sequence
      }
      return true;                            // F-key non configurato → comportamento normale
    });

    // Click nel terminale → imposta porta attiva
    host.addEventListener('click', () => setFocusedPort(pn));

    const col = pn===1?'34':'35';
    term.writeln(`\x1b[1;${col}m╔══════════════════════════════╗\x1b[0m`);
    term.writeln(`\x1b[1;${col}m║  Serial Terminal Pro  PORT ${pn} ║\x1b[0m`);
    term.writeln(`\x1b[1;${col}m╚══════════════════════════════╝\x1b[0m\r\n`);
  });
}

// Switcha alla scheda indicata
async function switchTab(id) {
  if (!cfg.tabs.find(t => t.id === id)) return;
  if (activeTabId && activeTabId !== id) saveTabSettings(activeTabId);

  // Nascondi tutti i gruppi, mostra quello nuovo
  document.querySelectorAll('.tab-term-group').forEach(g => g.classList.add('hidden'));
  document.querySelector(`.tab-term-group[data-tab="${id}"]`)?.classList.remove('hidden');

  // Aggiorna tab bar
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.tab[data-id="${id}"]`)?.classList.add('active');

  activeTabId     = id;
  cfg.activeTabId = id;

  restoreTabSettings(id);
  renderButtons();
  updateConnectButtonsUI(id);
  updateSplitUI(id);
  if (tabState[id]?.splitActive) _restoreSplitRatio(id);
  _updatePortGearTooltip(1);
  _updatePortGearTooltip(2);

  setTimeout(() => fitTab(id), 100);
  await saveConfig();
}

// Chiude una scheda
// Stack delle schede chiuse (max 10) per il recupero
const _closedTabsStack = [];
const _CLOSED_TABS_MAX = 10;

async function closeTab(id) {
  if (cfg.tabs.length <= 1) return; // non chiudere l'ultima

  const tab = cfg.tabs.find(t => t.id === id);
  if (!tab) return;

  // ── Salva snapshot nel cestino PRIMA di chiudere ──────────────────────────
  const snapshot = {
    tab:          JSON.parse(JSON.stringify(tab)),
    portSettings: JSON.parse(JSON.stringify(tab.portSettings || defaultPortSettings())),
    closedAt:     Date.now(),
  };
  _closedTabsStack.push(snapshot);
  if (_closedTabsStack.length > _CLOSED_TABS_MAX) _closedTabsStack.shift();
  _updateReopenMenu();

  // Disconnetti porte aperte
  await window.serialAPI.closeTabPorts({ tabId: id });
  // Rimuovi DOM
  document.querySelector(`.tab-term-group[data-tab="${id}"]`)?.remove();
  document.querySelector(`.tab[data-id="${id}"]`)?.remove();
  // Rimuovi da cfg e state
  cfg.tabs = cfg.tabs.filter(t => t.id !== id);
  delete tabState[id];
  // Switcha ad altra scheda
  if (activeTabId === id) {
    const next = cfg.tabs[0];
    if (next) await switchTab(next.id);
  }
  renderTabBar();
  await saveConfig();
}
window.closeTab = closeTab;

/** Riapre l'ultima scheda chiusa dallo stack. */
async function reopenLastTab() {
  const snap = _closedTabsStack.pop();
  _updateReopenMenu();
  if (!snap) return;

  const t = snap.tab;
  // Assegna nuovo ID per evitare conflitti
  t.id = uid();
  t.portSettings = snap.portSettings;

  cfg.tabs.push(t);
  tabState[t.id] = { terms:{}, fits:{}, connected:{1:false,2:false},
    splitActive: snap.portSettings?.splitMode  || false,
    splitRatio:  snap.portSettings?.splitRatio || 50 };

  // createTabTermGroup appende già al DOM internamente
  createTabTermGroup(t.id);
  setupTabTerminals(t.id);
  await switchTab(t.id);
  renderTabBar();
  await saveConfig();
}

/** Aggiorna la voce "Riapri scheda" nel menu con l'elenco delle ultime chiuse. */
function _updateReopenMenu() {
  if (!_menuRef) return;
  const fileMenu = _menuRef.items.find(m => m.label === 'File');
  if (!fileMenu) return;

  // Ricostruisce il menu File con la sezione "Riapri scheda" aggiornata
  buildMenu();
}

// Riferimento al menu corrente (aggiornato da buildMenu)
let _menuRef = null;

// Rinomina scheda inline
function startRenameTab(tabId) {
  const tabEl  = document.querySelector(`.tab[data-id="${tabId}"]`);
  const span   = tabEl?.querySelector('.tab-title');
  if (!span) return;
  const prev = span.textContent;
  const inp  = document.createElement('input');
  inp.type = 'text'; inp.value = prev; inp.className = 'tab-rename-input';
  span.replaceWith(inp); inp.select();
  const commit = () => {
    const val = inp.value.trim() || prev;
    const newSpan = makeTabTitleSpan(tabId, val);
    inp.replaceWith(newSpan);
    const t = cfg.tabs.find(t => t.id === tabId);
    if (t) { t.title = val; saveConfig(); }
  };
  inp.addEventListener('keydown', e => {
    if (e.key==='Enter') inp.blur();
    if (e.key==='Escape') { inp.value=prev; inp.blur(); }
  });
  inp.addEventListener('blur', commit);
  inp.focus();
}

function makeTabTitleSpan(tabId, title) {
  const s = document.createElement('span');
  s.className = 'tab-title';
  s.textContent = title;
  s.title = 'Doppio click per rinominare';
  s.addEventListener('dblclick', e => { e.stopPropagation(); startRenameTab(tabId); });
  return s;
}

// Renderizza la tab bar
function renderTabBar() {
  const container = document.getElementById('tabs-container');
  container.innerHTML = '';
  cfg.tabs.forEach(tab => {
    const el   = document.createElement('div');
    el.className = `tab${tab.id === activeTabId ? ' active' : ''}`;
    el.dataset.id = tab.id;

    // Pallino stato connessione
    const state = tabState[tab.id];
    const hasConn = state && (state.connected[1] || state.connected[2]);
    const dot = document.createElement('span');
    dot.className = `tab-dot ${hasConn ? 'has-conn' : 'no-conn'}`;
    dot.textContent = '●';

    el.appendChild(dot);
    el.appendChild(makeTabTitleSpan(tab.id, tab.title));

    // Tasto chiudi (solo se ci sono più di 1 scheda)
    if (cfg.tabs.length > 1) {
      const x = document.createElement('button');
      x.className = 'tab-close'; x.textContent = '×'; x.title = 'Chiudi scheda';
      x.addEventListener('click', e => { e.stopPropagation(); closeTab(tab.id); });
      el.appendChild(x);
    }

    el.addEventListener('click', () => switchTab(tab.id));
    container.appendChild(el);
  });

  // Aggiorna visibilità frecce dopo il render
  container.dispatchEvent(new Event('scroll'));
}

// ═══════════════════════ RILEVAMENTO PORTE ═══════════════════════════════════

function startPortPolling() {
  pollPorts(); // prima chiamata immediata
  pollTimer = setInterval(pollPorts, 2000);
}

async function pollPorts() {
  try {
    const res   = await window.serialAPI.listPorts();
    const ports = res?.ports || [];
    const paths = ports.map(p=>p.path).sort().join(',');
    if (paths === lastPortPaths) return;
    lastPortPaths  = paths;
    availablePorts = ports;
    updatePortDropdowns(ports);
    updatePortBadgeArea(ports);
    // Notifica nel terminale attivo se le porte cambiano durante l'uso
    if (activeTabId && lastPortPaths !== '') {
      const st = tabState[activeTabId];
      if (st?.terms[1]) {
        const names = ports.length ? ports.map(p=>p.path).join(', ') : 'nessuna';
        st.terms[1].writeln(`\x1b[2;36m[AUTO] Porte disponibili: ${names}\x1b[0m`);
      }
    }
  } catch(_) {}
}

function updatePortDropdowns(ports) {
  [1, 2].forEach(pn => {
    const sel  = document.getElementById(`p${pn}-com`);
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">— Seleziona porta —</option>';
    ports.forEach(p => {
      const o = document.createElement('option');
      o.value = p.path;
      o.textContent = p.friendlyName ? `${p.path}  (${p.friendlyName.slice(0,26)})` : p.path;
      sel.appendChild(o);
    });
    if (prev && ports.find(p=>p.path===prev)) sel.value = prev;
  });
}

function updatePortBadgeArea(ports) {
  const area = document.getElementById('port-badge-area');
  if (!area) return;
  area.innerHTML = '';
  if (ports.length === 0) {
    const s = document.createElement('span');
    s.style.cssText = 'font-size:10px;color:var(--txt2)';
    s.textContent = 'Nessuna porta';
    area.appendChild(s);
    return;
  }
  ports.forEach(p => {
    const b = document.createElement('span');
    b.className = 'port-badge available';
    b.textContent = p.path;
    b.title = p.friendlyName || p.path;
    area.appendChild(b);
  });
}

// ═══════════════════════ CONNESSIONE PORTE ═══════════════════════════════════

function portOpts(pn) {
  const tab = cfg.tabs.find(t => t.id === activeTabId);
  const ps  = tab?.portSettings?.[`p${pn}`] || defaultPortSettings()[`p${pn}`];
  return {
    connType:    ps.connType    || 'serial',
    // serial
    portPath:    document.getElementById(`p${pn}-com`)?.value || ps.portPath,
    baudRate:    ps.baudRate,   dataBits: ps.dataBits,
    parity:      ps.parity,     stopBits: ps.stopBits,
    rtscts:      ps.rtscts,     echo:     ps.echo,
    // ssh
    sshHost:     ps.sshHost,    sshPort:  ps.sshPort,
    sshUser:     ps.sshUser,    sshPass:  ps.sshPass,
    sshKey:      ps.sshKey,
    // telnet
    telnetHost:  ps.telnetHost, telnetPort: ps.telnetPort,
  };
}

async function connectPort(pn) {
  const tabId = activeTabId;
  const o     = portOpts(pn);
  const btn   = document.getElementById(`p${pn}-connect`);
  btn.textContent = 'Connessione…'; btn.disabled = true;

  let res;

  if (o.connType === 'ssh') {
    if (!o.sshHost) { alert(`Inserisci host SSH per PORT ${pn}`); btn.textContent='CONNECT'; btn.disabled=false; return; }
    res = await window.serialAPI.connectSsh({
      portId: `${tabId}:${pn}`,
      host: o.sshHost, port: o.sshPort,
      username: o.sshUser, password: o.sshPass,
      privateKey: o.sshKey || undefined,
    });
    if (res.success) {
      tabState[tabId].connected[pn] = true;
      tabState[tabId].connType = tabState[tabId].connType || {};
      tabState[tabId].connType[pn] = 'ssh';
      setConnUI(tabId, pn, true, `${o.sshUser}@${o.sshHost}`, o.sshPort);
      setCtrlsEnabled(pn, false);
      saveTabSettings(tabId);
      renderTabBar();
    }

  } else if (o.connType === 'telnet') {
    if (!o.telnetHost) { alert(`Inserisci host Telnet per PORT ${pn}`); btn.textContent='CONNECT'; btn.disabled=false; return; }
    res = await window.serialAPI.connectTelnet({
      portId: `${tabId}:${pn}`,
      host: o.telnetHost, port: o.telnetPort,
    });
    if (res.success) {
      tabState[tabId].connected[pn] = true;
      tabState[tabId].connType = tabState[tabId].connType || {};
      tabState[tabId].connType[pn] = 'telnet';
      setConnUI(tabId, pn, true, `${o.telnetHost}:${o.telnetPort}`, 0);
      setCtrlsEnabled(pn, false);
      saveTabSettings(tabId);
      renderTabBar();
    }

  } else {
    // Seriale — comportamento originale
    if (!o.portPath) { alert(`Seleziona una porta COM per PORT ${pn}`); btn.textContent='CONNECT'; btn.disabled=false; return; }
    res = await window.serialAPI.connectPort({ portId:`${tabId}:${pn}`, portPath:o.portPath, options:o });
    if (res.success) {
      tabState[tabId].connected[pn] = true;
      tabState[tabId].connType = tabState[tabId].connType || {};
      tabState[tabId].connType[pn] = 'serial';
      setConnUI(tabId, pn, true, o.portPath, o.baudRate);
      setCtrlsEnabled(pn, false);
      saveTabSettings(tabId);
      renderTabBar();
    }
  }

  btn.disabled = false;
  if (!res?.success) {
    termErr(tabId, pn, `Errore connessione: ${res?.error || 'sconosciuto'}`);
    setConnUI(tabId, pn, false);
  }
}

async function disconnectPort(pn) {
  const tabId  = activeTabId;
  const ctype  = tabState[tabId]?.connType?.[pn] || 'serial';
  let res;
  if (ctype === 'ssh' || ctype === 'telnet') {
    res = await window.serialAPI.disconnectRemote({ portId:`${tabId}:${pn}` });
  } else {
    res = await window.serialAPI.disconnectPort({ portId:`${tabId}:${pn}` });
  }
  if (res.success) {
    tabState[tabId].connected[pn] = false;
    setConnUI(tabId, pn, false);
    setCtrlsEnabled(pn, true);
    termInfo(tabId, pn, 'Disconnessa.');
    renderTabBar();
  } else {
    termErr(tabId, pn, `Errore disconnessione: ${res.error}`);
  }
}

function setConnUI(tabId, pn, on, portName='', baud=0) {
  if (tabId !== activeTabId) return;
  const btn  = document.getElementById(`p${pn}-connect`);
  const dot  = document.getElementById(`dot${pn}-${tabId}`);
  const info = document.getElementById(`info${pn}-${tabId}`);
  if (btn)  { btn.textContent=on?'DISCONNECT':'CONNECT'; btn.className=`conn-btn ${on?'conn':'disc'}`; }
  if (dot)  dot.className = `sdot ${on?'conn':'disc'}`;
  if (info) info.textContent = on ? `${portName} @ ${baud.toLocaleString()} baud` : 'Disconnessa';
  if (on) termOk(tabId, pn, `Connessa: ${portName} @ ${baud} baud`);
}

function updateConnectButtonsUI(tabId) {
  const state = tabState[tabId];
  if (!state) return;
  [1,2].forEach(pn => {
    const on  = state.connected[pn];
    const btn = document.getElementById(`p${pn}-connect`);
    if (btn) { btn.textContent=on?'DISCONNECT':'CONNECT'; btn.className=`conn-btn ${on?'conn':'disc'}`; }
    setCtrlsEnabled(pn, !on);
  });
}

function setCtrlsEnabled(pn, on) {
  ['com','baud','data','parity','stop','flow'].forEach(f => {
    const el = document.getElementById(`p${pn}-${f}`);
    if (el) el.disabled = !on;
  });
}

// ═══════════════════════ MDM — INTERROGAZIONE MODEM ══════════════════════════

// Avvia l'interrogazione del modem: invia "AT+CGSN" e "AT+QGMR" (o "ATI")
// e poi raccoglie la risposta per estrarre IMEI e versione FW.
async function handleMdmClick() {
  const tabId = activeTabId;
  const active = document.getElementById('active-port').value;
  const pn = active === '2' ? 2 : 1;
  const st = tabState[tabId];

  if (!st?.connected[pn]) {
    termErr(tabId, pn, 'MDM: porta non connessa.');
    return;
  }

  // Pulisce i campi
  document.getElementById('mdm-imei').value = '';
  document.getElementById('mdm-fw').value   = '';

  // Avvia la modalità ascolto
  mdmListening = true;
  mdmBuffer    = '';
  mdmPortNum   = pn;
  mdmTabId     = tabId;

  // Timeout di sicurezza: dopo 5 secondi smette di ascoltare
  if (mdmTimeout) clearTimeout(mdmTimeout);
  mdmTimeout = setTimeout(() => {
    if (mdmListening) {
      mdmListening = false;
      parseMdmBuffer(mdmBuffer);
    }
  }, 5000);

  const le = lineEnding();
  // Invia il comando "modem" che fa stampare IMEI e versione FW
  await writePort(tabId, pn, 'modem' + le);
}

// Analizza il buffer accumulato ed estrae IMEI e versione FW
function parseMdmBuffer(text) {
  // Rimuove sequenze ANSI escape e caratteri di controllo non utili
  const clean = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\r/g, '\n');
  const lines = clean.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  let imei = '';
  let fw   = '';

  for (const line of lines) {
    // Cerca IMEI dopo "imei:" (case-insensitive)
    if (!imei) {
      const mImei = line.match(/imei\s*:\s*(.+)/i);
      if (mImei) {
        imei = mImei[1].trim();
      }
    }
    // Cerca versione FW dopo "ver(QGMR):" oppure "revisione fw:" (case-insensitive)
    if (!fw) {
      const mFw = line.match(/(?:ver\(QGMR\)|revisione\s+fw)\s*:\s*(.+)/i);
      if (mFw) {
        fw = mFw[1].trim();
      }
    }
  }

  // Se non trovato con etichetta, prova a riconoscere l'IMEI come sequenza di 15 cifre
  if (!imei) {
    for (const line of lines) {
      if (/^\d{15}$/.test(line)) {
        imei = line;
        break;
      }
    }
  }

  if (imei) document.getElementById('mdm-imei').value = imei;
  if (fw)   document.getElementById('mdm-fw').value   = fw;
}

// ─── EVENTI PORTA (main → renderer) ──────────────────────────────────────────
function setupPortEvents() {
  window.serialAPI.onPortData(({ portId, bytes }) => {
    const { tabId, portNum } = parsePortId(portId);
    const st = tabState[tabId];
    if (!st) return;
    const text = new TextDecoder('utf-8',{fatal:false}).decode(new Uint8Array(bytes));
    st.terms[portNum]?.write(text);

    // Accumula nel buffer MDM se stiamo aspettando la risposta
    if (mdmListening && tabId === mdmTabId && portNum === mdmPortNum) {
      mdmBuffer += text;
      // Controlla se abbiamo già entrambi i valori per terminare prima del timeout
      const cleanBuf = mdmBuffer.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\r/g, '\n');
      const hasImei = /imei\s*:/i.test(cleanBuf) || /^\d{15}$/m.test(cleanBuf);
      const hasFw   = /(?:ver\(QGMR\)|revisione\s+fw)\s*:/i.test(cleanBuf);
      if (hasImei && hasFw) {
        mdmListening = false;
        if (mdmTimeout) { clearTimeout(mdmTimeout); mdmTimeout = null; }
        parseMdmBuffer(mdmBuffer);
      }
    }
  });

  window.serialAPI.onPortClosed(({ portId }) => {
    const { tabId, portNum } = parsePortId(portId);
    const st = tabState[tabId];
    if (!st || !st.connected[portNum]) return;
    st.connected[portNum] = false;
    if (tabId === activeTabId) {
      setConnUI(tabId, portNum, false);
      setCtrlsEnabled(portNum, true);
    }
    termInfo(tabId, portNum, 'Connessione chiusa dal dispositivo.');
    renderTabBar();
  });

  window.serialAPI.onPortError(({ portId, error }) => {
    const { tabId, portNum } = parsePortId(portId);
    termErr(tabId, portNum, `Errore porta: ${error}`);
  });
}

// ─── SCRITTURA ────────────────────────────────────────────────────────────────
async function writePort(tabId, pn, text) {
  const st = tabState[tabId];
  if (!st?.connected[pn]) { termErr(tabId, pn, 'Porta non connessa.'); return false; }
  const bytes = Array.from(new TextEncoder().encode(text));
  const res   = await window.serialAPI.writePort({ portId:`${tabId}:${pn}`, bytes });
  if (!res.success) termErr(tabId, pn, `Errore scrittura: ${res.error}`);
  return res.success;
}

async function writeTarget(text, target) {
  const tabId  = activeTabId;
  const active = document.getElementById('active-port').value;
  const t = target==='active' ? active : target;
  if (t==='1'||t==='both') await writePort(tabId, 1, text);
  if (t==='2'||t==='both') await writePort(tabId, 2, text);
}

// ═══════════════════════ SPLIT MODE ══════════════════════════════════════════

function toggleSplit() {
  const tabId = activeTabId;
  const st    = tabState[tabId];
  if (!st) return;
  st.splitActive = !st.splitActive;
  const tab = cfg.tabs.find(t=>t.id===tabId);
  if (tab) tab.portSettings.splitMode = st.splitActive;
  updateSplitUI(tabId);
  setTimeout(() => fitTab(tabId), 120);
  saveConfig();
}

function updateSplitUI(tabId) {
  const st = tabState[tabId];
  if (!st) return;
  const on = st.splitActive;
  document.getElementById(`tp2-${tabId}`)?.classList.toggle('hidden', !on);
  document.getElementById(`tdiv-${tabId}`)?.classList.toggle('hidden', !on);
  document.getElementById('pg2').classList.toggle('hidden', !on);
  document.getElementById('split-btn').classList.toggle('active', on);
  document.getElementById('split-btn').title = on ? 'Disattiva schermo diviso' : 'Attiva schermo diviso';
  const p2 = document.getElementById('active-port').querySelector('[value="2"]');
  const pb = document.getElementById('active-port').querySelector('[value="both"]');
  if (p2) p2.disabled = !on;
  if (pb) pb.disabled = !on;

  // Ripristina il rapporto e ri-adatta entrambi i terminali
  if (on) {
    _restoreSplitRatio(tabId);
    requestAnimationFrame(() => {
      try { st.fits[1]?.fit(); } catch(_) {}
      try { st.fits[2]?.fit(); } catch(_) {}
    });
  } else {
    // Torna al full-width: rimuovi lo stile inline per non lasciare
    // residui di ratio precedenti (es. flex: 0 0 50%) sul pannello
    const tp1 = document.getElementById(`tp1-${tabId}`);
    if (tp1) tp1.style.flex = '';
    requestAnimationFrame(() => { try { st.fits[1]?.fit(); } catch(_) {} });
  }
}

// ═══════════════════════ IMPOSTAZIONI SCHEDA ═════════════════════════════════

function saveTabSettings(tabId) {
  const tab = cfg.tabs.find(t=>t.id===tabId);
  if (!tab) return;
  const prev = tab.portSettings || defaultPortSettings();
  tab.portSettings = {
    p1: { ...prev.p1,
          portPath: document.getElementById('p1-com')?.value || prev.p1?.portPath || '',
          echo:     document.getElementById('p1-echo')?.checked ?? prev.p1?.echo ?? false },
    p2: { ...prev.p2,
          portPath: document.getElementById('p2-com')?.value || prev.p2?.portPath || '',
          echo:     document.getElementById('p2-echo')?.checked ?? prev.p2?.echo ?? false },
    splitMode:  tabState[tabId]?.splitActive || false,
    splitRatio: tabState[tabId]?.splitRatio  || 50,
    lineEnd:    document.getElementById('line-end')?.value   || prev.lineEnd,
    activePort: document.getElementById('active-port')?.value || prev.activePort,
  };
}

function restoreTabSettings(tabId) {
  const tab = cfg.tabs.find(t=>t.id===tabId);
  const ps  = tab?.portSettings || defaultPortSettings();

  [1,2].forEach(pn => {
    const p = ps[`p${pn}`];
    if (!p) return;
    const sel = document.getElementById(`p${pn}-com`);
    if (p.portPath && sel) {
      if (![...sel.options].find(o=>o.value===p.portPath)) {
        const o=document.createElement('option'); o.value=p.portPath; o.textContent=p.portPath; sel.appendChild(o);
      }
      sel.value = p.portPath;
    }
    // Campi serial dettagliati: aggiorna il DOM solo se gli elementi esistono
    const set = (id,v) => { const el=document.getElementById(id); if(el&&v!==undefined) el.value=v; };
    set(`p${pn}-baud`,   p.baudRate);
    set(`p${pn}-data`,   p.dataBits);
    set(`p${pn}-parity`, p.parity);
    set(`p${pn}-stop`,   p.stopBits);
    const flowEl = document.getElementById(`p${pn}-flow`);
    if (flowEl) flowEl.value = p.rtscts ? 'rtscts' : 'none';
    const echoEl = document.getElementById(`p${pn}-echo`);
    if (echoEl) echoEl.checked = p.echo || false;
  });

  const set2 = (id,v) => { const el=document.getElementById(id); if(el&&v) el.value=v; };
  set2('line-end',    ps.lineEnd);
  set2('active-port', ps.activePort);
}

async function saveConfig() {
  const data = {
    ...cfg,
    darkMode,
    counterCfg,
    counterValue,
    phoneCfg,
    fkeyCfg,
  };
  await window.serialAPI.saveConfig(data);
}

// ═══════════════════════ CLICK PULSANTE ══════════════════════════════════════
// autoSend ON  → [cmd][cmdbar][le]  inviato alla porta
// autoSend OFF → [cmd][spazio?][cmdbar] messo nella barra (l'utente completa)

async function handleButtonClick(btn) {
  const cmd    = interp(btn.command || '');
  const target = btn.portTarget || 'active';
  const le     = lineEnding();
  const input  = document.getElementById('user-input');
  const cmdbar = input.value;

  if (btn.autoSend !== false) {
    // Aggiunge uno spazio tra il comando del pulsante e il testo della barra
    const sp = (cmd && cmdbar) ? ' ' : '';
    await writeTarget(cmd + sp + cmdbar + le, target);
  } else {
    const sp = btn.addSpace ? ' ' : '';
    input.value = cmd + sp + cmdbar;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    return; // non focalizzare il terminale se stiamo editando la barra
  }
  // Riporta il focus al terminale attivo
  focusActiveTerminal();
}

// Porta il focus al terminale della porta attiva
function focusActiveTerminal() {
  const tabId = activeTabId;
  const st = tabState[tabId];
  if (!st) return;
  const pn = focusedPort || 1;
  st.terms[pn]?.focus();
}

// ═══════════════════════ RENDERING PULSANTI ══════════════════════════════════

function sortedButtons() {
  const tab = activeTab();
  return tab ? [...tab.buttons].sort((a,b)=>(a.order??999)-(b.order??999)) : [];
}

// ─── POSIZIONAMENTO LIBERO SU GRIGLIA 4 COLONNE ───────────────────────────────

/**
 * Costruisce una mappa di occupazione {row:col → true} dai pulsanti
 * che hanno già una posizione assegnata.
 */
function buildOccupancy(buttons) {
  const occ = new Set();
  buttons.forEach(b => {
    if (b.gridRow && b.gridCol) {
      const w = Math.max(1, b.colWidth || 1);
      for (let dc = 0; dc < w; dc++) occ.add(`${b.gridRow}:${b.gridCol + dc}`);
    }
  });
  return occ;
}

/**
 * Trova il primo slot libero nella griglia 4-colonne che può contenere
 * un pulsante largo `colWidth` celle.
 */
function findNextSlot(colWidth, occupied) {
  const w = Math.max(1, Math.min(4, colWidth));
  for (let row = 1; row <= 200; row++) {
    for (let col = 1; col <= 4 - w + 1; col++) {
      let fits = true;
      for (let dc = 0; dc < w; dc++) {
        if (occupied.has(`${row}:${col + dc}`)) { fits = false; break; }
      }
      if (fits) return { row, col };
    }
  }
  return { row: 1, col: 1 };
}

/**
 * Assegna gridRow/gridCol ai pulsanti che non ce li hanno ancora,
 * riempiendo gli slot liberi dall'alto verso il basso.
 */
function autoAssignPositions(buttons) {
  const occ = buildOccupancy(buttons);
  buttons.forEach(btn => {
    if (btn.gridRow && btn.gridCol) return;
    const w   = Math.max(1, btn.colWidth || 1);
    const pos = findNextSlot(w, occ);
    btn.gridRow = pos.row;
    btn.gridCol = pos.col;
    for (let dc = 0; dc < w; dc++) occ.add(`${pos.row}:${pos.col + dc}`);
  });
}

function renderButtons() {
  const list = document.getElementById('btn-list');
  list.innerHTML = '';

  // Forza griglia 4 colonne con altezza riga fissa (usata anche per il drag)
  list.style.display              = 'grid';
  list.style.gridTemplateColumns  = 'repeat(4, 1fr)';
  list.style.gridAutoRows         = `var(--btn-row-h, 52px)`;
  list.style.gap                  = '4px';

  const sorted = sortedButtons();

  // Assicura che tutti abbiano una posizione
  autoAssignPositions(sorted);

  if (editMode) {
    list.addEventListener('dragover', onListDragOver);
    list.addEventListener('drop',     onListDrop);
  }

  sorted.forEach(btn => {
    const wrap = document.createElement('div');
    wrap.className  = 'sbw';
    wrap.dataset.id = btn.id;

    const gridCol  = Math.max(1, Math.min(4, btn.gridCol || 1));
    const gridRow  = Math.max(1, btn.gridRow || 1);
    const colWidth = Math.max(1, Math.min(5 - gridCol, btn.colWidth || 1));

    wrap.style.gridColumn = `${gridCol} / span ${colWidth}`;
    wrap.style.gridRow    = String(gridRow);

    if (editMode) {
      wrap.draggable = true;
      wrap.addEventListener('dragstart', onDragStart);
      wrap.addEventListener('dragover',  onDragOver);
      wrap.addEventListener('drop',      onDrop);
      wrap.addEventListener('dragend',   onDragEnd);
    }

    const el = document.createElement('div');
    el.className = `sb-btn sz-${btn.size || 'medium'}`;
    el.style.backgroundColor = btn.color || '#1e3a5f';
    el.title = btn.autoSend !== false ? `⚡ ${btn.command}` : `✏ ${btn.command}`;
    const icon  = btn.autoSend !== false ? '⚡' : (btn.addSpace ? '↳' : '✏');
    const badge = PBADGE[btn.portTarget] || '';
    el.innerHTML = `
      <span class="sb-btn-icon"  style="color:${colorSettings.sbText}">${icon}</span>
      <span class="sb-btn-title" style="color:${colorSettings.sbText}">${esc(btn.title)}</span>
      <span class="sb-btn-port">${badge}</span>`;

    if (editMode) {
      const editIcon = document.createElement('button');
      editIcon.className   = 'sb-edit-icon';
      editIcon.textContent = '✎';
      editIcon.title       = 'Modifica pulsante';
      editIcon.addEventListener('click', e => { e.stopPropagation(); openEditor(btn); });
      el.appendChild(editIcon);
      el.addEventListener('click', () => openEditor(btn));
    } else {
      el.addEventListener('click', () => handleButtonClick(btn));
    }

    wrap.appendChild(el);
    list.appendChild(wrap);
  });
}

// ─── DRAG AND DROP — posizionamento libero ────────────────────────────────────
// In edit mode l'utente trascina un pulsante e lo "posa" in qualsiasi
// cella della griglia 4×N.  L'indicatore di drop viene piazzato come
// un elemento grid nella posizione bersaglio, così il layout CSS lo
// mostra esattamente dove andrà il pulsante.

let dragSrcId      = null;
let dragTargetRow  = 1;
let dragTargetCol  = 1;

function getDropIndicator() {
  let ind = document.getElementById('drag-drop-indicator');
  if (!ind) {
    ind = document.createElement('div');
    ind.id        = 'drag-drop-indicator';
    ind.className = 'drag-drop-indicator';
  }
  return ind;
}

function removeDropIndicator() {
  document.getElementById('drag-drop-indicator')?.remove();
}

/** Calcola riga e colonna bersaglio dal mouse rispetto alla griglia. */
function calcDropCell(e) {
  const list    = document.getElementById('btn-list');
  const rect    = list.getBoundingClientRect();
  const tab     = activeTab();
  const srcBtn  = tab?.buttons.find(b => b.id === dragSrcId);
  const cw      = srcBtn ? Math.max(1, srcBtn.colWidth || 1) : 1;

  // Colonna (1-4), spostata per non sforare il bordo destro
  const cellW = rect.width / 4;
  let col = Math.floor((e.clientX - rect.left) / cellW) + 1;
  col = Math.max(1, Math.min(4 - cw + 1, col));

  // Riga: usa l'altezza CSS della riga (var --btn-row-h + gap)
  const rowH = (parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--btn-row-h')
  ) || 52) + 4; // +4px gap
  const relY = e.clientY - rect.top + list.scrollTop;
  let row = Math.max(1, Math.floor(relY / rowH) + 1);

  return { row, col, cw };
}

function onDragStart(e) {
  dragSrcId = this.dataset.id;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragSrcId);
}

function onDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'move';
  _updateDropIndicator(e);
}

function onListDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  _updateDropIndicator(e);
}

function _updateDropIndicator(e) {
  const { row, col, cw } = calcDropCell(e);
  if (row === dragTargetRow && col === dragTargetCol) return;
  dragTargetRow = row;
  dragTargetCol = col;

  const ind  = getDropIndicator();
  const list = document.getElementById('btn-list');
  ind.style.gridColumn = `${col} / span ${cw}`;
  ind.style.gridRow    = String(row);
  if (!ind.parentElement) list.appendChild(ind);
}

function onDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  _commitDrop(e);
}

function onListDrop(e) {
  e.preventDefault();
  _commitDrop(e);
}

function _commitDrop(e) {
  removeDropIndicator();
  if (!dragSrcId) return;
  const tab = activeTab(); if (!tab) return;

  const { row, col } = calcDropCell(e);
  const btn = tab.buttons.find(b => b.id === dragSrcId);
  if (btn) {
    btn.gridRow = row;
    btn.gridCol = col;
  }

  saveConfig();
  renderButtons();
}

function onDragEnd() {
  removeDropIndicator();
  document.querySelectorAll('.sbw').forEach(w => w.classList.remove('dragging'));
  dragSrcId     = null;
  dragTargetRow = 1;
  dragTargetCol = 1;
}

// ═══════════════════════ EDITOR PULSANTI ═════════════════════════════════════

function openEditor(btn=null) {
  editingId = btn?.id ?? null;
  document.getElementById('modal-title').textContent = btn ? 'Modifica Pulsante' : 'Nuovo Pulsante';
  document.getElementById('f-title').value      = btn?.title      || '';
  document.getElementById('f-cmd').value        = btn?.command    || '';
  document.getElementById('f-color').value      = btn?.color      || '#1e3a5f';
  document.getElementById('f-port').value       = btn?.portTarget || 'active';
  const autoSend = btn ? btn.autoSend !== false : true;
  document.getElementById('f-autosend').checked = autoSend;
  document.getElementById('f-space').checked    = btn?.addSpace || false;
  document.getElementById('space-opt').classList.toggle('hidden', autoSend);

  const size = btn?.size || 'medium';
  document.querySelectorAll('input[name="f-size"]').forEach(r => r.checked = (r.value === size));

  // ── colWidth 1-4: aggiorna i radio se il DOM ha ancora solo 1-2 ──────────
  _ensureWidthRadios();
  const colWidth = String(btn?.colWidth || '1');
  document.querySelectorAll('input[name="f-width"]').forEach(r => r.checked = (r.value === colWidth));

  // ── Posizione griglia: riga e colonna ─────────────────────────────────────
  const tab    = activeTab();
  const sorted = sortedButtons();
  autoAssignPositions(sorted);

  // Garantisce che f-row e f-col esistano nel form
  _ensureGridPosFields();

  const rowEl = document.getElementById('f-row') || document.getElementById('f-order');
  const colEl = document.getElementById('f-col');
  if (rowEl) {
    rowEl.value = btn?.gridRow ?? _nextFreeRow(tab?.buttons || []);
    rowEl.min   = 1;
    const lbl = document.querySelector(`label[for="${rowEl.id}"]`);
    if (lbl && rowEl.id === 'f-order') lbl.textContent = 'Riga';
  }
  if (colEl) {
    colEl.value = btn?.gridCol ?? 1;
    colEl.min   = 1;
    colEl.max   = 4;
  }

  document.getElementById('m-delete').classList.toggle('hidden', !btn);
  document.getElementById('overlay').classList.remove('hidden');
  document.getElementById('f-title').focus();
}

/** Restituisce la prima riga completamente libera. */
function _nextFreeRow(buttons) {
  const occ = buildOccupancy(buttons);
  for (let row = 1; row <= 200; row++) {
    let free = true;
    for (let col = 1; col <= 4; col++) {
      if (occ.has(`${row}:${col}`)) { free = false; break; }
    }
    if (free) return row;
  }
  return 1;
}

/**
 * Se il contenitore dei radio f-width ha solo le opzioni 1 e 2 (vecchio HTML),
 * le sostituisce aggiungendo 3 e 4.
 */
function _ensureWidthRadios() {
  const existing = [...document.querySelectorAll('input[name="f-width"]')].map(r => r.value);
  if (existing.includes('3') && existing.includes('4')) return; // già aggiornato

  // Trova il contenitore del primo radio f-width
  const first = document.querySelector('input[name="f-width"]');
  if (!first) return;
  const container = first.closest('div, fieldset, span, label')?.parentElement || first.parentElement;

  container.innerHTML = `
    <label><input type="radio" name="f-width" value="1"> 1</label>
    <label><input type="radio" name="f-width" value="2"> 2</label>
    <label><input type="radio" name="f-width" value="3"> 3</label>
    <label><input type="radio" name="f-width" value="4"> 4</label>`;
}

/**
 * Aggiunge al modal i campi f-row e f-col se non esistono ancora nell'HTML.
 * Si inserisce dopo il campo f-order (se esiste) o in fondo al form.
 */
function _ensureGridPosFields() {
  if (document.getElementById('f-row') && document.getElementById('f-col')) return;

  // Punto di inserimento: dopo f-order, o in fondo all'ultimo fieldset/div del form
  const anchor = document.getElementById('f-order')?.closest('div,p,tr,label')
               || document.getElementById('m-save')?.previousElementSibling;
  if (!anchor) return;

  const wrapper = document.createElement('div');
  wrapper.id    = 'grid-pos-fields';
  wrapper.style.cssText = 'display:flex;gap:12px;margin-top:6px;align-items:center';
  wrapper.innerHTML = `
    <label for="f-row" style="font-size:12px;white-space:nowrap">Riga
      <input id="f-row" type="number" min="1" value="1"
             style="width:52px;margin-left:4px">
    </label>
    <label for="f-col" style="font-size:12px;white-space:nowrap">Colonna (1-4)
      <input id="f-col" type="number" min="1" max="4" value="1"
             style="width:52px;margin-left:4px">
    </label>`;
  anchor.after(wrapper);
}

function closeEditor() {
  document.getElementById('overlay').classList.add('hidden');
  editingId = null;
}

async function saveButton() {
  const tab = activeTab(); if (!tab) return;
  const title      = document.getElementById('f-title').value.trim();
  const command    = document.getElementById('f-cmd').value;
  const autoSend   = document.getElementById('f-autosend').checked;
  const addSpace   = document.getElementById('f-space').checked;
  const color      = document.getElementById('f-color').value;
  const portTarget = document.getElementById('f-port').value;
  const size       = document.querySelector('input[name="f-size"]:checked')?.value || 'medium';
  const colWidth   = parseInt(document.querySelector('input[name="f-width"]:checked')?.value || '1');
  if (!title) { document.getElementById('f-title').focus(); return; }

  // Legge posizione griglia (f-row oppure f-order per compat HTML vecchio)
  const rowEl  = document.getElementById('f-row') || document.getElementById('f-order');
  const colEl  = document.getElementById('f-col');
  let gridRow  = Math.max(1, parseInt(rowEl?.value || '1') || 1);
  let gridCol  = Math.max(1, Math.min(4 - colWidth + 1, parseInt(colEl?.value || '1') || 1));

  if (editingId) {
    const idx = tab.buttons.findIndex(b => b.id === editingId);
    if (idx !== -1) {
      tab.buttons[idx] = {
        ...tab.buttons[idx],
        title, command, autoSend, addSpace, color, portTarget, size, colWidth, gridRow, gridCol
      };
    }
  } else {
    // Se non c'è un campo colonna nel form, cerca lo slot libero automaticamente
    if (!colEl) {
      const pos = findNextSlot(colWidth, buildOccupancy(tab.buttons));
      gridRow = pos.row;
      gridCol = pos.col;
    }
    tab.buttons.push({
      id: uid(), title, command, autoSend, addSpace, color, portTarget,
      size, colWidth, gridRow, gridCol, order: tab.buttons.length
    });
  }

  await saveConfig();
  renderButtons();
  closeEditor();
}

async function deleteButton() {
  const tab = activeTab();
  if (!editingId||!tab||!confirm('Eliminare questo pulsante?')) return;
  tab.buttons = tab.buttons.filter(b=>b.id!==editingId);
  await saveConfig();
  renderButtons();
  closeEditor();
}

// ═══════════════════════ BARRA INFERIORE ════════════════════════════════════

async function sendUserInput() {
  const input = document.getElementById('user-input');
  const text  = input.value;
  if (!text) return;
  const full = text + lineEnding();
  await writeTarget(full, 'active');
  logLine(full);
  input.value = '';
  focusActiveTerminal();
}

// ═══════════════════════ TERMINALE — funzioni globali ════════════════════════

function clearTerm(tabId, pn)  { tabState[tabId]?.terms[pn]?.clear(); }
function copyTerm(tabId, pn)   { const s=tabState[tabId]?.terms[pn]?.getSelection(); if(s) navigator.clipboard.writeText(s); }
function scrollEnd(tabId, pn)  { tabState[tabId]?.terms[pn]?.scrollToBottom(); }
window.clearTerm=clearTerm; window.copyTerm=copyTerm; window.scrollEnd=scrollEnd;

function fitTab(tabId) {
  const st = tabState[tabId];
  if (!st) return;
  try { st.fits[1]?.fit(); } catch(_) {}
  if (st.splitActive) try { st.fits[2]?.fit(); } catch(_) {}
}

function termWrite(tabId, pn, col, msg) {
  tabState[tabId]?.terms[pn]?.writeln(`\x1b[${col}m\r\n[${utcNow()}] ${msg}\x1b[0m`);
}
const termOk   = (tabId,pn,m) => termWrite(tabId,pn,'1;32',m);
const termInfo = (tabId,pn,m) => termWrite(tabId,pn,'1;33',m);
const termErr  = (tabId,pn,m) => termWrite(tabId,pn,'1;31',m);

// ═══════════════════════ CONTATORE ═══════════════════════════════════════════

function formatCounter(n) {
  // Mantieni almeno 5 cifre, massimo 7
  const s = String(Math.max(0, n));
  if (s.length >= 5) return s.slice(0, 7);
  return s.padStart(5, '0');
}

function syncCounterFields() {
  const v = formatCounter(counterValue);
  document.getElementById('counter-a').value = v;
  document.getElementById('counter-b').value = v;
}

function applyCounterCfg() {
  const btn = document.getElementById('counter-btn');
  btn.textContent = counterCfg.title || 'CNT';
  btn.style.backgroundColor = counterCfg.color || '#1e5f3a';
  btn.style.color = '#fff';
  btn.style.borderColor = 'transparent';
}

async function handleCounterClick() {
  const cmd  = (counterCfg.command || '').trim();
  const valA = document.getElementById('counter-a').value.trim();
  const valB = document.getElementById('counter-b').value.trim();
  const txt  = document.getElementById('counter-text').value.trim();
  const le   = lineEnding();

  // Costruisci la stringa: cmd valA valB [txt]
  const parts = [];
  if (cmd)  parts.push(cmd);
  if (valA) parts.push(valA);
  if (valB) parts.push(valB);
  if (txt)  parts.push(txt);

  const full = parts.join(' ') + le;
  await writeTarget(full, 'active');
  logLine(full);
  focusActiveTerminal();
}

function openCounterModal() {
  document.getElementById('cf-title').value = counterCfg.title || '';
  document.getElementById('cf-cmd').value   = counterCfg.command || '';
  document.getElementById('cf-color').value = counterCfg.color  || '#1e5f3a';
  document.getElementById('counter-overlay').classList.remove('hidden');
  document.getElementById('cf-title').focus();
}
function closeCounterModal() {
  document.getElementById('counter-overlay').classList.add('hidden');
}
function saveCounterModal() {
  counterCfg.title   = document.getElementById('cf-title').value.trim() || 'CNT';
  counterCfg.command = document.getElementById('cf-cmd').value;
  counterCfg.color   = document.getElementById('cf-color').value;
  applyCounterCfg();
  closeCounterModal();
  saveConfig();
}

function parseCounterInput(val) {
  // Preserva gli zeri iniziali: usa la stringa così com'è (solo cifre)
  const digits = val.replace(/\D/g,'');
  if (!digits) return 0;
  const n = parseInt(digits, 10);
  return isNaN(n) ? 0 : Math.max(0, n);
}

// ═══════════════════════ TELEFONO ════════════════════════════════════════════

function applyPhoneCfg() {
  const btn = document.getElementById('phone-btn');
  btn.textContent = phoneCfg.title || 'TEL';
  btn.style.backgroundColor = phoneCfg.color || '#5f3a1e';
  btn.style.color = '#fff';
  btn.style.borderColor = 'transparent';
}

async function handlePhoneClick() {
  const cmd    = (phoneCfg.command || '').trim();
  const number = document.getElementById('phone-number').value.trim();
  const le     = lineEnding();

  const parts = [];
  if (cmd)    parts.push(cmd);
  if (number) parts.push(number);

  const full = parts.join(' ') + le;
  await writeTarget(full, 'active');
  logLine(full);
  focusActiveTerminal();
}

function openPhoneModal() {
  document.getElementById('pf-title').value = phoneCfg.title || '';
  document.getElementById('pf-cmd').value   = phoneCfg.command || '';
  document.getElementById('pf-color').value = phoneCfg.color  || '#5f3a1e';
  document.getElementById('phone-overlay').classList.remove('hidden');
  document.getElementById('pf-title').focus();
}
function closePhoneModal() {
  document.getElementById('phone-overlay').classList.add('hidden');
}
function savePhoneModal() {
  phoneCfg.title   = document.getElementById('pf-title').value.trim() || 'TEL';
  phoneCfg.command = document.getElementById('pf-cmd').value;
  phoneCfg.color   = document.getElementById('pf-color').value;
  applyPhoneCfg();
  closePhoneModal();
  saveConfig();
}

// ═══════════════════════ LOG ══════════════════════════════════════════════════

function autoLogName() {
  const d=new Date(), p=n=>String(n).padStart(2,'0');
  return `log_${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function logLine(text) {
  if (!logEnabled) return;
  const name = logFileName.trim() || autoLogName();
  if (window.serialAPI?.appendLog) {
    window.serialAPI.appendLog({ name, text });
  }
}

function setupLogToggle() {
  const toggle = document.getElementById('log-enable');
  const nameEl = document.getElementById('log-name');
  toggle.addEventListener('change', () => {
    logEnabled = toggle.checked;
    nameEl.disabled = !logEnabled;
    if (logEnabled && !logFileName.trim()) {
      nameEl.placeholder = autoLogName() + '  (auto)';
    }
  });
  nameEl.addEventListener('input', () => { logFileName = nameEl.value; });
  nameEl.disabled = true;

  // Mostra percorso cartella log e aggiunge pulsante "Apri"
  window.serialAPI.getLogDir?.().then(dir => {
    if (!dir) return;
    let hint = document.getElementById('log-folder-hint');
    if (!hint) {
      hint = document.createElement('span');
      hint.id = 'log-folder-hint';
      hint.style.cssText = 'font-size:10px;color:#8b949e;margin-left:6px;cursor:pointer;text-decoration:underline;white-space:nowrap';
      hint.title = 'Apri cartella log';
      hint.addEventListener('click', () => window.serialAPI.openLogFolder?.());
      nameEl.insertAdjacentElement('afterend', hint);
    }
    // Mostra solo la parte finale del percorso per non occupare troppo spazio
    const short = dir.replace(/\\/g, '/').split('/').slice(-3).join('/');
    hint.textContent = `📁 …/${short}`;
  }).catch(() => {});
}

// ═══════════════════════ EVENT LISTENERS ════════════════════════════════════

function setupListeners() {
  // ── Fix cursore scomparso (Electron/Windows) ──────────────────────────────
  // xterm.js imposta cursor:none via JS con !important direttamente sul canvas,
  // battendo qualsiasi regola CSS. Il MutationObserver intercetta il cambio
  // e lo ripristina immediatamente prima che il browser lo applichi visivamente.
  const _cursorObserver = new MutationObserver(mutations => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.attributeName === 'style') {
        const el = m.target;
        if (el.style.cursor === 'none' || el.style.getPropertyValue('cursor') === 'none') {
          el.style.setProperty('cursor', 'default', 'important');
        }
      }
    }
  });
  _cursorObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['style'],
    subtree: true,
  });
  // ─── Tema ────────────────────────────────────────────────────────────────
  document.getElementById('theme-toggle').addEventListener('click', () => {
    applyTheme(!darkMode);
    saveConfig();
  });

  // ─── Contatore ───────────────────────────────────────────────────────────
  document.getElementById('counter-btn').addEventListener('click', handleCounterClick);
  document.getElementById('counter-edit-btn').addEventListener('click', openCounterModal);
  document.getElementById('counter-modal-x').addEventListener('click', closeCounterModal);
  document.getElementById('cf-cancel').addEventListener('click', closeCounterModal);
  document.getElementById('cf-save').addEventListener('click', saveCounterModal);
  document.getElementById('counter-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('counter-overlay')) closeCounterModal();
  });

  // Tasti + e −
  document.getElementById('counter-plus').addEventListener('click', () => {
    // Legge il valore attuale dal campo (preserva zeri iniziali e cifre scritte)
    const fieldVal = document.getElementById('counter-a').value;
    const digits = fieldVal.replace(/\D/g, '');
    const num = parseInt(digits, 10) || 0;
    const newNum = num + 1;
    // Mantieni la stessa lunghezza della stringa originale (padding con zeri)
    const newStr = String(newNum).padStart(Math.max(digits.length, String(newNum).length), '0');
    counterValue = newNum;
    document.getElementById('counter-a').value = newStr;
    document.getElementById('counter-b').value = newStr;
    saveConfig();
  });
  document.getElementById('counter-minus').addEventListener('click', () => {
    // Legge il valore attuale dal campo (preserva zeri iniziali e cifre scritte)
    const fieldVal = document.getElementById('counter-a').value;
    const digits = fieldVal.replace(/\D/g, '');
    const num = parseInt(digits, 10) || 0;
    if (num <= 0) return;
    const newNum = num - 1;
    // Mantieni la stessa lunghezza della stringa originale (padding con zeri)
    const newStr = String(newNum).padStart(Math.max(digits.length, String(newNum).length), '0');
    counterValue = newNum;
    document.getElementById('counter-a').value = newStr;
    document.getElementById('counter-b').value = newStr;
    saveConfig();
  });

  // Modifica manuale dei campi (sincrona)
  ['counter-a','counter-b'].forEach(id => {
    document.getElementById(id).addEventListener('change', function() {
      // Preserva gli zeri iniziali: aggiorna counterValue ma risincronizza
      // solo se il valore numerico è diverso, mantenendo la stringa dell'utente
      const digits = this.value.replace(/\D/g,'');
      if (digits) {
        // Aggiorna counterValue con il numero puro
        counterValue = parseInt(digits, 10) || 0;
        // Risincronizza entrambi i campi con la formattazione standard
        // MA se l'utente ha inserito zeri iniziali, li manteniamo
        const formatted = formatCounter(counterValue);
        // Se la stringa dell'utente ha più zeri iniziali di quelli standard, li rispettiamo
        const userStr = digits.padStart(Math.max(formatted.length, digits.length), '0');
        document.getElementById('counter-a').value = userStr;
        document.getElementById('counter-b').value = userStr;
      } else {
        counterValue = 0;
        syncCounterFields();
      }
      saveConfig();
    });
    document.getElementById(id).addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        const digits = this.value.replace(/\D/g,'');
        if (digits) {
          counterValue = parseInt(digits, 10) || 0;
          const formatted = formatCounter(counterValue);
          const userStr = digits.padStart(Math.max(formatted.length, digits.length), '0');
          document.getElementById('counter-a').value = userStr;
          document.getElementById('counter-b').value = userStr;
        } else {
          counterValue = 0;
          syncCounterFields();
        }
        saveConfig();
      }
    });
  });

  // ─── MDM ─────────────────────────────────────────────────────────────────
  document.getElementById('mdm-btn').addEventListener('click', handleMdmClick);

  // ─── Telefono ────────────────────────────────────────────────────────────
  document.getElementById('phone-btn').addEventListener('click', handlePhoneClick);
  document.getElementById('phone-edit-btn').addEventListener('click', openPhoneModal);
  document.getElementById('phone-modal-x').addEventListener('click', closePhoneModal);
  document.getElementById('pf-cancel').addEventListener('click', closePhoneModal);
  document.getElementById('pf-save').addEventListener('click', savePhoneModal);
  document.getElementById('phone-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('phone-overlay')) closePhoneModal();
  });

  // Log
  setupLogToggle();

  // Connetti/Disconnetti
  document.getElementById('p1-connect').addEventListener('click', () =>
    tabState[activeTabId]?.connected[1] ? disconnectPort(1) : connectPort(1));
  document.getElementById('p2-connect').addEventListener('click', () =>
    tabState[activeTabId]?.connected[2] ? disconnectPort(2) : connectPort(2));

  // Aggiorna porte manualmente
  document.getElementById('refresh-btn').addEventListener('click', () => {
    lastPortPaths = ''; // forza aggiornamento
    pollPorts();
  });

  // Split
  document.getElementById('split-btn').addEventListener('click', toggleSplit);

  // Nuova scheda
  document.getElementById('new-tab-btn').addEventListener('click', () => {
    saveTabSettings(activeTabId);
    createTab(null, null, true);
  });

  // Sidebar
  document.getElementById('add-btn').addEventListener('click', () => openEditor());
  document.getElementById('edit-btn').addEventListener('click', () => {
    editMode = !editMode;
    const b = document.getElementById('edit-btn');
    b.textContent = editMode ? '✓ FINE MODIFICA' : '✎ MODIFICA';
    b.classList.toggle('active', editMode);
    document.getElementById('btn-list').classList.toggle('edit-mode', editMode);
    // Mostra/nascondi le matite dei pulsanti extra-bar
    document.getElementById('counter-edit-btn').classList.toggle('hidden', !editMode);
    document.getElementById('phone-edit-btn').classList.toggle('hidden', !editMode);
    renderButtons();
  });

  // Modal
  document.getElementById('modal-x').addEventListener('click', closeEditor);
  document.getElementById('m-cancel').addEventListener('click', closeEditor);
  document.getElementById('m-save').addEventListener('click', saveButton);
  document.getElementById('m-delete').addEventListener('click', deleteButton);
  document.getElementById('f-autosend').addEventListener('change', function(){
    document.getElementById('space-opt').classList.toggle('hidden', this.checked);
  });
  document.getElementById('overlay').addEventListener('click', e => {
    if (e.target===document.getElementById('overlay')) closeEditor();
  });

  // Barra inferiore
  document.getElementById('send-btn').addEventListener('click', sendUserInput);
  document.getElementById('user-input').addEventListener('keydown', e => {
    if (e.key==='Enter') sendUserInput();
  });
  document.getElementById('clr-all-btn').addEventListener('click', () => {
    const t = document.getElementById('active-port').value;
    if (t==='1'||t==='both') clearTerm(activeTabId,1);
    if (t==='2'||t==='both') clearTerm(activeTabId,2);
  });

  // Salva impostazioni al cambio
  ['p1-baud','p1-data','p1-parity','p1-stop','p1-flow','p1-echo',
   'p2-baud','p2-data','p2-parity','p2-stop','p2-flow','p2-echo',
   'line-end','active-port'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => saveTabSettings(activeTabId));
  });
  // Salva anche al cambio porta COM
  ['p1-com','p2-com'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => saveTabSettings(activeTabId));
  });

  // Scorciatoie tastiera
  document.addEventListener('keydown', e => {
    if (e.key==='Escape') { closeEditor(); closeCounterModal(); closePhoneModal(); closeFkeyModal(); }
    if ((e.ctrlKey||e.metaKey) && e.key==='t') { e.preventDefault(); document.getElementById('new-tab-btn').click(); }
    if ((e.ctrlKey||e.metaKey) && e.shiftKey && e.key==='T') { e.preventDefault(); reopenLastTab(); }
    if ((e.ctrlKey||e.metaKey) && e.key==='w') {
      e.preventDefault();
      if (cfg.tabs.length>1) closeTab(activeTabId);
    }
    // Tasti funzione F1–F12
    const fIdx = ['F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12'].indexOf(e.key);
    if (fIdx !== -1) {
      const fk = fkeyCfg[fIdx];
      if (fk?.enabled && fk.command) {
        e.preventDefault();
        handleFkeyPress(fk);
      }
    }
  });

  // Resize osservato con ResizeObserver per gestire correttamente il dual-screen
  const termArea = document.getElementById('term-area');
  if (termArea && typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      setTimeout(() => fitTab(activeTabId), 50);
    });
    ro.observe(termArea);
  }
}

// ═══════════════════════ IMPOSTAZIONI COLORI ═════════════════════════════════

function applyColorSettings() {
  const root = document.documentElement;
  const cs   = colorSettings;

  // ── Pulsanti ──────────────────────────────────────────────────────────────
  root.style.setProperty('--btn-cnt-text',    cs.cntText);
  root.style.setProperty('--btn-tel-text',    cs.telText);
  root.style.setProperty('--btn-send-text',   cs.sendText);
  root.style.setProperty('--btn-send-bg',     cs.sendBg);
  root.style.setProperty('--btn-clr-text',    cs.clrText);
  root.style.setProperty('--btn-clr-bg',      cs.clrBg);
  root.style.setProperty('--btn-conn-text',   cs.connText);
  root.style.setProperty('--btn-disconn-text',cs.disconnText);
  root.style.setProperty('--btn-sb-text',     cs.sbText);

  // ── Chrome: inietta override SOLO per colori esplicitamente personalizzati.
  // Se null → il CSS originale (.light-mode / dark default) gestisce tutto.
  _injectChromeOverrideStyle();

  // ── Terminale ─────────────────────────────────────────────────────────────
  // In light mode usa TERM_THEME_LIGHT come base anche se i colori sono null.
  const baseTheme  = darkMode ? TERM_THEME_DARK : TERM_THEME_LIGHT;
  const xtermTheme = {
    ...baseTheme,
    ...(cs.termBg     && { background:         cs.termBg }),
    ...(cs.termFg     && { foreground:          cs.termFg }),
    ...(cs.termCursor && { cursor:              cs.termCursor }),
    ...(cs.termSelBg  && { selectionBackground: cs.termSelBg }),
  };
  Object.values(tabState).forEach(state => {
    [1,2].forEach(pn => {
      const term = state.terms?.[pn];
      if (term) {
        term.options.theme = xtermTheme;
        // Aggiorna il colore del viewport per farlo tornare light/dark
        const effectiveBg = cs.termBg || baseTheme.background;
        const vp = term.element?.querySelector('.xterm-viewport');
        if (vp) vp.style.backgroundColor = effectiveBg;
      }
    });
  });

  // ── Sidebar pulsanti ──────────────────────────────────────────────────────
  document.querySelectorAll('.sb-btn-title, .sb-btn-icon').forEach(el => {
    el.style.color = cs.sbText;
  });
  const cntBtn = document.getElementById('counter-btn');
  if (cntBtn) cntBtn.style.color = cs.cntText;
  const telBtn = document.getElementById('phone-btn');
  if (telBtn) telBtn.style.color = cs.telText;
}

/**
 * Inietta (o aggiorna) un tag <style> con !important SOLO per i colori
 * che l'utente ha esplicitamente personalizzato (non null).
 * Se nessun colore è personalizzato, rimuove il tag per lasciare
 * che il CSS originale (incluso .light-mode) gestisca tutto.
 */
function _injectChromeOverrideStyle() {
  const cs = colorSettings;

  // In light mode con colori a default, forziamo i colori light perché
  // il CSS originale non li applica a tutti gli elementi (terminale, sidebar, ecc.)
  // In dark mode con colori a default, rimuoviamo l'override e lasciamo il CSS originale.
  const isLight = !darkMode;

  const winBg   = cs.windowBg   || (isLight ? CHROME_LIGHT.windowBg   : null);
  const sideBg  = cs.sidebarBg  || (isLight ? CHROME_LIGHT.sidebarBg  : null);
  const tabBg   = cs.tabBarBg   || (isLight ? CHROME_LIGHT.tabBarBg   : null);
  const inputBg = cs.inputBarBg || (isLight ? CHROME_LIGHT.inputBarBg : null);

  const rules = [];
  if (winBg)   rules.push(`html, body, #app, .app-root, .app-container, .term-area, #term-area { background-color: ${winBg} !important; }`);
  if (sideBg)  rules.push(`#sidebar, .sidebar, #btn-list, .btn-list { background-color: ${sideBg} !important; }`);
  if (tabBg)   rules.push(`#tabs-container, #tabs-wrapper, .tabs-bar, .tab-bar, #fkey-bar { background-color: ${tabBg} !important; }`);
  if (inputBg) rules.push(`#input-bar, .input-bar, .bottom-bar, #bottom-bar { background-color: ${inputBg} !important; }`);

  // Terminale: in light mode forza sfondo chiaro anche su xterm-host e xterm-viewport
  if (isLight && !cs.termBg) {
    rules.push(`.xterm-host, .xterm-viewport, .xterm-screen { background-color: ${TERM_COLORS_LIGHT.termBg} !important; }`);
  }

  // Header terminali e barra di stato
  if (isLight) {
    rules.push(`.term-hdr, .term-panel { background-color: ${CHROME_LIGHT.windowBg} !important; color: #24292f !important; }`);
    rules.push(`.hdr-name, .hdr-info, .sdot { color: #24292f !important; }`);
  }

  let st = document.getElementById('__chrome-override');
  if (rules.length === 0) {
    st?.remove();
    return;
  }
  if (!st) {
    st = document.createElement('style');
    st.id = '__chrome-override';
    document.head.appendChild(st);
  }
  st.textContent = rules.join('\n');
}

/** Helper per i picker: restituisce il valore corrente o stringa vuota se null */
function _csVal(key) {
  const v = colorSettings[key];
  if (v) return v;
  // Mostra il colore del tema come placeholder nel picker
  const themeChrome = darkMode ? CHROME_DARK : CHROME_LIGHT;
  const themeTerm   = darkMode ? TERM_COLORS_DARK : TERM_COLORS_LIGHT;
  return { ...themeChrome, ...themeTerm }[key] || '#000000';
}

/** Applica background-color a tutti gli elementi che matchano il selettore CSS. */
function _applyBgDirect(selector, color) {
  document.querySelectorAll(selector).forEach(el => {
    el.style.backgroundColor = color;
  });
}

function openColorSettings() {
  _ensureExtraColorFields();   // aggiunge le nuove righe se non ci sono

  const cs = colorSettings;
  // Campi esistenti
  document.getElementById('cs-cnt-text-color').value      = cs.cntText;
  document.getElementById('cs-tel-text-color').value      = cs.telText;
  document.getElementById('cs-send-text-color').value     = cs.sendText;
  document.getElementById('cs-send-bg-color').value       = cs.sendBg;
  document.getElementById('cs-clr-text-color').value      = cs.clrText;
  document.getElementById('cs-clr-bg-color').value        = cs.clrBg;
  document.getElementById('cs-conn-text-color').value     = cs.connText;
  document.getElementById('cs-disconn-text-color').value  = cs.disconnText;
  document.getElementById('cs-sb-text-color').value       = cs.sbText;
  // Nuovi campi — mostra colore tema corrente se non personalizzati
  _csSet('cs-window-bg',    _csVal('windowBg'));
  _csSet('cs-sidebar-bg',   _csVal('sidebarBg'));
  _csSet('cs-tabbar-bg',    _csVal('tabBarBg'));
  _csSet('cs-inputbar-bg',  _csVal('inputBarBg'));
  _csSet('cs-term-bg',      _csVal('termBg'));
  _csSet('cs-term-fg',      _csVal('termFg'));
  _csSet('cs-term-cursor',  _csVal('termCursor'));
  _csSet('cs-term-sel',     _csVal('termSelBg'));

  document.getElementById('color-settings-overlay').classList.remove('hidden');
}

function _csSet(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function closeColorSettings() {
  document.getElementById('color-settings-overlay').classList.add('hidden');
}

function saveColorSettings() {
  const _v = id => document.getElementById(id)?.value || null;
  colorSettings.cntText    = _v('cs-cnt-text-color')     || colorSettings.cntText;
  colorSettings.telText    = _v('cs-tel-text-color')     || colorSettings.telText;
  colorSettings.sendText   = _v('cs-send-text-color')    || colorSettings.sendText;
  colorSettings.sendBg     = _v('cs-send-bg-color')      || colorSettings.sendBg;
  colorSettings.clrText    = _v('cs-clr-text-color')     || colorSettings.clrText;
  colorSettings.clrBg      = _v('cs-clr-bg-color')       || colorSettings.clrBg;
  colorSettings.connText   = _v('cs-conn-text-color')    || colorSettings.connText;
  colorSettings.disconnText= _v('cs-disconn-text-color') || colorSettings.disconnText;
  colorSettings.sbText     = _v('cs-sb-text-color')      || colorSettings.sbText;
  // Nuovi campi (se presenti)
  if (_v('cs-window-bg'))   colorSettings.windowBg   = _v('cs-window-bg');
  if (_v('cs-sidebar-bg'))  colorSettings.sidebarBg  = _v('cs-sidebar-bg');
  if (_v('cs-tabbar-bg'))   colorSettings.tabBarBg   = _v('cs-tabbar-bg');
  if (_v('cs-inputbar-bg')) colorSettings.inputBarBg = _v('cs-inputbar-bg');
  if (_v('cs-term-bg'))     colorSettings.termBg     = _v('cs-term-bg');
  if (_v('cs-term-fg'))     colorSettings.termFg     = _v('cs-term-fg');
  if (_v('cs-term-cursor')) colorSettings.termCursor = _v('cs-term-cursor');
  if (_v('cs-term-sel'))    colorSettings.termSelBg  = _v('cs-term-sel');

  applyColorSettings();
  localStorage.setItem('colorSettings', JSON.stringify(colorSettings));
  closeColorSettings();
}

function resetColorSettings() {
  colorSettings = { ...COLOR_SETTINGS_DEFAULTS };
  applyColorSettings();
  localStorage.setItem('colorSettings', JSON.stringify(colorSettings));
  openColorSettings(); // riapri per mostrare i valori aggiornati
}

/**
 * Aggiunge le sezioni "Finestra" e "Terminale" al pannello colori esistente,
 * se non sono già presenti. Si aggancia all'interno di #color-settings-overlay.
 */
function _ensureExtraColorFields() {
  if (document.getElementById('cs-extra-sections')) return;

  // Trova il contenitore esistente dei colori (la griglia/lista di picker)
  const overlay = document.getElementById('color-settings-overlay');
  if (!overlay) return;

  // Troviamo il bottone Reset o Save come punto di inserimento
  const saveBtn = overlay.querySelector('#cs-save, [id*="cs-save"]');
  const anchor  = saveBtn?.closest('div, p') || overlay.querySelector('.modal-box');
  if (!anchor) return;

  const extra = document.createElement('div');
  extra.id = 'cs-extra-sections';
  extra.innerHTML = `
    <hr style="border-color:#30363d;margin:10px 0">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
      <div class="cs-section-title" style="margin:0">🖥 Finestra &amp; Layout</div>
      <button id="cs-reset-chrome" style="font-size:10px;padding:2px 7px;cursor:pointer" title="Ripristina colori predefiniti del tema">↺ Ripristina tema</button>
    </div>
    <div class="cs-extra-grid">
      <label>Sfondo app</label>
      <input type="color" id="cs-window-bg">

      <label>Sfondo sidebar</label>
      <input type="color" id="cs-sidebar-bg">

      <label>Sfondo tab bar</label>
      <input type="color" id="cs-tabbar-bg">

      <label>Sfondo barra input</label>
      <input type="color" id="cs-inputbar-bg">
    </div>

    <hr style="border-color:#30363d;margin:10px 0">

    <div class="cs-section-title">🖫 Terminale</div>
    <div class="cs-extra-grid">
      <label>Sfondo terminale</label>
      <input type="color" id="cs-term-bg">

      <label>Testo terminale</label>
      <input type="color" id="cs-term-fg">

      <label>Cursore</label>
      <input type="color" id="cs-term-cursor">

      <label>Selezione</label>
      <input type="color" id="cs-term-sel">
    </div>`;

  // Inserisce prima dei pulsanti Salva/Reset
  const btnRow = saveBtn?.closest('div');
  if (btnRow) btnRow.before(extra);
  else anchor.appendChild(extra);

  // Stile inline per le nuove sezioni
  if (!document.getElementById('__cs-extra-style')) {
    const st = document.createElement('style');
    st.id = '__cs-extra-style';
    st.textContent = `
      .cs-section-title {
        font-size: 11px;
        font-weight: bold;
        color: #58a6ff;
        text-transform: uppercase;
        letter-spacing: .05em;
        margin: 8px 0 4px;
      }
      .cs-extra-grid {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 5px 10px;
        align-items: center;
      }
      .cs-extra-grid label { font-size: 12px; color: #8b949e; }
      .cs-extra-grid input[type=color] {
        width: 36px; height: 22px;
        padding: 1px; border: 1px solid #30363d;
        border-radius: 3px; background: none; cursor: pointer;
      }
    `;
    document.head.appendChild(st);
  }

  // Pulsante "Ripristina tema": azzera i colori chrome e terminale
  document.getElementById('cs-reset-chrome')?.addEventListener('click', () => {
    ['windowBg','sidebarBg','tabBarBg','inputBarBg','termBg','termFg','termCursor','termSelBg']
      .forEach(k => { colorSettings[k] = null; });
    applyColorSettings();
    localStorage.setItem('colorSettings', JSON.stringify(colorSettings));
    openColorSettings();
  });
}

function loadColorSettings() {
  try {
    const saved = localStorage.getItem('colorSettings');
    if (saved) {
      const parsed = JSON.parse(saved);
      // null significa "segui il tema" — non sovrascrivere con valori del default
      colorSettings = { ...COLOR_SETTINGS_DEFAULTS };
      Object.keys(parsed).forEach(k => {
        // Accetta null esplicitamente (l'utente ha fatto "Ripristina tema")
        colorSettings[k] = parsed[k];
      });
    }
  } catch(_) {}
  applyColorSettings();
}

function setupColorSettingsListeners() {
  document.getElementById('color-settings-btn').addEventListener('click', openColorSettings);
  document.getElementById('color-settings-x').addEventListener('click', closeColorSettings);
  document.getElementById('cs-cancel').addEventListener('click', closeColorSettings);
  document.getElementById('cs-save').addEventListener('click', saveColorSettings);
  document.getElementById('cs-reset').addEventListener('click', resetColorSettings);
  document.getElementById('color-settings-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('color-settings-overlay')) closeColorSettings();
  });
}

// ═══════════════════════ OROLOGIO SIDEBAR ════════════════════════════════════

function updateDatetimeDisplay() {
  const now = new Date();
  const p = n => String(n).padStart(2, '0');

  // Data locale: GG/MM/AAAA
  const dateStr = `${p(now.getDate())}/${p(now.getMonth()+1)}/${now.getFullYear()}`;
  // Ora locale: HH:MM:SS
  const timeStr = `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
  // Ora UTC: HH:MM:SS
  const utcStr  = `${p(now.getUTCHours())}:${p(now.getUTCMinutes())}:${p(now.getUTCSeconds())}`;

  const elDate = document.getElementById('dt-date');
  const elTime = document.getElementById('dt-time');
  const elUtc  = document.getElementById('dt-utc');
  if (elDate) elDate.textContent = dateStr;
  if (elTime) elTime.textContent = timeStr;
  if (elUtc)  elUtc.textContent  = utcStr;
}

// Funzioni helper esposte globalmente per uso nei pulsanti
// Restituisce la data locale corrente come stringa "GG/MM/AAAA"
function getCurrentDate() {
  const d = new Date(), p = n => String(n).padStart(2,'0');
  return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()}`;
}
// Restituisce l'ora locale corrente come stringa "HH:MM:SS"
function getCurrentTime() {
  const d = new Date(), p = n => String(n).padStart(2,'0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
// Restituisce l'ora UTC corrente come stringa "HH:MM:SS"
function getCurrentUTC() {
  const d = new Date(), p = n => String(n).padStart(2,'0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

// ─── START ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  _injectPortModalCSS();
  _injectFkeyCSS();
  _injectGridCSS();
  _initTabScrollWrapper();
  loadColorSettings();
  init();
  setupColorSettingsListeners();
  updateDatetimeDisplay();
  setInterval(updateDatetimeDisplay, 1000);
  renderFkeyBar();
  _injectPortGearButtons();

  // Pulsante apertura modal tasti funzione (se esiste nel tuo HTML)
  document.getElementById('fkey-settings-btn')?.addEventListener('click', openFkeyModal);

  // Ascolta il menu File > Carica configurazione
  window.serialAPI.onApplyConfig(data => applyConfigFromFile(data));
  window.serialAPI.onOpenFkeyModal(() => openFkeyModal());
  window.serialAPI.onReopenLastTab(() => reopenLastTab());
  window.serialAPI.onToggleFkeyBar(visible => {
    const bar = document.getElementById('fkey-bar');
    if (bar) bar.style.display = visible ? 'flex' : 'none';
    localStorage.setItem('fkeyBarVisible', visible ? '1' : '0');
  });

  // ── Auto-update listeners ─────────────────────────────────────────────────
  window.serialAPI.onUpdateChecking?.(() =>
    showUpdateBanner('🔍 Controllo aggiornamenti…', false, 'info'));
  window.serialAPI.onUpdateAvailable?.(v =>
    showUpdateBanner(`⬇ Aggiornamento ${v} disponibile — scaricamento in corso…`, false, 'info'));
  window.serialAPI.onUpdateNotAvailable?.(() =>
    showUpdateBanner('✔ Applicazione aggiornata all\'ultima versione', false, 'ok'));
  window.serialAPI.onUpdateProgress?.(p =>
    showUpdateBanner(`⬇ Download aggiornamento… ${p}%`, false, 'info'));
  window.serialAPI.onUpdateDownloaded?.(v =>
    showUpdateBanner(`✅ Aggiornamento ${v} pronto — clicca per riavviare`, true, 'success'));

  // Ripristina visibilità barra Fn
  if (localStorage.getItem('fkeyBarVisible') === '0') {
    requestAnimationFrame(() => {
      const bar = document.getElementById('fkey-bar');
      if (bar) bar.style.display = 'none';
    });
  }
});

// ── Banner aggiornamento ──────────────────────────────────────────────────────
function showUpdateBanner(msg, clickable, type = 'info') {
  let bar = document.getElementById('update-banner');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'update-banner';
    bar.style.cssText = [
      'position:fixed', 'bottom:0', 'left:0', 'right:0', 'z-index:99999',
      'color:#fff', 'text-align:center', 'padding:7px 14px',
      'font-size:12px', 'font-weight:500', 'letter-spacing:.02em',
      'transition:background .3s',
    ].join(';');

    // Pulsante chiudi
    const x = document.createElement('button');
    x.textContent = '×';
    x.style.cssText = 'float:right;background:none;border:none;color:#fff;font-size:16px;cursor:pointer;line-height:1;padding:0 4px;opacity:.8';
    x.onclick = e => { e.stopPropagation(); bar.remove(); };
    bar.appendChild(x);

    document.body.appendChild(bar);
  }

  const colors = { info: '#1f6feb', success: '#2ea043', warning: '#9e6a03', ok: '#238636' };
  bar.style.background = colors[type] || colors.info;
  bar.style.cursor     = clickable ? 'pointer' : 'default';

  // Aggiorna solo il testo, preservando il pulsante ×
  const txt = bar.querySelector('#update-banner-text') || (() => {
    const s = document.createElement('span');
    s.id = 'update-banner-text';
    bar.prepend(s);
    return s;
  })();
  txt.textContent = msg;

  bar.onclick = clickable
    ? (e) => { if (e.target !== bar.querySelector('button')) window.serialAPI.installUpdate(); }
    : null;

  // Solo il tipo 'ok' (già aggiornato) sparisce da solo dopo 4s — tutti gli altri restano
  clearTimeout(bar._autoHide);
  if (type === 'ok') {
    bar._autoHide = setTimeout(() => bar.remove(), 4000);
  }
}

/** Avvolge #tabs-container in un wrapper con frecce di scorrimento. */
function _initTabScrollWrapper() {
  const container = document.getElementById('tabs-container');
  if (!container || document.getElementById('tabs-wrapper')) return;

  // Crea wrapper
  const wrapper = document.createElement('div');
  wrapper.id = 'tabs-wrapper';

  // Freccia sinistra
  const btnL = document.createElement('button');
  btnL.className = 'tab-scroll-btn left';
  btnL.textContent = '‹';
  btnL.title = 'Scorri a sinistra';
  btnL.addEventListener('click', () => container.scrollBy({ left: -120, behavior: 'smooth' }));

  // Freccia destra
  const btnR = document.createElement('button');
  btnR.className = 'tab-scroll-btn right';
  btnR.textContent = '›';
  btnR.title = 'Scorri a destra';
  btnR.addEventListener('click', () => container.scrollBy({ left: 120, behavior: 'smooth' }));

  // Inserisce wrapper nel DOM al posto di container
  container.parentElement.insertBefore(wrapper, container);
  wrapper.appendChild(btnL);
  wrapper.appendChild(container);
  wrapper.appendChild(btnR);

  // Mostra/nasconde le frecce in base alla posizione di scroll
  const updateArrows = () => {
    const canLeft  = container.scrollLeft > 2;
    const canRight = container.scrollLeft < container.scrollWidth - container.clientWidth - 2;
    btnL.style.display = canLeft  ? 'flex' : 'none';
    btnR.style.display = canRight ? 'flex' : 'none';
  };

  container.addEventListener('scroll', updateArrows);
  new ResizeObserver(updateArrows).observe(container);
  updateArrows();
}

/**
 * Applica una configurazione caricata da file JSON.
 * Salva nello store e ricarica il renderer — init() riparte da capo
 * con la nuova config, esattamente come al primo avvio.
 */
async function applyConfigFromFile(data) {
  if (!data || !Array.isArray(data.tabs) || data.tabs.length === 0) {
    console.warn('[loadConfig] File non valido o senza schede.');
    return;
  }
  // Chiude tutte le porte aperte prima di ricaricare
  try {
    for (const tab of (cfg.tabs || [])) {
      await window.serialAPI.closeTabPorts({ tabId: tab.id });
    }
  } catch (_) {}

  // Salva la nuova config nello store e ricarica
  await window.serialAPI.saveConfig(data);
  location.reload();
}

// ═══════════════════════ MODAL IMPOSTAZIONI PORTA ════════════════════════════
// Sostituisce i campi baud/data/parity/stop/flow/echo nella UI principale.
// Aperto cliccando il pulsante ⚙ accanto a ogni porta.

let _portModalPn = 1; // porta corrente nel modal (1 o 2)

function openPortSettingsModal(pn) {
  _portModalPn = pn;
  _ensurePortSettingsModal();

  const tab = cfg.tabs.find(t => t.id === activeTabId);
  const p   = tab?.portSettings?.[`p${pn}`] || defaultPortSettings()[`p${pn}`];

  document.getElementById('psm-title').textContent = `⚙ Impostazioni Porta ${pn}`;

  // Tipo connessione
  document.getElementById('psm-conntype').value = p.connType || 'serial';
  _psmUpdateVisibility();

  // Seriale
  document.getElementById('psm-baud').value    = p.baudRate  || 115200;
  document.getElementById('psm-data').value    = p.dataBits  || 8;
  document.getElementById('psm-parity').value  = p.parity    || 'none';
  document.getElementById('psm-stop').value    = p.stopBits  || 1;
  document.getElementById('psm-flow').value    = p.rtscts    ? 'rtscts' : 'none';
  document.getElementById('psm-echo').checked  = p.echo      || false;

  // SSH
  document.getElementById('psm-ssh-host').value = p.sshHost  || '';
  document.getElementById('psm-ssh-port').value = p.sshPort  || 22;
  document.getElementById('psm-ssh-user').value = p.sshUser  || '';
  document.getElementById('psm-ssh-pass').value = p.sshPass  || '';
  document.getElementById('psm-ssh-key').value  = p.sshKey   || '';

  // Telnet
  document.getElementById('psm-tel-host').value = p.telnetHost || '';
  document.getElementById('psm-tel-port').value = p.telnetPort || 23;

  document.getElementById('psm-overlay').classList.remove('hidden');
}

function closePortSettingsModal() {
  document.getElementById('psm-overlay')?.classList.add('hidden');
}

function _ensurePortSettingsModal() {
  if (document.getElementById('psm-overlay')) return;

  const BAUDS = [300,600,1200,2400,4800,9600,14400,19200,28800,38400,57600,115200,230400,460800,921600];

  const overlay = document.createElement('div');
  overlay.id        = 'psm-overlay';
  overlay.className = 'modal-overlay hidden';
  overlay.innerHTML = `
    <div class="modal-box" style="width:380px">
      <div class="modal-header">
        <span id="psm-title">⚙ Impostazioni Porta</span>
        <button class="modal-close" id="psm-close">×</button>
      </div>

      <!-- Tipo connessione -->
      <div class="psm-grid" style="margin-top:10px">
        <label>Tipo connessione</label>
        <select id="psm-conntype">
          <option value="serial">🔌 Seriale (COM)</option>
          <option value="ssh">🔒 SSH</option>
          <option value="telnet">📡 Telnet</option>
        </select>
      </div>

      <!-- Sezione Seriale -->
      <div id="psm-section-serial">
        <div class="psm-section-label">Impostazioni seriale</div>
        <div class="psm-grid">
          <label>Baud Rate</label>
          <select id="psm-baud">${BAUDS.map(b=>`<option value="${b}">${b}</option>`).join('')}</select>
          <label>Data Bits</label>
          <select id="psm-data">
            <option value="5">5</option><option value="6">6</option>
            <option value="7">7</option><option value="8" selected>8</option>
          </select>
          <label>Parity</label>
          <select id="psm-parity">
            <option value="none">None</option><option value="even">Even</option>
            <option value="odd">Odd</option><option value="mark">Mark</option>
            <option value="space">Space</option>
          </select>
          <label>Stop Bits</label>
          <select id="psm-stop">
            <option value="1">1</option><option value="1.5">1.5</option><option value="2">2</option>
          </select>
          <label>Flow Control</label>
          <select id="psm-flow">
            <option value="none">None</option><option value="rtscts">RTS/CTS</option>
          </select>
          <label>Echo locale</label>
          <label style="justify-self:start"><input type="checkbox" id="psm-echo"> Abilitato</label>
        </div>
      </div>

      <!-- Sezione SSH -->
      <div id="psm-section-ssh" class="hidden">
        <div class="psm-section-label">Connessione SSH</div>
        <div class="psm-grid">
          <label>Host / IP</label>
          <input type="text" id="psm-ssh-host" placeholder="192.168.1.1">
          <label>Porta</label>
          <input type="number" id="psm-ssh-port" value="22" min="1" max="65535" style="width:80px">
          <label>Utente</label>
          <input type="text" id="psm-ssh-user" placeholder="root">
          <label>Password</label>
          <input type="password" id="psm-ssh-pass" placeholder="••••••••">
          <label style="align-self:start">Chiave privata<br><span style="font-size:10px;color:#555">(lascia vuoto se usi password)</span></label>
          <textarea id="psm-ssh-key" rows="3" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----" style="font-size:10px;font-family:monospace;width:100%;resize:vertical"></textarea>
        </div>
      </div>

      <!-- Sezione Telnet -->
      <div id="psm-section-telnet" class="hidden">
        <div class="psm-section-label">Connessione Telnet</div>
        <div class="psm-grid">
          <label>Host / IP</label>
          <input type="text" id="psm-tel-host" placeholder="192.168.1.1">
          <label>Porta</label>
          <input type="number" id="psm-tel-port" value="23" min="1" max="65535" style="width:80px">
        </div>
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
        <button id="psm-save" class="btn-primary">Salva</button>
        <button id="psm-cancel" class="btn-secondary">Annulla</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => { if (e.target === overlay) closePortSettingsModal(); });
  document.getElementById('psm-close').addEventListener('click',   closePortSettingsModal);
  document.getElementById('psm-cancel').addEventListener('click',  closePortSettingsModal);
  document.getElementById('psm-save').addEventListener('click',    _savePortSettingsModal);
  document.getElementById('psm-conntype').addEventListener('change', _psmUpdateVisibility);
}

function _psmUpdateVisibility() {
  const type = document.getElementById('psm-conntype')?.value || 'serial';
  document.getElementById('psm-section-serial')?.classList.toggle('hidden', type !== 'serial');
  document.getElementById('psm-section-ssh')?.classList.toggle('hidden',    type !== 'ssh');
  document.getElementById('psm-section-telnet')?.classList.toggle('hidden', type !== 'telnet');
}

async function _savePortSettingsModal() {
  const tab = cfg.tabs.find(t => t.id === activeTabId);
  if (!tab) return;
  if (!tab.portSettings) tab.portSettings = defaultPortSettings();

  const pn       = _portModalPn;
  const connType = document.getElementById('psm-conntype').value;

  tab.portSettings[`p${pn}`] = {
    ...tab.portSettings[`p${pn}`],
    connType,
    // Seriale
    baudRate:   parseInt(document.getElementById('psm-baud').value),
    dataBits:   parseInt(document.getElementById('psm-data').value),
    parity:     document.getElementById('psm-parity').value,
    stopBits:   parseFloat(document.getElementById('psm-stop').value),
    rtscts:     document.getElementById('psm-flow').value === 'rtscts',
    echo:       document.getElementById('psm-echo').checked,
    // SSH
    sshHost:    document.getElementById('psm-ssh-host').value.trim(),
    sshPort:    parseInt(document.getElementById('psm-ssh-port').value) || 22,
    sshUser:    document.getElementById('psm-ssh-user').value.trim(),
    sshPass:    document.getElementById('psm-ssh-pass').value,
    sshKey:     document.getElementById('psm-ssh-key').value.trim(),
    // Telnet
    telnetHost: document.getElementById('psm-tel-host').value.trim(),
    telnetPort: parseInt(document.getElementById('psm-tel-port').value) || 23,
  };

  _updatePortGearTooltip(pn, tab.portSettings[`p${pn}`]);
  await saveConfig();
  closePortSettingsModal();
}

/** Aggiunge il pulsante ⚙ accanto al selettore COM nel DOM. */
function _injectPortGearButtons() {
  [1,2].forEach(pn => {
    if (document.getElementById(`p${pn}-gear`)) return;
    const comSel = document.getElementById(`p${pn}-com`);
    if (!comSel) return;

    const btn  = document.createElement('button');
    btn.id     = `p${pn}-gear`;
    btn.className = 'port-gear-btn';
    btn.title  = 'Impostazioni porta…';
    btn.textContent = '⚙';
    btn.addEventListener('click', () => openPortSettingsModal(pn));
    comSel.insertAdjacentElement('afterend', btn);
    _updatePortGearTooltip(pn);
  });
}

function _updatePortGearTooltip(pn, p) {
  const tab = cfg.tabs.find(t => t.id === activeTabId);
  const ps  = p || tab?.portSettings?.[`p${pn}`] || defaultPortSettings()[`p${pn}`];
  const btn = document.getElementById(`p${pn}-gear`);
  if (!btn) return;
  const type = ps.connType || 'serial';
  if (type === 'ssh')
    btn.title = `SSH: ${ps.sshUser}@${ps.sshHost}:${ps.sshPort}\nClicca per modificare`;
  else if (type === 'telnet')
    btn.title = `Telnet: ${ps.telnetHost}:${ps.telnetPort}\nClicca per modificare`;
  else
    btn.title = `Baud: ${ps.baudRate} | Data: ${ps.dataBits} | Parity: ${ps.parity} | Stop: ${ps.stopBits} | Flow: ${ps.rtscts?'RTS/CTS':'None'}\nClicca per modificare`;
}

function _injectPortModalCSS() {
  if (document.getElementById('__psm-style')) return;
  const s = document.createElement('style');
  s.id = '__psm-style';
  s.textContent = `
    /* ── Nascondi i campi baud/data/parity/stop/flow/echo dalla UI principale ── */
    #p1-baud, #p1-data, #p1-parity, #p1-stop, #p1-flow, #p1-echo,
    #p2-baud, #p2-data, #p2-parity, #p2-stop, #p2-flow, #p2-echo,
    label[for="p1-baud"], label[for="p1-data"], label[for="p1-parity"],
    label[for="p1-stop"], label[for="p1-flow"], label[for="p1-echo"],
    label[for="p2-baud"], label[for="p2-data"], label[for="p2-parity"],
    label[for="p2-stop"], label[for="p2-flow"], label[for="p2-echo"] {
      display: none !important;
    }
    /* Nascondi anche i wrapper diretti che contengono solo quei campi.
       Usiamo :has() dove supportato (Electron/Chromium lo supporta). */
    span:has(> #p1-baud), span:has(> #p1-data), span:has(> #p1-parity),
    span:has(> #p1-stop), span:has(> #p1-flow), span:has(> #p1-echo),
    span:has(> #p2-baud), span:has(> #p2-data), span:has(> #p2-parity),
    span:has(> #p2-stop), span:has(> #p2-flow), span:has(> #p2-echo),
    div:has(> label[for="p1-baud"]), div:has(> label[for="p2-baud"]) {
      display: none !important;
    }

    .psm-grid {
      display: grid;
      grid-template-columns: 110px 1fr;
      gap: 8px 12px;
      align-items: center;
      margin-top: 12px;
    }
    .psm-grid label   { font-size: 12px; color: #8b949e; }
    .psm-grid select,
    .psm-grid input[type=text] { font-size: 12px; width: 100%; }

    /* Pulsante ingranaggio accanto al COM */
    .port-gear-btn {
      background: none;
      border: 1px solid #30363d;
      border-radius: 4px;
      color: #8b949e;
      cursor: pointer;
      font-size: 13px;
      padding: 1px 5px;
      margin-left: 4px;
      vertical-align: middle;
      transition: color .15s, border-color .15s;
    }
    .port-gear-btn:hover { color: #58a6ff; border-color: #58a6ff; }

    /* Label di sezione nel modal porta */
    .psm-section-label {
      font-size: 11px; font-weight: bold; color: #58a6ff;
      text-transform: uppercase; letter-spacing: .04em;
      margin: 10px 0 4px;
    }
  `;
  document.head.appendChild(s);
}

// ═══════════════════════ TASTI FUNZIONE F1–F12 ═══════════════════════════════

/** Esegue il comando associato a un tasto funzione. */
async function handleFkeyPress(fk) {
  const cmd    = interp(fk.command || '');
  const le     = lineEnding();
  const input  = document.getElementById('user-input');
  const cmdbar = input?.value || '';
  if (fk.autoSend !== false) {
    const sp = (cmd && cmdbar) ? ' ' : '';
    await writeTarget(cmd + sp + cmdbar + le, fk.portTarget || 'active');
  } else {
    input.value = cmd + (fk.addSpace ? ' ' : '') + cmdbar;
    input.focus();
  }
}

/** Apre il modal di configurazione tasti funzione. */
function openFkeyModal() {
  _ensureFkeyModal();
  _renderFkeyRows();
  document.getElementById('fkey-overlay').classList.remove('hidden');
}

function closeFkeyModal() {
  document.getElementById('fkey-overlay')?.classList.add('hidden');
}

/** Crea il modal la prima volta. */
function _ensureFkeyModal() {
  if (document.getElementById('fkey-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id        = 'fkey-overlay';
  overlay.className = 'modal-overlay hidden';
  overlay.innerHTML = `
    <div class="modal-box" style="width:620px;max-width:95vw">
      <div class="modal-header">
        <span>⌨ Tasti Funzione F1–F12</span>
        <button class="modal-close" id="fkey-close">×</button>
      </div>
      <div id="fkey-rows" style="display:flex;flex-direction:column;gap:6px;margin:12px 0;max-height:70vh;overflow-y:auto"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
        <button id="fkey-save" class="btn-primary">Salva</button>
        <button id="fkey-cancel" class="btn-secondary">Annulla</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => { if (e.target === overlay) closeFkeyModal(); });
  document.getElementById('fkey-close').addEventListener('click', closeFkeyModal);
  document.getElementById('fkey-cancel').addEventListener('click', closeFkeyModal);
  document.getElementById('fkey-save').addEventListener('click', _saveFkeyModal);
}

/** Renderizza le righe F1–F12 nel modal. */
function _renderFkeyRows() {
  const container = document.getElementById('fkey-rows');
  container.innerHTML = '';
  fkeyCfg.forEach((fk, i) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:50px 1fr 2fr 100px 80px;gap:6px;align-items:center';
    row.dataset.idx   = i;
    row.innerHTML = `
      <label style="font-weight:bold;font-size:12px;text-align:center">F${i+1}</label>
      <input  class="fk-label" type="text"   value="${esc(fk.label)}"   placeholder="Etichetta" style="font-size:12px">
      <input  class="fk-cmd"   type="text"   value="${esc(fk.command)}" placeholder="Comando"   style="font-size:12px;font-family:monospace">
      <select class="fk-port"  style="font-size:11px">
        <option value="active" ${fk.portTarget==='active'?'selected':''}>Porta attiva</option>
        <option value="1"      ${fk.portTarget==='1'     ?'selected':''}>Porta 1</option>
        <option value="2"      ${fk.portTarget==='2'     ?'selected':''}>Porta 2</option>
        <option value="both"   ${fk.portTarget==='both'  ?'selected':''}>Entrambe</option>
      </select>
      <label style="font-size:11px;display:flex;align-items:center;gap:4px;cursor:pointer">
        <input class="fk-enabled" type="checkbox" ${fk.enabled?'checked':''}>
        Attivo
      </label>`;
    container.appendChild(row);
  });
}

/** Legge i valori dal modal e li salva in fkeyCfg. */
async function _saveFkeyModal() {
  document.querySelectorAll('#fkey-rows [data-idx]').forEach(row => {
    const i = parseInt(row.dataset.idx);
    fkeyCfg[i] = {
      ...fkeyCfg[i],
      label:      row.querySelector('.fk-label').value.trim() || `F${i+1}`,
      command:    row.querySelector('.fk-cmd').value,
      portTarget: row.querySelector('.fk-port').value,
      enabled:    row.querySelector('.fk-enabled').checked,
    };
  });
  await saveConfig();
  renderFkeyBar();
  closeFkeyModal();
}

/** Barra visiva F1–F12 in fondo alla finestra. */
function renderFkeyBar() {
  let bar = document.getElementById('fkey-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'fkey-bar';
    // Inserisce la barra subito prima del contenuto principale
    document.body.appendChild(bar);
  }
  bar.innerHTML = '';
  fkeyCfg.forEach((fk, i) => {
    const btn = document.createElement('button');
    btn.className   = `fkey-btn${fk.enabled && fk.command ? ' fkey-active' : ''}`;
    btn.title       = fk.command || '(non configurato)';
    btn.innerHTML   = `<span class="fkey-name">F${i+1}</span><span class="fkey-label">${esc(fk.label)}</span>`;
    btn.addEventListener('click', () => {
      if (fk.enabled && fk.command) handleFkeyPress(fk);
      else openFkeyModal();
    });
    bar.appendChild(btn);
  });
}

// ─── CSS barra Fn ─────────────────────────────────────────────────────────────
function _injectFkeyCSS() {
  if (document.getElementById('__fkey-style')) return;
  const s = document.createElement('style');
  s.id = '__fkey-style';
  s.textContent = `
    #fkey-bar {
      display: flex;
      flex-wrap: nowrap;
      gap: 2px;
      padding: 2px 4px;
      background: #161b22;
      border-top: 1px solid #30363d;
      overflow-x: auto;
      scrollbar-width: none;
      flex-shrink: 0;
    }
    #fkey-bar::-webkit-scrollbar { display: none; }
    .fkey-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 48px;
      flex: 1;
      padding: 1px 3px;
      background: #21262d;
      border: 1px solid #30363d;
      border-radius: 3px;
      cursor: pointer;
      color: #8b949e;
      font-size: 9px;
      line-height: 1.3;
      white-space: nowrap;
      overflow: hidden;
    }
    .fkey-btn:hover      { background: #30363d; color: #c9d1d9; }
    .fkey-btn.fkey-active{ border-color: #58a6ff44; color: #c9d1d9; }
    .fkey-name { font-weight: bold; font-size: 8px; color: #58a6ff; }
    .fkey-label { overflow: hidden; text-overflow: ellipsis; max-width: 60px; }
  `;
  document.head.appendChild(s);
}

// ─── CSS griglia 4-colonne + drag indicator ───────────────────────────────────
function _injectGridCSS() {
  if (document.getElementById('__grid4-style')) return;
  const s = document.createElement('style');
  s.id = '__grid4-style';
  s.textContent = `
    /* ── Layout terminali: flex row con divider trascinabile ─────────────────── */
    /* Importante: usare :not(.hidden) per non battere display:none della classe hidden */
    .tab-term-group:not(.hidden) {
      display: flex !important;
      flex-direction: row !important;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    .tab-term-group.hidden { display: none !important; }
    .term-panel {
      display: flex;
      flex-direction: column;
      min-width: 0;
      overflow: hidden;
    }

    /* Fix scroll xterm: l'host deve avere un'altezza definita */
    .xterm-host {
      flex: 1;
      min-height: 0;
      overflow: hidden;
      position: relative;
    }
    /* Forza lo scroll interno di xterm a funzionare */
    .xterm-host .xterm { height: 100% !important; }
    .xterm-host .xterm-viewport {
      overflow-y: scroll !important;
      scrollbar-width: thin;
      scrollbar-color: #30363d transparent;
    }
    .xterm-host .xterm-viewport::-webkit-scrollbar { width: 6px; }
    .xterm-host .xterm-viewport::-webkit-scrollbar-thumb {
      background: #30363d; border-radius: 3px;
    }

    /* Divider trascinabile tra i due terminali */
    .term-divider {
      width: 5px !important;
      flex-shrink: 0;
      background: #21262d;
      border-left:  1px solid #30363d;
      border-right: 1px solid #30363d;
      cursor: col-resize !important;
      transition: background .15s;
      position: relative;
      z-index: 5;
    }
    .term-divider:hover,
    .term-divider:active { background: #58a6ff55 !important; }
    /* Linea centrale visibile */
    .term-divider::after {
      content: '⋮';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: #8b949e;
      font-size: 14px;
      pointer-events: none;
    }

    /* Griglia 4 colonne con posizionamento libero */
    #btn-list {
      display: grid !important;
      grid-template-columns: repeat(4, 1fr) !important;
      grid-auto-rows: var(--btn-row-h) !important;
      gap: 4px !important;
      align-items: stretch;
    }

    /* Rimosso il vecchio sbw-wide (era 2 col); ora tutto via grid-column */
    .sbw        { min-width: 0; }
    .sbw-wide   { /* deprecato, mantenuto per compat */ }

    /* Pulsanti: altezza piena del wrapper */
    .sbw .sb-btn { height: 100%; box-sizing: border-box; }

    /* Testo allineato a sinistra, icona piccola in alto a destra */
    .sb-btn {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      padding: 0 6px;
      overflow: hidden;
    }
    .sb-btn-title {
      flex: 1;
      text-align: left;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 11px;
    }
    /* Icona (fulmine / matita) — piccola badge in alto a destra */
    .sb-btn-icon {
      position: absolute;
      top: 1px;
      right: 3px;
      font-size: 7px;
      opacity: 0.55;
      line-height: 1;
      pointer-events: none;
    }
    /* Badge porta — rimane dov'era */
    .sb-btn-port {
      font-size: 8px;
      opacity: 0.7;
      margin-left: 3px;
      flex-shrink: 0;
    }

    /* Indicatore di drop: cella fantasma colorata */
    .drag-drop-indicator {
      background: rgba(99, 179, 237, 0.25);
      border: 2px dashed #63b3ed;
      border-radius: 6px;
      pointer-events: none;
      z-index: 10;
    }

    /* Wrapper trascinato: semi-trasparente */
    .sbw.dragging { opacity: 0.35; }

    /* Variabile altezza riga pulsanti */
    :root { --btn-row-h: 26px; }

    /* ── Tab bar scrollabile ─────────────────────────────────────────────── */
    #tabs-wrapper {
      position: relative;
      display: flex;
      align-items: center;
      min-width: 0;
      flex: 1;
      overflow: hidden;
    }
    #tabs-container {
      display: flex;
      flex-wrap: nowrap;
      overflow-x: auto;
      overflow-y: hidden;
      scroll-behavior: smooth;
      scrollbar-width: none;          /* Firefox */
      -ms-overflow-style: none;       /* IE/Edge */
      flex: 1;
      min-width: 0;
    }
    #tabs-container::-webkit-scrollbar { display: none; }

    /* Frecce laterali — visibili solo quando serve */
    .tab-scroll-btn {
      flex-shrink: 0;
      width: 22px;
      height: 100%;
      display: none;                  /* mostrate via JS */
      align-items: center;
      justify-content: center;
      cursor: pointer;
      background: linear-gradient(to right, transparent, rgba(0,0,0,.35));
      border: none;
      color: #ccc;
      font-size: 13px;
      padding: 0;
      z-index: 2;
    }
    .tab-scroll-btn.left  { background: linear-gradient(to left,  transparent, rgba(0,0,0,.35)); }
    .tab-scroll-btn:hover { color: #fff; }
    /* Cursore grab in edit mode */
    #btn-list .sbw[draggable="true"] { cursor: grab; }
    #btn-list .sbw[draggable="true"]:active { cursor: grabbing; }
  `;
  document.head.appendChild(s);
}
