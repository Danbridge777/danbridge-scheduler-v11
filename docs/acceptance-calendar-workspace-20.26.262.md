# 20.26.262 課表介面整理與權限核對

日期：2026-09-09。基準提交：`a898fec75cd9f7fb172c7d1ccca5c4e55db108e6`。

## 發布範圍

- 日期導覽、新增、常用工具分區，篩選與搜尋可展開；收起後仍顯示已選條件。
- 同類控制項維持 48px 高、按鈕 14px 字級；窄畫面分行，不壓縮到重疊。
- 保留原按鈕 ID、事件、權限判斷、課程／學生 ID、計費及同步協定。重複的標題新增入口隱藏，工具列新增入口保留。
- 總覽移除 AI 標記及「依目前資料自動整理」，「智慧提醒」改為「待辦事項」。實際課程衝突、待回報、權限、同步及錯誤提醒保留。
- 全部啟用資源發布指紋更新為 20.26.262，Service Worker 快取世代為 301。
- 僅准許發布 Hosting；本版不部署 Functions、Rules 或 IAM，不寫入正式課程、學生、費用、薪資或通知已讀狀態。

## 四帳號核對

正式 `companyAccess` 只讀欄位核對：Catherine 為有效 Owner；Lucas 為有效、唯讀的 branch_manager，branchIds 僅 `art_museum`（美術東四路）；AA 為有效 teacher 且 canManageSchedule 為 true；Daniel 主帳號由現行 Owner 規則識別。沒有改動角色。

正式 Rules 原文 SHA-256：`55011bf1e21b39e46f55132050e836be029924def291454f1217fec8713b4df0`。以原文在本機 Firestore Emulator 執行四帳號資料邊界、未授權讀取／提權及 AA 排課權撤銷測試：4 通過、0 失敗、0 跳過。測試使用隔離身份，非真人帳號登入或正式資料寫入。

- Daniel／Catherine：完整授權資料。
- Lucas：自身美術東四路檢視；其他校區與完整原始資料拒絕。
- AA：排課所需最小資料；不傳送家長、付款、營收、薪資與鐘點費資料；不准自行提權。

## 40 筆實驗：未達標、不發布

曾以三個獨立 runtime、本機原生 Firestore 交易、3,000 堂既有合成課程執行十輪。每輪新增、移動、複製、刪除原件與刪除複本，每批 40 堂，共 150 次命令、6,000 次課程變更。每階段回讀 16 集合雜湊及限定老師檢視；150 次命令完成、無殘留活動測試課、3,000 堂基準資料完整。

但最慢 3,901ms、P95 3,043ms，45/150 次超過 2,000ms，故效能門檻失敗。這是本機 Emulator 後端時間，不是 production 網路或三台真人瀏覽器完成顯示的時間。40 筆實驗改動已撤回，本版保留原有每請求 30 筆限制。不得把資料正確稱為秒數達標，也不宣稱固定 120Hz 或任何網路下兩秒同步。

實驗補丁保留在 `/private/tmp/danbridge40-batch-experiment.patch`，不屬於 Hosting 內容；記錄 `/tmp/danbridge40-capacity.log`。

## 驗證方式與發現

隔離瀏覽器實際操作篩選、搜尋、展開／收合、新增視窗、框選及第一次複製快捷鍵；檢查每個可見控制項邊界、高度、文字溢出及兩兩重疊。覆蓋 Chromium／WebKit 桌面、iPad、手機，以及 Windows／Android 配置；另檢查 320–1920px 與長搜尋文字。作業系統配置屬模擬，不能代稱每一台實機都已測過。

中途檢查發現日期欄舊 CSS 為 46px，已用範圍化樣式修為 48px；按鈕字級、重複新增入口也已核對。Android 框選自動化原先將手勢落在固定底部導覽列，改為將課程捲到畫面中央，並先斷言命中課表區再執行手勢；未放寬複製結果斷言。

完整瀏覽器回歸：721 通過、23 不適用跳過、0 失敗。完整回歸執行期間仍追加了介面細節修正，因此另以最後原始碼重跑整組介面測試：34 通過、6 不適用跳過、0 失敗；包括四角色、兩種搜尋快捷鍵、控制項 48px 高／14px 字級與 320–1920px 邊界。

最後一輪特別抓到手機搜尋欄仍受舊 16px 樣式覆蓋；已修成 14px 並重測通過。篩選收合後的 Cmd/Ctrl+K 會先展開再聚焦，不犧牲原搜尋快捷鍵。另以實際 staging 的 Daniel 工作階段操作課表與 Cmd+K，確認畫面及搜尋焦點；僅操作導覽與篩選，沒有新增或刪除雲端課程。

staging 最終 Hosting 發布完成；340/340 個發布檔案逐一比對本機 SHA-256 一致、0 不一致。

### 正式發布回讀

- production Hosting 已完成發布 20.26.262；340/340 個檔案 SHA-256 與本機一致、0 不一致。
- 發布前後 9 個後端 Functions 的版本、更新時間及來源完全相同；本次沒有部署後端。
- 正式 safety 文件發布前後完全相同：revision 634、recordRevision 633、documentCount 2,712、activeCount 2,171、tombstoneCount 541，recordDataHash 未改變；readAllowed／writeAllowed 皆為 true、state 為 active。這是同步資料安全狀態，不等同所有系統健康指標皆無警示。
- 沒有修改 production 課程／學生／薪資／計費資料；沒有執行資料清空、還原或通知已讀操作。
- 在獨立 production 20.26.262 分頁，以既有 Daniel 登入實際打開課表、收合／展開篩選、按 Cmd+K 聚焦搜尋、回總覽核對「待辦事項」及 AI 文案移除。已目視正式課表工具列截圖；不改動既有篩選值、不操作課程資料、不強制重載使用者原本的工作分頁。

發布證據：`/tmp/danbridge262-production-deploy.log`、`/tmp/danbridge262-production-hashes.json`、`/tmp/danbridge262-functions-before.json`、`/tmp/danbridge262-functions-after.json`、`/tmp/danbridge262-safety-before.json`、`/tmp/danbridge262-safety-after.json`。

### 已完成的獨立量測

- `npm test`：1,046 通過、7 跳過、0 失敗，含既有計費／薪資／同步回歸。正式 Rules 四帳號測試另行執行，不混入上述數字。
- Chromium 與 WebKit，3,000 堂歷史合成資料加 40 堂當週課程，六次實際「全選目前畫面 → 批次調整 → 預覽 → 確認套用」：12 次 UI 操作資料順序正確，3,040 個 ID 保持唯一，付款狀態不變。
- 上述 UI 測試刻意隔離傳輸；按鈕操作完成約 102–125ms，並不等於雲端完成。Chromium 畫面 P95 33.3ms、最長 149.9ms；WebKit P95 35ms、最長 67ms，因此**沒有證據可宣稱持續 120Hz**。此數據來自獨立、單 worker 執行，不採用完整回歸併發時的效能數字。
- 320–1920px 長文字測試先抓到最窄畫面的「今天」擠壓，以及 768px Apple 行事曆按鈕文字溢出；修正為極窄畫面獨立導覽列與長工具文字可換行後，兩個瀏覽器引擎均通過。

日誌：`/tmp/danbridge262-unit-verified.log`、`/tmp/danbridge262-role-rules.log`、`/tmp/danbridge262-forty-render.log`、`/tmp/danbridge262-widths-fixed.log`、`/tmp/danbridge262-final-e2e.log`、`/tmp/danbridge262-ui-verified.log`、`/tmp/danbridge262-staging-final-hashes.json`。
