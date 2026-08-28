function shortcutLearnedClassification_(vault, merchantHash) {
  var rule = merchantRuleForHash_(vault, merchantHash);
  if (!rule || !rule.category || rule.category === '미분류' || rule.ambiguous) {
    return { category: '미분류', living: false, fixed: false, rule: rule };
  }
  var fixed = rule.category === '고정비';
  return { category: rule.category, living: !fixed, fixed: fixed, rule: rule };
}

function importShortcutTransactionDirectV2_(body) {
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
    var learned = shortcutLearnedClassification_(vault, merchantHash);

    if (shortcutExistsInServer_(snapshot, details, date, time, card, amount, merchantHash)) {
      return { ok: true, status: 'duplicate', merchant: merchant, amount: amount, category: learned.category };
    }

    var raw = {
      id: 'shortcut-' + Utilities.getUuid(),
      date: date,
      time: time,
      card: card,
      merchant: merchant,
      amount: amount,
      category: learned.category,
      living: learned.living,
      fixed: learned.fixed,
      performanceIncluded: true,
      cashFlow: false,
      source: 'iOS 카드알림 OCR',
      memo: '',
      merchantHash: merchantHash,
      merchantCategoryAmbiguous: !!(learned.rule && learned.rule.ambiguous)
    };

    var clean = sanitizeTransaction_(raw);
    snapshot.transactions.push(clean);
    updateServerVaultItem_(vault, raw, clean);
    updateServerDetailItem_(details, raw, clean);
    writeServerSnapshot_(snapshot);
    writeMerchantVault_(vault);
    writeTransactionDetails_(details);

    return {
      ok: true,
      status: 'stored',
      merchant: merchant,
      amount: amount,
      category: learned.category,
      id: clean.id
    };
  } finally {
    lock.releaseLock();
  }
}

function migrateShortcutClassificationV2_() {
  var properties = PropertiesService.getScriptProperties();
  if (properties.getProperty('SHORTCUT_CLASSIFICATION_V2_MIGRATED') === '1') return { migrated: 0, alreadyDone: true };

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (properties.getProperty('SHORTCUT_CLASSIFICATION_V2_MIGRATED') === '1') return { migrated: 0, alreadyDone: true };

    var snapshot = readSnapshot_();
    var vault = readMerchantVault_();
    var migrated = 0;

    snapshot.transactions.forEach(function (row) {
      var id = String(row.id || '');
      if (id.indexOf('shortcut-') !== 0) return;
      if (row.category === '미분류' && row.living === false && row.fixed === false) return;

      row.category = '미분류';
      row.living = false;
      row.fixed = false;
      if (vault.transactions[id]) {
        vault.transactions[id].category = '미분류';
        vault.transactions[id].updatedAt = new Date().toISOString();
      }
      migrated += 1;
    });

    if (migrated) {
      writeServerSnapshot_(snapshot);
      writeMerchantVault_(vault);
    }
    properties.setProperty('SHORTCUT_CLASSIFICATION_V2_MIGRATED', '1');
    return { migrated: migrated, alreadyDone: false };
  } finally {
    lock.releaseLock();
  }
}

function migrateShortcutAutoClassificationV3_() {
  var properties = PropertiesService.getScriptProperties();
  if (properties.getProperty('SHORTCUT_AUTO_CLASSIFICATION_V3_MIGRATED') === '1') return { migrated: 0, alreadyDone: true };

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (properties.getProperty('SHORTCUT_AUTO_CLASSIFICATION_V3_MIGRATED') === '1') return { migrated: 0, alreadyDone: true };

    var snapshot = readSnapshot_();
    var vault = readMerchantVault_();
    var migrated = 0;

    snapshot.transactions.forEach(function (row) {
      var id = String(row.id || '');
      if (id.indexOf('shortcut-') !== 0) return;
      if (String(row.category || '') !== '미분류') return;
      var hash = String(row.merchantHash || '');
      if (!hash) return;

      var learned = shortcutLearnedClassification_(vault, hash);
      if (learned.category === '미분류') return;

      row.category = learned.category;
      row.living = learned.living;
      row.fixed = learned.fixed;
      row.merchantCategoryAmbiguous = false;
      if (vault.transactions[id]) {
        vault.transactions[id].category = learned.category;
        vault.transactions[id].updatedAt = new Date().toISOString();
      }
      migrated += 1;
    });

    if (migrated) {
      writeServerSnapshot_(snapshot);
      writeMerchantVault_(vault);
    }
    properties.setProperty('SHORTCUT_AUTO_CLASSIFICATION_V3_MIGRATED', '1');
    return { migrated: migrated, alreadyDone: false };
  } finally {
    lock.releaseLock();
  }
}
