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

function barcodeReadNumber(id, fallback = 0) {
  const value = Number(document.getElementById(id)?.value);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
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

function barcodeCustomFoodGet(code) {
  if (typeof getCustomFoods !== 'function') return null;
  const cleanCode = barcodeCleanCode(code);
  return (getCustomFoods() || []).find(food => barcodeCleanCode(food?.barcode) === cleanCode) || null;
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
  if (addBtn) {
    addBtn.style.display = panel === 'review' ? 'block' : 'none';
    addBtn.dataset.confirmExtreme = '';
  }
  const warning = document.getElementById('barcode-warning');
  if (warning && panel !== 'review') {
    warning.style.display = 'none';
    warning.textContent = '';
  }
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
  const custom = barcodeCustomFoodGet(code);
  if (custom) {
    barcodeTrace('lookup_finished', { barcode: code, cacheHit: false, customHit: true, ok: true });
    barcodeRenderReview({
      ...custom,
      barcode: code,
      source: 'custom_barcode',
      sourceId: custom.sourceId || ('custom-barcode:' + code),
      servingBasis: custom.servingBasis || 'per100g',
      defaultAmount: custom.w || custom.weight || 100,
      nutritionPer100g: custom.nutritionPer100g || {
        calories: custom.kcal,
        protein: custom.p,
        carbs: custom.c,
        fat: custom.f,
        fibre: custom.fi
      },
      diagnostics: {
        barcode: code,
        source: 'custom_barcode',
        rawNutritionFields: {},
        normalizedNutritionFields: custom.nutritionPer100g || {},
        servingBasis: custom.servingBasis || 'per100g',
        sanityWarnings: []
      }
    }, true);
    return;
  }
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
    if (/not found/i.test(String(e.message || ''))) {
      barcodeRenderManualProduct(code);
    } else {
      barcodeSetStatus(String(e.message || 'Product lookup failed.'), 'warn');
      barcodeShowManualEntry(code);
    }
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

function barcodeRenderManualProduct(code) {
  barcodeRenderReview({
    barcode: code,
    name: 'Barcode ' + code,
    brand: '',
    quantity: '',
    servingGrams: 100,
    packageGrams: null,
    defaultAmount: 100,
    servingBasis: 'manual',
    imageUrl: '',
    source: 'manual_barcode',
    sourceId: 'custom-barcode:' + code,
    nutritionPer100g: { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 },
    nutritionPerServing: null,
    nutritionPerPackage: null,
    raw: {},
    diagnostics: {
      barcode: code,
      source: 'manual_barcode',
      rawNutritionFields: {},
      normalizedNutritionFields: {
        nutritionPer100g: { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 }
      },
      servingBasis: 'manual',
      sanityWarnings: ['not_found_manual_entry']
    },
    type: 'solid'
  }, false);
  barcodeSetStatus('Not found — add manually', 'warn');
}

function barcodeRenderReview(product, cached) {
  barcodeState.lookingUp = false;
  barcodeState.product = product;
  barcodeShowPanel('review');
  const name = product.name || 'Scanned product';
  const brand = product.brand ? product.brand + ' - ' : '';
  const qty = product.defaultAmount || product.servingGrams || product.packageGrams || 100;
  document.getElementById('barcode-product-name').value = name;
  document.getElementById('barcode-serving-grams').value = qty;
  document.getElementById('barcode-review-title').textContent = brand + name;
  document.getElementById('barcode-review-meta').textContent = [
    product.quantity,
    barcodeBasisLabel(product),
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
    hasImage: !!product.imageUrl,
    diagnostics: barcodeDiagnostics(product)
  });
}

function barcodeBucket(source) {
  const n = source || {};
  return {
    kcal: barcodeRound(n.calories),
    protein: barcodeRound(n.protein),
    carbs: barcodeRound(n.carbs),
    fat: barcodeRound(n.fat),
    fibre: barcodeRound(n.fibre)
  };
}

function barcodeBasisLabel(product = barcodeState.product) {
  const basis = product?.servingBasis || 'per100g';
  if (basis === 'perServing') return 'per serving';
  if (basis === 'perPackage') return 'per package';
  if (basis === 'manual') return 'manual entry';
  return 'per 100g';
}

function barcodeSourceNutrition(product = barcodeState.product, grams = null) {
  if (!product) return { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 };
  const amount = Math.max(1, Number(grams) || Number(product.defaultAmount) || 100);
  if (product.servingBasis === 'perServing' && product.nutritionPerServing) {
    const base = barcodeBucket(product.nutritionPerServing);
    const ratio = product.servingGrams ? amount / product.servingGrams : 1;
    return {
      kcal: Math.round(base.kcal * ratio),
      protein: barcodeRound(base.protein * ratio),
      carbs: barcodeRound(base.carbs * ratio),
      fat: barcodeRound(base.fat * ratio),
      fibre: barcodeRound(base.fibre * ratio)
    };
  }
  if (product.servingBasis === 'perPackage' && product.nutritionPerPackage) {
    const base = barcodeBucket(product.nutritionPerPackage);
    const ratio = product.packageGrams ? amount / product.packageGrams : 1;
    return {
      kcal: Math.round(base.kcal * ratio),
      protein: barcodeRound(base.protein * ratio),
      carbs: barcodeRound(base.carbs * ratio),
      fat: barcodeRound(base.fat * ratio),
      fibre: barcodeRound(base.fibre * ratio)
    };
  }
  const per100 = barcodeBucket(product.nutritionPer100g);
  const ratio = amount / 100;
  return {
    kcal: Math.round(per100.kcal * ratio),
    protein: barcodeRound(per100.protein * ratio),
    carbs: barcodeRound(per100.carbs * ratio),
    fat: barcodeRound(per100.fat * ratio),
    fibre: barcodeRound(per100.fibre * ratio)
  };
}

function barcodeNutritionPer100(product = barcodeState.product) {
  if (!product) return { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 };
  if (product.nutritionPer100g) return barcodeBucket(product.nutritionPer100g);
  if (product.servingBasis === 'perServing' && product.nutritionPerServing && product.servingGrams) {
    const n = barcodeBucket(product.nutritionPerServing);
    const ratio = 100 / product.servingGrams;
    return { kcal: Math.round(n.kcal * ratio), protein: barcodeRound(n.protein * ratio), carbs: barcodeRound(n.carbs * ratio), fat: barcodeRound(n.fat * ratio), fibre: barcodeRound(n.fibre * ratio) };
  }
  if (product.servingBasis === 'perPackage' && product.nutritionPerPackage && product.packageGrams) {
    const n = barcodeBucket(product.nutritionPerPackage);
    const ratio = 100 / product.packageGrams;
    return { kcal: Math.round(n.kcal * ratio), protein: barcodeRound(n.protein * ratio), carbs: barcodeRound(n.carbs * ratio), fat: barcodeRound(n.fat * ratio), fibre: barcodeRound(n.fibre * ratio) };
  }
  return { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 };
}

function barcodeCurrentValues() {
  const grams = Math.max(1, Math.round(Number(document.getElementById('barcode-serving-grams')?.value) || 100));
  return {
    grams,
    kcal: Math.round(barcodeReadNumber('barcode-kcal')),
    protein: barcodeRound(barcodeReadNumber('barcode-protein')),
    carbs: barcodeRound(barcodeReadNumber('barcode-carbs')),
    fat: barcodeRound(barcodeReadNumber('barcode-fat')),
    fibre: barcodeRound(barcodeSourceNutrition(barcodeState.product, grams).fibre)
  };
}

function barcodeSanityWarnings(values = barcodeCurrentValues(), product = barcodeState.product) {
  const warnings = [];
  const per100 = barcodeNutritionPer100(product);
  const totalMacros = values.protein + values.carbs + values.fat;
  const per100Macros = per100.protein + per100.carbs + per100.fat;
  const amountIsMass = !product ||
    product.servingBasis === 'per100g' ||
    (product.servingBasis === 'perServing' && !!product.servingGrams) ||
    (product.servingBasis === 'perPackage' && !!product.packageGrams) ||
    product.servingBasis === 'manual';
  if (per100.kcal > 900) warnings.push({ code: 'kcal_per_100g_over_900', level: 'confirm', text: 'Calories per 100g look unusually high.' });
  if (values.kcal > 2000) warnings.push({ code: 'total_kcal_over_2000', level: 'confirm', text: 'This single item is over 2,000 kcal.' });
  if (per100Macros > 105) warnings.push({ code: 'macros_per_100g_physically_impossible', level: 'block', text: 'Macros per 100g are physically impossible.' });
  if (amountIsMass && totalMacros > values.grams * 1.05 + 1) warnings.push({ code: 'macros_total_exceeds_amount', level: 'block', text: 'Macros exceed the amount eaten.' });
  return warnings;
}

function barcodeDiagnostics(product = barcodeState.product, values = null, warnings = null) {
  const warningCodes = (warnings || []).map(w => w.code);
  return {
    barcode: product?.barcode || barcodeState.currentCode || null,
    source: product?.source || null,
    rawNutritionFields: product?.diagnostics?.rawNutritionFields || {},
    normalizedNutritionFields: product?.diagnostics?.normalizedNutritionFields || {
      nutritionPer100g: product?.nutritionPer100g || null,
      nutritionPerServing: product?.nutritionPerServing || null,
      nutritionPerPackage: product?.nutritionPerPackage || null
    },
    servingBasis: product?.servingBasis || 'per100g',
    sanityWarning: warningCodes.length ? warningCodes.join(',') : '',
    editedValues: values || null
  };
}

function barcodeShowWarnings(warnings) {
  const el = document.getElementById('barcode-warning');
  if (!el) return;
  if (!warnings.length) {
    el.style.display = 'none';
    el.textContent = '';
    return;
  }
  el.style.display = 'block';
  el.textContent = warnings.map(w => w.text).join(' ');
}

function barcodeUpdatePreview() {
  if (!barcodeState.product) return;
  const addBtn = document.getElementById('barcode-add-btn');
  if (addBtn) addBtn.dataset.confirmExtreme = '';
  const grams = Math.max(1, Math.round(Number(document.getElementById('barcode-serving-grams')?.value) || 100));
  const values = barcodeSourceNutrition(barcodeState.product, grams);
  Object.entries(values).forEach(([key, value]) => {
    const el = document.getElementById('barcode-' + key);
    if (el) el.value = key === 'kcal' ? Math.round(value) : barcodeRound(value);
  });
  const warnings = barcodeSanityWarnings(barcodeCurrentValues());
  barcodeShowWarnings(warnings);
  barcodeTrace('nutrition_preview_updated', barcodeDiagnostics(barcodeState.product, barcodeCurrentValues(), warnings));
}

function barcodeReviewEdited() {
  const addBtn = document.getElementById('barcode-add-btn');
  if (addBtn) addBtn.dataset.confirmExtreme = '';
  if (!barcodeState.product) return;
  const warnings = barcodeSanityWarnings(barcodeCurrentValues());
  barcodeShowWarnings(warnings);
}

function barcodeAddReviewedProduct() {
  const product = barcodeState.product;
  if (!product) return;
  const name = (document.getElementById('barcode-product-name')?.value || product.name || '').trim();
  if (!name) {
    barcodeSetStatus('Keep a product name before adding.', 'warn');
    return;
  }
  const values = barcodeCurrentValues();
  const warnings = barcodeSanityWarnings(values, product);
  barcodeShowWarnings(warnings);
  barcodeTrace('product_add_attempt', barcodeDiagnostics(product, values, warnings));
  if (warnings.some(w => w.level === 'block')) {
    barcodeSetStatus('Check the nutrition numbers before adding.', 'warn');
    return;
  }
  const addBtn = document.getElementById('barcode-add-btn');
  if (warnings.some(w => w.level === 'confirm') && addBtn?.dataset.confirmExtreme !== 'true') {
    if (addBtn) addBtn.dataset.confirmExtreme = 'true';
    barcodeSetStatus('Nutrition looks unusually high. Edit it or tap Add again to confirm.', 'warn');
    return;
  }
  const per100 = barcodeNutritionPer100(product);
  const per100FromValues = {
    kcal: barcodeRound(values.kcal * 100 / values.grams),
    protein: barcodeRound(values.protein * 100 / values.grams),
    carbs: barcodeRound(values.carbs * 100 / values.grams),
    fat: barcodeRound(values.fat * 100 / values.grams),
    fibre: barcodeRound(values.fibre * 100 / values.grams)
  };
  const n = product.servingBasis === 'per100g' || product.servingBasis === 'manual' ? per100FromValues : per100;
  const food = {
    id: 'barcode_' + product.barcode,
    name,
    w: values.grams,
    kcal: values.kcal,
    p: values.protein,
    c: values.carbs,
    f: values.fat,
    fi: values.fibre,
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
    brand: product.brand || '',
    servingBasis: product.servingBasis || 'per100g',
    diagnostics: barcodeDiagnostics(product, values, warnings)
  };
  const item = {
    name,
    weight: values.grams,
    kcal: values.kcal,
    protein: values.protein,
    carbs: values.carbs,
    fat: values.fat,
    fibre: values.fibre,
    icon: 'ti-barcode',
    type: food.type,
    rawFood: food
  };
  item.source = 'barcode';
  item.barcode = product.barcode;
  item.brand = product.brand || '';
  item.weightSpecified = true;
  item.barcodeDiagnostics = food.diagnostics;
  if (product.source === 'manual_barcode' && typeof addCustomFood === 'function') addCustomFood(food);
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
  ['barcode-product-name', 'barcode-kcal', 'barcode-protein', 'barcode-carbs', 'barcode-fat'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', barcodeReviewEdited);
  });
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
