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
    if (body.action === 'snapshot.get') return json_({ ok: true, snapshot: readSnapshot_() });
    throw new Error('UNKNOWN_ACTION');
  } catch (error) { return json_({ ok: false, error: String(error.message || error) }); }
}
