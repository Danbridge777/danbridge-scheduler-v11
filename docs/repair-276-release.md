# 20.26.276 修復發布與驗收

日期：2026-09-11（台灣）。基準正式版：20.26.266 / e1c3c9a。

## 已發布

- staging 與 production Hosting：20.26.276。
- 正式 productionTrustedOperation：ACTIVE，productiontrustedoperation-00006-vuh。
- 正式 productionSchedulerOperation：ACTIVE，productionscheduleroperation-00007-guf。
- 先部署後端費率保護，再發布前端。沒有部署 Rules、修改 IAM 或遷移正式課表／學生／老師資料。
- 正式 Rules 保持 projects/danbridge-d8877/rulesets/ad7ddf44-0ef1-42d4-b534-bb03291f9e87。

## 此次修復範圍

1. JSON 備份完整保留 16 集合、收款明細、既有夏冬令營價格與不可覆寫日誌；還原前差異與歷史衝突保護。
2. 學費、兼職支付及教師計薪設定加入生效日歷程；後端拒絕移除／篡改既有歷程。不猜測舊資料歷史價格，不重寫正式學生資料。
3. 原月結、事後調整、目前重算分開；家庭同名確認及識別；課程唯一堂數、學生人次、老師人時分開。
4. LINE 複製與已發送／付款狀態區分；複製期間重新核對家庭、月份、成員。登出清除敏感通知畫面，舊待辦暫緩不阻擋新通知。
5. 健康資料時間標示、staging 同身份安全重試、Catherine Owner 驗證、瀏覽器儲存空間不足時的隔離復原副本。
6. 課表保留既有卡片與週格 DOM，局部更新內容；衝堂只掃目標日期；避免中文翻譯重寫相同節點與重複綁定事件。快捷鍵立即綁定，避免登入後第一次操作的延遲空窗。
7. 單堂及批次刪除用頁內確認，提交前重新核對權限、所選 ID、記錄內容。276 補修真實操作發現的「刪除成功但多選工具列仍顯示舊數量」。
8. PWA 更新前及啟用回呼再次核對待送同步／主要編輯表單，避免更新刷新打斷工作。這不是所有任意表單的通用 dirty tracker。

## 測試證據

- 276 完整 npm test：1,137 項，1,130 通過、7 略過、0 失敗，exit0。
- 275 完整整合瀏覽器：760 項，747 通過、13 略過、0 失敗。含 8 組引擎／尺寸設定；不是 8 台實體裝置。
- 工具列補修後八組批次刪除：72/72 通過。
- 276 最終桌機 Chromium/WebKit 定向回歸：92 項，90 通過、2 略過、0 失敗。
- 略過原因：iPad 指引僅適用 iPad；桌機調尺寸案例不在手機重跑；30,000 筆年度案例僅 Chromium 執行，WebKit 略過。
- 三萬筆年度案例包含家教／團班／安親、12 個月、20 名學生、10 名老師、不同生效費率、16 集合往返與年度 .xls 下載；逐月收入與薪资對獨立期望值。這是本機隔離容量，不是三萬笔正式雲端壓測，也不是 Excel app 開啟驗收。
- 先前 274：實際正式 Rules 與角色資料唯讀載入 Emulator，33 項權限允許／拒絕通過，包含 Lucas 實際校區唯讀設定；沒有登入 Lucas 私人帳號。
- 先前 273：隔離 Firestore 專用空間 16 集合／31 操作同交易還原及重送零寫入、錯誤拒絕；測試空間已清理。

### Catherine 真實 staging UI

275：新增→複製一堂至隔日→複製兩堂→立即選取四堂→刪除。獨立伺服器讀回以下四筆均 revision2/deleted=true，commitTime 都是 2026-09-10T17:05:04.002589Z：

- lsn_510de775-947c-4f9b-a05a-103d0f8745df
- lsn_c7753e6e-29cc-45b6-9d8d-1c898ce234a2
- lsn_bc852e36-80cf-4c0f-873b-c0c17d2f7f4d
- lsn_ad3a5085-45f3-4df0-bcd7-945ac1261941

四次操作共 16 筆通知，Daniel／Catherine／AA／張毅各 4 筆；這是收件人伺服器資料核對，不是本輪四台各自已讀。

276：新增每週重複兩堂→多選→確認刪除；畫面立即恢復「部分選取」，不留「已選 2 堂」。兩筆雲端 revision2/deleted=true，commitTime 都是 2026-09-10T17:10:54.894840Z：

- lsn_b1df975e-e9f8-482b-8958-ddaa7b5016ba
- lsn_a1159228-13ed-4260-a270-057d731edce2

本輪未新增學生；六堂測試課已正常刪除，保留復原／稽核 tombstone。正式業務資料沒有被測試寫入。

## 發布讀回與切版安排

`tools/verify_repair_release_readonly.mjs` 對基準後所有修改的瀏覽器資產逐一 HTTP/SHA256 比對，staging、production 均通過。正式 control/safety active、writeAllowed=true；兩函式 ACTIVE。

正式費率唯讀檢查：166 名學生、10 名老師，費率歷程均尚未新增，無非法歷程。讀取時間 2026-09-10T17:13:34.640675Z。未替使用者補寫歷史價格。

正式每日健康快照時間 2026-09-09T19:17:08.634Z，state=attention 的精確原因是「177 筆未讀通知」；該快照 recentErrors=0、pendingRequests=0、PITR 與刪除保護已驗證。這不是本刻即時健康證明，不能宣稱當下全站 healthy；未將通知代為標已讀。

使用者已同意財務切版協調：Daniel／Catherine／Lucas 先儲存、暫停計費，更新後重新開啟。已通知正式發布完成後重開財務頁。不能把舊開啟分頁當成已更新，沒有強制刷新未儲存內容。

## 沒有宣稱完成

- 新分片 coordinator／worker／角色接收者的 40 筆新同步協定仍在獨立候選，不在此發布中。既有交易批次上限 30 保留；沒有為秒數放寬資料／權限檢查。
- 本輪沒有精確量測四角色端到端延遲，沒有保證 40 筆 2 秒或持續 120Hz。
- 沒有三萬筆正式雲端壓測、所有實體平台驗收、完整正式 PITR 還原、一年未來保存保證。
- 原報告列為可選新增產品功能（退款、帳齡、薪資發放流程等）不冒充既有缺陷，未全部新增。

日誌：/private/tmp/danbridge-276-unit.log、danbridge-275-final-browser.log、danbridge-275-delete-fix.log、danbridge-276-final-browser.log、danbridge-276-production-functions.log、danbridge-276-production-hosting.log、danbridge-276-production-readback.json。
