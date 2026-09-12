# 318 四帳號擴大驗收 — 2026-09-12

狀態：2026-09-13 01:15 已恢復 Safari 控制並重新檢查先前失敗項；全功能驗收仍未完成，不可宣稱所有功能／所有情境 100% 通過。

測試版本：Git `54e7a0e`，20.26.318。正式業務資料不作測試寫入。
真實登入：Daniel、Catherine、AA、張毅；隔離工作區 `80190109-2684-4a92-a726-abf3cae53b5a`。

## 本輪證據

- `npm test`：1,392 項，1,383 通過、0 失敗、9 略過。紀錄 `/private/tmp/danbridge-318-four-role-full-unit.log`。
- 初次瀏覽器測試無效：4173 既有伺服器提供 20.26.310，而測試程式要求 318；1,165 通過／72 失敗／59 略過均不列為本版驗收。保留 `/private/tmp/danbridge-318-four-role-full-browser.log`。改用獨立 4318 埠重跑。
- 現行正式 Rules 讀回後在本機模擬器測試：47 項通過，0 security findings，正式資料寫入 0。Rules SHA `f76e51ec1eb6508d191244ad0c25775909c2d3644f2f571e00c041e7cf01b619`。紀錄 `/private/tmp/danbridge-318-four-role-live-rules.log`。
- Catherine 正常 Google 登入成功，隔離資料 401 學生、124 活動課程基線。搜尋選取「驗收學生 280」後自動帶入張毅及課程名稱。
- Catherine 新增 `ACCEPT318-FOUR-CATHERINE-0912`，9/12 16:00–17:00：本月 17→18 堂、今日 1→2 堂立即更新。頁面記錄送出至確認 9,490 ms；不能宣稱本例 2.5 秒達標。
- Daniel、張毅、AA 實際分頁均收到 Catherine 課表更新通知。Daniel 與張毅前景顯示新課；張毅本月 18 堂／12 小時。此操作不是精密接收延遲量測。
- 張毅「知道了」未讀 114→113；AA 116→115。雲端已讀須另讀回核對，不只看 UI。
- **失敗 F1**：Daniel 按「知道了」顯示 `AppCheck: Requests throttled due to previous 403 error ... (appCheck/throttled)`，通知確認失敗。尚未確定根因及是否僅隔離驗收環境受影響，不可將其描述為正常網路波動或已修复。
- Catherine 復原本輪新增，畫面回到本月 17／今日 1 堂。雲端基線還原核對待完成。

## 本輪後續結果

- 獨立 4318 埠正確 318 全套：1,237 通過、0 失敗、59 略過，6 分鐘。`/private/tmp/danbridge-318-four-role-browser-correct-root.log`。八個瀏覽器專案為引擎／尺寸／UA 模擬，不是八部真實硬體。
- 59 略過涉及平台限定案例：桌面時間格、mobile agenda、iPad 專屬項目、Chromium 剪貼簿權限、容量僅桌機跑一次。略過沒有列入通過。
- 本機原生 published UI / role chunks：3 通過、0 略過；40 堂三次連續編輯、刪除與重用包含 Chromium 與 WebKit。`/private/tmp/danbridge-318-four-role-native-ui.log`。
- 本機 production transactions：兩組各 1 項通過；三裝置競爭新增／移動／複製／批次刪除／同 ID 復原。`/private/tmp/danbridge-318-four-role-transactions.log`。
- 本機隔離 workspace：8 項通過；身分、跨路徑拒絕、原子通知及安全清理。`/private/tmp/danbridge-318-four-role-workspace.log`。
- 本機 AA scheduler 原生交易：1 項通過，包含重送／併發／中途失敗。`/private/tmp/danbridge-318-four-role-scheduler.log`。
- 補跑 Owner 原生 runtime：6 項通過、0 略過，含平常單元測試略過的 2 項原生 Firestore 案例（相容模式開／關），40 堂權威、角色及通知原子提交，重放／撤權／準備失敗安全性。`/private/tmp/danbridge-318-four-role-owner-runtime.log`。其餘初始單元測試略過項目仍不列為通過。
- 三教師隔離投影，每人 300 學生與課程：1 項通過；非線上壓測。`/private/tmp/danbridge-318-four-role-capacity.log`。
- **F1 恢復驗證**：Daniel 正常重新載入後可確認通知；雲端讀回 revision 4607 新增與 4609 撤銷均 `read:true`。先前 403 根因未確定，不能將正常重新載入視為程式修復。
- Catherine 新增／復原與 AA、張毅已讀都已從雲端確認。`/private/tmp/danbridge-318-four-role-ack-recovery.json`。
- Daniel 財務真實畫面：九月 17 堂／11 小時，收入 6,600、薪資 3,300；切十月 19 小時，收入 11,400、薪資 5,700；切回九月正確。
- Daniel LINE 預覽：綁定「隔離驗收家長」，17 堂、8 天、逐堂日期時間、11 小時 × 600 = 6,600。可編輯並成功複製，標示「已複製（未確認發送）」，未向 LINE 發送訊息。之後點恢復待通知；保留測試操作稽核，不影響正式家庭。
- Daniel 薪資實際頁：張毅 17 堂、11 hr、公司營收 6,600、薪資 3,300，符合 11 × 300。其他底薪／扣款邊界由本轮自動化案例覆蓋，未假稱在此真實帳號逐一寫入所有薪资設定。
- Daniel 與 Catherine 均實際逐一開啟學生、老師、請假、課表、課程紀錄、補課、營隊、公司財務、備份及安全設定。這只證明入口與讀取，不等於每個表單提交皆通過。
- AA 真實 UI 多選 9/29 與 9/30 共 8 堂，延後 30 分鐘，預覽 8 可套用／0 衝突；連續套用→復原→重做→復原均入佇列，未被等待同步阻擋。
- AA 上述四個事件分別 revision 4627／4643／4659／4675；每個事件四帳號各有 8 筆明細、8 個唯一課程 ID。Catherine 與張毅已從正常頁確認最新 revision 4675 通知，雲端 `read:true`。
- 最終隔離讀回 `/private/tmp/danbridge-318-four-role-final-readback.json`：124 活動課程，完整 lessonRecordsHash 與本輪初始完全一致，authorityVerified=true。teacher 100 分片、scheduler 331 分片均符合最新權威投影，release=20.26.318；保留的相容投影亦內容一致。無新增課程殘留，僅留必要測試稽核／通知及複製操作記錄。
- 張毅真實導覽只見我的總覽／我的請假／我的課表／課程回報，課表沒有新增、刪除、公司財務入口；請假老師欄位鎖定本人。
- **涵蓋缺口 G1**：隔離工作區請假頁顯示 `Missing or insufficient permissions`。源碼明確在 `publishedWorkspace` 時不建立 `productionTeacherLeaveCall`，請假提交也僅允許正式受保護後端。不能在此工作區完成請假新增／取消的部署端真實驗收，也不能據此推斷正式請假故障。需獨立的安全 staging 請假驗收路徑。
- 隔離工作區健康頁沒有正式 PITR／健康維護 receipt，不能拿此頁代表正式系統備份狀態，也未做正式資料還原演練。
- 最後一般老師導覽實測呼叫回覆 `The Mac is locked and automatic unlock could not unlock it`。未尝試繞過鎖定；需手動解鎖再續真實操作。

本輪未變更／部署任何正式程式、Rules、IAM 或正式業務資料。唯一 repo 新檔為本報告；測試證據在 `/private/tmp`。

## 覆蓋矩陣（未完成不得勾通過）

| 功能／風險 | Daniel／Catherine | AA | 張毅 | 證據要求與狀態 |
|---|---|---|---|---|
| 正常登入／角色顯示 | 真實登入 | 真實登入 | 真實登入 | 已有分頁；本輪仍逐一核對 |
| 新增／即刪／修改／複製／貼上／拖曳 | 真實新增／復原已核對；其餘部分 | 真實八堂批次移動已核對；其餘待驗 | 依權限應拒絕排課 | 自動化全套已通過，不取代尚未做的真實操作 |
| 1／8／20 堂連續操作、復原／重做 | 真實單筆完成 | 真實八堂四連續動作完成；20 堂真實操作待驗 | 真實接收；最終投影一致 | 不以舊輪结果冒充本輪 |
| 通知接收／已讀／不得讀寫別人通知 | Daniel 失敗後重載恢復；Catherine 通過 | UI 與雲端已讀成功 | UI 與雲端已讀成功 | Rules 通過；F1 根因待釐清 |
| 校區／角色隔離、權限撤銷 | 待補全 | 待補全 | 待補全 | Rules 47 項已通過，不等於每個雲端 API |
| 家教／團課／安親、學生與家長 | 待驗 | 應拒絕非授權資料 | 僅授權學生資料 | 表單與識別、同名學生 |
| 費率歷程／營收／LINE 預覽複製 | Daniel 月份／單一家長時薪帳單真實核對通過；其餘自動化覆蓋 | 應拒絕 | 應拒絕 | 複雜家庭與團班真實雲端表單待驗 |
| 老師時數／薪資／請假 | 時薪與跨月真實核對通過 | 僅授權範圍 | 僅本人範圍；請假 G1 缺口 | 月份／底薪／時薪／共同授課自動化覆蓋 |
| 補課／課程紀錄／營隊 | 待驗 | 依權限驗證 | 依權限驗證 | 正常／衝突／取消案例 |
| 備份／匯出／恢復／一年容量 | 待驗 | 應拒絕管理資料 | 應拒絕管理資料 | 僅隔離恢復；不可覆盖正式 |
| 更新／離線／重試／草稿保留 | 自動測試通過 | 同左 | 同左 | 瀏覽器模擬不等於真實所有裝置 |

未略過的有限測試可以提供可重現的保證範圍，不能證明無限輸入、所有裝置、所有網路狀態永遠零故障。Lucas 非真實登入；不得冒稱已用本人帳號測試。

## 2026-09-13 01:11–01:15 失敗項重新核對

- Safari 原有 Daniel 隔離分頁未重新整理、未重新登入，直接連續開啟三筆通知並按「知道了」，本輪未重現 App Check 錯誤。
- 01:14:35 雲端獨立讀回：Daniel 的 revision 4675、4659、4643 均 `read:true`，三笔各有 8 個唯一課程 ID；尚未操作的 revision 4627 仍 `read:false`。並非批次清空所有未讀。
- 同次讀回：124 活動課程、revision 4675，完整課程雜湊仍為 `record-v1:0d47c04eb61d9c924d88003608bbc58de9235a0b110b5e5f0845c75bbaceb8c5`；authorityVerified=true。teacher 100 分片、scheduler 331 分片均與權威資料及權限投影一致，版本 20.26.318。
- F1 定位：現有錯誤訊息為 App Check 取憑證節流，不是已證實的通知 Rules 拒絕。Firebase 官方 provider 原始碼在 token exchange 的 403/404 後設定一天 backoff（https://github.com/firebase/firebase-js-sdk/blob/main/packages/app-check/src/providers.ts）；這能解釋先前訊息，但不能證明最初 403 的成因。
- 唯讀查詢 staging 2026-09-12T15:00:00Z～17:15:00Z、`firebaseappcheck.googleapis.com` 的 ERROR audit logs，回傳 0 筆、無下一頁。無紀錄不代表未發生錯誤；原始 403 回應原因仍無足夠證據。首次查詢因 API body 格式錯誤被拒，修正查詢格式後才取得上述結果，沒有修改雲端設定。
- G1 再現：張毅原隔離請假頁仍顯示 `Missing or insufficient permissions`。前端在 publishedWorkspace 使用 run-scoped collection，但不建立請假 callable；staging workspace 後端 ACTIONS 亦沒有請假操作，workspace Rules 沒有一般老師的請假紀錄讀取路徑。這是隔離驗收覆蓋缺口，不能藉開放正式權限掩蓋，也不能宣稱正式請假故障或已完成其真實提交驗收。
- 定向重跑 `app-check-limited-use-token`、`production-notification-acknowledge`、`teacher-leave-policy`、`teacher-leave-integration-contract`：20 項通過、0 失敗、0 略過。包含四種角色已讀、撤權與縮減範圍拒絕、請假時數及版本處理；不取代 G1 的部署端真實操作。
- 本次只更改三筆隔離測試通知的已讀狀態及本報告，未修改正式程式、課程、帳務、Rules、IAM 或發布版本。結論為「通知本輪重試成功、F1 根因未結案、G1 仍存在」，不是「所有失敗已修好」。
