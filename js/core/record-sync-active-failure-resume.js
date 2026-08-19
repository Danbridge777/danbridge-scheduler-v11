const storageReadOnly = () => {
  const store = new Map();
  return {getItem: key => store.get(key) || null, setItem: (key, value) => void store.set(key, value), removeItem: key => store.delete(key)};
};

const fallbackStorage = storageReadOnly();
const VALID_RECORD_ID = /^[A-Za-z0-9_.:-]{8,128}$/;
const HAS_INVALID_OPERATION_ID_CHAR = /[\/\x00-\x1f\x7f]/;
const VALID_RECEIPT_KINDS = new Set(['create', 'update', 'tombstone', 'revive']);
const STATE_KEY = 'danbridgeRecordSyncActiveFailureResume';
const PROBE_STATE_KEY = `${STATE_KEY}:probe`;

const clone = value => JSON.parse(JSON.stringify(value || {}));
const isSafeRecordId = value => typeof value === 'string' && VALID_RECORD_ID.test(value);
const isSafeOperationId = value => {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 1500 && !HAS_INVALID_OPERATION_ID_CHAR.test(trimmed);
};
const isSafeReceiptKind = kind => VALID_RECEIPT_KINDS.has(String(kind || ''));

const isSafeRevision = value => Number.isSafeInteger(value) && value >= 0;

const asDiagnostic = ({state = 'idle', pending = 0, sending = 0, failed = 0, quarantined = 0, confirmed = 0, ...rest} = {}) => ({
  state,
  pending: Number(pending) || 0,
  sending: Number(sending) || 0,
  failed: Number(failed) || 0,
  quarantined: Number(quarantined) || 0,
  confirmed: Number(confirmed) || 0,
  ...rest
});

function buildRetryableUnavailableError(payload = {}) {
  const error = new Error('record sync active response lost');
  error.code = 'unavailable';
  error.recordSyncFailureResume = clone(payload);
  return error;
}

function buildFailClosedError(message) {
  const error = new Error(message);
  error.code = 'failed-precondition';
  return error;
}

export function parseRecordSyncActiveFailureResumeRecordId(value) {
  const candidate = String(value || '').trim();
  return isSafeRecordId(candidate) ? candidate : '';
}

export function createRecordSyncActiveFailureResume({
  environment = 'production',
  role = '',
  recordId = '',
  storage = globalThis.sessionStorage ?? fallbackStorage,
  onDiagnostic = () => {}
} = {}) {
  const targetRecordId = parseRecordSyncActiveFailureResumeRecordId(recordId);
  const enabledByConfig = environment === 'staging' && role === 'owner' && Boolean(targetRecordId);
  const sink = typeof onDiagnostic === 'function' ? onDiagnostic : () => {};

  const probeStorage = () => {
    if (!enabledByConfig) return false;
    try {
      storage.setItem(PROBE_STATE_KEY, JSON.stringify({targetRecordId, probeAt: Date.now()}));
      storage.removeItem(PROBE_STATE_KEY);
      return true;
    } catch {
      return false;
    }
  };

  const preflightUsable = probeStorage();
  let stateStorageUsable = preflightUsable;
  const canStoreState = () => stateStorageUsable;
  const getState = () => {
    if (!canStoreState()) return {phase: 'idle', targetRecordId};
    try {
      const raw = storage.getItem(STATE_KEY);
      if (!raw) return {phase: 'idle', targetRecordId};
      const parsed = JSON.parse(raw);
      if (parsed?.targetRecordId !== targetRecordId) return {phase: 'idle', targetRecordId};
      return parsed;
    } catch {
      return {phase: 'idle', targetRecordId};
    }
  };

  const setState = nextState => {
    if (!canStoreState()) return false;
    const payload = {targetRecordId, ...(clone(nextState) || {})};
    if (payload?.phase === 'idle') {
      storage.removeItem(STATE_KEY);
      return true;
    }
    try {
      storage.setItem(STATE_KEY, JSON.stringify(payload));
      return true;
    } catch {
      stateStorageUsable = false;
      return false;
    }
  };

  let lastDiagnostic = asDiagnostic({state: preflightUsable ? 'ready' : 'disabled', targetRecordId});
  const emit = (next = {}) => {
    const currentState = getState();
    lastDiagnostic = asDiagnostic({...currentState, ...next, targetRecordId});
    sink(lastDiagnostic);
    return lastDiagnostic;
  };

  const failClosed = message => {
    const diagnostic = emit({state: 'error', error: String(message || 'fail closed')});
    const error = buildFailClosedError(diagnostic.error);
    error.recordSyncFailureResume = clone(diagnostic);
    throw error;
  };

  const parseOperation = operation => {
    const operationId = operation?.operationId;
    const operationRecordId = operation?.recordId;
    const nextRevision = operation?.nextRevision;
    return {operationId, operationRecordId, nextRevision};
  };

  const requireTargetOperation = operation => {
    const parsed = parseOperation(operation);
    if (!isSafeOperationId(parsed.operationId) || !isSafeRecordId(parsed.operationRecordId)) {
      failClosed('operation identity 不一致');
    }
    if (!isSafeRevision(parsed.nextRevision)) {
      failClosed('operation.nextRevision 不合法');
    }
    return parsed;
  };

  const requireWriteReceipt = (receipt, expectedRevision) => {
    if (!isSafeReceiptKind(receipt?.kind)) {
      failClosed('逐筆回應類型不合法');
    }
    if (receipt?.write !== true) {
      failClosed('逐筆回應缺少寫入結果');
    }
    if (!isSafeRevision(receipt?.revision) || receipt.revision !== expectedRevision) {
      failClosed('逐筆回應 revision 不一致');
    }
  };

  const requireDuplicateReceipt = (receipt, expectedRevision) => {
    if (receipt?.kind !== 'duplicate') {
      failClosed('重試 operation 預期 duplicate');
    }
    if (receipt?.write !== false) {
      failClosed('重試 operation 不能寫入');
    }
    if (!isSafeRevision(receipt?.revision) || receipt.revision !== expectedRevision) {
      failClosed('重試 operation revision 不一致');
    }
  };

  emit({state: preflightUsable ? 'ready' : 'disabled'});

  const wrapSend = async (operation, send) => {
    const isTargetOperation = operation?.recordId === targetRecordId;
    if (!enabledByConfig || !preflightUsable || !isTargetOperation) {
      return send(operation);
    }

    const parsed = requireTargetOperation(operation);

    const state = getState();
    if (state.phase === 'completed') {
      return send(operation);
    }

    if (state.phase === 'awaiting') {
      if (state.operationId !== parsed.operationId) {
        failClosed('operationId 與重試目標不一致');
      }
      if (!isSafeRevision(state.revision) || state.revision !== parsed.nextRevision) {
        failClosed('重試 operation revision 不一致');
      }
      const receipt = await send(operation);
      requireDuplicateReceipt(receipt, parsed.nextRevision);
      const next = {
        phase: 'completed',
        targetRecordId,
        state: 'resumed',
        operationId: parsed.operationId,
        recordId: operation.recordId,
        collection: operation.collection,
        kind: receipt.kind,
        write: receipt.write,
        revision: receipt.revision,
        exactlyOnce: true,
        firstOperationId: state.firstOperationId || parsed.operationId,
        retryOperationId: parsed.operationId,
        firstOperationReceipt: state.firstOperationReceipt,
        retryOperationReceipt: clone(receipt)
      };
      setState(next);
      return emit(next), receipt;
    }

    const receipt = await send(operation);

    if (receipt?.kind === 'duplicate' && receipt.write === false) {
      requireDuplicateReceipt(receipt, parsed.nextRevision);
      const next = {
        phase: 'completed',
        targetRecordId,
        operationId: parsed.operationId,
        recordId: operation.recordId,
        collection: operation.collection,
        kind: receipt.kind,
        write: receipt.write,
        revision: receipt.revision,
        exactlyOnce: true,
        firstOperationId: parsed.operationId,
        retryOperationId: parsed.operationId,
        firstOperationReceipt: clone(receipt),
        retryOperationReceipt: clone(receipt),
        state: 'resumed'
      };
      setState(next);
      return emit(next), receipt;
    }

    requireWriteReceipt(receipt, parsed.nextRevision);
    const next = {
      phase: 'awaiting',
      targetRecordId,
      operationId: parsed.operationId,
      recordId: operation.recordId,
      collection: operation.collection,
      kind: receipt.kind,
      write: receipt.write,
      revision: receipt.revision,
      firstOperationId: parsed.operationId,
      firstOperationReceipt: clone(receipt),
      exactlyOnce: false,
      state: 'intercepted'
    };
    setState(next);
    emit(next);
    throw buildRetryableUnavailableError(next);
  };

  const wrapOnStatus = next => {
    const status = next || {};
    if (!enabledByConfig) return status;
    const state = getState();
    if (status?.counts) {
      const counts = status.counts || {};
      emit({state: state.state || 'waiting', pending: counts.pending, sending: counts.sending, failed: counts.failed, quarantined: counts.quarantined, confirmed: counts.confirmed});
    }
    return status;
  };

  return {
    enabled: preflightUsable && enabledByConfig,
    targetRecordId,
    wrapSend,
    wrapOnStatus,
    getDiagnostic: () => clone(lastDiagnostic)
  };
}
