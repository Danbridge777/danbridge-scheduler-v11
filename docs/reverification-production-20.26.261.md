# 20.26.261 上線後完整既有測試套件複驗

日期：2026-09-08。正式程式基準提交 `5aba0d2845062f49275cb585c16edb10121f220c`。

## 結果

| 項目 | 本輪實際結果 |
| --- | --- |
| `npm test`（含前後置） | 1,040 通過、7 跳過、0 失敗 |
| 完整瀏覽器操作套件 | 679 通過、17 跳過、0 失敗，八種瀏覽器／裝置模擬配置 |
| 遷移分階段 Rules/Auth/Firestore Emulator | 正確前置流程後 33 通過、0 失敗 |
| staging runtime 角色 Rules | 2 通過、0 失敗 |
| 正式 Rules 原文契約及後端 Firestore 交易 | 4 通過、0 失敗、0 跳過 |
| npm 正式與完整依賴安全稽核 | 通過，零已知弱點 |
| 正式 Hosting | 339 個檔案 SHA-256 全部與已發布本機檔案一致 |
| 正式唯讀操作 | Daniel 登入、財務、老師薪資八月切九月、學生收款九月正常顯示；未見 NaN／Infinity，該頁 error 日誌為空 |

前次實際 staging 計費、雲端讀回、可編輯 LINE 預覽與真實剪貼簿操作證據見 `acceptance-billing-line-20.26.261.md`。本輪沒有重複建立 staging 收款資料，也未在 production 寫入課程、學生或付款狀態。

## 正式規則核對

- production Rules release：`projects/danbridge-d8877/rulesets/ad7ddf44-0ef1-42d4-b534-bb03291f9e87`。
- production 原文 SHA-256：`55011bf1e21b39e46f55132050e836be029924def291454f1217fec8713b4df0`；63,500 bytes。
- staging Rules：`projects/danbridge-d8877-staging/rulesets/ef5bd786-4a83-45c7-97b2-68148a81c931`；SHA-256 `0a42c2fab1882a043aaba3835dcd1a0edeb6bd26c29224f005a94d3b69b2d227`，與本機 runtime 產物一致。
- 兩個環境刻意使用不同規則，未互相覆蓋。沒有修改或部署 Rules／IAM。
- 新增 `tests/production-deployed-rules.test.mjs`：必須明確指定原文檔及 SHA-256，並確認 localhost Emulator，才可執行。實測 Owner／AA／兩位老師／未登入角色不能直接寫通知、回報、排課要求或錯誤事件；老師僅可讀自己資料，撤權後立即拒絕。
- 後端測試實際執行新增、移動、複製、批刪、同 ID 復原、重送、三裝置競爭、三位老師角色資料／通知，以及注入中途例外；驗證權威資料完整、交易不留半套。

## 測試過程中的不相容與處理

1. 第一次直接執行 Rules runner 沒有執行 npm 前置 pause 產物建置，導致一個遷移案例失敗。改用 `npm run test:rules` 完整流程後 33 個測試通過；最後以既有 builder 還原 runtime 規則，與原始雜湊完全相同。
2. 舊 Rules 測試套件拿到正式規則時，14 個通過、9 個失敗；9 個失敗均要求瀏覽器直接寫通知／排課要求／回報／錯誤事件，與正式後端模式不相容。保留其原有用途，不放寬正式規則；另加上述正式契約測試確認正確拒絕直接寫入，並透過後端交易測試確認合法操作可完成。
3. 暫存原文曾多出補丁尾端換行，雜湊斷言正確拒絕；移除多出的換行後與遠端原文逐 byte 相同，再完整重跑通過。沒有以正規化雜湊放寬檢查。
4. 正式 UI 自動操作曾回覆逾時；均讀回 DOM 確認換頁／換月已完成，不重複資料操作，不將此紀錄作為 UI 效能達標證據。

## 明確邊界

- 不是所有實體 Mac／Windows／iOS／Android 裝置、也不是所有可能輸入組合均逐一驗證。
- 本輪 production 實際登入為 Daniel；AA／老師以 Emulator 身份與隔離瀏覽器 fixture 驗證，不能稱為本輪三個真人帳號同時正式雲端驗收。
- 單一本機 runtime 操作本輪約 14–64 ms；三個獨立 runtime 同時競爭時為 2,049／3,515／3,535 ms。因此「所有操作最慢 2.5 秒」**沒有通過**；這是本機 Emulator 量測，不能冒充 production 網路延遲或保證。
- 正式安全控制讀回 `active`、`readAllowed: true`、`writeAllowed: true`，`recordRevision: 633`，資料雜湊仍為 `record-v1:60802ca562e7fb3be7cc060f3d4075e02c37b4b24f2aea4df3a65cd89ab0ed2e`。不把安全控制或 HTTP 200 當作每位用戶待送佇列已清空。
- 本輪只新增驗證測試與報告，不改正式 runtime，因此 production 保留已上線的 20.26.261，不重複部署相同程式。

## 本機完整日誌

- `/tmp/danbridge261-reverify-unit.log`
- `/tmp/danbridge261-reverify-browser.log`
- `/tmp/danbridge261-reverify-rules-full.log`
- `/tmp/danbridge261-reverify-staging-runtime.log`
- `/tmp/danbridge261-reverify-production-contract-final.log`
- `/tmp/danbridge261-reverify-dependencies.log`
- `/tmp/danbridge261-reverify-hosting.json`

本報告與新增測試隨 GitHub main 驗證提交保存；發布回覆記錄遠端 HEAD 核對結果。
