# Danbridge 最小錯誤監控

## 收集範圍

錯誤事件儲存在 `companies/danbridge/errorEvents`，涵蓋：

- 瀏覽器未捕捉錯誤與 Promise rejection。
- Owner 主資料雲端寫入失敗。
- 老師／校區檢視發布失敗。
- Owner、老師與校區管理者的主要 Firestore 讀取失敗。

## 隱私限制

事件只包含版本、環境、類型、功能區域、標準化錯誤代碼、角色、是否可重試及伺服器時間。禁止寫入錯誤訊息、stack、Email、UID、姓名、學生、老師、課程或其他業務資料。

Firestore Rules 只允許有效登入成員新增符合固定 schema 的事件；一般成員無法讀取、修改或刪除事件，只有 Owner 可以集中查詢與清理。

## 流量保護

- 相同類型、區域、代碼與角色在 60 秒內只記錄一次。
- 每次瀏覽器工作階段最多寫入 20 筆。
- 監控寫入失敗會靜默停止，不影響原操作，也不會遞迴產生新事件。

## 查詢方式

Owner 可在 Firebase Console 的 Firestore Data 頁面查詢 `companies/danbridge/errorEvents`，依 `occurredAt`、`release`、`environment`、`category` 或 `area` 判讀問題範圍。錯誤事件不作為業務資料，應定期刪除；目前建議保留 30 天。
