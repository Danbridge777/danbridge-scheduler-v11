# 20.26.310 相容傳輸驗收紀錄

日期：2026-09-12。正式基線：20.26.309，Git `52c3e18be191d5a03290481f24aa122935f2b711`。

## 發布界線

- 310 後端目前僅部署到 staging 的 `stagingPublishedWorkspaceOperation`，revision `stagingpublishedworkspaceoperation-00030-tav`。
- 310 前端目前在 staging 既有 `draft-308` 預覽 channel；channel 名稱不是程式版本。61 個資產 HTTP 200 且 SHA-256 與 310 本機內容一致。
- 未將 310 Functions、Rules、IAM 或角色資料切到 production。production 的業務資料未因本輪測試而寫入。
- 不能把此文件、程式提交或 Hosting 發布當成新版正式原子後端已啟用的證據。

## 修正內容

新版權威資料、角色分片與通知仍在同一個最終交易發布。相容模式同時保存相同版本、相同權限範圍的舊格式 `db`／`scopedDb`，供已開啟的舊分頁讀取；不是另一份可獨立寫入的權威資料。這只保證舊收件者資料格式相容，不等於舊 Owner 寫入計畫相容。

相容開關只接受後端 `DANBRIDGE_ROLE_TRANSPORT=published-v1-compatible`，不由瀏覽器決定。AA 回應保持舊版回條格式。相容文件若超過 800,000 bytes 的保守預算，交易在發布前拒絕，不能靜默刪除相容欄位或只寫一半。

## 原生瀏覽器及雲端證據

只使用左側 Safari 驗收視窗。右側使用者視窗未操作。

隔離工作區：`acceptancePublishedTransport/workspace-280-80190109-2684-4a92-a726-abf3cae53b5a`。

| 操作 | 權威版本 | 結果 |
| --- | --- | --- |
| 已開啟的 Daniel 分頁：8 堂移動 | 4353 | 權威、相容角色、分片、四收件者通知一致 |
| Daniel 還原 8 堂 | 4369 | 124 堂完整內容回到測試前 |
| AA 310：多選 8 堂、批次移動 | 4385 | 預覽 8 有效、0 衝突，提交成功 |
| AA 310：立即接續復原 | 4401 | 課表恢復原時間、雲端資料完整核對通過 |

最後版本 4401 的通知已在 Daniel、AA、Catherine、張毅四個授權分頁實際開啟。唯讀雲端查核確認四位各一份 8 個不同課程 ID 的通知，4／4 已讀。

124 堂課的最終完整雜湊與測試前一致：
`record-v1:0d47c04eb61d9c924d88003608bbc58de9235a0b110b5e5f0845c75bbaceb8c5`。

本輪沒有建立要留在學生名單的新學生，也沒有刪除原有 124 堂驗收基線。測試前後 `formalDataWrites=0`。

曾在未更新的舊 staging 預覽頁遇到 8 堂預覽只判定 2 有效、6 衝突；當場取消，沒有套用。310 使用與正式 309 相同的批次操作模組，更新該驗收分頁後重測為 8 有效、0 衝突。這不是正式 309 重現的證據。

## 自動化驗證

- 獨立乾淨發布目錄 `npm test`：1,340 tests，1,331 pass，9 skip，0 fail。跳過項目不列為通過。
- Chromium／WebKit 指定回歸：114 pass、2 skip、0 fail；包含計費 LINE 預覽、通知介面、PWA 更新保護、草稿耐久性、排課佇列、工作執行緒及分片讀取。
- 本機 native Firestore 相容／非相容 Owner 與 AA 測試：8 pass、0 skip、0 fail，含 40 堂容量、重送、撤權、準備階段中斷與原子通知。
- 本機 native staging 工作區及 Rules 邊界：8 pass、0 skip、0 fail。
- 補測發現舊 Owner 中間操作雜湊不是完整資料雜湊，原始舊命令不能直接交給新原子後端。第一次驗收失敗（`danbridge-310-rolling-client-native.log`），不抹除失敗紀錄。
- 新增精確 20 筆拆成首批 8 筆的舊計畫測試，確認拒絕且 authority／通知無寫入；新版 canonical 中間雜湊命令逐筆新增、移動、刪除、重送及四角色相容資料均通過。`danbridge-310-rolling-client-native-r2.log`：8 pass、0 skip、0 fail，模擬器退出碼 0；隔離測試資料已清除。

## 正式唯讀容量預檢

正式 authority revision 645：1,182 堂有效課、7 個角色。純規劃需要 1,400 個不可變分片與 14 個 head 寫入，初次需先準備私有分片；查核本身 0 雲端寫入。

相容 AA head 約 620,817 bytes，校區主管 head 約 365,855 bytes，均在目前安全預算內。這不是未來無限容量保證，也不是正式切換已執行。

## 未達標及切版條件

- 實際 8 堂端到端同步仍約 8–11 秒，沒有達到 2.5 秒；不能以本機畫面先更新代替雲端完成。
- 兩次 AA 後端完整權威讀取分別約 4,104／4,158 ms，後端提交約 970／670 ms。此瓶頸不能全部歸因使用者網路。
- 持續 120Hz 未驗證達標。
- 正式切版前必須處理舊 Functions 存活請求與新 Functions 的發布順序、舊格式通知重送去重，以及現行 Rules 的精確基線補丁。不得把含 staging 驗收路徑的整份本機 Rules 直接部署 production。
- 必須先部署 canonical 中間雜湊前端，讓所有 Owner 舊頁的待送日誌在原後端送完、儲存草稿後安全重新開啟，再切換後端。只等候舊 Cloud Run 請求結束不夠：未更新的 Owner 分頁之後仍能產生舊命令。沒有取得這項證據，禁止開啟正式原子後端。
- 使用者正常使用中，不強制刷新有未儲存草稿的分頁；未完成正式切版條件前保留 309 後端。

## 本機證據索引

證據檔位於 `/private/tmp/`，可能由作業系統清理；本文件保留必要非敏感結論，不把原始課表或權杖加入 Git。

- `danbridge-310-clean-full-regression.log`
- `danbridge-310-clean-browser-regression.log`
- `danbridge-310-compatible-native-r3.log`
- `danbridge-310-compatible-workspace.log`
- `danbridge-310-rolling-client-native.log`
- `danbridge-310-rolling-client-native-r2.log`
- `danbridge-310-four-role-final.json`
- `danbridge-310-compatible-production-preflight.json`
- `danbridge-310-compatible-staging-deploy.log`
- `danbridge-310-compatible-preview-readback.json`
