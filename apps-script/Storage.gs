function defaultSnapshot_() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    transactions: [],
    loans: [],
    fixedPlans: [],
    settings: { weeklyBase: 0, livingCap: 0, monthlyPaceTarget: 0, salary: 0, cardTarget: 0, categoryBudgets: {} },
    cashFlow: 0
  };
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
  return text ? JSON.parse(text) : defaultSnapshot_();
}

function saveSnapshot_(snapshot) {
  validateSnapshot_(snapshot);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    snapshot.version = Number(snapshot.version || 0) + 1;
    snapshot.updatedAt = new Date().toISOString();
    dataFile_().setContent(JSON.stringify(snapshot));
    return snapshot;
  } finally { lock.releaseLock(); }
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
