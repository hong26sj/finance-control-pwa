var SHORTCUT_IMPORT_KEY_HASH_ = '811713493818d9ff5a39e679d2bf260dadbe0e4277461f334d5882317b5e20ca';

function defaultShortcutInbox_() {
  return { version: 1, items: [] };
}

function shortcutInboxFile_() {
  var properties = PropertiesService.getScriptProperties();
  var id = properties.getProperty('SHORTCUT_INBOX_FILE_ID') || '';
  if (id) {
    try { return DriveApp.getFileById(id); } catch (_) {}
  }
  var file = financeFolder_().createFile('shortcut-inbox.enc', encryptVaultText_(JSON.stringify(defaultShortcutInbox_())), MimeType.PLAIN_TEXT);
  properties.setProperty('SHORTCUT_INBOX_FILE_ID', file.getId());
  return file;
}

function readShortcutInbox_() {
  var text = shortcutInboxFile_().getBlob().getDataAsString('UTF-8');
  if (!text) return defaultShortcutInbox_();
  var parsed = JSON.parse(decryptVaultText_(text));
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.items)) return defaultShortcutInbox_();
  return parsed;
}

function writeShortcutInbox_(inbox) {
  inbox = inbox || defaultShortcutInbox_();
  inbox.version = 1;
  if (!Array.isArray(inbox.items)) inbox.items = [];
  shortcutInboxFile_().setContent(encryptVaultText_(JSON.stringify(inbox)));
  return inbox;
}

function authorizeShortcutImport_(key) {
  var raw = String(key || '');
  return raw && sha256Hex_(raw) === SHORTCUT_IMPORT_KEY_HASH_;
}

function normalizeShortcutCard_(company, card) {
  var raw = (String(company || '') + ' ' + String(card || '')).trim();
  if (/신한/i.test(raw)) return '신한';
  if (/red/i.test(raw)) return '현대 Red';
  if (/네이버/i.test(raw)) return '현대 네이버';
  if (/현대/i.test(raw)) return '현대 Red';
  return String(card || company || '기타').trim();
}

function shortcutFallbackCategory_(merchant) {
  var m = String(merchant || '').toLowerCase();
  if (/보험|아파트관리비|kt통신요금|귀뚜라미에너지|도시가스/.test(m)) return '고정비';
  if (/푸드포커스|푸드 포커스|더이룸푸드/.test(m)) return '평일 점심';
  if (/gs25|세븐일레븐|씨유|cu|이마트24|마트|정육|쿠팡_쿠페이|쿠팡\(쿠페이\)/.test(m)) return '식비·장보기';
  if (/커피|ciao|차오|뚜레쥬르|카카오페이메가/.test(m)) return '커피·간식';
  if (/카카오t|택시|티머니|코레일|더스윙/.test(m)) return '교통·주차';
  if (/다이소|올리브영|워시스왓|병원|의원|한의원|약국|고이장례|chatgpt|openai|구글클라우드/.test(m)) return '생활용품·잡비';
  if (/쿠팡이츠|우아한형제들|김밥|국수|해장국|분식|삼계탕|유부|호텔|볼링|비어|시네마|여기어때|넷플릭스|웨이브|교보문고/.test(m)) return '외식·여가·개인';
  return '미분류';
}

function shortcutTransactionKey_(item) {
  return [item.date, item.time, item.card, item.amount, item.merchantHash].join('|');
}

function importShortcutTransaction_(body) {
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
  var vault = readMerchantVault_();
  var rule = merchantRuleForHash_(vault, merchantHash);
  var category = rule && rule.category ? rule.category : shortcutFallbackCategory_(merchant);
  var fixed = category === '고정비';
  var item = {
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
    merchantCategoryAmbiguous: !!(rule && rule.ambiguous),
    merchantCategoryAuto: category !== '미분류',
    createdAt: new Date().toISOString()
  };
  var key = shortcutTransactionKey_(item);

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var inbox = readShortcutInbox_();
    var existing = inbox.items.filter(function (row) { return shortcutTransactionKey_(row) === key; })[0];
    if (existing) {
      return {
        ok: true,
        status: 'pending',
        merchant: merchant,
        amount: amount,
        category: category,
        id: existing.id
      };
    }

    // The installed Home Screen PWA owns the final duplicate decision because its
    // localStorage is separate from Safari and may differ from the Drive snapshot.
    inbox.items.push(item);
    writeShortcutInbox_(inbox);
    return { ok: true, status: 'queued', merchant: merchant, amount: amount, category: category, id: item.id };
  } finally { lock.releaseLock(); }
}

function getShortcutPending_() {
  var inbox = readShortcutInbox_();
  return (inbox.items || []).slice(0, 200);
}

function ackShortcutPending_(ids) {
  var wanted = {};
  (Array.isArray(ids) ? ids : []).forEach(function (id) { wanted[String(id)] = true; });
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var inbox = readShortcutInbox_();
    var before = inbox.items.length;
    inbox.items = inbox.items.filter(function (item) { return !wanted[String(item.id)]; });
    writeShortcutInbox_(inbox);
    return { removed: before - inbox.items.length, remaining: inbox.items.length };
  } finally { lock.releaseLock(); }
}
