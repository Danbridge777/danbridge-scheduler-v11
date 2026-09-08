# 20.26.257 發布驗收紀錄

日期：2026-09-08。接續 20.26.256 團班與營收歸屬驗收；只列已取得證據的結果，不代表所有網路或裝置情況零風險。

## 計算規則

- 學生收費與兼職老師成本分開保存。家教營收＝課表時數 × 學生鐘點費；兼職純時薪成本＝課表時數 × 該學生的支付老師鐘點費。
- 團班逐孩計營收；老師成本取團班容器的鐘點費，整班每堂付一次，不加總孩子的老師費率。
- 新老師成本留白沿用原老師時薪，填 0 明確表示不支付。正職／底薪制及營隊既有算法不受新欄位覆蓋。
- 營收歸屬與實際上課校區分開；缺少歸屬列未歸屬，不推測或修改正式資料。老師授課時數仍按上課校區。
- 老師／排課專員投影不包含學生收費、兼職老師成本或家長私密欄位。團班名單使用學生 ID，避免同名混帳。

## 已通過的發布前檢查

- `npm test`：1,035 通過、7 跳過、0 失敗；其他 audit 檢查成功。
- `npx playwright test`：522 通過、14 跳過、0 失敗。包含 8 組瀏覽器／尺寸配置，不宣稱為 8 台實機。
- 14 項跳過為限定專案案例在其他配置不重跑：年度 30,000 堂匯出、iPad 安裝引導。
- 兼職新功能 8 組瀏覽器均實際操作表單、儲存、編輯、排課、切月份及檢查財務金額；資料為隔離 fixture，不冒稱真實三角色雲端驗收。
- 跨月計費矩陣涵蓋 12 個月份、6 種時長、5 種人數，共 360 組。
- `npm run test:rules`：隔離 Firestore／Auth Emulator 腳本成功；反向權限測試的 PERMISSION_DENIED 是預期拒絕結果。
- `npm run test:production-transactions`：2 項整合測試通過，包含三裝置競爭新增、拖移、複製、批次刪除、同 ID 復原後權威讀回。初次因 Java 不在 PATH 未啟動，指定既有測試 Java 後重跑成功。
- `python3 tools/validate_project.py`：144 個本機引用、429 個 JavaScript 檔案、362 個 HTML ID 通過。
- staging 20.26.257 已部署；index、sw、團班模組、兼職費率模組、商業計算與校區範圍六份資源 SHA-256 與本機一致。

## 真實 staging 驗證與清理限制

- Daniel Owner 實際表單：測試學生「團班驗收甲254」學生收費 600、老師成本 300；保存後重新載入，兩欄讀回仍為 600／300。
- 測試團班「團班名單驗收254」可獨立保存整班老師鐘點費 600。
- 20.26.256 報告所載的團班 2,100 元、家長 LINE 分帳、河西營收／美術上課核對均為真實 staging UI 操作。
- 測試課已刪除；原有 STAGING_SHADOW_STUDENT 的 263 堂保留。
- 三筆測試名單仍在 staging：團班名單驗收254、團班驗收甲254、團班驗收乙254。原生封存 prompt 未能由瀏覽器工具操作；沒有繞過同步協定直接改資料，也沒有把瞬間尚未載入的清單當作刪除成功。此項清理未完成，不能宣稱已全部清空。
- 沒有在 production 建立、刪除或修改測試課表、學生、帳單或薪資資料。

## 發布狀態

- 正式 Hosting 20.26.257 已成功發布到 https://danbridge-d8877.web.app/ 。
- 本次全部 31 份變動的公開 JS／CSS／index／sw 檔案，正式站 HTTP 200，SHA-256 與已測試本機內容 31／31 相同。
- productionSchedulerOperation：API 讀回 ACTIVE，revision `productionscheduleroperation-00004-caw`，更新時間 2026-09-08T05:07:37Z。
- productionPublishRoleViews：API 讀回 ACTIVE，revision `productionpublishroleviews-00007-vem`，更新時間 2026-09-08T05:07:36Z。
- 未部署 Firestore Rules、未改 IAM、未移轉正式業務資料。Emulator 產生的 pause rules 已恢復原有 runtime 生成檔，Git 差異為零。
- 發布後唯讀查詢正式 Cloud Run／Functions 近 15 分鐘 ERROR：0 筆。
- 健康紀錄（2026-09-07T19:17:07Z）為 attention，原因僅 63 筆未讀通知；紀錄中的 recentErrors、pendingRequests 均為 0。此為既有健康快照，不冒稱每秒即時評估，也未擅自標記通知已讀。
- 正式 Daniel 分頁已重新載入，DOM 引用的團班、兼職費率、雲端模組皆為 20.26.257；實際學生表單顯示新收費欄位及歸屬／上課兩個校區，未提交正式資料變更。
- Git 提交及 main 推送原先被安全審核要求明確授權；使用者已於 2026-09-08 明確允許將 20.26.257 提交並推送至 Danbridge777/danbridge-scheduler-v11 的 main。本報告隨此次發布提交保存，推送成功以遠端 main 提交雜湊讀回核對為準。
