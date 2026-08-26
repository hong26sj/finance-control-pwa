var AUTH_TOKEN_TTL_SECONDS_ = 180 * 24 * 60 * 60;
var LOGIN_MAX_FAILURES_ = 5;
var LOGIN_LOCK_SECONDS_ = 10 * 60;

function bytesToHex_(bytes) {
  return bytes.map(function (byte) { var n = byte < 0 ? byte + 256 : byte; return ('0' + n.toString(16)).slice(-2); }).join('');
}

function sha256Hex_(value) {
  return bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8));
}

function merchantHmacSecret_() {
  var properties = PropertiesService.getScriptProperties();
  var secret = properties.getProperty('MERCHANT_HMAC_SECRET');
  if (!secret) {
    secret = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + '|' + Date.now() + '|' + Math.random())).replace(/=+$/g, '');
    properties.setProperty('MERCHANT_HMAC_SECRET', secret);
  }
  return secret;
}

function normalizeMerchantForFingerprint_(value) {
  return String(value || '').toLowerCase().replace(/[\s\-_()]/g, '');
}

function merchantFingerprint_(merchant) {
  var normalized = normalizeMerchantForFingerprint_(merchant);
  if (!normalized) throw new Error('MERCHANT_REQUIRED');
  return bytesToHex_(Utilities.computeHmacSha256Signature(normalized, merchantHmacSecret_(), Utilities.Charset.UTF_8));
}

function login_(password) {
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var properties = PropertiesService.getScriptProperties();
    var expected = properties.getProperty('APP_PASSWORD_HASH') || '';
    if (!expected) return { ok: false, error: 'AUTH_NOT_CONFIGURED', message: 'APP_PASSWORD가 설정되지 않았습니다.' };
    var now = Date.now();
    var lockedUntil = Number(properties.getProperty('AUTH_LOCKED_UNTIL') || 0);
    if (lockedUntil > now) return { ok: false, error: 'LOGIN_LOCKED', message: '로그인 시도가 잠겨 있습니다.', retry_after_seconds: Math.ceil((lockedUntil - now) / 1000) };
    if (!/^\d{6,12}$/.test(String(password || '')) || sha256Hex_(String(password)) !== expected) {
      var failures = Number(properties.getProperty('AUTH_FAILURE_COUNT') || 0) + 1;
      if (failures >= LOGIN_MAX_FAILURES_) {
        properties.setProperties({ AUTH_FAILURE_COUNT: '0', AUTH_LOCKED_UNTIL: String(now + LOGIN_LOCK_SECONDS_ * 1000) }, false);
        return { ok: false, error: 'LOGIN_LOCKED', message: '비밀번호를 5회 잘못 입력하여 10분 동안 로그인이 잠겼습니다.', retry_after_seconds: LOGIN_LOCK_SECONDS_ };
      }
      properties.setProperty('AUTH_FAILURE_COUNT', String(failures));
      return { ok: false, error: 'INVALID_PASSWORD', message: '비밀번호가 올바르지 않습니다.', remaining_attempts: LOGIN_MAX_FAILURES_ - failures };
    }
    properties.deleteProperty('AUTH_FAILURE_COUNT');
    properties.deleteProperty('AUTH_LOCKED_UNTIL');
    var issued = createAuthToken_();
    return { ok: true, auth_token: issued.token, expires_at: new Date(issued.expiresAt).toISOString() };
  } finally { lock.releaseLock(); }
}

function createAuthToken_() {
  var properties = PropertiesService.getScriptProperties();
  var now = Date.now();
  var expiresAt = now + AUTH_TOKEN_TTL_SECONDS_ * 1000;
  var tokenId = Utilities.getUuid().replace(/-/g, '');
  var randomPart = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + '|' + now + '|' + Math.random())).replace(/=+$/g, '');
  var token = tokenId + '.' + randomPart;
  cleanupExpiredTokens_();
  properties.setProperty('AUTH_TOKEN_' + tokenId, JSON.stringify({ hash: sha256Hex_(token), expires_at: expiresAt }));
  return { token: token, expiresAt: expiresAt };
}

function verifyAuthToken_(token) {
  var raw = String(token || '').trim();
  if (!raw || raw.indexOf('.') < 1) return { ok: false, error: 'UNAUTHORIZED', message: '인증이 필요합니다.' };
  var tokenId = raw.split('.')[0];
  if (!/^[a-fA-F0-9]{32}$/.test(tokenId)) return { ok: false, error: 'UNAUTHORIZED', message: '인증 토큰 형식이 올바르지 않습니다.' };
  var properties = PropertiesService.getScriptProperties();
  var key = 'AUTH_TOKEN_' + tokenId;
  var storedRaw = properties.getProperty(key);
  if (!storedRaw) return { ok: false, error: 'UNAUTHORIZED', message: '유효하지 않은 인증 토큰입니다.' };
  try {
    var stored = JSON.parse(storedRaw);
    if (!stored.expires_at || Number(stored.expires_at) <= Date.now()) { properties.deleteProperty(key); return { ok: false, error: 'UNAUTHORIZED', message: '인증 토큰이 만료되었습니다.' }; }
    if (sha256Hex_(raw) !== String(stored.hash || '')) return { ok: false, error: 'UNAUTHORIZED', message: '유효하지 않은 인증 토큰입니다.' };
    return { ok: true, expires_at: new Date(Number(stored.expires_at)).toISOString() };
  } catch (_) { properties.deleteProperty(key); return { ok: false, error: 'UNAUTHORIZED', message: '손상된 인증 토큰입니다.' }; }
}

function authorizeRequest_(authToken, legacyToken) {
  var session = verifyAuthToken_(authToken);
  if (session.ok) return session;
  var expectedLegacy = PropertiesService.getScriptProperties().getProperty('ACCESS_TOKEN_HASH');
  if (expectedLegacy && legacyToken && sha256Hex_(String(legacyToken)) === expectedLegacy) return { ok: true, legacy: true };
  return session;
}

function cleanupExpiredTokens_() {
  var properties = PropertiesService.getScriptProperties();
  var all = properties.getProperties();
  Object.keys(all).forEach(function (key) {
    if (key.indexOf('AUTH_TOKEN_') !== 0) return;
    try { if (Number(JSON.parse(all[key]).expires_at || 0) <= Date.now()) properties.deleteProperty(key); }
    catch (_) { properties.deleteProperty(key); }
  });
}

function setFinancePassword_(password) {
  if (!/^\d{6,12}$/.test(String(password || ''))) throw new Error('숫자 6~12자리 비밀번호를 사용하세요.');
  PropertiesService.getScriptProperties().setProperty('APP_PASSWORD_HASH', sha256Hex_(String(password)));
  return { ok: true };
}

function revokeAllAuthTokens() {
  var properties = PropertiesService.getScriptProperties();
  var all = properties.getProperties();
  Object.keys(all).forEach(function (key) { if (key.indexOf('AUTH_TOKEN_') === 0) properties.deleteProperty(key); });
  return { ok: true };
}
