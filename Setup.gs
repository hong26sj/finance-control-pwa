/**
 * 최초 1회 실행용입니다.
 * 프로젝트 설정 > 스크립트 속성에 SETUP_ACCESS_TOKEN을 등록한 뒤 setupFlow()를 실행합니다.
 * FINANCE_FOLDER_ID는 선택 사항이며 비워두면 내 드라이브 최상위에 저장됩니다.
 * 실행이 끝나면 평문 토큰 속성은 자동 삭제되고 SHA-256 해시만 남습니다.
 */
function setupFlow() {
  var properties = PropertiesService.getScriptProperties();
  var accessToken = properties.getProperty('SETUP_ACCESS_TOKEN') || '';
  var appPassword = properties.getProperty('SETUP_APP_PASSWORD') || '';
  var folderId = properties.getProperty('FINANCE_FOLDER_ID') || '';
  var result = setupFinanceStorage(folderId, accessToken);
  if (appPassword) setFinancePassword_(appPassword);
  properties.deleteProperty('SETUP_ACCESS_TOKEN');
  properties.deleteProperty('SETUP_APP_PASSWORD');
  return result;
}

/** NEW_ACCESS_TOKEN 속성을 등록한 뒤 실행하면 기존 기기 토큰을 교체합니다. */
function resetFlowToken() {
  var properties = PropertiesService.getScriptProperties();
  var accessToken = properties.getProperty('NEW_ACCESS_TOKEN') || '';
  var result = resetFinanceAccessToken(accessToken);
  properties.deleteProperty('NEW_ACCESS_TOKEN');
  return result;
}

/** SETUP_APP_PASSWORD에 숫자 6~12자리를 등록한 뒤 한 번 실행합니다. */
function configureFlowPassword() {
  var properties = PropertiesService.getScriptProperties();
  var password = properties.getProperty('SETUP_APP_PASSWORD') || '';
  var result = setFinancePassword_(password);
  properties.deleteProperty('SETUP_APP_PASSWORD');
  revokeAllAuthTokens();
  return result;
}

/** 새 PIN 인증을 확인한 뒤 실행하면 이전 20자 토큰 인증을 중단합니다. */
function disableLegacyFlowToken() {
  PropertiesService.getScriptProperties().deleteProperty('ACCESS_TOKEN_HASH');
  return { ok: true };
}
