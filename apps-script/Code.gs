function json_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return json_({ ok: true, service: 'Flow Finance API', authenticationRequired: true });
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action === 'login') return json_(login_(body.password));
    var auth = authorizeRequest_(body.auth_token, body.token);
    if (!auth.ok) return json_(auth);
    if (body.action === 'auth.check') return json_({ ok: true, expires_at: auth.expires_at || null });
    if (body.action === 'snapshot.save') return json_({ ok: true, snapshot: saveSnapshot_(body.snapshot || defaultSnapshot_()) });
    if (body.action === 'snapshot.get') return json_({ ok: true, snapshot: readSnapshotForClient_() });
    if (body.action === 'merchant.resolve') return json_({ ok: true, items: resolveMerchantRules_(body.merchants || []) });
    if (body.action === 'merchant.rule.save') {
      var saved = saveMerchantRule_(body.transactionId, body.rawMerchant, body.merchantHash, body.category);
      return json_({ ok: true, merchantHash: saved.merchantHash, rule: saved.rule });
    }
    if (body.action === 'transaction.merchant.saveMany') return json_({ ok: true, result: saveTransactionMerchants_(body.items || []) });
    if (body.action === 'transaction.merchant.get') return json_({ ok: true, merchant: getTransactionMerchant_(body.transactionId) });
    if (body.action === 'transaction.merchant.delete') return json_({ ok: true, result: deleteTransactionMerchant_(body.transactionId) });
    throw new Error('UNKNOWN_ACTION');
  } catch (error) { return json_({ ok: false, error: String(error.message || error) }); }
}
