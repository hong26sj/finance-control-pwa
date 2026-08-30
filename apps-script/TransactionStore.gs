function defaultTransactionDetails_() {
  return { version: 1, transactions: {} };
}

function transactionDetailsFile_() {
  var properties = PropertiesService.getScriptProperties();
  var id = properties.getProperty('TRANSACTION_DETAILS_FILE_ID') || '';
  if (id) {
    try { return DriveApp.getFileById(id); } catch (_) {}
  }
  var file = financeFolder_().createFile('transaction-details.enc', encryptVaultText_(JSON.stringify(defaultTransactionDetails_())), MimeType.PLAIN_TEXT);
  properties.setProperty('TRANSACTION_DETAILS_FILE_ID', file.getId());
  return file;
}

function readTransactionDetails_() {
  var text = transactionDetailsFile_().getBlob().getDataAsString('UTF-8');
  if (!text) return defaultTransactionDetails_();
  var parsed = JSON.parse(decryptVaultText_(text));
  if (!parsed || typeof parsed !== 'object') return defaultTransactionDetails_();
  if (!parsed.transactions || typeof parsed.transactions !== 'object') parsed.transactions = {};
  return parsed;
}

function writeTransactionDetails_(details) {
  details = details || defaultTransactionDetails_();
  details.version = 1;
  if (!details.transactions || typeof details.transactions !== 'object') details.transactions = {};
  transactionDetailsFile_().setContent(encryptVaultText_(JSON.stringify(details)));
  return details;
}

function writeServerSnapshot_(snapshot) {
  validateSnapshot_(snapshot);
  snapshot.version = Number(snapshot.version || 0) + 1;
  snapshot.privacyVersion = 4;
  snapshot.updatedAt = new Date().toISOString();
  dataFile_().setContent(JSON.stringify(snapshot));
  return snapshot;
}

function updateServerVaultItem_(vault, raw, clean) {
  var id = String(clean.id || '').trim();
  if (!id) return;
  var previous = vault.transactions[id] || {};
  var merchant = String(raw.merchant || previous.merchant || '').trim().slice(0, 200);
  var hash = String(clean.merchantHash || previous.merchantHash || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash) && merchant) hash = merchantFingerprint_(merchant);
  vault.transactions[id] = {
    merchant: merchant,
    merchantHash: hash,
    category: String(clean.category || previous.category || '미분류').slice(0, 80),
    updatedAt: new Date().toISOString()
  };
}

function updateServerDetailItem_(details, raw, clean) {
  var id = String(clean.id || '').trim();
  if (!id) return;
  var previous = details.transactions[id] || {};
  details.transactions[id] = {
    time: String(raw.time != null ? raw.time : (previous.time || '')).slice(0, 20),
    source: String(raw.source != null ? raw.source : (previous.source || '')).slice(0, 100),
    memo: String(raw.memo != null ? raw.memo : (previous.memo || '')).slice(0, 1000),
    cashAdvance: raw.cashAdvance != null ? raw.cashAdvance === true : previous.cashAdvance === true
  };
}

function patchServerTransaction_(raw, options) {
  raw = raw || {};
  options = options || {};
  var clean = sanitizeTransaction_(raw);
  var merchant = String(raw.merchant || '').trim();
  if (!clean.merchantHash && merchant) clean.merchantHash = merchantFingerprint_(merchant);
  var id = String(clean.id || '').trim();
  if (!id) throw new Error('TRANSACTION_ID_REQUIRED');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(2500)) throw new Error('LOCK_BUSY');
  try {
    var snapshot = readSnapshot_();
    var index = -1;
    for (var i = 0; i < snapshot.transactions.length; i += 1) {
      if (String(snapshot.transactions[i].id) === id) { index = i; break; }
    }
    if (index < 0) throw new Error('TRANSACTION_NOT_FOUND');
    snapshot.transactions[index] = clean;
    writeServerSnapshot_(snapshot);

    if (options.writeVault === true) {
      var vault = readMerchantVault_();
      updateServerVaultItem_(vault, raw, clean);
      writeMerchantVault_(vault);
    }

    if (options.writeDetails === true) {
      var details = readTransactionDetails_();
      updateServerDetailItem_(details, raw, clean);
      writeTransactionDetails_(details);
    }

    return {
      saved: 1,
      version: snapshot.version,
      updatedAt: snapshot.updatedAt,
      writes: 1 + (options.writeVault === true ? 1 : 0) + (options.writeDetails === true ? 1 : 0)
    };
  } finally { lock.releaseLock(); }
}

function upsertServerTransactions_(items) {
  items = Array.isArray(items) ? items.slice(0, 2000) : [];
  if (!items.length) return { saved: 0 };
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var snapshot = readSnapshot_();
    var vault = readMerchantVault_();
    var details = readTransactionDetails_();
    var byId = {};
    snapshot.transactions.forEach(function (row, index) { byId[String(row.id)] = index; });
    var saved = 0;

    items.forEach(function (raw) {
      raw = raw || {};
      var clean = sanitizeTransaction_(raw);
      var merchant = String(raw.merchant || '').trim();
      if (!clean.merchantHash && merchant) clean.merchantHash = merchantFingerprint_(merchant);
      var id = String(clean.id || '').trim();
      if (!id) return;
      if (Object.prototype.hasOwnProperty.call(byId, id)) snapshot.transactions[byId[id]] = clean;
      else {
        byId[id] = snapshot.transactions.length;
        snapshot.transactions.push(clean);
      }
      updateServerVaultItem_(vault, raw, clean);
      updateServerDetailItem_(details, raw, clean);
      saved += 1;
    });

    writeServerSnapshot_(snapshot);
    writeMerchantVault_(vault);
    writeTransactionDetails_(details);
    return { saved: saved, version: snapshot.version, updatedAt: snapshot.updatedAt };
  } finally { lock.releaseLock(); }
}

function deleteServerTransactions_(ids) {
  var wanted = {};
  (Array.isArray(ids) ? ids : []).forEach(function (id) {
    id = String(id || '').trim();
    if (id) wanted[id] = true;
  });
  var keys = Object.keys(wanted);
  if (!keys.length) return { removed: 0 };

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var snapshot = readSnapshot_();
    var vault = readMerchantVault_();
    var details = readTransactionDetails_();
    var before = snapshot.transactions.length;
    snapshot.transactions = snapshot.transactions.filter(function (row) { return !wanted[String(row.id)]; });
    keys.forEach(function (id) {
      delete vault.transactions[id];
      delete details.transactions[id];
    });
    var removed = before - snapshot.transactions.length;
    if (removed) writeServerSnapshot_(snapshot);
    writeMerchantVault_(vault);
    writeTransactionDetails_(details);
    return { removed: removed, version: snapshot.version, updatedAt: snapshot.updatedAt };
  } finally { lock.releaseLock(); }
}

function saveServerConfig_(body) {
  body = body || {};
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var snapshot = readSnapshot_();
    if (Array.isArray(body.loans)) snapshot.loans = body.loans;
    if (Array.isArray(body.fixedPlans)) snapshot.fixedPlans = body.fixedPlans;
    if (body.settings && typeof body.settings === 'object') snapshot.settings = body.settings;
    if (body.cashFlow != null) snapshot.cashFlow = Number(body.cashFlow || 0);
    writeServerSnapshot_(snapshot);
    return { version: snapshot.version, updatedAt: snapshot.updatedAt };
  } finally { lock.releaseLock(); }
}

function getServerTransactionDetails_(ids) {
  var wanted = {};
  (Array.isArray(ids) ? ids : []).slice(0, 5000).forEach(function (id) { wanted[String(id)] = true; });
  var details = readTransactionDetails_();
  return Object.keys(wanted).map(function (id) {
    var item = details.transactions[id] || {};
    return {
      id: id,
      time: String(item.time || ''),
      source: String(item.source || ''),
      memo: String(item.memo || ''),
      cashAdvance: item.cashAdvance === true
    };
  });
}

function shortcutExistsInServer_(snapshot, details, date, time, card, amount, merchantHash) {
  return snapshot.transactions.some(function (row) {
    if (String(row.date) !== date || String(row.card) !== card || Number(row.amount) !== amount || String(row.merchantHash || '') !== merchantHash) return false;
    var detail = details.transactions[String(row.id)] || {};
    return String(detail.time || '') === time;
  });
}

function removeShortcutInboxKeyUnlocked_(key) {
  try {
    var inbox = readShortcutInbox_();
    var before = inbox.items.length;
    inbox.items = inbox.items.filter(function (row) { return shortcutTransactionKey_(row) !== key; });
    if (inbox.items.length !== before) writeShortcutInbox_(inbox);
  } catch (_) {}
}

function importShortcutTransactionDirect_(body) {
  if (!authorizeShortcutImport_(body.shortcut_key)) throw new Error('SHORTCUT_UNAUTHORIZED');

  var merchant = String(body.merchant || '').trim().replace(/\s*누적[\d,]+원\s*$/i, '').slice(0, 200);
  var amount = Number(body.amount || 0);
  var date = String(body.date || '').trim();
  var time = String(body.time || '').trim();
  var card = normalizeShortcutCard_(body.cardCompany, body.card);
  if (!merchant || !amount || !/^\d{4}-\d{1,2}-\d{1,2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(time)) throw new Error('INVALID_SHORTCUT_TRANSACTION');

  var dateParts = date.split('-');
  date = dateParts[0] + '-' + ('0' + dateParts[1]).slice(-2) + '-' + ('0' + dateParts[2]).slice(-2);
  var timeParts = time.split(':');
  time = ('0' + timeParts[0]).slice(-2) + ':' + timeParts[1];
  var merchantHash = merchantFingerprint_(merchant);

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var snapshot = readSnapshot_();
    var vault = readMerchantVault_();
    var details = readTransactionDetails_();
    var rule = merchantRuleForHash_(vault, merchantHash);
    var category = rule && rule.category ? rule.category : shortcutFallbackCategory_(merchant);
    var fixed = category === '고정비';
    var key = [date, time, card, amount, merchantHash].join('|');

    if (shortcutExistsInServer_(snapshot, details, date, time, card, amount, merchantHash)) {
      removeShortcutInboxKeyUnlocked_(key);
      return { ok: true, status: 'duplicate', merchant: merchant, amount: amount, category: category };
    }

    var raw = {
      id: 'shortcut-' + Utilities.getUuid(),
      date: date,
      time: time,
      card: card,
      merchant: merchant,
      amount: amount,
      category: category,
      living: !fixed,
      fixed: fixed,
      performanceIncluded: true,
      cashFlow: false,
      source: 'iOS 카드알림 OCR',
      memo: '',
      merchantHash: merchantHash,
      merchantCategoryAmbiguous: !!(rule && rule.ambiguous)
    };
    var clean = sanitizeTransaction_(raw);
    snapshot.transactions.push(clean);
    updateServerVaultItem_(vault, raw, clean);
    updateServerDetailItem_(details, raw, clean);
    writeServerSnapshot_(snapshot);
    writeMerchantVault_(vault);
    writeTransactionDetails_(details);
    removeShortcutInboxKeyUnlocked_(key);
    return { ok: true, status: 'stored', merchant: merchant, amount: amount, category: category, id: clean.id };
  } finally { lock.releaseLock(); }
}

function migrateShortcutInboxToSnapshot_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var inbox;
    try { inbox = readShortcutInbox_(); } catch (_) { return { migrated: 0, cleared: 0 }; }
    var items = Array.isArray(inbox.items) ? inbox.items : [];
    if (!items.length) return { migrated: 0, cleared: 0 };

    var snapshot = readSnapshot_();
    var vault = readMerchantVault_();
    var details = readTransactionDetails_();
    var migrated = 0;

    items.forEach(function (raw) {
      raw = raw || {};
      var merchant = String(raw.merchant || '').trim();
      var hash = String(raw.merchantHash || '').toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(hash) && merchant) hash = merchantFingerprint_(merchant);
      var date = String(raw.date || '');
      var time = String(raw.time || '');
      var card = String(raw.card || '');
      var amount = Number(raw.amount || 0);
      if (!date || !card || !amount || !hash) return;
      if (shortcutExistsInServer_(snapshot, details, date, time, card, amount, hash)) return;
      raw.merchantHash = hash;
      var clean = sanitizeTransaction_(raw);
      snapshot.transactions.push(clean);
      updateServerVaultItem_(vault, raw, clean);
      updateServerDetailItem_(details, raw, clean);
      migrated += 1;
    });

    if (migrated) {
      writeServerSnapshot_(snapshot);
      writeMerchantVault_(vault);
      writeTransactionDetails_(details);
    }
    inbox.items = [];
    writeShortcutInbox_(inbox);
    return { migrated: migrated, cleared: items.length };
  } finally { lock.releaseLock(); }
}
