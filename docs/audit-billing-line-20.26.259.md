# 新增功能計費與 LINE 驗收 — 20.26.259

日期：2026-09-08。結論：**未通過完整驗收；擴大測試後共有 6 類已重現的問題，尚未修正。**

後續更新：以上是已發布 20.26.259 的修正前狀態。使用者要求修正後，已在本機進行修正及重測；尚未發布，不改寫本報告的失敗證據。後續狀態見 [本機修正驗證紀錄](verification-billing-line-fixes-2026-09-08.md)。

## 範圍與安全界線

核對新增團班名單、家教／團班工作區、每位孩子收費、家長合併帳單、歸屬校區、兼職教師成本、月份切換及 LINE 預覽／修改／複製。使用本機隔離資料與瀏覽器實際點擊；認證、雲端儲存隔離，不新增、刪除或修改正式課表、學生、收款資料，沒有發送 LINE 訊息。本次僅新增測試與本報告，沒有修改應用程式執行碼、部署或推送 Git。

已讀回 production 的 index.html、business-logic.js、v18-information-architecture.js、v18-convenience-suite.js；HTTP 200，內容雜湊與本機相同。因此下列問題存在於已發布的對應程式碼，不只是未發布的草稿。

## 未通過項目

### 1. 不同收款來源合併時，未收金額錯誤（高）

- 測試應收 11,400：安親 9,000、家教 1,200、團班 1,200。
- 不同家庭分別已有安親收款紀錄 9,000，以及課程標示已繳的家教 1,200。
- 正確未收應為 **1,200**；實際為 **2,400**。
- `js/modules/business/business-logic.js:87` 的 `studentUnpaidTuitionRevenue` 對兩種已收來源取最大值，沒有依家庭／課程對帳。`js/app/v18-information-architecture.js:150` 的收款摘要亦採二選一來源。
- 修正需要依實際資料身分合併並排除重複，不能直接相加，否則同一筆在兩處標記時會雙扣。
- 覆蓋缺口：舊 `tests/billing-line-preview.test.mjs:169` 竟把 2,400 當預期值；舊測試通過不能作為此計算正確的證明。本次新增獨立的正確預期回歸測試，保留失敗結果。

### 2. LINE 複製失敗仍記錄已通知（高）

- 在真實瀏覽器中模擬 Clipboard API 拒絕、備援 `execCommand('copy')` 回傳 false，點擊預覽「確認複製」。
- 預期：顯示失敗、保留預覽、不建立已通知紀錄。
- 實際：仍寫入 `notifiedAt` 並關閉預覽。
- `js/modules/business/business-logic.js:146` 忽略備援複製回傳值，仍呼叫成功回呼；`js/app/v18-information-architecture.js:65` 發出複製成功事件；`js/app/v18-convenience-suite.js:80` 處理已通知標記。
- 即使複製成功也不等於 LINE 已實際送達；本次沒有發送或驗證收件者端送達。

### 3. 跨校區收款會讓本校區待辦消失（高）

- 同一家庭當月河西、美術各應收 600；僅河西已收，美術未收。
- 切換美術校區，「家庭尚未收款」預期 **1**，實際 **0**，尚未通知計數也被另一校區紀錄影響。
- `js/app/v18-convenience-suite.js:82` 的 `renderMonthTasks` 只依月份、familyKey 尋找收款紀錄，沒有相符的校區條件。

### 4. 月底一次檢查仍把團班當成單一孩子（中）

- 團班兩位孩子，鐘點費 600／800，上課 1.5 小時：營收 **2,100**、整班教師費 **750**，兩者實際計算正確。
- 點擊「月底一次檢查」，卻誤報團班單價未設定、缺少家長姓名，以及「財務 2,100／學生應收 0」。
- `js/app/v18-information-architecture.js:48` 驗證團班容器的費率，`:50` 從 lesson.studentId 蒐集帳單對象，沒有展開團班孩子。這是檢查工具誤報，不是這個案例的實際 2,100 帳單算錯。

以上首輪 4 個問題皆在 **Chromium 與 WebKit** 重現，共 8 個失敗回歸案例。

### 5. 標記收款與 LINE 通知存檔中斷（高）

- 真實點击收款頁：勾選王家長孩子、選「轉帳」、按「標記已收款」。
- 預期一筆家庭紀錄：兩位孩子 a／c、金額 1,500、狀態 collected、收款方式轉帳，完成一次儲存。
- 實際建立了預設紀錄，但金額仍 0、狀態 pending、收款方式空白、儲存呼叫 **0 次**。
- Chromium 報錯 `Cannot read properties of undefined (reading 'ids')`；WebKit 同樣在該路徑拋錯。
- `js/app/v18-convenience-suite.js:9` 的 `familyAmount` 使用 `const {info}=familyInfo(studentId)`，但 `familyInfo` 直接回傳 `{family,ids,key}`，沒有 info 這層，存取 info.ids 時中斷。
- 同一問題也影響 LINE 成功複製後的記錄：文字已正確複製、時間戳與狀態在記憶體變更，但金額仍 0，沒有呼叫儲存。**文字複製成功與通知紀錄成功是兩項獨立驗收，前者通過不能證明後者。**
- 本次使用替代 saveDB 計數器記錄是否抵達儲存呼叫，沒有執行正式雲端寫入。

### 6. 全部校區與單校區付款紀錄重疊，會扣到別的家庭（高）

- 應收總額 2,700；王家長 1,500、李家長 1,200。
- 王家長同一付款分別出現在「全部校區」與「河西」紀錄，各 1,500。
- 正確全校未收仍為李家長的 **1,200**，實際被合計成已收 3,000，再截成未收 **0**。
- `studentUnpaidTuitionRevenue` 沒有依家庭及範圍重疊去重。同一功能若要支援全校區與單校區標記，必須避免兩種紀錄重複沖銷應收。
- 此為隔離紀錄的對帳重現；不是在正式環境建立重複付款。與問題 1 一起說明：收款來源不能一律取最大值，也不能一律相加。

第二輪新增 6 個工作流案例，在 Chromium／WebKit 各執行一次：**6 項通過、6 項失敗**。失敗為問題 5 的兩條流程、問題 6，各跨兩種引擎重現。通過項目為重複團班 ID 去重／阻擋外家庭、跨年課程名單快照、同筆付款同時在課程與家庭紀錄時不雙扣。

## 已通過案例

- 既有相關瀏覽器回歸 **80 項通過**：團班、工作區、學生／教師價格、計費預覽、財務月份與薪資。
- 相關單元測試 **22 項通過**，包含 12 個月份 × 6 種時長 × 5 種團班人數的 360 組計算矩陣。但其中上述收款舊測試預期有誤，不能把 22 項通過解讀成整體計費完全正確。
- 新增整合驗收：30 堂各 1.5 小時團班，每堂 3 位孩子（600／800／400）；另有 0.5 小時家教 600、一位安親月費 9,000。
  - 9 月公司營收 **90,300**；兼職教師薪資 **22,750**。
  - 王家長三位孩子合併 **54,300**；李家長 **36,000**。同名孩子不混入另一家庭。
  - 上課校區與歸屬校區不同，營收全部按歸屬校區；團班容器不另外收費。
  - 課程保存的學生名單與現在團班名單不同，帳單仍按該課程名單計算。
  - 實際點開 LINE 預覽、編輯備註、按確認複製，再讀回真實瀏覽器剪貼簿，內容完全相等，沒有改變原本帳單數字。
  - 切到 10 月，王家長 **11,000**、李家長 **1,600**，不混入 9 月日期、金額或上次編輯備註。
- 上述新整合驗收 **5 項通過、3 項跳過**：5 種 Chromium 視窗／裝置設定通過；WebKit 3 種設定因真實剪貼簿權限能力不適用而跳過。這是本機裝置模擬，不是 Windows／iOS／Android 實機驗收。
- 教師單元案例涵蓋按月工作天數、底薪、超時、不足時數、請假比例與避免重複扣款；沒有據此聲稱所有正式教師歷史資料都已逐筆人工核帳。

## 重現與證據

```sh
node --test tests/billing-line-preview.test.mjs tests/teacher-payroll-monthly-leave.test.mjs tests/group-roster-projection.test.mjs
npx playwright test tests/e2e/billing-clipboard-audit.spec.js --workers=1
npx playwright test tests/e2e/billing-group-audit.spec.js --project=desktop-chromium --project=desktop-webkit
```

- 新測試：`tests/e2e/billing-group-audit.spec.js`（4 個正確預期，目前均失敗）。
- 新測試：`tests/e2e/billing-clipboard-audit.spec.js`（正向整合與實際剪貼簿）。
- 計算單元紀錄：`/tmp/danbridge259-billing-unit-audit.log`。
- 既有 80 項回歸紀錄：`/tmp/danbridge259-billing-regression.log`。該次另有新整合測試的選取器錯誤；修正測試選取器與正常開啟頁面流程後，獨立重跑通過如下。
- 最終剪貼簿紀錄：`/tmp/danbridge259-clipboard-audit-all.log`。
- 最終錯誤重現紀錄：`/tmp/danbridge259-billing-audit-confirm.log`。
- 第二輪工作流紀錄：`/tmp/danbridge259-billing-workflow-audit.log`；測試檔 `tests/e2e/billing-workflow-audit.spec.js`；截圖與 trace 位於 `/tmp/danbridge-billing-workflow-audit-259/`。
- 8 個失敗案例的截圖與 trace：`/tmp/danbridge-billing-audit-evidence-259/`。暫存證據可能由系統清理，回歸測試留在專案內可重跑。

## 驗收判定

基本應收公式、已列出的家庭 LINE 文字預覽及複製通過，但收款存檔、通知存檔、未收款統計、跨校區待辦、複製失敗處理、團班月底檢查未通過。**修正並重測前，不應宣布全部完成，也不應只依「未收／已通知／月底一次檢查」作最終結帳依據。** 本次沒有完成正式資料全量逐筆核帳、LINE 訊息送達或全世界裝置／網路狀態驗證。部分付款的使用者介面沒有金額輸入欄，本次沒有把它視為已支援且驗收通過的功能。
