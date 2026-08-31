export const RECORD_SYNC_V2_GENESIS_SEED_PLAN_PATH=(targetV2Epoch,seedId)=>`stagingRecordSyncV2Genesis/danbridge/epochs/${targetV2Epoch}/seeds/${seedId}`;
export const RECORD_SYNC_V2_GENESIS_BATCH_RECEIPT_PATH=(targetV2Epoch,seedId,receiptHash)=>`${RECORD_SYNC_V2_GENESIS_SEED_PLAN_PATH(targetV2Epoch,seedId)}/batchReceipts/${receiptHash}`;
export const RECORD_SYNC_V2_GENESIS_BATCH_RECORD_PATH=(targetV2Epoch,seedId,receiptHash,genesisRecordHash)=>`${RECORD_SYNC_V2_GENESIS_BATCH_RECEIPT_PATH(targetV2Epoch,seedId,receiptHash)}/genesisRecords/${genesisRecordHash}`;
export const RECORD_SYNC_V2_GENESIS_DURABLE_MANIFEST_PATH=(targetV2Epoch,seedId)=>`${RECORD_SYNC_V2_GENESIS_SEED_PLAN_PATH(targetV2Epoch,seedId)}/artifacts/manifest`;
export const RECORD_SYNC_V2_GENESIS_READBACK_RECEIPT_PATH=(targetV2Epoch,seedId)=>`${RECORD_SYNC_V2_GENESIS_SEED_PLAN_PATH(targetV2Epoch,seedId)}/artifacts/readback`;
