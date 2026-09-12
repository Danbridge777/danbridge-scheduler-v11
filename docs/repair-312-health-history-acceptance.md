# 20.26.312 健康刷新與隔離歷史讀取驗收

日期：2026-09-12。基線：production 20.26.311，Git 50a6093。

## 已實際完成的健康修正

- 原 attention 精確原因為 Daniel 178 筆未讀通知；近 24 小時 errorEvents 為 0，PITR／刪除保護均開啟，每日排程正常。
- 已送達而未讀改為 reminders，保留全部通知、未讀狀態及計數。不等於未送達，也不將通知全部標為已讀。
- 新 productionHealthRefresh 每 15 分鐘讀取實際保護設定、錯誤樣本與精確 aggregate count，只寫 ownerAlert 健康快照。45 分鐘過期，舊執行不得覆蓋新樣本。讀取失敗不改寫快照。
- 每日維護改用同一健康刷新函式，保留原有 30／90 日 retention 判斷及刪除範圍；本輪沒有手動觸發每日清理。
- 已僅部署 productionHealthRefresh、productionDailyMaintenance。未部署 productionTrustedOperation／productionSchedulerOperation，未改 Rules。
- 首次健康呼叫遭 run.routes.invoke 拒絕。讀回服務 IAM 與排程 OIDC 均為 danbridge-production-runtime，沒有擴大 IAM 或公開存取。重送後實際成功；不將第一次失敗當成通過。
- 正式快照 checkedAt：2026-09-12T07:17:49.481Z，state healthy、recentErrors 0、pendingRequests 0、unreadNotifications 178、formalDataWrites 0、PITR 與刪除保護 true，alerts 空、reminders 保留 178。
- 證據：/private/tmp/danbridge-312-health-deploy.log、danbridge-312-health-readback-r2.json。

## 本機回歸

- 全套 npm test：1,349 tests、1,340 pass、9 skip、0 fail；另新增歷史版本讀取 3 個單元測試全過。跳過不列為通過。
- Chromium／WebKit：86 pass、2 skip、0 fail，包含健康提醒與未送批次分開、登入隔離、耐久草稿與正常同步 Worker。
- 真實本機 Firestore 健康測試 1 pass：只寫健康快照、原生 Timestamp、精確 Owner 未讀計數、失敗保留、舊樣本不覆蓋。
- 開啟歷史版本讀取的原生 Firestore Owner／AA 及讀取測試：9 pass、0 skip、0 fail。核對 40 筆合成操作、角色檢視、通知、重送、撤權與交易中斷；不是四個真實帳號登入測試。
- staging workspace bridge 的原生隔離與角色邊界：8 pass、0 fail。
- Worker 可重現建置及本機引用／語法／HTML id 驗證通過。

## 同步效能候選：尚未達標

既有 staging 合成工作區 80190109-2684-4a92-a726-abf3cae53b5a，revision 4401，2,619 documents。只讀、0 cloud writes。完整歷史 1,959 documents 約 3.9 MB 為主要讀取負擔。

新增可選 historyVersionCache。每次交易重新查詢完整 ID 清單及原生 updateTime；僅重用完全相同文件版本的內容，新增／修改／刪除／同 ID 重建均需重新核對。每個 runtime 獨立且限制 16 MiB／10,000 records；超額退回完整讀取。沒有快取權限、鎖、authority head，也不略過完整 16 集合雜湊及計數檢查。

唯讀原型：首次 1,441 ms，暖機 699／742／814 ms；每筆均核對完整來源雜湊及 revision。這是本機到 staging 的讀取比較，不是 Cloud Function 端到端，更不是 2.5 秒穩定保證。

候選只於 staging 合成 workspace 啟用；正式 Owner／AA runtime 預設 false。新原子同步後端仍未正式切換。

## 尚待完成的界線

- 1–10 筆每次 2.5 秒完整同步仍未證明。
- 新後端四帳號實際 UI 驗收未完成；Safari 操作焦點被使用者切換，未動其他現用網頁。
- 正式新後端切換前，所有 Owner 舊分頁仍須已儲存、舊佇列清空並安全更新。未強制刷新。
- 本報告不宣稱四項全部完成；健康修正可獨立上線，不讓未驗收的傳輸切換影響現用課表。
