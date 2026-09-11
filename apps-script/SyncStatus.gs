var FLOW_SYNC_VERSION_KEY_ = 'FLOW_SYNC_VERSION_V1';
var FLOW_SYNC_UPDATED_KEY_ = 'FLOW_SYNC_UPDATED_AT_V1';

function rememberSyncStatus_(version, updatedAt) {
  var v = Number(version || 0);
  if (!v) return { version: 0, updated_at: '' };
  var updated = String(updatedAt || new Date().toISOString());
  PropertiesService.getScriptProperties().setProperties({
    FLOW_SYNC_VERSION_V1: String(v),
    FLOW_SYNC_UPDATED_AT_V1: updated
  }, false);
  return { version: v, updated_at: updated };
}

function rememberSyncResult_(result) {
  result = result || {};
  return rememberSyncStatus_(result.version, result.updatedAt || result.updated_at);
}

function refreshSyncStatusFromDrive_() {
  var snapshot = readSnapshot_();
  return rememberSyncStatus_(snapshot.version, snapshot.updatedAt);
}

function getSyncStatus_() {
  var properties = PropertiesService.getScriptProperties();
  var version = Number(properties.getProperty(FLOW_SYNC_VERSION_KEY_) || 0);
  var updated = String(properties.getProperty(FLOW_SYNC_UPDATED_KEY_) || '');
  if (!version) return refreshSyncStatusFromDrive_();
  return { version: version, updated_at: updated };
}
