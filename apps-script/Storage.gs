function defaultSnapshot_() {
  return {
    version: 1,
    privacyVersion: 4,
    updatedAt: new Date().toISOString(),
    transactions: [],
    loans: [],
    fixedPlans: [],
    settings: { weeklyBase: 0, livingCap: 0, monthlyPaceTarget: 0, salary: 0, cardTarget: 0, categoryBudgets: {} },
    cashFlow: 0
  };
}

function defaultMerchantVault_() {
  return { version: 1, transactions: {} };
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
    merchantHash: /^[a-f0-9]{64}$/.test(hash) ? hash : ''
  };
}

function sanitizeSnapshot_(snapshot) {
  return {
    version: Number(snapshot && snapshot.version || 0),
    privacyVersion: 4,
    updatedAt: String(snapshot && snapshot.updatedAt || ''),
    transactions: Array.isArray(snapshot && snapshot.transactions) ? snapshot.transactions.map(sanitizeTransaction_) : [],
    loans: Array.isArray(snapshot && snapshot.loans) ? snapshot.loans : [],
    fixedPlans: Array.isArray(snapshot && snapshot.fixedPlans) ? snapshot.fixedPlans : [],
    settings: snapshot && snapshot.settings && typeof snapshot.settings === 'object' ? snapshot.settings : defaultSnapshot_().settings,
    cashFlow: Number(snapshot && snapshot.cashFlow || 0)
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

function financeFolder_() {
  var properties = PropertiesService.getScriptProperties();
  var folderId = properties.getProperty('FINANCE_FOLDER_ID') || '';
  if (folderId) {
    try { return DriveApp.getFolderById(folderId); } catch (_) {}
  }

  var root = DriveApp.getRootFolder();
  var folders = root.getFoldersByName('Flow Finance');
  var folder = folders.hasNext() ? folders.next() : root.createFolder('Flow Finance');
  properties.setProperty('FINANCE_FOLDER_ID', folder.getId());
  return folder;
}

function merchantVaultFile_() {
  var properties = PropertiesService.getScriptProperties();
  var id = properties.getProperty('MERCHANT_VAULT_FILE_ID') || '';
  if (id) {
    try { return DriveApp.getFileById(id); } catch (_) {}
  }
  merchantVaultKey_();
  var folder = financeFolder_();
  var file = folder.createFile('merchant-vault.enc', encryptVaultText_(JSON.stringify(defaultMerchantVault_())), MimeType.PLAIN_TEXT);
  properties.setProperty('MERCHANT_VAULT_FILE_ID', file.getId());
  return file;
}

function readMerchantVault_() {
  var text = merchantVaultFile_().getBlob().getDataAsString('UTF-8');
  if (!text) return defaultMerchantVault_();
  var parsed = JSON.parse(decryptVaultText_(text));
  if (!parsed || typeof parsed !== 'object') return defaultMerchantVault_();
  if (!parsed.transactions || typeof parsed.transactions !== 'object') parsed.transactions = {};
  return parsed;
}

function writeMerchantVault_(vault) {
  vault = vault || defaultMerchantVault_();
  vault.version = 1;
  merchantVaultFile_().setContent(encryptVaultText_(JSON.stringify(vault)));
  return vault;
}

function merchantRuleForHash_(vault, hash) {
  var categories = {};
  Object.keys(vault.transactions || {}).forEach(function (id) {
    var item = vault.transactions[id] || {};
    if (String(item.merchantHash || '') !== hash) return;
    var category = String(item.category || '');
    if (category && category !== '미분류') categories[category] = true;
  });
  var list = Object.keys(categories).sort();
  if (!list.length) return null;
  return { category: list.length === 1 ? list[0] : '', ambiguous: list.length > 1, categories: list };
}

function saveTransactionMerchants_(items) {
  items = Array.isArray(items) ? items.slice(0, 1000) : [];
  if (!items.length) return { saved: 0 };
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var vault = readMerchantVault_();
    var saved = 0;
    items.forEach(function (item) {
      item = item || {};
      var id = String(item.id || '').trim();
      var merchant = String(item.merchant || '').trim().slice(0, 200);
      if (!id || !merchant) return;
      var hash = String(item.merchantHash || '').toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(hash)) hash = merchantFingerprint_(merchant);
      var previous = vault.transactions[id] || {};
      vault.transactions[id] = {
        merchant: merchant,
        merchantHash: hash,
        category: String(item.category || previous.category || '미분류').slice(0, 80)
      };
      saved += 1;
    });
    writeMerchantVault_(vault);
    return { saved: saved };
  } finally { lock.releaseLock(); }
}

function getTransactionMerchant_(transactionId) {
  var id = String(transactionId || '').trim();
  if (!id) throw new Error('TRANSACTION_ID_REQUIRED');
  var vault = readMerchantVault_();
  var item = vault.transactions[id] || {};
  return String(item.merchant || '');
}

function deleteTransactionMerchant_(transactionId) {
  var id = String(transactionId || '').trim();
  if (!id) return { ok: true };
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var vault = readMerchantVault_();
    delete vault.transactions[id];
    writeMerchantVault_(vault);
    return { ok: true };
  } finally { lock.releaseLock(); }
}

function resolveMerchantRules_(merchants) {
  var vault = readMerchantVault_();
  return (Array.isArray(merchants) ? merchants : []).slice(0, 1000).map(function (merchant) {
    var raw = String(merchant || '');
    if (!raw.trim()) return { merchant: raw, merchantHash: '', rule: null };
    var hash = merchantFingerprint_(raw);
    return { merchant: raw, merchantHash: hash, rule: merchantRuleForHash_(vault, hash) };
  });
}

function saveMerchantRule_(transactionId, rawMerchant, merchantHash, category) {
  var id = String(transactionId || '').trim();
  var cat = String(category || '').trim();
  if (!id) throw new Error('TRANSACTION_ID_REQUIRED');
  if (!cat || cat === '미분류') throw new Error('CATEGORY_REQUIRED');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var vault = readMerchantVault_();
    var previous = vault.transactions[id] || {};
    var merchant = String(rawMerchant || previous.merchant || '').trim().slice(0, 200);
    var hash = String(merchantHash || previous.merchantHash || '').toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(hash)) {
      if (!merchant) throw new Error('MERCHANT_REQUIRED');
      hash = merchantFingerprint_(merchant);
    }
    vault.transactions[id] = { merchant: merchant, merchantHash: hash, category: cat };
    writeMerchantVault_(vault);
    return { merchantHash: hash, rule: merchantRuleForHash_(vault, hash) };
  } finally { lock.releaseLock(); }
}

function organizeFinanceStorage() {
  var properties = PropertiesService.getScriptProperties();
  var fileId = properties.getProperty('FINANCE_DATA_FILE_ID') || '';
  if (!fileId) throw new Error('STORAGE_NOT_INITIALIZED');

  var folder = financeFolder_();
  var file = DriveApp.getFileById(fileId);
  file.moveTo(folder);
  merchantHmacSecret_();
  merchantVaultKey_();
  var vaultFile = merchantVaultFile_();
  vaultFile.moveTo(folder);

  return {
    ok: true,
    folderId: folder.getId(),
    folderName: folder.getName(),
    fileId: file.getId(),
    fileName: file.getName(),
    merchantVaultFileId: vaultFile.getId(),
    merchantVaultFileName: vaultFile.getName()
  };
}

function readSnapshot_() {
  var text = dataFile_().getBlob().getDataAsString('UTF-8');
  return text ? sanitizeSnapshot_(JSON.parse(text)) : defaultSnapshot_();
}

function readSnapshotForClient_() {
  var snapshot = readSnapshot_();
  var vault = readMerchantVault_();
  snapshot.transactions = snapshot.transactions.map(function (item) {
    var merchant = vault.transactions[item.id] && vault.transactions[item.id].merchant;
    if (!merchant) return item;
    var copy = {};
    Object.keys(item).forEach(function (key) { copy[key] = item[key]; });
    copy.merchant = merchant;
    return copy;
  });
  return snapshot;
}

function saveSnapshot_(snapshot) {
  var incoming = snapshot || {};
  if (Array.isArray(incoming.transactions)) {
    saveTransactionMerchants_(incoming.transactions.map(function (item) {
      return { id: item.id, merchant: item.merchant, merchantHash: item.merchantHash, category: item.category };
    }));
  }
  var clean = sanitizeSnapshot_(incoming);
  validateSnapshot_(clean);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var current = readSnapshot_();
    clean.version = Number(current.version || 0) + 1;
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
  merchantHmacSecret_();
  merchantVaultKey_();
  if (existingId) {
    properties.setProperty('ACCESS_TOKEN_HASH', sha256Hex_(String(accessToken)));
    merchantVaultFile_();
    return { fileId: existingId, fileName: DriveApp.getFileById(existingId).getName(), reused: true };
  }

  var folder;
  if (folderId) {
    folder = DriveApp.getFolderById(folderId);
    properties.setProperty('FINANCE_FOLDER_ID', folder.getId());
  } else {
    folder = financeFolder_();
  }

  var file = folder.createFile('flow-finance-data.json', JSON.stringify(defaultSnapshot_()), MimeType.PLAIN_TEXT);
  properties.setProperties({ FINANCE_DATA_FILE_ID: file.getId(), ACCESS_TOKEN_HASH: sha256Hex_(String(accessToken)) }, false);
  merchantVaultFile_();
  return { fileId: file.getId(), fileName: file.getName(), folderId: folder.getId(), reused: false };
}

function resetFinanceAccessToken(accessToken) {
  if (!accessToken || String(accessToken).length < 20) throw new Error('20자 이상의 임의 토큰을 사용하세요.');
  PropertiesService.getScriptProperties().setProperty('ACCESS_TOKEN_HASH', sha256Hex_(String(accessToken)));
  return { ok: true };
}
