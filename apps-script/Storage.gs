function defaultSnapshot_() {
  return {
    version: 1,
    privacyVersion: 2,
    updatedAt: new Date().toISOString(),
    transactions: [],
    loans: [],
    fixedPlans: [],
    settings: { weeklyBase: 0, livingCap: 0, monthlyPaceTarget: 0, salary: 0, cardTarget: 0, categoryBudgets: {} },
    cashFlow: 0
  };
}

function sanitizeTransaction_(item) {
  item = item || {};
  return {
    id: String(item.id || Utilities.getUuid()),
    date: String(item.date || ''),
    card: String(item.card || ''),
    amount: Number(item.amount || 0),
    category: String(item.category || '미분류'),
    living: item.living !== false,
    fixed: item.fixed === true,
    performanceIncluded: item.performanceIncluded !== false,
    cashFlow: item.cashFlow === true
  };
}

function sanitizeSnapshot_(snapshot) {
  var clean = {
    version: Number(snapshot && snapshot.version || 0),
    privacyVersion: 2,
    updatedAt: String(snapshot && snapshot.updatedAt || ''),
    transactions: Array.isArray(snapshot && snapshot.transactions) ? snapshot.transactions.map(sanitizeTransaction_) : [],
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
  var clean = sanitizeSnapshot_(snapshot);
  validateSnapshot_(clean);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    clean.version = Number(clean.version || 0) + 1;
    clean.updatedAt = new Date().toISOString();
    dataFile_().setContent(JSON.stringify(clean));
    return clean;
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
