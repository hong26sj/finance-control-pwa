/**
 * 최초 1회 실행용입니다.
 * 프로젝트 설정 > 스크립트 속성에 SETUP_ACCESS_TOKEN을 등록한 뒤 setupFlow()를 실행합니다.
 * FINANCE_FOLDER_ID가 없으면 내 드라이브에 "Flow Finance" 폴더를 자동 생성/재사용합니다.
 * 실행이 끝나면 평문 토큰 속성은 자동 삭제되고 SHA-256 해시만 남습니다.
 */
function setupFlow() {
  var properties = PropertiesService.getScriptProperties();
  var accessToken = properties.getProperty('SETUP_ACCESS_TOKEN') || '';
  var appPassword = properties.getProperty('SETUP_APP_PASSWORD') || '';
  var folder = ensureFlowFinanceFolder_();
  var result = setupFinanceStorage(folder.getId(), accessToken);
  moveFinanceDataFileToFolder_(result.fileId, folder);
  if (appPassword) setFinancePassword_(appPassword);
  properties.deleteProperty('SETUP_ACCESS_TOKEN');
  properties.deleteProperty('SETUP_APP_PASSWORD');
  result.folderId = folder.getId();
  result.folderName = folder.getName();
  return result;
}

/**
 * 기존 데이터 파일을 별도 "Flow Finance" 폴더로 정리할 때 한 번 실행합니다.
 * 기존 FINANCE_DATA_FILE_ID는 유지되므로 앱 데이터 연결은 바뀌지 않습니다.
 */
function organizeFinanceStorage() {
  var properties = PropertiesService.getScriptProperties();
  var fileId = properties.getProperty('FINANCE_DATA_FILE_ID') || '';
  if (!fileId) throw new Error('FINANCE_DATA_FILE_ID가 없습니다. 먼저 저장소를 초기화하세요.');
  var folder = ensureFlowFinanceFolder_();
  var file = moveFinanceDataFileToFolder_(fileId, folder);
  merchantHmacSecret_();
  return {
    ok: true,
    folderId: folder.getId(),
    folderName: folder.getName(),
    fileId: file.getId(),
    fileName: file.getName()
  };
}

function ensureFlowFinanceFolder_() {
  var properties = PropertiesService.getScriptProperties();
  var folderId = properties.getProperty('FINANCE_FOLDER_ID') || '';
  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (_) {
      properties.deleteProperty('FINANCE_FOLDER_ID');
    }
  }

  var root = DriveApp.getRootFolder();
  var folders = root.getFoldersByName('Flow Finance');
  var folder = folders.hasNext() ? folders.next() : root.createFolder('Flow Finance');
  properties.setProperty('FINANCE_FOLDER_ID', folder.getId());
  return folder;
}

function moveFinanceDataFileToFolder_(fileId, folder) {
  var file = DriveApp.getFileById(fileId);
  file.moveTo(folder);
  return file;
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
