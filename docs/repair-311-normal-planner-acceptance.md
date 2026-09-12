# 20.26.311 正常傳輸背景規劃驗收

日期：2026-09-12。基線：正式前端 20.26.310／Git `875527b`。

## 正式前端發布讀回

- production Hosting 311 已完成，CLI `Deploy complete`。正式 61 個候選瀏覽器資產 HTTP 200 且 SHA-256 全部一致；staging 專用驗收頁在正式 HTTP 404。
- 正式 Rules：`ad7ddf44-0ef1-42d4-b534-bb03291f9e87`，未變。
- trusted：`productiontrustedoperation-00006-vuh`；scheduler：`productionscheduleroperation-00007-guf`，均 ACTIVE、revision／updateTime 與發版前相同。
- control／safety active，writeTakeover／writeAllowed true。正式資料寫入 0。
- ownerAlert 仍是 2026-09-11 19:17 UTC 的舊 attention 快照；不宣稱即時 healthy。
- 證據：`/private/tmp/danbridge-311-production-deploy.log`、`danbridge-311-production-readback.json`。沒有強制刷新或登出現用頁面。這是前端部署完成，不是新同步後端或 2.5 秒達標。

## 修補範圍

正式模式的純同步規劃移到既有 module Worker，不再綁定尚未啟用的 `publishedOwnerBatch` 開關。規劃前保留整份輸入快照；工作執行緒沒有 Auth、Firestore 或操作日誌能力。回應仍驗證 protocol、requestId、環境、device、epoch、sequence 及結果結構。

批次大小、序列、衝突備份、耐久日誌與回條驗證未變。正常正式傳輸仍最多 8 個 operation 一批；不以這次前端發布啟用新的原子後端。Worker 無法載入／被瀏覽器阻止時保留既有純規劃 fallback，不丟棄操作。

除了此項執行緒選擇，其他執行碼變更僅為 310 → 311 發布標記與可重現生成檔。Functions 的候選 release 標記一起更新以符合版本一致性測試，但不代表部署 Functions。

## 本機驗收

- `npm test`：1,340 tests、1,331 pass、9 skip、0 fail。包括衝突備份失敗、回條遺失重送、草稿保存與恢復、撤權邊界及計費。跳過不列為通過。
- Chromium／WebKit 指定瀏覽器回歸：138 pass、2 skip、0 fail。
- 新增正常正式傳輸專項：400 學生與 800 歷史紀錄下，20 堂新增 → 移動 → 刪除，連做兩輪；兩個瀏覽器各 6 個 Worker 回應、重用同一 Worker，所有批次最多 8 筆，每批完整重建雜湊等於最後 operation targetHash。每個 send 之前核對耐久日誌已有該 operation。
- 每輪課程數、教室、日期時間、完整資料雜湊及歷史數均核對；最後 0 測試課、920 歷史，無 pending／failed／quarantined／sending。期間輸入仍可操作，requestAnimationFrame 持續回呼。
- 另加四種裝置設定（iPad／iPhone WebKit、Android／Windows Chromium）的背景規劃、草稿恢復、AA 延遲回條檢查：16 pass、0 fail。它們是裝置模擬，不冒稱在四種實體作業系統測過。
- 強化正常傳輸測試：第二輪移動在 8 筆已提交後遺失回條；確認為 retryable failed，從耐久儲存重建 journal，退避後續送。六種瀏覽器設定均核對 240 次實際寫入、8 次重送去重、0 遺失、最後 0 待送，Worker 只規劃 6 次，不因重送另造操作。12 pass、0 fail；證據 `danbridge-311-worker-loss-recovery.log`。
- 以上為真實瀏覽器引擎操作本機隔離合成資料，不是四個真實帳號的雲端同步速度驗收，不宣稱持續 120Hz。
- 首兩次全套執行因新版本與既有精確版本斷言不同而停止；對齊候選版本及斷言後重跑全套，保留失敗紀錄。

證據：`/private/tmp/danbridge-311-regression-r3.log`、`danbridge-311-browser-regression.log`、`danbridge-311-validation.log`。Worker bundle 54,672 bytes／15 純模組，生成檢查通過。

## 雲端唯讀效能比較

精確隔離工作區 `80190109-2684-4a92-a726-abf3cae53b5a`，固定 revision 4401、2,619 documents。每次使用原生唯讀交易讀完 16 集合、核對完整資料雜湊與計數；前後確認無進行中操作及相同 authority revision。

| 方式 | 完整耗時（ms） |
| --- | --- |
| 16 集合完整查詢，第 1 次 | 3262 |
| 先完整列舉 ID 再單次 BatchGet，第 1 次 | 5403 |
| 16 集合完整查詢，第 2 次 | 6019 |
| 先完整列舉 ID 再單次 BatchGet，第 2 次 | 3777 |

沒有一致優勢，因此未改後端讀取方式。這是本機到 staging 的唯讀比較，不當作正式 Cloud Function 端到端 latency。`cloudWrites=0`、`formalDataWrites=0`。

同一工作區另比較 REST／gRPC 的完整查詢：REST 1,302／1,026 ms，gRPC 6,463／4,696 ms；全部同 revision、同完整雜湊、0 writes。這不支持改用 gRPC，也不能將本輪較快的 REST 樣本宣稱為穩定上限；上表的 REST 波動仍存在。證據 `danbridge-authority-transport-comparison.log`。

## 未完成與發布界線

- 1–10 筆 2.5 秒端到端目標未達標；完整原子新後端尚未切到正式。
- 上輪已證明舊 Owner 中間雜湊命令不相容；正式切換仍須 Daniel／Catherine 所有 Owner 頁面先儲存、待同步清空並更新，不能強制刷新未存表單。
- 本輪 Safari 視窗清單已無原本左側四帳號驗收視窗；沒有操作其他現用網頁、沒有將舊輪驗收冒充本輪。
- 新建 `planner-311` 預覽通道，不覆寫既有 `draft-308`。CLI `Deploy complete`，遠端 61 個候選資產 SHA-256 全部與本機一致，0 mismatch。證據 `danbridge-311-preview-deploy.log`／`danbridge-311-preview-readback.json`。
