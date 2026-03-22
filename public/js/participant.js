/* ═══════════════════════════════════════════════
   Participant App — ENOUGH · Misfit Architecture
   ═══════════════════════════════════════════════ */

// ── Data & Socket ──
let D = JSON.parse(localStorage.getItem('mm-data') || '{}');
let sid = localStorage.getItem('mm-sid');
if (!sid) {
  sid = Math.random().toString(36).slice(2) + Date.now();
  localStorage.setItem('mm-sid', sid);
}

// Session code from URL param
const urlParams = new URLSearchParams(window.location.search);
const sessionCode = urlParams.get('s') || 'LIVE';

// Socket.io — safe init (works without server too)
let socket;
try {
  socket = io();
  socket.emit('join-session', { sessionCode, participantId: sid });
} catch (e) {
  socket = { on() {}, emit() {}, off() {} };
}

// ── Phase Navigation ──
function goPhase(p) {
  D = JSON.parse(localStorage.getItem('mm-data') || '{}');
  document.querySelectorAll('.phase').forEach(el => el.classList.remove('active'));
  document.getElementById('p' + p).classList.add('active');

  for (let i = 1; i <= 3; i++) {
    const step = document.getElementById('step' + i);
    step.classList.remove('active', 'done');
    step.removeAttribute('aria-current');
    if (i < p) step.classList.add('done');
    if (i === p) { step.classList.add('active'); step.setAttribute('aria-current', 'step'); }

    const line = document.getElementById('line' + i);
    if (line) { line.classList.toggle('done', i < p); }
  }

  window.scrollTo(0, 0);
  announce('Phase ' + p);
  restore(p);
}

function goToPosition() {
  autoSave();
  const pos = calculatePosition(D);
  D.startingLine = pos;
  autoSave();
  socket.emit('phase1-complete', {
    participantId: sid,
    position: pos,
    costCount: (D.costs?.items || []).length,
    assetCount: (D.assets?.items || []).length
  });
  goPhase(2);
}

function nextPhase(p) {
  autoSave();
  goPhase(p);
}

// ── Cost Chips ──
function toggleCost(el) {
  if (!D.costs) D.costs = { items: [], hrs: [], cats: [], counters: [], legacy: [] };

  const isOn = el.classList.contains('on');
  const label = el.textContent.replace(/ ✓$/g, '').trim();

  if (!isOn) {
    // Add
    if (!D.costs.items.includes(label)) {
      D.costs.items.push(label);
      D.costs.hrs.push(parseFloat(el.dataset.hrs) || 0);
      D.costs.cats.push(el.dataset.cat || 'coached');
      D.costs.counters.push(el.dataset.counter || '');
      D.costs.legacy.push(el.dataset.legacy || '');
    }
    el.classList.add('on');
    el.setAttribute('aria-checked', 'true');
    el.textContent = label + ' ✓';
  } else {
    // Remove
    const idx = D.costs.items.indexOf(label);
    if (idx !== -1) {
      D.costs.items.splice(idx, 1);
      D.costs.hrs.splice(idx, 1);
      D.costs.cats.splice(idx, 1);
      D.costs.counters.splice(idx, 1);
      D.costs.legacy.splice(idx, 1);
    }
    el.classList.remove('on');
    el.setAttribute('aria-checked', 'false');
    el.textContent = label;
  }

  renderCols();
  calcTax();
  updateBattery();
  autoSave();
}

// ── Asset Chips ──
function toggleAsset(el) {
  if (!D.assets) D.assets = { items: [], pts: [] };

  const isOn = el.classList.contains('on');
  const label = el.textContent.replace(/ ✓$/g, '').trim();

  if (!isOn) {
    if (!D.assets.items.includes(label)) {
      D.assets.items.push(label);
      D.assets.pts.push(parseFloat(el.dataset.pts) || 1);
    }
    el.classList.add('on');
    el.setAttribute('aria-checked', 'true');
    el.textContent = label + ' ✓';
  } else {
    const idx = D.assets.items.indexOf(label);
    if (idx !== -1) {
      D.assets.items.splice(idx, 1);
      D.assets.pts.splice(idx, 1);
    }
    el.classList.remove('on');
    el.setAttribute('aria-checked', 'false');
    el.textContent = label;
  }

  renderCols();
  updateBattery();
  autoSave();
}

// ── Custom Columns ──
function addCustomCol(type) {
  const input = document.getElementById(type + '-input');
  const val = input.value.trim();
  if (!val) return;

  if (type === 'cost') {
    if (!D.costs) D.costs = { items: [], hrs: [], cats: [], counters: [], legacy: [] };
    D.costs.items.push(val);
    D.costs.hrs.push(0);
    D.costs.cats.push('coached');
    D.costs.counters.push('');
    D.costs.legacy.push('');
  } else {
    if (!D.assets) D.assets = { items: [], pts: [] };
    D.assets.items.push(val);
    D.assets.pts.push(1);
  }

  input.value = '';
  renderCols();
  calcTax();
  updateBattery();
  autoSave();
}

// Enter key for custom inputs
document.getElementById('cost-input').addEventListener('keydown', e => { if (e.key === 'Enter') addCustomCol('cost'); });
document.getElementById('asset-input').addEventListener('keydown', e => { if (e.key === 'Enter') addCustomCol('asset'); });

// ── Render Ledger Columns ──
function renderCols() {
  renderOneCol('cost-col-items', D.costs?.items || [], 'cost');
  renderOneCol('asset-col-items', D.assets?.items || [], 'asset');
}

function renderOneCol(id, items, type) {
  const container = document.getElementById(id);
  container.innerHTML = '';

  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'ledger-empty';
    empty.textContent = 'Nothing added yet';
    container.appendChild(empty);
    return;
  }

  items.forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'ledger-item';
    const span = document.createElement('span');
    span.textContent = item;
    const btn = document.createElement('button');
    btn.className = 'del-btn';
    btn.textContent = '×';
    btn.setAttribute('aria-label', 'Remove ' + item);
    btn.onclick = () => deleteCol(type, i);
    div.appendChild(span);
    div.appendChild(btn);
    container.appendChild(div);
  });
}

function deleteCol(type, i) {
  if (type === 'cost') {
    const item = D.costs.items[i];
    D.costs.items.splice(i, 1);
    D.costs.hrs.splice(i, 1);
    D.costs.cats.splice(i, 1);
    D.costs.counters.splice(i, 1);
    D.costs.legacy.splice(i, 1);
    // Untoggle chip if it exists
    untoggleChip(item, 'chip-cost');
  } else {
    const item = D.assets.items[i];
    D.assets.items.splice(i, 1);
    D.assets.pts.splice(i, 1);
    untoggleChip(item, 'chip-asset');
  }
  renderCols();
  calcTax();
  updateBattery();
  autoSave();
}

function untoggleChip(label, cls) {
  document.querySelectorAll('.' + cls + '.on').forEach(chip => {
    if (chip.textContent.replace(' ✓', '').trim() === label) {
      chip.classList.remove('on');
      chip.setAttribute('aria-checked', 'false');
      chip.textContent = label;
    }
  });
}

// ── Tax Calculator ──
function calcTax() {
  const rate = parseFloat(document.getElementById('hourly-rate')?.value) || 0;
  const grossHrs = (D.costs?.hrs || []).reduce((a, b) => a + b, 0);

  // Calculate condition offsets (same logic as battery and calculator)
  const assetItems = D.assets?.items || [];
  let offsetHrs = 0;
  if (assetItems.includes('I can be myself in my work'))            offsetHrs += 1.5;
  if (assetItems.includes('A work environment that suits me'))      offsetHrs += 1;
  if (assetItems.includes('I am safe at home'))                     offsetHrs += 3;
  if (assetItems.includes('I set my own pace'))                     offsetHrs += 1;
  if (assetItems.includes('Flexible schedule'))                     offsetHrs += 0.5;
  if (assetItems.includes('Care at home is shared or supported'))   offsetHrs += 2;
  if (assetItems.includes('Supportive people around me'))           offsetHrs += 1;
  if (assetItems.includes('Reliable childcare in place'))           offsetHrs += 2;
  if (assetItems.includes('I have help with operations or admin'))  offsetHrs += 1;
  if (assetItems.includes('I have guidance that fits my actual life')) offsetHrs += 1.5;
  if (assetItems.includes('A financial safety net exists'))         offsetHrs += 1;

  const hrs = Math.max(0, grossHrs - offsetHrs);
  D.taxHrs = grossHrs;
  D.taxHrsNet = hrs;
  D.hourlyRate = rate;

  if (!rate || !grossHrs) {
    document.getElementById('tax-results').classList.remove('visible');
    return;
  }

  const wk = hrs * rate;
  const yr = wk * 48;

  document.getElementById('tax-results').classList.add('visible');
  document.getElementById('tx-hrs').textContent = hrs.toFixed(1) + 'h / week';
  document.getElementById('tx-week').textContent = '$' + Math.round(wk).toLocaleString();
  document.getElementById('tx-year').textContent = '$' + Math.round(yr).toLocaleString();

  if (offsetHrs > 0 && offsetHrs < grossHrs) {
    document.getElementById('tx-insight').textContent =
      `Your conditions are offsetting ${offsetHrs.toFixed(1)} hours. But you are still giving away $${Math.round(wk).toLocaleString()} worth of time every week. Over 48 working weeks that is $${Math.round(yr).toLocaleString()}. The conditions helped. They did not fix it.`;
  } else if (hrs === 0) {
    document.getElementById('tx-insight').textContent =
      'Your conditions are fully offsetting your hidden costs. That is rare. Protect what you have built.';
  } else {
    document.getElementById('tx-insight').textContent =
      `Every week you give away $${Math.round(wk).toLocaleString()} worth of time that never shows up on any invoice. Over 48 working weeks that adds up to $${Math.round(yr).toLocaleString()}. That is not a confidence problem. It is a missing column problem.`;
  }
}

// ── Phase 2: Position Rendering ──
function renderPosition() {
  const pos = D.startingLine || calculatePosition(D);
  const p = POSITIONS[pos] || POSITIONS.blocks;

  const card = document.getElementById('position-card');
  card.className = 'position-card ' + p.cls;
  document.getElementById('pos-emoji').textContent = p.emoji;
  document.getElementById('pos-title').textContent = p.title;
  document.getElementById('pos-desc').textContent = p.desc;
  document.getElementById('pos-sent').textContent = 'Sent to the room ✓';

  // Counter conditions
  const counters = (D.costs?.counters || []).filter(c => c);
  const cb = document.getElementById('counter-box');
  const ci = document.getElementById('counter-items');

  if (counters.length) {
    cb.style.display = 'flex';
    ci.innerHTML = '';
    const seen = new Set();
    (D.costs.counters || []).forEach((c, i) => {
      if (!c || seen.has(c)) return;
      seen.add(c);
      const item = D.costs.items[i] || '';
      const div = document.createElement('div');
      div.className = 'counter-item';
      div.innerHTML = `<div class="counter-for">for</div><div><div class="counter-from">${item}</div><div class="counter-text">${c}</div></div>`;
      ci.appendChild(div);
    });
  } else {
    cb.style.display = 'none';
  }

  // Legacy
  const legacy = (D.costs?.legacy || []).filter(l => l);
  const lb = document.getElementById('legacy-box');
  const li = document.getElementById('legacy-items');

  if (legacy.length) {
    lb.style.display = 'flex';
    li.innerHTML = '';
    const seen = new Set();
    (D.costs.legacy || []).forEach(l => {
      if (!l || seen.has(l)) return;
      seen.add(l);
      const div = document.createElement('div');
      div.className = 'legacy-item';
      div.textContent = l;
      li.appendChild(div);
    });
  } else {
    lb.style.display = 'none';
  }
}

// ── Phase 3: Reprice ──
function selectOffer(el) {
  document.querySelectorAll('#offer-chips .chip').forEach(c => {
    c.classList.remove('on');
    c.setAttribute('aria-checked', 'false');
  });
  el.classList.add('on');
  el.setAttribute('aria-checked', 'true');
  document.getElementById('offer-name').value = el.textContent;
  calcReprice();
  autoSave();
}

function renderPhase3Position() {
  const pos = D.startingLine || calculatePosition(D);
  const p = POSITIONS[pos] || POSITIONS.blocks;

  const card = document.getElementById('p3-position-card');
  if (!card) return;
  card.className = 'position-card ' + p.cls;
  document.getElementById('p3-pos-emoji').textContent = p.emoji;
  document.getElementById('p3-pos-title').textContent = p.title;
  document.getElementById('p3-pos-desc').textContent = p.desc;

  // Show hidden cost hours and list
  const grossHrs = (D.costs?.hrs || []).reduce((a, b) => a + b, 0);
  const netHrs = D.taxHrsNet != null ? D.taxHrsNet : grossHrs;
  const hrsEl = document.getElementById('p3-hidden-hrs');
  if (hrsEl) hrsEl.textContent = netHrs.toFixed(1) + 'h';

  const listEl = document.getElementById('p3-cost-list');
  if (listEl && D.costs?.items?.length) {
    listEl.textContent = D.costs.items.join(' · ');
  } else if (listEl) {
    listEl.textContent = 'Go back to Phase 1 to build your picture first.';
  }
}

function calcReprice() {
  const offer = document.getElementById('offer-name')?.value.trim() || '';
  const price = parseFloat(document.getElementById('current-price')?.value) || 0;
  const visH = parseFloat(document.getElementById('visible-hours')?.value) || 0;

  // Hidden hours from Phase 1 (net of condition offsets)
  const grossHrs = (D.costs?.hrs || []).reduce((a, b) => a + b, 0);
  const hidH = D.taxHrsNet != null ? D.taxHrsNet : grossHrs;

  const totH = visH + hidH;
  const apparentRate = visH > 0 ? price / visH : 0;
  const realRate = totH > 0 ? price / totH : 0;
  const gap = apparentRate - realRate;

  D.reprice = { offer, price, visH, hidH, totH, apparentRate, realRate, gap };

  if (!offer || !price || !visH) return;

  document.getElementById('result-box').classList.add('visible');
  document.getElementById('r-offer').textContent = offer;
  document.getElementById('r-charge').textContent = '$' + price.toLocaleString();
  document.getElementById('r-vis').textContent = visH + 'h';
  document.getElementById('r-hidden').textContent = hidH.toFixed(1) + 'h (from your picture)';
  document.getElementById('r-total').textContent = totH.toFixed(1) + 'h';
  document.getElementById('r-apparent').textContent = '$' + Math.round(apparentRate).toLocaleString() + '/hr';
  document.getElementById('r-real').textContent = '$' + Math.round(realRate).toLocaleString() + '/hr';
  document.getElementById('r-gap').textContent = '$' + Math.round(gap).toLocaleString() + '/hr missing';

  if (gap > 0) {
    const pctDrop = Math.round((gap / apparentRate) * 100);
    document.getElementById('r-insight').textContent =
      `You think you earn $${Math.round(apparentRate).toLocaleString()} per hour. You actually earn $${Math.round(realRate).toLocaleString()}. That is a ${pctDrop}% drop that never shows up on any invoice. It is not a confidence problem. It is a missing column problem. You now have the column.`;
  } else {
    document.getElementById('r-insight').textContent =
      'Your pricing already accounts for the real cost. The question is whether your capacity allows you to sustain it.';
  }
}

// ── Save & Restore ──
function autoSave() {
  localStorage.setItem('mm-data', JSON.stringify(D));
  showToast('Saved ✓');
}

function saveMap() {
  autoSave();
  for (let i = 1; i <= 3; i++) {
    document.getElementById('step' + i).classList.add('done');
    document.getElementById('step' + i).classList.remove('active');
  }
  const conf = document.getElementById('save-conf');
  if (conf) conf.style.display = 'block';
  window.scrollTo(0, document.body.scrollHeight);
}

function restore(p) {
  D = JSON.parse(localStorage.getItem('mm-data') || '{}');

  if (p === 1) {
    if (D.costs || D.assets) renderCols();
    if (D.hourlyRate) { document.getElementById('hourly-rate').value = D.hourlyRate; calcTax(); }

    // Restore chip states
    if (D.costs?.items) {
      D.costs.items.forEach(item => {
        document.querySelectorAll('.chip-cost').forEach(chip => {
          if (chip.textContent.replace(' ✓', '').trim() === item && !chip.classList.contains('on')) {
            chip.classList.add('on');
            chip.setAttribute('aria-checked', 'true');
            chip.textContent = item + ' ✓';
          }
        });
      });
    }
    if (D.assets?.items) {
      D.assets.items.forEach(item => {
        document.querySelectorAll('.chip-asset').forEach(chip => {
          if (chip.textContent.replace(' ✓', '').trim() === item && !chip.classList.contains('on')) {
            chip.classList.add('on');
            chip.setAttribute('aria-checked', 'true');
            chip.textContent = item + ' ✓';
          }
        });
      });
    }
    updateBattery();
  }

  if (p === 2) renderPosition();

  if (p === 3) {
    renderPhase3Position();
    if (D.reprice) {
      const r = D.reprice;
      if (r.offer) document.getElementById('offer-name').value = r.offer;
      if (r.price) document.getElementById('current-price').value = r.price;
      if (r.visH) document.getElementById('visible-hours').value = r.visH;
      calcReprice();
    }
  }
}

// ── Toast ──
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 1800);
}

// ── SR Announcements ──
function announce(msg) {
  const el = document.getElementById('sr-announcements');
  if (el) el.textContent = msg;
}

// ── Export ──
function exportSummary() {
  const pl = {
    carpark: 'Still in the car park',
    injuries: 'Carrying injuries that never healed',
    weight: 'Carrying weight nobody else holds',
    coached: 'Coached by accident not design',
    blocks: 'At the blocks',
    ahead: 'Ahead of the line'
  };

  let txt = 'MISFIT ARCHITECTURE — YOUR MINI MAP\n';
  txt += 'ENOUGH · Tanya Hicks\n';
  txt += '─'.repeat(42) + '\n\n';

  if (D.startingLine) {
    txt += 'MY STARTING POSITION (calculated)\n';
    txt += (pl[D.startingLine] || D.startingLine) + '\n\n';
  }

  if (D.costs?.items?.length) {
    txt += 'WHAT IS TAKING FROM ME\n';
    txt += D.costs.items.join('\n') + '\n';
    if (D.hourlyRate && D.taxHrs) {
      const wk = D.taxHrs * D.hourlyRate;
      txt += `→ $${Math.round(wk).toLocaleString()}/week · $${Math.round(wk * 48).toLocaleString()}/year given away free\n`;
    }
    txt += '\n';
  }

  if (D.costs?.counters?.filter(c => c).length) {
    txt += 'TO GET TO THE STARTING LINE, I NEED\n';
    const seen = new Set();
    (D.costs.counters || []).forEach(c => {
      if (c && !seen.has(c)) { seen.add(c); txt += `· ${c}\n`; }
    });
    txt += '\n';
  }

  if (D.assets?.items?.length) {
    txt += 'WHAT IS ALREADY WORKING FOR ME\n';
    txt += D.assets.items.join('\n') + '\n\n';
  }

  if (D.costs?.legacy?.filter(l => l).length) {
    txt += 'WHAT I CAN BUILD FOR THOSE WHO COME AFTER ME\n';
    const seen = new Set();
    (D.costs.legacy || []).forEach(l => {
      if (l && !seen.has(l)) { seen.add(l); txt += `· ${l}\n`; }
    });
    txt += '\n';
  }

  if (D.reprice?.offer) {
    const r = D.reprice;
    txt += 'MY REPRICE\n';
    txt += `Offer: ${r.offer}\n`;
    txt += `Currently charging: $${r.price}\n`;
    txt += `Actual cost: $${Math.round(r.cost)}\n`;
    txt += `Minimum price: $${Math.round(r.min)}\n\n`;
  }

  txt += '─'.repeat(42) + '\n';
  txt += '"The starting line moved. Not because she changed.\n';
  txt += 'Because the conditions stopped extracting from her\n';
  txt += 'before she had to begin."\n\n';
  txt += 'tanyahicks.com';

  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' }));
  a.download = 'misfit-architecture-my-map.txt';
  a.click();
}

// ── Accessibility ──
let fontSizeLevel = 0;

function changeFontSize(dir) {
  if (dir === 0) fontSizeLevel = 0;
  else fontSizeLevel = Math.max(-2, Math.min(4, fontSizeLevel + dir));
  document.documentElement.style.fontSize = (100 + fontSizeLevel * 12.5) + '%';
  saveA11yPrefs();
}

function toggleA11y(feature) {
  const map = {
    dyslexia: 'dyslexia-mode',
    contrast: 'high-contrast',
    motion: 'reduced-motion',
    spacing: 'spacing-mode',
    dark: 'dark-mode',
    guide: null
  };

  const btn = document.getElementById(feature + '-toggle');
  const pressed = btn.getAttribute('aria-pressed') === 'true';
  btn.setAttribute('aria-pressed', !pressed);

  if (feature === 'guide') {
    const guide = document.getElementById('reading-guide');
    guide.style.display = !pressed ? 'block' : 'none';
    if (!pressed) {
      document.addEventListener('mousemove', moveGuide);
      document.addEventListener('touchmove', moveGuideTouch);
    } else {
      document.removeEventListener('mousemove', moveGuide);
      document.removeEventListener('touchmove', moveGuideTouch);
    }
  } else {
    document.body.classList.toggle(map[feature], !pressed);
  }

  saveA11yPrefs();
}

function moveGuide(e) {
  document.getElementById('reading-guide').style.top = (e.clientY - 20) + 'px';
}

function moveGuideTouch(e) {
  if (e.touches[0]) {
    document.getElementById('reading-guide').style.top = (e.touches[0].clientY - 20) + 'px';
  }
}

document.getElementById('a11y-toggle').addEventListener('click', () => {
  const panel = document.getElementById('a11y-panel');
  const isOpen = panel.classList.contains('open');
  panel.classList.toggle('open', !isOpen);
  document.getElementById('a11y-toggle').setAttribute('aria-expanded', !isOpen);
});

function closeA11y() {
  document.getElementById('a11y-panel').classList.remove('open');
  document.getElementById('a11y-toggle').setAttribute('aria-expanded', 'false');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeA11y();
});

function saveA11yPrefs() {
  const prefs = {
    fontSize: fontSizeLevel,
    dyslexia: document.body.classList.contains('dyslexia-mode'),
    contrast: document.body.classList.contains('high-contrast'),
    motion: document.body.classList.contains('reduced-motion'),
    spacing: document.body.classList.contains('spacing-mode'),
    dark: document.body.classList.contains('dark-mode'),
    guide: document.getElementById('reading-guide').style.display === 'block'
  };
  localStorage.setItem('a11y-prefs', JSON.stringify(prefs));
}

// Load saved a11y preferences
try {
  const saved = JSON.parse(localStorage.getItem('a11y-prefs'));
  if (saved) {
    if (saved.fontSize) { fontSizeLevel = saved.fontSize; document.documentElement.style.fontSize = (100 + fontSizeLevel * 12.5) + '%'; }
    if (saved.dyslexia) toggleA11y('dyslexia');
    if (saved.contrast) toggleA11y('contrast');
    if (saved.motion) toggleA11y('motion');
    if (saved.spacing) toggleA11y('spacing');
    if (saved.dark) toggleA11y('dark');
    if (saved.guide) toggleA11y('guide');
  }
} catch (e) {}

// Auto-detect prefers-reduced-motion
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.body.classList.add('reduced-motion');
  const mt = document.getElementById('motion-toggle');
  if (mt) mt.setAttribute('aria-pressed', 'true');
}

// ── Text-to-Speech ──
if (window.speechSynthesis) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}

let currentTTSBtn = null;

function speakPhase(phaseNum) {
  const btn = document.querySelector('#p' + phaseNum + ' .tts-btn');
  if (!window.speechSynthesis) return;

  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    document.querySelectorAll('.tts-btn').forEach(b => b.classList.remove('speaking'));
    if (currentTTSBtn === btn) { currentTTSBtn = null; return; }
  }

  const phase = document.getElementById('p' + phaseNum);
  const els = phase.querySelectorAll('.phase-title, .phase-sub, .intro-box, .pos-title, .pos-desc');
  let text = '';
  els.forEach(el => { text += el.textContent + '. '; });

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.92;
  utterance.pitch = 1.05;

  const voices = window.speechSynthesis.getVoices();
  const preferred = ['Samantha', 'Karen', 'Moira', 'Tessa', 'Google UK English Female', 'Google US English'];
  let bestVoice = null;
  for (const name of preferred) {
    bestVoice = voices.find(v => v.name.includes(name));
    if (bestVoice) break;
  }
  if (!bestVoice) bestVoice = voices.find(v => v.lang.startsWith('en'));
  if (bestVoice) utterance.voice = bestVoice;

  utterance.onend = () => { btn.classList.remove('speaking'); currentTTSBtn = null; };
  btn.classList.add('speaking');
  currentTTSBtn = btn;
  window.speechSynthesis.speak(utterance);
}

// ── Battery Visual ──
const BATTERY_MAX_HRS = 40; // scale: 40 hrs of cost = 0%

function updateBattery() {
  const costHrs = (D.costs?.hrs || []).reduce((a, b) => a + b, 0);

  // Calculate condition offsets (same logic as calculator.js)
  const assetItems = D.assets?.items || [];
  let offsetHrs = 0;
  if (assetItems.includes('I can be myself in my work'))            offsetHrs += 1.5;
  if (assetItems.includes('A work environment that suits me'))      offsetHrs += 1;
  if (assetItems.includes('I am safe at home'))                     offsetHrs += 3;
  if (assetItems.includes('I set my own pace'))                     offsetHrs += 1;
  if (assetItems.includes('Flexible schedule'))                     offsetHrs += 0.5;
  if (assetItems.includes('Care at home is shared or supported'))   offsetHrs += 2;
  if (assetItems.includes('Supportive people around me'))           offsetHrs += 1;
  if (assetItems.includes('Reliable childcare in place'))           offsetHrs += 2;
  if (assetItems.includes('I have help with operations or admin'))  offsetHrs += 1;
  if (assetItems.includes('I have guidance that fits my actual life')) offsetHrs += 1.5;
  if (assetItems.includes('A financial safety net exists'))         offsetHrs += 1;

  const netHrs = Math.max(0, costHrs - offsetHrs);
  const pct = Math.max(0, Math.round(100 - (netHrs / BATTERY_MAX_HRS * 100)));

  const fill = document.getElementById('battery-fill');
  const pctEl = document.getElementById('battery-pct');
  const status = document.getElementById('battery-status');
  if (!fill) return;

  // Scale fill
  fill.style.transform = `scaleY(${pct / 100})`;

  // Update percentage text
  pctEl.textContent = pct + '%';

  // Color and status based on level
  if (pct > 70) {
    pctEl.style.color = '#fff';
    status.style.color = 'var(--asset)';
    status.textContent = 'Strong';
  } else if (pct > 40) {
    pctEl.style.color = 'var(--ink)';
    status.style.color = 'var(--gold)';
    status.textContent = 'Depleting';
  } else if (pct > 15) {
    pctEl.style.color = 'var(--cost)';
    status.style.color = 'var(--cost)';
    status.textContent = 'Running low';
  } else {
    pctEl.style.color = 'var(--cost)';
    status.style.color = 'var(--cost)';
    status.textContent = 'Near empty';
  }

  // Announce to screen readers
  announce('Capacity at ' + pct + ' percent');
}

// ── Init ──
restore(1);
