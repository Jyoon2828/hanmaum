'use strict';

// 사용자가 제공한 PNG 원본만 등록합니다. 경로는 저장소 하위 주소에서도 작동합니다.
const BACKGROUNDS = [
  { id: 'bg01', title: '연꽃과 새벽 연못', category: '수채화', src: './assets/watercolor-lotus.png', recommendedPosition: 'top', recommendedColor: '#513a2d' },
  { id: 'bg02', title: '고요한 사찰', category: '수채화', src: './assets/watercolor-temple.png', recommendedPosition: 'top', recommendedColor: '#292d2c' },
  { id: 'bg03', title: '연꽃과 새', category: '색연필', src: './assets/colored-pencil-lotus-bird.png', recommendedPosition: 'top', recommendedColor: '#513a2d' },
  { id: 'bg04', title: '한마음선원 우주탑', category: '색연필', src: './assets/colored-pencil-ujutap.png', recommendedPosition: 'top', recommendedColor: '#292d2c' },
  { id: 'bg05', title: '사찰의 풍경', category: '실사', src: './assets/photo-temple.png', recommendedPosition: 'top', recommendedColor: '#ffffff' },
  { id: 'bg06', title: '연꽃의 시간', category: '실사', src: './assets/photo-lotus.png', recommendedPosition: 'top', recommendedColor: '#513a2d' }
];
const FONTS = [
  { name: '단정한 명조', label: '나눔명조', family: 'Nanum Myeongjo' },
  { name: '또렷한 고딕', label: '노토 산스', family: 'Noto Sans KR' },
  { name: '부드러운 고딕', label: '고운돋움', family: 'Gowun Dodum' },
  { name: '편안한 손글씨', label: '나눔펜', family: 'Nanum Pen Script' },
  { name: '힘 있는 붓글씨', label: '나눔붓', family: 'Nanum Brush Script' },
  { name: '전통적인 글씨', label: '송명', family: 'Song Myung' }
];
const $ = (selector) => document.querySelector(selector);
const state = { mode: 'quote', quotes: [], selectedId: null, customText: '', author: '',
  background: null, category: '전체', font: 0, ratio: 'portrait', size: 'auto',
  position: 'middle', align: 'center', color: '#292d2c', readability: true };
const canvas = $('#preview');
const ctx = canvas.getContext('2d');
let renderVersion = 0;
let pendingRender = Promise.resolve();
let renderError = null;
let currentBlob = null;
let currentObjectUrl = null;
let exporting = false;
let loadingQuotes = false;
let photoUrl = null;
let photoBackground = null;
let availableBackgrounds = [];
const imageCache = new Map();
const fontCache = new Map();
const restrictedInAppBrowser = /KAKAOTALK|FBAN|FBAV|Instagram|NAVER\(inapp|DaumApps|; wv\)/i.test(navigator.userAgent);
const androidDevice = /Android/i.test(navigator.userAgent);

function setMessage(message) { $('#message').textContent = message; }
function showBrowserNotice() {
  if (!restrictedInAppBrowser) return;
  const notice = $('#in-app-warning');
  notice.hidden = false;
  if (!androidDevice) {
    $('#open-browser').hidden = true;
    $('#open-samsung').hidden = true;
    notice.querySelector('p').textContent = '카카오톡 안에서는 이미지 저장과 공유가 제한됩니다. 주소를 복사한 뒤 Safari 주소창에 붙여 넣어 주세요.';
  }
}
function externalBrowserUrl(packageName) {
  const scheme = location.protocol === 'http:' ? 'http' : 'https';
  const path = `${location.host}${location.pathname}${location.search}`;
  return `intent://${path}#Intent;scheme=${scheme};package=${packageName};S.browser_fallback_url=${encodeURIComponent(location.href)};end`;
}
async function copyPageAddress() {
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) await navigator.clipboard.writeText(location.href);
    else {
      const input = document.createElement('textarea'); input.value = location.href; input.style.position = 'fixed'; input.style.opacity = '0';
      document.body.append(input); input.select();
      if (!document.execCommand('copy')) throw new Error('copy');
      input.remove();
    }
    setMessage('주소를 복사했습니다. Chrome, 삼성 인터넷 또는 Safari 주소창에 붙여 넣어 주세요.');
  } catch { setMessage('주소를 복사하지 못했습니다. 카카오톡 오른쪽 위 메뉴에서 다른 브라우저로 열어 주세요.'); }
}
function setExportReady(ready) {
  if (exporting) return;
  document.querySelectorAll('[data-export]').forEach((button) => {
    button.disabled = !ready;
    button.setAttribute('aria-disabled', String(!ready));
  });
}
function refreshObjectUrl(blob) {
  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = blob ? URL.createObjectURL(blob) : null;
  $('#manual-save').hidden = !blob;
}
function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  })]).finally(() => clearTimeout(timer));
}

// CSV 따옴표 안의 줄바꿈, 쉼표, 이중 따옴표를 원문 그대로 보존합니다.
function parseCSV(csv) {
  const rows = []; let row = []; let field = ''; let quoted = false; let closed = false;
  const input = csv.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else { field += char; }
    } else if (char === '"') {
      if (field || closed) throw new Error('CSV 따옴표 형식이 잘못되었습니다.');
      quoted = true;
    } else if (char === ',' || char === '\n' || char === '\r') {
      row.push(field); field = ''; closed = false;
      if (char !== ',') {
        rows.push(row); row = [];
        if (char === '\r' && input[i + 1] === '\n') i++;
      }
    } else {
      if (closed) throw new Error('CSV 따옴표 뒤에 잘못된 내용이 있습니다.');
      field += char;
    }
  }
  if (quoted) throw new Error('CSV 따옴표가 닫히지 않았습니다.');
  if (field || row.length || closed) { row.push(field); rows.push(row); }
  return rows.filter((cells) => cells.some((cell) => cell.trim()));
}

function quotesFromCSV(csv) {
  const rows = parseCSV(csv);
  const required = ['id', 'category', 'text', 'author', 'source', 'verified', 'enabled', 'sortOrder'];
  const header = (rows.shift() || []).map((value) => value.trim());
  if (required.some((key) => !header.includes(key)) || new Set(header).size !== header.length) {
    throw new Error('CSV 열 제목을 확인해 주세요.');
  }
  const seen = new Set();
  return rows.map((row) => {
    if (row.length !== header.length) throw new Error('CSV 열 개수가 일치하지 않습니다.');
    return Object.fromEntries(header.map((key, index) => [key, row[index]]));
  }).filter((quote) => /^true$/i.test(quote.verified.trim()) && /^true$/i.test(quote.enabled.trim()))
    .filter((quote) => {
      if (!quote.id.trim() || !quote.text.trim() || seen.has(quote.id)) return false;
      seen.add(quote.id); return true;
    }).map((quote) => ({ ...quote, sortOrder: Number.isFinite(Number(quote.sortOrder)) ? Number(quote.sortOrder) : Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function cacheKey(url) { return `mind-card:quotes:v1:${url}`; }
function readCachedQuotes(url) {
  try {
    const cache = JSON.parse(localStorage.getItem(cacheKey(url)));
    // 캐시도 동일한 필터와 열 검사를 거칩니다. 다른 CSV 주소의 자료는 사용하지 않습니다.
    return cache && typeof cache.csv === 'string' ? quotesFromCSV(cache.csv) : null;
  } catch { return null; }
}
function useQuotes(quotes) {
  state.quotes = quotes;
  if (!quotes.some((quote) => quote.id === state.selectedId)) state.selectedId = quotes[0]?.id || null;
  refreshQuoteSelection(); renderQuoteList(); queueRender();
}
async function loadQuotes() {
  if (loadingQuotes) return;
  const url = (window.APP_CONFIG?.QUOTES_CSV_URL || '').trim();
  if (!url) {
    console.info('APP_CONFIG.QUOTES_CSV_URL이 비어 있습니다. config.js에 공개 CSV 주소를 입력하세요.');
    $('#quote-status').textContent = '법어 목록 주소가 아직 설정되지 않았습니다.';
    $('#selected-quote').textContent = '직접 입력하기에서 나만의 글을 담아 보세요.';
    return;
  }
  loadingQuotes = true;
  $('#quote-status').textContent = '말씀을 불러오고 있습니다.';
  $('#reload-quotes').hidden = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('CSV 주소 형식을 확인해 주세요.');
    const separator = url.includes('?') ? '&' : '?';
    const response = await fetch(`${url}${separator}t=${Date.now()}`, { cache: 'no-store', signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error(`CSV 요청 실패 (${response.status})`);
    const csv = await response.text();
    const quotes = quotesFromCSV(csv);
    useQuotes(quotes);
    try { localStorage.setItem(cacheKey(url), JSON.stringify({ csv, savedAt: Date.now() })); } catch { /* 저장 공간 제한 시에도 편집은 계속합니다. */ }
    $('#quote-status').textContent = quotes.length ? '' : '표시할 법어가 없습니다. 직접 입력하기를 이용해 주세요.';
    $('#reload-quotes').hidden = false;
  } catch (error) {
    console.info('법어 불러오기:', error.message);
    const cached = readCachedQuotes(url);
    if (cached?.length) {
      useQuotes(cached);
      $('#quote-status').textContent = '저장된 말씀을 보여 드리고 있습니다.';
    } else {
      $('#quote-status').textContent = '말씀을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
      refreshQuoteSelection();
    }
    $('#reload-quotes').hidden = false;
  } finally { clearTimeout(timer); loadingQuotes = false; }
}

function getAttribution(quote) {
  const author = quote.author.trim(); const source = quote.source.trim();
  const compact = (text) => text.replace(/\s+/g, '');
  if (!author) return source;
  if (!source) return author;
  if (compact(source).includes(compact(author))) return source;
  if (compact(author).includes(compact(source))) return author;
  return `${author} · ${source}`;
}
function currentContent() {
  if (state.mode === 'custom') return { text: state.customText, attribution: state.author.trim() };
  const quote = state.quotes.find((item) => item.id === state.selectedId);
  return quote ? { text: quote.text, attribution: '-대행선사 법어-' } : { text: '', attribution: '' };
}
function refreshQuoteSelection() {
  const quote = state.quotes.find((item) => item.id === state.selectedId);
  $('#selected-quote').textContent = quote?.text || '등록된 법어가 없습니다. 직접 입력으로 시작해 주세요.';
}
function renderQuoteList() {
  const list = $('#quote-list'); list.replaceChildren();
  if (!state.quotes.length) {
    const empty = document.createElement('p'); empty.textContent = $('#quote-status').textContent || '표시할 법어가 없습니다.';
    list.append(empty); return;
  }
  for (const quote of state.quotes) {
    const button = document.createElement('button'); button.className = 'quote-option';
    button.setAttribute('aria-pressed', String(quote.id === state.selectedId));
    const text = document.createElement('span'); text.textContent = quote.text;
    const source = document.createElement('small'); source.textContent = `${quote.id === state.selectedId ? '✓ 선택됨 · ' : ''}${getAttribution(quote)}`;
    button.append(text, source);
    button.addEventListener('click', () => {
      state.selectedId = quote.id; refreshQuoteSelection(); $('#quote-sheet').close(); queueRender();
    }); list.append(button);
  }
}
function setMode(mode, focus = false) {
  state.mode = mode;
  for (const item of ['quote', 'custom']) {
    const active = item === mode; const tab = $(`#${item}-tab`);
    tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
    $(`#${item}-panel`).hidden = !active;
    if (active && focus) tab.focus();
  }
  setMessage(''); queueRender();
}

function loadImage(src) {
  if (!imageCache.has(src)) {
    const promise = withTimeout(new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('배경을 불러오지 못했습니다. 다른 이미지나 내 사진을 선택해 주세요.'));
      image.src = src;
    }), 15000, '이미지 로딩이 늦어지고 있습니다. 다시 선택해 주세요.');
    imageCache.set(src, promise);
    promise.catch(() => imageCache.delete(src));
  }
  return imageCache.get(src);
}
async function initBackgrounds() {
  const results = await Promise.allSettled(BACKGROUNDS.map(async (item) => { await loadImage(item.src); return item; }));
  availableBackgrounds = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
  const missing = results.filter((result) => result.status === 'rejected').length;
  $('#asset-note').textContent = missing ? `배경 ${missing}장을 불러오지 못했습니다. 내 사진을 사용할 수 있어요.` : '등록된 배경이 없습니다. 내 사진을 선택하거나 기본 종이 배경을 사용하세요.';
  $('#asset-note').hidden = availableBackgrounds.length > 0 && missing === 0;
  // 로딩 중 사용자가 고른 사진을 덮어쓰지 않습니다.
  if (!state.background && availableBackgrounds.length) selectBackground(availableBackgrounds[0]);
  renderBackgrounds();
}
function selectBackground(background) {
  state.background = background;
  if (background?.recommendedPosition) state.position = background.recommendedPosition;
  if (background?.recommendedColor) state.color = background.recommendedColor;
  renderBackgrounds(); syncControls(); queueRender();
}
function renderBackgrounds() {
  const container = $('#backgrounds'); container.replaceChildren();
  const upload = document.createElement('button'); upload.className = 'background upload'; upload.textContent = '＋ 내 사진';
  upload.addEventListener('click', () => $('#photo-input').click()); container.append(upload);
  const backgrounds = [{ id: 'paper', title: '기본 종이', src: null }, ...(photoBackground ? [photoBackground] : []), ...availableBackgrounds.filter((bg) => state.category === '전체' || bg.category === state.category)];
  for (const bg of backgrounds) {
    const button = document.createElement('button'); button.className = `background${bg.src ? '' : ' paper'}`;
    button.setAttribute('aria-label', bg.title);
    button.setAttribute('aria-pressed', String((state.background?.id || 'paper') === bg.id));
    if (bg.src) { const img = document.createElement('img'); img.src = bg.src; img.alt = bg.title; button.append(img); }
    else button.textContent = bg.title;
    button.addEventListener('click', () => selectBackground(bg.src ? bg : null)); container.append(button);
  }
}
async function uploadPhoto(event) {
  const file = event.target.files[0]; event.target.value = '';
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    setMessage('JPG, PNG, WebP 사진을 선택해 주세요.'); return;
  }
  if (file.size > 30 * 1024 * 1024) { setMessage('사진 용량이 큽니다. 30MB 이하의 사진을 선택해 주세요.'); return; }
  const nextUrl = URL.createObjectURL(file);
  try {
    await loadImage(nextUrl);
    const oldUrl = photoUrl; photoUrl = nextUrl;
    photoBackground = { id: 'photo', title: '내 사진', src: nextUrl };
    selectBackground(photoBackground);
    if (oldUrl) { URL.revokeObjectURL(oldUrl); imageCache.delete(oldUrl); }
    setMessage('내 사진을 적용했습니다. 사진은 이 브라우저에서만 사용됩니다.');
  } catch { URL.revokeObjectURL(nextUrl); setMessage('이 사진을 열 수 없습니다. 다른 JPG, PNG, WebP 사진을 선택해 주세요.'); }
}

function syncControls() {
  document.querySelectorAll('[data-control]').forEach((group) => {
    group.querySelectorAll('button').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.value === String(state[group.dataset.control])));
    });
  });
  $('#fonts').querySelectorAll('button').forEach((button, index) => button.setAttribute('aria-pressed', String(state.font === index)));
}
function initControls() {
  ['전체', '수채화', '색연필', '실사'].forEach((category) => {
    const button = document.createElement('button'); button.textContent = category;
    button.setAttribute('aria-pressed', String(category === state.category));
    button.addEventListener('click', () => {
      state.category = category;
      $('#categories').querySelectorAll('button').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      renderBackgrounds();
    }); $('#categories').append(button);
  });
  FONTS.forEach((font, index) => {
    const button = document.createElement('button'); button.className = 'font-card';
    const name = document.createElement('strong'); name.textContent = font.name; name.style.fontFamily = `"${font.family}", serif`;
    const label = document.createElement('small'); label.textContent = font.label;
    button.append(name, label); button.addEventListener('click', () => { state.font = index; syncControls(); queueRender(); });
    $('#fonts').append(button);
  });
  document.querySelectorAll('[data-control]').forEach((group) => {
    group.querySelectorAll('button').forEach((button) => {
      button.addEventListener('click', () => { state[group.dataset.control] = button.dataset.value; syncControls(); queueRender(); });
      if (group.dataset.control === 'color') button.setAttribute('aria-label', button.textContent);
    });
  });
  syncControls(); renderBackgrounds();
}

async function ensureFont(family, text) {
  // 한글 폰트는 여러 unicode-range 파일로 나뉘므로 실제 그릴 문자열로 로드합니다.
  const sample = text || '마음에 머무는 말씀';
  const key = `${family}:${sample}`;
  if (!fontCache.has(key)) {
    const task = withTimeout((async () => {
      const loaded = await document.fonts.load(`48px "${family}"`, sample);
      await document.fonts.ready;
      if (!loaded.length || !document.fonts.check(`48px "${family}"`, sample)) throw new Error('font');
    })(), 20000, 'font');
    fontCache.set(key, task);
    task.catch(() => fontCache.delete(key));
    if (fontCache.size > 80) fontCache.delete(fontCache.keys().next().value);
  }
  try { await fontCache.get(key); }
  catch { throw new Error('글씨체를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 글씨체를 다시 선택해 주세요.'); }
}
function graphemes(text) {
  return typeof Intl.Segmenter === 'function' ? Array.from(new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(text), (item) => item.segment) : Array.from(text);
}
function wrapText(context, text, width) {
  const lines = [];
  // 띄어쓰기 단위로 우선 배치하여 조사와 단어가 분리되는 일을 줄입니다.
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (!paragraph.trim()) { lines.push(''); continue; }
    const tokens = paragraph.match(/\S+\s*/gu) || [];
    let line = '';
    for (const token of tokens) {
      if (context.measureText((line + token).trimEnd()).width <= width) { line += token; continue; }
      if (line) { lines.push(line.trimEnd()); line = ''; }
      if (context.measureText(token.trimEnd()).width <= width) { line = token; continue; }
      // 공백 없는 긴 단어는 유니코드 문자 경계에서만 나눕니다.
      const chunks = []; let chunk = '';
      for (const character of graphemes(token.trimEnd())) {
        if (chunk && context.measureText(chunk + character).width > width) { chunks.push(chunk); chunk = ''; }
        chunk += character;
      }
      if (chunk) chunks.push(chunk);
      if (chunks.length > 1 && graphemes(chunks.at(-1)).length === 1) {
        const previous = graphemes(chunks.at(-2));
        if (previous.length > 2) { chunks[chunks.length - 1] = previous.pop() + chunks.at(-1); chunks[chunks.length - 2] = previous.join(''); }
      }
      lines.push(...chunks.slice(0, -1)); line = (chunks.at(-1) || '') + (token.endsWith(' ') ? ' ' : '');
    }
    if (line) lines.push(line.trimEnd());
  }
  return lines;
}
function fontSpec(size, family) { return `400 ${size}px "${family}"`; }
function measureBlock(context, text, size, family, width) {
  context.font = fontSpec(size, family);
  const lines = wrapText(context, text, width);
  let ascent = 0; let descent = 0; let actualWidth = 0;
  for (const line of lines) {
    const metrics = context.measureText(line || '한');
    ascent = Math.max(ascent, metrics.actualBoundingBoxAscent || size * .8);
    descent = Math.max(descent, metrics.actualBoundingBoxDescent || size * .2);
    actualWidth = Math.max(actualWidth, metrics.width, (metrics.actualBoundingBoxLeft || 0) + (metrics.actualBoundingBoxRight || 0));
  }
  const lineHeight = Math.max(size * 1.42, (ascent + descent) * 1.2);
  return { lines, ascent, descent, lineHeight, size, width: actualWidth,
    height: lines.length ? (lines.length - 1) * lineHeight + ascent + descent : 0 };
}
function fitLayout(context, content, snapshot, width, height) {
  const family = FONTS[snapshot.font].family;
  const margin = width * .095;
  const safeWidth = width - 2 * margin;
  const maxHeight = height - 2 * margin;
  // 폰트 실제 글리프 높이를 참고해 손글씨의 시각적인 크기를 보정합니다.
  context.font = fontSpec(100, family);
  const sample = context.measureText('마음한글');
  const visualScale = Math.min(1.45, Math.max(.9, 90 / ((sample.actualBoundingBoxAscent || 80) + (sample.actualBoundingBoxDescent || 10))));
  const maximum = ({ small: 57, auto: 87, large: 110 }[snapshot.size]) * visualScale;
  const make = (size) => {
    // 획이 advance 폭보다 돌출되는 폰트까지 안전 여백 안에 담습니다.
    const body = measureBlock(context, content.text, size, family, safeWidth - size * .5);
    const authorSize = Math.max(1, size * .43);
    const attribution = content.attribution ? measureBlock(context, content.attribution, authorSize, family, safeWidth - authorSize * .5) : null;
    const gap = attribution ? size * .72 : 0;
    return { body, attribution, gap, height: body.height + gap + (attribution?.height || 0), margin, safeWidth, family };
  };
  let low = 12; let high = maximum; let best = null;
  for (let i = 0; i < 17; i++) {
    const size = (low + high) / 2; const layout = make(size);
    if (layout.height <= maxHeight && layout.body.width <= safeWidth && (!layout.attribution || layout.attribution.width <= safeWidth)) { best = layout; low = size; }
    else high = size;
  }
  // 극단적으로 긴 공개 원문도 자르거나 요약하지 않고 축소합니다.
  if (!best) {
    for (let size = 12; size >= .25; size *= .8) {
      const layout = make(size);
      if (layout.height <= maxHeight && layout.body.width <= safeWidth && (!layout.attribution || layout.attribution.width <= safeWidth)) { best = layout; break; }
    }
  }
  if (!best) throw new Error('글이 너무 길어 카드에 담기 어렵습니다. 더 짧은 글을 선택해 주세요.');
  best.top = snapshot.position === 'top' ? margin : snapshot.position === 'bottom' ? height - margin - best.height : (height - best.height) / 2;
  return best;
}
function drawCover(context, image, width, height) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const w = image.naturalWidth * scale; const h = image.naturalHeight * scale;
  context.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
}
function drawBlock(context, block, top, layout, snapshot, width) {
  context.font = fontSpec(block.size, layout.family); context.textAlign = snapshot.align; context.textBaseline = 'alphabetic';
  const x = snapshot.align === 'left' ? layout.margin + block.size * .25 : width / 2;
  block.lines.forEach((line, index) => context.fillText(line, x, top + block.ascent + index * block.lineHeight));
}
function drawCard(target, snapshot, content, image) {
  target.width = 1080; target.height = snapshot.ratio === 'square' ? 1080 : 1350;
  const context = target.getContext('2d'); const { width, height } = target;
  context.fillStyle = '#f2efe7'; context.fillRect(0, 0, width, height);
  if (image) drawCover(context, image, width, height);
  if (!content.text.trim()) {
    context.font = '36px sans-serif'; context.fillStyle = '#68736f'; context.textAlign = 'center';
    context.fillText('마음에 담을 글을 골라 주세요', width / 2, height / 2); return null;
  }
  const layout = fitLayout(context, content, snapshot, width, height);
  if (snapshot.readability) {
    const bright = ['#ffffff', '#e5c77e'].includes(snapshot.color);
    const rgb = bright ? '16,28,24' : '255,255,255';
    context.save(); context.translate(width / 2, layout.top + layout.height / 2);
    context.scale(width * .65, Math.max(layout.height / 2 + 110, 190));
    const glow = context.createRadialGradient(0, 0, 0, 0, 0, 1);
    glow.addColorStop(0, `rgba(${rgb},${bright ? .6 : .72})`); glow.addColorStop(.55, `rgba(${rgb},${bright ? .42 : .5})`); glow.addColorStop(1, `rgba(${rgb},0)`);
    context.fillStyle = glow; context.fillRect(-1, -1, 2, 2); context.restore();
  }
  context.fillStyle = snapshot.color;
  drawBlock(context, layout.body, layout.top, layout, snapshot, width);
  if (layout.attribution) drawBlock(context, layout.attribution, layout.top + layout.body.height + layout.gap, layout, snapshot, width);
  return layout;
}
function canvasToBlob(target) {
  return new Promise((resolve, reject) => {
    try { target.toBlob((blob) => blob ? resolve(blob) : reject(new Error('이미지를 만들지 못했습니다. 다시 시도해 주세요.')), 'image/png'); }
    catch { reject(new Error('이미지를 저장할 수 없습니다. 다른 배경을 선택해 주세요.')); }
  });
}
function queueRender() {
  const version = ++renderVersion; const snapshot = { ...state }; const content = currentContent();
  currentBlob = null; renderError = null; refreshObjectUrl(null); setExportReady(false);
  $('#render-status').textContent = '카드를 준비하고 있어요';
  pendingRender = (async () => {
    try {
      const [, image] = await Promise.all([
        content.text.trim() ? ensureFont(FONTS[snapshot.font].family, content.text + content.attribution) : Promise.resolve(),
        snapshot.background ? loadImage(snapshot.background.src) : Promise.resolve(null)
      ]);
      if (version !== renderVersion) return;
      const buffer = document.createElement('canvas');
      const layout = drawCard(buffer, snapshot, content, image);
      const blob = await canvasToBlob(buffer);
      if (version !== renderVersion) return;
      canvas.width = buffer.width; canvas.height = buffer.height; ctx.drawImage(buffer, 0, 0);
      canvas.setAttribute('aria-label', content.text.trim() ? `${content.text}${content.attribution ? ' — ' + content.attribution : ''}` : '글을 선택하면 카드가 여기에 표시됩니다.');
      $('#resolution').textContent = `1080 × ${canvas.height} · PNG`;
      $('#render-status').textContent = content.text.trim() ? (layout.body.size < 24 ? '글이 길어 작게 표시됩니다. 저장 전에 확인해 주세요.' : '지금 보이는 모습 그대로 저장돼요') : '법어를 고르거나 직접 글을 입력해 주세요';
      currentBlob = content.text.trim() ? blob : null;
      refreshObjectUrl(currentBlob); setExportReady(Boolean(currentBlob));
    } catch (error) {
      if (version !== renderVersion) return;
      renderError = error; $('#render-status').textContent = error.message; setExportReady(false);
    }
  })();
  return pendingRender;
}
function filename() {
  const now = new Date(); const pad = (value) => String(value).padStart(2, '0');
  return `마음에_머무는_말씀_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.png`;
}
function download(blob, name) {
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = name; link.rel = 'noopener'; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function openManualSave() {
  if (!currentBlob || !currentObjectUrl) { setMessage('이미지를 먼저 준비해 주세요.'); return; }
  const preview = $('#save-preview');
  preview.src = currentObjectUrl;
  $('#save-sheet').showModal();
}
async function exportCard(mode) {
  if (exporting) return;
  if (!currentContent().text.trim()) { setMessage('저장할 글을 먼저 입력하거나 법어를 선택해 주세요.'); return; }
  if (restrictedInAppBrowser) {
    showBrowserNotice();
    setMessage('카카오톡 안에서는 저장·공유가 제한됩니다. 위 안내에서 외부 브라우저를 열어 주세요.');
    $('#in-app-warning').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    return;
  }
  // 모바일의 다운로드·공유 권한은 클릭 직후에만 유지됩니다. 준비가 끝난 이미지로 즉시 실행합니다.
  if (!currentBlob || renderError) {
    setMessage(renderError?.message || '이미지를 준비하고 있습니다. 잠시 후 다시 눌러 주세요.');
    return;
  }
  exporting = true;
  document.querySelectorAll('[data-export]').forEach((button) => { button.disabled = true; button.setAttribute('aria-busy', 'true'); });
  setMessage('이미지를 준비하고 있습니다.');
  try {
    const blob = currentBlob;
    if (!blob) throw new Error('저장할 글을 먼저 입력하거나 법어를 선택해 주세요.');
    const name = filename(); const file = new File([blob], name, { type: 'image/png' });
    if (mode === 'share' && window.isSecureContext && navigator.share && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: '마음에 머무는 말씀' }); setMessage('공유했습니다.'); }
      catch (error) {
        if (error.name === 'AbortError') { setMessage(''); return; }
        setMessage('공유 창을 열지 못했습니다. 아래 직접 저장 버튼을 이용해 주세요.');
      }
    } else {
      download(blob, name);
      setMessage(mode === 'share'
        ? (window.isSecureContext ? '이 브라우저는 이미지 공유를 지원하지 않아 PNG 저장을 시작했습니다.' : '보안 연결(HTTPS)이 아니어서 공유 대신 PNG 저장을 시작했습니다.')
        : 'PNG 저장을 시작했습니다. 저장되지 않으면 아래 직접 저장 버튼을 눌러 주세요.');
    }
  } catch (error) { setMessage(error.message || '저장하지 못했습니다. 다시 시도해 주세요.'); }
  finally { exporting = false; document.querySelectorAll('[data-export]').forEach((button) => { button.disabled = !currentBlob; button.setAttribute('aria-disabled', String(!currentBlob)); button.removeAttribute('aria-busy'); }); }
}
function pickDifferent(items, current) {
  const alternatives = items.filter((item) => item.id !== current); const options = alternatives.length ? alternatives : items;
  return options[Math.floor(Math.random() * options.length)];
}
function shuffle() {
  const background = pickDifferent(availableBackgrounds, state.background?.id);
  const quote = state.mode === 'quote' ? pickDifferent(state.quotes, state.selectedId) : null;
  if (quote) { state.selectedId = quote.id; refreshQuoteSelection(); }
  if (background) selectBackground(background); else queueRender();
  setMessage(!background && !quote ? '추천할 배경이나 법어가 아직 없습니다.' : '다른 조합을 골랐습니다. 원하는 대로 더 바꿔 보세요.');
}

initControls();
$('#quote-tab').addEventListener('click', () => setMode('quote'));
$('#custom-tab').addEventListener('click', () => setMode('custom'));
$('.tabs').addEventListener('keydown', (event) => {
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    event.preventDefault(); setMode(event.key === 'Home' ? 'quote' : event.key === 'End' ? 'custom' : state.mode === 'quote' ? 'custom' : 'quote', true);
  }
});
$('#custom-text').addEventListener('input', (event) => {
  const chars = Array.from(event.target.value); state.customText = chars.slice(0, 260).join('');
  if (state.customText !== event.target.value) event.target.value = state.customText;
  $('#char-count').textContent = `${Array.from(state.customText).length} / 260`; queueRender();
});
$('#author').addEventListener('input', (event) => { state.author = event.target.value; queueRender(); });
$('#quote-picker').addEventListener('click', () => { renderQuoteList(); $('#quote-sheet').showModal(); });
$('#close-sheet').addEventListener('click', () => $('#quote-sheet').close());
$('#quote-sheet').addEventListener('click', (event) => {
  if (event.target !== $('#quote-sheet')) return;
  const rect = $('#quote-sheet').getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('#quote-sheet').close();
});
$('#reload-quotes').addEventListener('click', loadQuotes);
$('#photo-input').addEventListener('change', uploadPhoto);
$('#readability').addEventListener('change', (event) => { state.readability = event.target.checked; queueRender(); });
$('#shuffle').addEventListener('click', shuffle);
$('#open-browser').addEventListener('click', () => { location.href = externalBrowserUrl('com.android.chrome'); });
$('#open-samsung').addEventListener('click', () => { location.href = externalBrowserUrl('com.sec.android.app.sbrowser'); });
$('#copy-address').addEventListener('click', copyPageAddress);
$('#manual-save').addEventListener('click', openManualSave);
$('#close-save-sheet').addEventListener('click', () => $('#save-sheet').close());
$('#save-sheet').addEventListener('click', (event) => {
  if (event.target !== $('#save-sheet')) return;
  const rect = $('#save-sheet').getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('#save-sheet').close();
});
document.querySelectorAll('[data-export]').forEach((button) => button.addEventListener('click', () => exportCard(button.dataset.export)));
showBrowserNotice(); queueRender(); loadQuotes(); initBackgrounds();
