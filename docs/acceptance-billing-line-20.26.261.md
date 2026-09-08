# 20.26.261 計費、LINE 與收款一致性正式發布驗收

日期：2026-09-08（Asia/Taipei）。20.26.260 僅用於 staging；正式發布版本為 20.26.261。

## 修正範圍

- 承接 20.26.258 團班搜尋、20.26.259 家教／團班分頁，以及 20.26.260 逐項收款與 LINE 存檔修正。
- 家教、團班依課表時間及每位孩子費率；團班容器不重複收費，兼職整班老師成本一次計算。安親按月費一次。
- 收款保存月份、孩子、課程及營收歸屬校區快照；同筆費用的課程付款、全校區／單校區紀錄不重複沖銷其他家庭。
- 缺少分配明細的歷史部分收款保留原資料，顯示需核對，不臆測付款分配。
- LINE 預覽可編輯，稱謂綁 CRM 家長姓名；剪貼簿失敗不假報成功，成功後通知紀錄可存檔。
- 真實 staging 驗收另發現家庭列只查本校區紀錄、提醒只查課程未繳旗標；已修正家庭列、總覽及通知中心採同一份對帳結果。部分付款明確顯示「部分已收款」。

## 完整回歸

- 最終 `npm test`：1,040 通過、7 跳過、0 失敗；紀錄 `/tmp/danbridge-billing-261-unit.log`。
- 最終完整 Playwright：679 通過、17 跳過、0 失敗，共 696 案例；紀錄 `/tmp/danbridge-billing-261-browser.log`。
- 八配置涵蓋 Chromium／WebKit、桌機、iPad、手機、Windows／Android 模擬，非八台實體設備。
- 覆蓋同名學生／不同家長、手足家庭、30 堂團班、跨月／跨年、跨校區營收、名單快照、重複名單 ID、付款重疊、歷史部分付款、老師月薪／兼職費率及請假工時。
- WebKit 真實剪貼簿等條件不適用案例列跳過，未算通過。

## 真實 staging 操作與雲端回讀

使用 Daniel 既有登入；沒有新增學生，僅使用既有清楚命名的 staging 團班驗收學生。

1. 透過新增課程表單建立 2026-09-08 16:00–17:30 的一次性測試團班，兩位孩子費率 600／800；上課美術、營收歸屬河西。
2. 王家長帳單為 1.5 × 600 = 900；李家長為 1.5 × 800 = 1,200；總應收 2,100。日期、時數、天數及堂數均在 LINE 預覽出現。
3. 實際修改預覽、確認複製，再以 Command+V 貼回預覽，讀回文字與修改內容一致；未發送 LINE 訊息。
4. 直接從 Firestore 權威紀錄讀回，王家長通知紀錄為 900／notified，李家長仍 pending／0，沒有串家長。
5. 勾選兩位家長、標記已收款；直接 Firestore 讀回兩筆 collected 紀錄，共 2,100，`billingItemsVersion: 1`，各自學生 ID、課程 ID、金額及 hexi 校區正確。
6. 切河西：應收／已收均 2,100，未收 0，兩列顯示已收款。切美術：應收／已收／未收均 0。切十月不帶入九月收款。
7. 20.26.261 重做課程新增與收款；總覽無錯誤欠款、通知中心不再提醒已收款家庭。
8. 另開全新 staging 頁面，完成 Firebase 登入資料載入後再進收款頁，仍顯示兩位家長已收款及 2,100／2,100／0，不只依賴原頁本機狀態。

### 清理

- 260 測試課 `lsn_32c73f00-448b-4641-8413-b3adaaf38da9` 已經既有復原流程刪除，雲端 `deleted: true`。
- 261 測試課 `lsn_6def0c37-be53-4674-ac26-381d7297d694` 同樣刪除，雲端 `deleted: true`。
- 兩筆九月 staging 驗收收款已復原刪除，雲端 `deleted: true`（revision 6／7）。
- 刪除標記及追加稽核紀錄保留，避免破壞同步鏈；不會以有效學生／課程／收款列留在操作清單。未刪除既有 staging 學生。

## 發布與邊界

- staging Hosting 及 `stagingV2AuthoritySave`、`stagingSchedulerOperation` 部署成功。
- staging 全部 339 個 Hosting 檔案遠端 SHA-256 與本機一致：`/tmp/danbridge261-staging-hosting-hashes.json`。
- production `productionSchedulerOperation`、`productionPublishRoleViews` 部署成功且讀回 ACTIVE，revision 分別為 `productionscheduleroperation-00005-zuv`、`productionpublishroleviews-00008-biq`，原有服務帳號保持不變。未更新其他 Functions、IAM 或 Rules。
- production Hosting 使用既有 `firebase.production.json` 部署成功；正式網址 `https://danbridge-d8877.web.app/`。
- 正式權威安全狀態讀回 `state: active`、`writeAllowed: true`。本次測試沒有新增、修改或刪除正式學生、課表或收款；部署會改程式碼，不會遷移正式資料。
- production 全部 339 個 Hosting 檔案遠端 SHA-256 與本機一致，無不一致檔案：`/tmp/danbridge261-production-hosting-hashes.json`。
- 另開正式頁面讀回 Daniel 老闆角色與 `v18-convenience-suite.js?v=20.26.261`；實際開啟財務中心、學生收款，八月 94 列切至九月 71 列，頁面沒有 NaN／Infinity。此次為唯讀冒煙檢查，未更動正式付款狀態。操作工具有兩次回覆逾時，均先讀回 DOM 確認動作已完成，沒有重複送出資料操作；不將其當作效能達標證據。
- 本報告隨 20.26.261 發布提交保存於 GitHub main；提交雜湊及遠端 HEAD 一致性由發布回覆記錄。

此證據涵蓋上述實際執行條件，不代表未知輸入／所有網路狀況零錯誤；LINE 複製成功也不等同家長端收到訊息。
