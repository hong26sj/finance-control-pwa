function defaultSnapshot_() {
  return {
    version: 1,
    privacyVersion: 3,
    updatedAt: new Date().toISOString(),
    transactions: [],
    merchantRules: {},
    loans: [],
    fixedPlans: [],
    settings: { weeklyBase: 0, livingCap: 0, monthlyPaceTarget: 0, salary: 0, cardTarget: 0, categoryBudgets: {} },
    cashFlow: 0
  };
}

function sanitizeMerchantRule_(rule) {
  rule = rule || {};
  return {
    displayName: String(rule.displayName || '').trim().slice(0, 120),
    category: String(rule.category || '미분류').trim().slice(0, 80)
  };
}

function sanitizeMerchantRules_(rules) {
  var clean = {};
  if (!rules || typeof rules !== 'object') return clean;
  Object.keys(rules).forEach(function (hash) {
    if (!/^[a-f0-9]{64}$/i.test(hash)) return;
    var rule = sanitizeMerchantRule_(rules[hash]);
    if (rule.displayName && rule.category && rule.category !== '미분류') clean[hash.toLowerCase()] = rule;
  });
  return clean;
}

function sanitizeTransaction_(item) {
  item = item || {};
  var hash = String(item.merchantHash || '').toLowerCase();
  return {
    id: String(item.id || Utilities.getUuid()),
    date: String(item.date || ''),
    card: String(item.card || ''),
    amount: Number(item.amount || 0),
    category: String(item.category || '미분류'),
    living: item.living !== false,
    fixed: item.fixed === true,
    performanceIncluded: item.performanceIncluded !== false,
    cashFlow: item.cashFlow === true,
    merchantHash: /^[a-f0-9]{64}$/.test(hash) ? hash : '',
    displayName: item.category === '미분류' ? '' : String(item.displayName || '').trim().slice(0, 120)
  };
}

function sanitizeSnapshot_(snapshot) {
  var clean = {
    version: Number(snapshot && snapshot.version || 0),
    privacyVersion: 3,
    updatedAt: String(snapshot && snapshot.updatedAt || ''),
    transactions: Array.isArray(snapshot && snapshot.transactions) ? snapshot.transactions.map(sanitizeTransaction_) : [],
    merchantRules: sanitizeMerchantRules_(snapshot && snapshot.merchantRules),
    loans: Array.isArray(snapshot && snapshot.loans) ? snapshot.loans : [],
    fixedPlans: Array.isArray(snapshot && snapshot.fixedPlans) ? snapshot.fixedPlans : [],
    settings: snapshot && snapshot.settings && typeof snapshot.settings === 'object' ? snapshot.settings : defaultSnapshot_().settings,
    cashFlow: Number(snapshot && snapshot.cashFlow || 0)
  };
  return clean;
}

function validateSnapshot_(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.transactions) || !Array.isArray(snapshot.loans) || !Array.isArray(snapshot.fixedPlans)) throw new Error('INVALID_SNAPSHOT');
  if (!snapshot.settings || typeof snapshot.settings !== 'object') throw new Error('INVALID_SETTINGS');
  if (!snapshot.merchantRules || typeof snapshot.merchantRules !== 'object') throw new Error('INVALID_MERCHANT_RULES');
  if (JSON.stringify(snapshot).length > 9000000) throw new Error('SNAPSHOT_TOO_LARGE');
}

function dataFile_() {
  var id = PropertiesService.getScriptProperties().getProperty('FINANCE_DATA_FILE_ID');
  if (!id) throw new Error('STORAGE_NOT_INITIALIZED');
  return DriveApp.getFileById(id);
}

function readSnapshot_() {
  var text = dataFile_().getBlob().getDataAsString('UTF-8');
  return text ? sanitizeSnapshot_(JSON.parse(text)) : defaultSnapshot_();
}

function saveSnapshot_(snapshot) {
  var current = readSnapshot_();
  var incoming = snapshot || {};
  if (!incoming.merchantRules) incoming.merchantRules = current.merchantRules || {};
  var clean = sanitizeSnapshot_(incoming);
  validateSnapshot_(clean);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    clean.version = Number(current.version || 0) + 1;
    clean.updatedAt = new Date().toISOString();
    dataFile_().setContent(JSON.stringify(clean));
    return clean;
  } finally { lock.releaseLock(); }
}

function resolveMerchantRules_(merchants) {
  var current = readSnapshot_();
  var rules = current.merchantRules || {};
  return (Array.isArray(merchants) ? merchants : []).slice(0, 1000).map(function (merchant) {
    var raw = String(merchant || '');
    if (!raw.trim()) return { merchant: raw, merchantHash: '', rule: null };
    var hash = merchantFingerprint_(raw);
    return { merchant: raw, merchantHash: hash, rule: rules[hash] || null };
  });
}

function saveMerchantRule_(rawMerchant, merchantHash, displayName, category) {
  var name = String(displayName || '').trim();
  var cat = String(category || '').trim();
  if (!name) throw new Error('DISPLAY_NAME_REQUIRED');
  if (!cat || cat === '미분류') throw new Error('CATEGORY_REQUIRED');
  var hash = String(merchantHash || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) hash = merchantFingerprint_(rawMerchant);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var current = readSnapshot_();
    current.merchantRules = current.merchantRules || {};
    current.merchantRules[hash] = sanitizeMerchantRule_({ displayName: name, category: cat });
    var saved = saveSnapshot_(current);
    return { merchantHash: hash, rule: saved.merchantRules[hash] };
  } finally { lock.releaseLock(); }
}

function purgeStoredTransactionDetails() {
  var current = readSnapshot_();
  var clean = saveSnapshot_(current);
  return { ok: true, transactions: clean.transactions.length, privacyVersion: clean.privacyVersion };
}

function setupFinanceStorage(folderId, accessToken) {
  if (!accessToken || String(accessToken).length < 20) throw new Error('20자 이상의 임의 토큰을 사용하세요.');
  var properties = PropertiesService.getScriptProperties();
  var existingId = properties.getProperty('FINANCE_DATA_FILE_ID');
  merchantHmacSecret_();
  if (existingId) {
    properties.setProperty('ACCESS_TOKEN_HASH', sha256Hex_(String(accessToken)));
    return { fileId: existingId, fileName: DriveApp.getFileById(existingId).getName(), reused: true };
  }
  var folder = folderId ? DriveApp.getFolderById(folderId) : DriveApp.getRootFolder();
  var file = folder.createFile('flow-finance-data.json', JSON.stringify(defaultSnapshot_()), MimeType.PLAIN_TEXT);
  properties.setProperties({ FINANCE_DATA_FILE_ID: file.getId(), ACCESS_TOKEN_HASH: sha256Hex_(String(accessToken)) }, false);
  return { fileId: file.getId(), fileName: file.getName(), reused: false };
}

function resetFinanceAccessToken(accessToken) {
  if (!accessToken || String(accessToken).length < 20) throw new Error('20자 이상의 임의 토큰을 사용하세요.');
  PropertiesService.getScriptProperties().setProperty('ACCESS_TOKEN_HASH', sha256Hex_(String(accessToken)));
  return { ok: true };
}
