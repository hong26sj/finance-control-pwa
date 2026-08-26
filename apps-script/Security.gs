function sha256Hex_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map(function (byte) { var n = byte < 0 ? byte + 256 : byte; return ('0' + n.toString(16)).slice(-2); })
    .join('');
}

function requireToken_(token) {
  var expected = PropertiesService.getScriptProperties().getProperty('ACCESS_TOKEN_HASH');
  if (!expected || !token || sha256Hex_(String(token)) !== expected) throw new Error('UNAUTHORIZED');
}
