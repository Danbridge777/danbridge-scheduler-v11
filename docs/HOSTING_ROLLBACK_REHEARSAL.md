# Firebase Hosting 回滾演練紀錄

## 結果

- 日期：2026-08-08
- 環境：`danbridge-d8877-staging`
- 正式網站：未切換、未修改
- 結果：通過
- 回滾與恢復時間：均在 5 分鐘內完成

## 版本

- 演練前最新版：commit `f49afbd`，`data-persistence.js?v=20.7.1`
- 上一穩定版：commit `87a11b1`，`data-persistence.js?v=20.5.9`

## 實際步驟與證據

1. 將 staging `live` clone 至臨時 `rollback-current` channel，保存演練前版本。
2. 從 commit `87a11b1` 建立臨時 `rollback-previous` channel。
3. 確認兩個來源分別載入 `20.7.1` 與 `20.5.9`。
4. 將 `rollback-previous` clone 至 staging `live`。
5. 線上確認 staging `live` 已載入 `20.5.9`，證明回滾成功。
6. 將 `rollback-current` clone 回 staging `live`。
7. 線上確認 staging `live` 已恢復 `20.7.1`。
8. 比對恢復後 HTML 與演練前保存版本，SHA-256 完全一致。
9. 刪除兩個臨時 Hosting channel 與本機暫存目錄。

本演練只切換 Hosting 靜態版本，沒有讀寫、清空或還原任何 production／staging Firestore 業務資料。
