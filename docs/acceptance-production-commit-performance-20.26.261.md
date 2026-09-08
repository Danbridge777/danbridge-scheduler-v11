# 20.26.261 正式後端併發修正驗收

日期：2026-09-09。修改基準：`8107cc09b771ea9a16f6f9ccd8d787a72011a63e`。

## 範圍與不可誤用的結論

本次只更新 `productionSchedulerOperation` 與 `productionTrustedOperation`。前端仍為 20.26.261；不重發 Hosting，不改 Rules／IAM，不重新編號既有學生或課程，不寫入正式課程、學生、收款或薪資資料。

以下秒數為本機真實 Firestore Emulator 的後端交易實測，不是 production 網路往返、三個真人帳號或另一台裝置畫面完成更新的量測。不能用這份報告保證所有情況都在 2.5 秒內。

## 修改

1. Owner 與 AA 原子寫入共用後端短期租約，減少獨立 runtime 同時爭用完整資料交易造成的鎖定重試。租約文件為 `companies/danbridge/productionRuntimeLocks/recordCommit`，只屬於後端協調 metadata。
2. 租約 token 在原生交易中重新讀取驗證；接管需 updateTime 前置條件，舊持有者不能刪掉新租約。失聯建立回條只恢復同一 token；釋放失敗不能把已提交資料誤報為失敗。
3. 同一交易已讀過的快照共用，其他單筆讀取合併為原生 `getAll`。讀取快取只存在於單次交易嘗試，重送／新交易必須重新讀取，不存在跨請求舊資料快取。
4. 採用既有、已驗證的範圍化增量規劃及 Node 原生 SHA-256；保留完整 16 集合雜湊、數量、版本、角色與衝突驗證。未變更的課程不重複計算 metadata；間接變更的補課仍納入。
5. 暫時性後端錯誤保留可重送的錯誤碼；權限、資料衝突與驗證錯誤不自動當成成功。

租約最長等候維持 5 秒，失效回收期 60 秒。這是故障／過載保護，不是假裝達成 2.5 秒的方法；效能測試另外使用嚴格 2,500 ms 斷言。崩潰遺留租約、過載或外部服務延遲仍可能超過效能目標。

## 最終測試

| 項目 | 結果 |
| --- | --- |
| `npm test`，含前後置 | 1,046 通過、7 跳過、0 失敗 |
| 原生 SHA-256 相容性 | 3 通過、0 失敗 |
| 瀏覽器完整既有回歸，八種配置 | 679 通過、17 跳過、0 失敗 |
| 正式原文 Rules 與實際後端交易 | 4 通過、0 跳過、0 失敗 |
| 3,000 堂既有合成課程、十輪、三個獨立 runtime 併發 | 120 次批次操作全數通過 2,500 ms |
| 全檔語法、參照及 HTML ID | 438 份 JavaScript、145 個本機參照、362 個 HTML ID 通過 |

每輪每個 runtime 新增 15 堂、移動 15 堂、複製 15 堂，再刪除原件及複本 30 堂。十輪共 2,250 次課程層級變更；每個階段回讀 16 集合資料雜湊及三位合成老師的限定檢視／版本，最後無批次測試活動課，3,000 堂既有合成課仍在。另測即時新增／移動／刪除、同 ID 衝突、重送回條、角色撤銷與交易中途例外，不留半套資料或通知。

| 操作 | 十輪中最慢 |
| --- | ---: |
| 新增 15 堂 | 1,152 ms |
| 移動 15 堂 | 1,156 ms |
| 複製 15 堂 | 1,206 ms |
| 刪除 30 堂 | 1,236 ms |
| 全部第 95 百分位 | 1,130 ms |

逐項等價測試比對最佳化與原完整規劃：新增、移動、請假、取消請假、Unicode 備註、刪除的 DB、每筆 operation、雜湊、數量與序號完全相同。既有計費／LINE／薪資功能未修改，瀏覽器回歸有實際點擊、切月、預覽及剪貼簿驗證；未把 fixture 模擬稱為正式三帳號驗收。

## 權限與資料保護

- 正式 Rules 原文 SHA-256：`55011bf1e21b39e46f55132050e836be029924def291454f1217fec8713b4df0`，未修改或部署。
- Owner、AA、兩位老師、未登入身份的通知／回報／排課要求／錯誤事件／新租約文件之直接 create、update、delete 全部被拒絕。
- 正式 runtime 服務帳號原有、無到期條件的 `roles/datastore.user` 已包含租約所需 get/list/create/update/delete；沒有新增權限。
- 發布前正式 safety 為 active，readAllowed/writeAllowed 均 true，recordRevision 633、revision 634、documentCount 2712、activeCount 2171、tombstoneCount 541。
- 發布前資料雜湊：`record-v1:60802ca562e7fb3be7cc060f3d4075e02c37b4b24f2aea4df3a65cd89ab0ed2e`。

## 未採用與未隱藏的失敗

原本三 runtime 爭用最慢約 3.54 秒。縮短 SDK 外層重試、調整讀取順序、只移出唯讀快照均未達標，未部署。初版租約加重複計算消除，在小資料十輪通過，但 3,000 堂既有課的測試仍失敗：提前等候逾時，或完整完成最慢 3,224 ms。沒有把這些當成成功；加入同次交易批次讀取後，重新完整十輪才得到上述最終結果。

擴充容量 fixture 的首次建置曾未透過 safety builder 更新雜湊，安全驗證正確拒絕；修正隔離 fixture 建置後才重新測試。這些測試從未寫入 production。

## 發布回讀

- `productionSchedulerOperation`：ACTIVE，revision `productionscheduleroperation-00006-cud`。
- `productionTrustedOperation`：ACTIVE，revision `productiontrustedoperation-00005-lut`。
- 兩個已部署 source archive 各 342 個檔案逐檔 SHA-256 與本機一致，包含兩個新 helper；其餘正式 function revision 未變動。
- 正式 safety 發布前後深度比較完全一致（不是只比較文件鍵順序）；recordRevision、資料雜湊與数量均未變動。
- 正式 Hosting 339 個檔案全部一致；新開的唯讀分頁確認 Daniel 登入與課表可開啟，未操作原本工作分頁或新增測試資料。
- Owner 健康摘要實際路徑是 `systemHealth/ownerAlert`，不是舊驗證 helper 猜測的 `systemHealth/current`（後者回覆 404）。摘要最近檢查時間為 `2026-09-07T19:17:07.608Z`，state 為 attention，原因為 63 筆未讀通知；當時 recentErrors、pendingRequests 皆 0。沒有把舊摘要稱為現在全系統 healthy，也未將通知標成已讀。
- GitHub main 推送及遠端 HEAD 以提交後的讀回結果為準。

本次發布後使用者追加「40 筆／2 秒／120 Hz」新要求，屬於下一階段驗收，不能沿用本報告的 15／30 筆、2.5 秒結果當作已達標。

## 本機日誌

- `/tmp/danbridge-lease-final-capacity-ten.log`
- `/tmp/danbridge-lease-release-unit.log`
- `/tmp/danbridge-lease-release-native.log`
- `/tmp/danbridge-lease-browser.log`
- `/tmp/danbridge-lease-parity.log`
- `/tmp/danbridge-lease-validation.log`
- `/tmp/danbridge-lease-production-deploy.log`
