// Barcode scanning and product review.
// Keeps scanned products editable and adds them through the shared meal path.
const BARCODE_CACHE_KEY = 'sous_barcode_cache_v1';
const BARCODE_ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.2.0/umd/zxing-browser.min.js';

let barcodeState = {
  active: false,
  stream: null,
  detector: null,
  detectTimer: null,
  zxingControls: null,
  currentCode: '',
  product: null,
  lookingUp: false,
  zxingLoading: null,
  trace: [],
  traceStart: 0,
  lastError: null
};

function barcodeSafeMeta(meta = {}) {
  try {
    return JSON.parse(JSON.stringify(meta));
  } catch (e) {
    return { note: String(meta) };
  }
}

function barcodeResetTrace() {
  barcodeState.traceStart = performance?.now ? performance.now() : Date.now();
  barcodeState.trace = [];
  barcodeState.lastError = null;
}

function barcodeTrace(event, meta = {}) {
  if (!barcodeState.traceStart) barcodeResetTrace();
  const now = performance?.now ? performance.now() : Date.now();
  const entry = {
    event,
    t: new Date().toISOString(),
    ms: Math.round(now - barcodeState.traceStart),
    ...barcodeSafeMeta(meta)
  };
  barcodeState.trace.push(entry);
  if (barcodeState.trace.length > 80) barcodeState.trace.splice(0, barcodeState.trace.length - 80);
  try { console.info('[Sous Barcode Timing]', entry); } catch (e) {}
  return entry;
}

function barcodeRememberError(error, context = '') {
  barcodeState.lastError = {
    t: new Date().toISOString(),
    context,
    message: String(error?.message || error || 'Unknown barcode error').slice(0, 240)
  };
  barcodeTrace('barcode_error', barcodeState.lastError);
}

function barcodeCleanCode(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 18);
}

function barcodeEsc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function barcodeRound(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 10) / 10 : 0;
}

function barcodeCacheGet(code) {
  try {
    const cache = JSON.parse(localStorage.getItem(BARCODE_CACHE_KEY) || '{}');
    return cache[code] || null;
  } catch (e) {
    return null;
  }
}

function barcodeCacheSet(code, product) {
  try {
    const cache = JSON.parse(localStorage.getItem(BARCODE_CACHE_KEY) || '{}');
    cache[code] = { ...product, cachedAt: Date.now() };
    const entries = Object.entries(cache).sort((a, b) => (b[1].cachedAt || 0) - (a[1].cachedAt || 0));
    localStorage.setItem(BARCODE_CACHE_KEY, JSON.stringify(Object.fromEntries(entries.slice(0, 80))));
  } catch (e) {}
}

function barcodeModal() {
  return document.getElementById('barcode-modal');
}

function barcodeSetStatus(message, tone = '') {
  const el = document.getElementById('barcode-status');
  if (!el) return;
  el.textContent = message || '';
  el.dataset.tone = tone;
}

function barcodeShowPanel(panel) {
  ['scan', 'manual', 'review'].forEach(name => {
    const el = document.getElementById('barcode-' + name + '-panel');
    if (el) el.style.display = name === panel ? 'block' : 'none';
  });
  const addBtn = document.getElementById('barcode-add-btn');
  if (addBtn) addBtn.style.display = panel === 'review' ? 'block' : 'none';
}

function barcodeStopScanning() {
  barcodeState.active = false;
  if (barcodeState.detectTimer) {
    clearTimeout(barcodeState.detectTimer);
    barcodeState.detectTimer = null;
  }
  if (barcodeState.zxingControls && typeof barcodeState.zxingControls.stop === 'function') {
    try { barcodeState.zxingControls.stop(); } catch (e) {}
  }
  barcodeState.zxingControls = null;
  if (barcodeState.stream) {
    barcodeState.stream.getTracks().forEach(track => track.stop());
  }
  barcodeState.stream = null;
  const video = document.getElementById('barcode-video');
  if (video) video.srcObject = null;
}

function closeBarcodeScanner() {
  barcodeStopScanning();
  barcodeState.currentCode = '';
  barcodeState.product = null;
  barcodeState.lookingUp = false;
  const modal = barcodeModal();
  if (!modal) return;
  modal.classList.remove('show');
  setTimeout(() => {
    modal.style.display = 'none';
  }, 200);
}

function openBarcodeScannerFromHome() {
  if (typeof currentEditMealId !== 'undefined') currentEditMealId = null;
  if (typeof currentEditMealDate !== 'undefined') currentEditMealDate = null;
  const date = typeof selectedLogDate !== 'undefined' ? selectedLogDate : null;
  const section = typeof getDefaultQuickAddSection === 'function' ? getDefaultQuickAddSection(date) : 'snacks';
  if (typeof switchTab === 'function') switchTab('log', { fresh: true, silent: true, section, quick: true });
  setTimeout(openBarcodeScanner, 80);
}

async function openBarcodeScanner() {
  const modal = barcodeModal();
  if (!modal) return;
  barcodeResetTrace();
  barcodeTrace('scanner_opened', {
    nativeDetector: 'BarcodeDetector' in window,
    zxingLoaded: !!window.ZXingBrowser
  });
  if (typeof stopAllVoiceActivity === 'function') stopAllVoiceActivity('barcode scan');
  barcodeState.currentCode = '';
  barcodeState.product = null;
  barcodeState.lookingUp = false;
  document.getElementById('barcode-manual-input').value = '';
  modal.style.display = 'flex';
  requestAnimationFrame(() => modal.classList.add('show'));
  barcodeShowPanel('scan');
  barcodeSetStatus('Point the camera at the barcode.');
  await barcodeStartCamera();
}

async function barcodeStartCamera() {
  const video = document.getElementById('barcode-video');
  if (!video || !navigator.mediaDevices?.getUserMedia) {
    barcodeRememberError('Camera API unavailable', 'camera_start');
    barcodeSetStatus('Camera is not available. Enter the barcode instead.', 'warn');
    barcodeShowManualEntry();
    return;
  }
  barcodeStopScanning();
  barcodeState.active = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    barcodeState.stream = stream;
    video.srcObject = stream;
    video.setAttribute('playsinline', '');
    await video.play();
    await barcodeWaitForCameraReady(video);
    barcodeTrace('camera_ready', {
      width: video.videoWidth || null,
      height: video.videoHeight || null
    });
    if ('BarcodeDetector' in window) {
      await barcodeStartNativeLoop(video);
    } else {
      await barcodeStartZxing(video);
    }
  } catch (e) {
    console.warn('[Sous Barcode] camera error', e);
    barcodeRememberError(e, 'camera_start');
    barcodeSetStatus('Camera could not start. Enter the barcode instead.', 'warn');
    barcodeShowManualEntry();
  }
}

function barcodeWaitForCameraReady(video) {
  if (video.readyState >= 2 && video.videoWidth) return Promise.resolve();
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener('loadedmetadata', finish);
      video.removeEventListener('canplay', finish);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, 1600);
    video.addEventListener('loadedmetadata', finish, { once: true });
    video.addEventListener('canplay', finish, { once: true });
  });
}

async function barcodeStartNativeLoop(video) {
  try {
    const formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
    let supported = formats;
    if (typeof BarcodeDetector.getSupportedFormats === 'function') {
      const list = await BarcodeDetector.getSupportedFormats();
      supported = formats.filter(format => list.includes(format));
    }
    if (!supported.length) {
      await barcodeStartZxing(video);
      return;
    }
    barcodeState.detector = new BarcodeDetector({ formats: supported });
    barcodeDetectNative(video);
  } catch (e) {
    console.warn('[Sous Barcode] native detector unavailable', e);
    await barcodeStartZxing(video);
  }
}

async function barcodeDetectNative(video) {
  if (!barcodeState.active || barcodeState.lookingUp) return;
  try {
    if (video.readyState >= 2 && barcodeState.detector) {
      const results = await barcodeState.detector.detect(video);
      const match = (results || []).map(result => barcodeCleanCode(result.rawValue)).find(Boolean);
      if (match) {
        await barcodeHandleDetected(match);
        return;
      }
    }
  } catch (e) {}
  barcodeState.detectTimer = setTimeout(() => barcodeDetectNative(video), 220);
}

function barcodeLoadZxing() {
  if (window.ZXingBrowser) return Promise.resolve(window.ZXingBrowser);
  if (barcodeState.zxingLoading) return barcodeState.zxingLoading;
  barcodeTrace('scanner_library_load_started', { library: 'zxing' });
  barcodeState.zxingLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = BARCODE_ZXING_URL;
    script.async = true;
    script.onload = () => {
      barcodeTrace('scanner_library_load_finished', { library: 'zxing', ok: !!window.ZXingBrowser });
      if (window.ZXingBrowser) resolve(window.ZXingBrowser);
      else {
        barcodeState.zxingLoading = null;
        reject(new Error('Barcode scanner library did not load.'));
      }
    };
    script.onerror = () => {
      barcodeTrace('scanner_library_load_finished', { library: 'zxing', ok: false });
      barcodeState.zxingLoading = null;
      reject(new Error('Barcode scanner library failed to load.'));
    };
    document.head.appendChild(script);
  });
  return barcodeState.zxingLoading;
}

async function barcodeStartZxing(video) {
  try {
    barcodeSetStatus('Starting scanner...');
    const zxing = await barcodeLoadZxing();
    const reader = new zxing.BrowserMultiFormatReader();
    barcodeState.zxingControls = await reader.decodeFromVideoElement(video, (result) => {
      const text = result && (typeof result.getText === 'function' ? result.getText() : result.text);
      const code = barcodeCleanCode(text);
      if (code) barcodeHandleDetected(code);
    });
    barcodeSetStatus('Point the camera at the barcode.');
  } catch (e) {
    console.warn('[Sous Barcode] zxing unavailable', e);
    barcodeRememberError(e, 'zxing_start');
    barcodeSetStatus('Scanner is not available here. Enter the barcode instead.', 'warn');
    barcodeShowManualEntry();
  }
}

async function barcodeHandleDetected(code, source = 'camera') {
  code = barcodeCleanCode(code);
  if (!code || code.length < 6) return;
  if (barcodeState.lookingUp) {
    barcodeTrace('duplicate_barcode_ignored', { barcode: code, currentCode: barcodeState.currentCode || null });
    return;
  }
  barcodeState.lookingUp = true;
  barcodeState.currentCode = code;
  barcodeTrace('barcode_detected', { barcode: code, source });
  barcodeStopScanning();
  barcodeSetStatus('Looking up product...');
  const cached = barcodeCacheGet(code);
  barcodeTrace('lookup_started', { barcode: code, cacheHit: !!cached });
  if (cached) {
    barcodeTrace('lookup_finished', { barcode: code, cacheHit: true, ok: true });
    barcodeRenderReview(cached, true);
    return;
  }
  try {
    const url = typeof window.sousApiUrl === 'function'
      ? window.sousApiUrl('/api/barcode/' + encodeURIComponent(code))
      : '/api/barcode/' + encodeURIComponent(code);
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Product lookup failed.');
    barcodeCacheSet(code, data);
    barcodeTrace('lookup_finished', { barcode: code, cacheHit: false, ok: true, status: res.status });
    barcodeRenderReview(data, false);
  } catch (e) {
    barcodeState.lookingUp = false;
    barcodeRememberError(e, 'lookup');
    barcodeTrace('lookup_finished', { barcode: code, cacheHit: false, ok: false });
    barcodeSetStatus(String(e.message || 'Product lookup failed.'), 'warn');
    barcodeShowManualEntry(code);
  }
}

function barcodeShowManualEntry(value = '') {
  barcodeStopScanning();
  barcodeShowPanel('manual');
  barcodeSetStatus('Enter the numbers under the barcode.');
  const input = document.getElementById('barcode-manual-input');
  if (input) {
    input.value = value || input.value || '';
    setTimeout(() => input.focus(), 120);
  }
}

function barcodeLookupManual() {
  const input = document.getElementById('barcode-manual-input');
  const code = barcodeCleanCode(input && input.value);
  if (!code || code.length < 6) {
    barcodeSetStatus('Enter at least 6 barcode digits.', 'warn');
    return;
  }
  barcodeHandleDetected(code, 'manual');
}

function barcodeRenderReview(product, cached) {
  barcodeState.lookingUp = false;
  barcodeState.product = product;
  barcodeShowPanel('review');
  const name = product.name || 'Scanned product';
  const brand = product.brand ? product.brand + ' - ' : '';
  const qty = product.servingGrams || 100;
  document.getElementById('barcode-product-name').value = name;
  document.getElementById('barcode-serving-grams').value = qty;
  document.getElementById('barcode-review-title').textContent = brand + name;
  document.getElementById('barcode-review-meta').textContent = [
    product.quantity,
    product.barcode,
    cached ? 'cached' : ''
  ].filter(Boolean).join(' - ');
  const img = document.getElementById('barcode-product-image');
  if (img) {
    img.style.display = product.imageUrl ? 'block' : 'none';
    img.src = product.imageUrl || '';
  }
  barcodeUpdatePreview();
  barcodeSetStatus('Review before adding.');
  barcodeTrace('product_rendered', {
    barcode: product.barcode || barcodeState.currentCode || null,
    cached: !!cached,
    hasImage: !!product.imageUrl
  });
}

function barcodeNutrition() {
  const n = barcodeState.product?.nutritionPer100g || {};
  return {
    kcal: barcodeRound(n.calories),
    protein: barcodeRound(n.protein),
    carbs: barcodeRound(n.carbs),
    fat: barcodeRound(n.fat),
    fibre: barcodeRound(n.fibre)
  };
}

function barcodeUpdatePreview() {
  if (!barcodeState.product) return;
  const grams = Math.max(1, Math.round(Number(document.getElementById('barcode-serving-grams')?.value) || 100));
  const n = barcodeNutrition();
  const ratio = grams / 100;
  const values = {
    kcal: Math.round(n.kcal * ratio),
    protein: barcodeRound(n.protein * ratio),
    carbs: barcodeRound(n.carbs * ratio),
    fat: barcodeRound(n.fat * ratio)
  };
  Object.entries(values).forEach(([key, value]) => {
    const el = document.getElementById('barcode-' + key);
    if (el) el.textContent = value;
  });
}

function barcodeAddReviewedProduct() {
  const product = barcodeState.product;
  if (!product) return;
  const name = (document.getElementById('barcode-product-name')?.value || product.name || '').trim();
  const grams = Math.max(1, Math.round(Number(document.getElementById('barcode-serving-grams')?.value) || 100));
  if (!name) {
    barcodeSetStatus('Keep a product name before adding.', 'warn');
    return;
  }
  const n = barcodeNutrition();
  const food = {
    id: 'barcode_' + product.barcode,
    name,
    w: 100,
    kcal: n.kcal,
    p: n.protein,
    c: n.carbs,
    f: n.fat,
    fi: n.fibre,
    icon: 'ti-barcode',
    type: product.type || 'solid',
    kw: [name, product.brand].filter(Boolean),
    nutritionPer100g: {
      calories: n.kcal,
      protein: n.protein,
      carbs: n.carbs,
      fat: n.fat,
      fibre: n.fibre
    },
    source: product.source || 'openfoodfacts',
    sourceId: product.sourceId || ('off:' + product.barcode),
    barcode: product.barcode,
    brand: product.brand || ''
  };
  const item = typeof foodScale === 'function'
    ? { ...foodScale(food, grams), rawFood: food }
    : {
      name,
      weight: grams,
      kcal: Math.round(n.kcal * grams / 100),
      protein: barcodeRound(n.protein * grams / 100),
      carbs: barcodeRound(n.carbs * grams / 100),
      fat: barcodeRound(n.fat * grams / 100),
      fibre: barcodeRound(n.fibre * grams / 100),
      icon: 'ti-barcode',
      type: food.type,
      rawFood: food
    };
  item.source = 'barcode';
  item.barcode = product.barcode;
  item.brand = product.brand || '';
  item.weightSpecified = true;
  if (typeof addIngredientToMeal === 'function') addIngredientToMeal(item, { source: 'barcode' });
  if (typeof showToast === 'function') showToast('Added ' + name);
  closeBarcodeScanner();
  if (typeof showLogScreen === 'function') showLogScreen('listening');
  if (typeof renderCurrentMeal === 'function') renderCurrentMeal();
  if (typeof updateHome === 'function') updateHome();
}

function initBarcode() {
  document.getElementById('barcode-modal-close')?.addEventListener('click', closeBarcodeScanner);
  document.getElementById('barcode-cancel-btn')?.addEventListener('click', closeBarcodeScanner);
  document.getElementById('barcode-manual-btn')?.addEventListener('click', () => barcodeShowManualEntry());
  document.getElementById('barcode-rescan-btn')?.addEventListener('click', openBarcodeScanner);
  document.getElementById('barcode-manual-lookup-btn')?.addEventListener('click', barcodeLookupManual);
  document.getElementById('barcode-add-btn')?.addEventListener('click', barcodeAddReviewedProduct);
  document.getElementById('barcode-serving-grams')?.addEventListener('input', barcodeUpdatePreview);
  document.getElementById('barcode-manual-input')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') barcodeLookupManual();
  });
  barcodeModal()?.addEventListener('click', event => {
    if (event.target === barcodeModal()) closeBarcodeScanner();
  });
  barcodeWarmScannerLibrary();
}

function barcodeWarmScannerLibrary() {
  if ('BarcodeDetector' in window || window.ZXingBrowser) return;
  const warm = () => barcodeLoadZxing().catch(error => barcodeRememberError(error, 'zxing_preload'));
  if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 2500 });
  else setTimeout(warm, 1200);
}

window.__sousBarcodeTimingTrace = () => barcodeState.trace.slice(-80);
window.__sousLastBarcodeError = () => barcodeState.lastError ? { ...barcodeState.lastError } : null;

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initBarcode);
else initBarcode();
