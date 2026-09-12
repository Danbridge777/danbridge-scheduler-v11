# 318 營運強化工作清單（staging 已發布，正式未發布）

正式基準：20.26.317，main c6f2b38。此文件是待辦與證據清單，不是完成宣告。

最新摘要與明確未完成門檻見 [current-acceptance-318.md](current-acceptance-318.md)。下方逐日條目保留失敗與恢復過程，不以早先狀態覆蓋最新證據。2026-09-12 最後一輪 AA 隔離課仍有 1 堂待 Mac 解鎖後正常復原；正式尚未發布。

## 安全邊界

- 正式課表、家長、費率、薪資和正式 AA／Lucas 帳號不作測試修改。
- 使用者同意以 AA 驗證 Lucas 同等校區主管權限；實際變更只允許 staging，須先保存原權限、精確比對後變更、測完恢復及核對。
- 本機模擬器與 staging 的測試不能稱為 Lucas 本人登入或全部實體裝置測試。
- 不改付款帳戶、不自動升級付費、不替管理員設定憑證。
- 使用者已接受目前同步速度，不再以 2.5 秒或持續 120Hz 作為本輪達標宣告。

## 逐項進度

| 項目 | 目前 | 完成條件 |
|---|---|---|
| 背景／重連 | 三角色 pageshow／online／visibility hooks 在 Chromium／WebKit 隔離測試通過；Safari 真實雲端 Daniel 新增及復原、老師分頁前景切回接收與統計更新通過 | scheduler／branch_manager 真實雲端前景恢復仍須區別於本機測試；不宣稱雲端延遲或 Lucas 本人登入達標 |
| 容量預警 | 新增有效角色讀取，70% 提醒、90% 注意、樣本不完整不得當作完整驗收；單元測試通過 | 原生資料庫驗證及正式低量讀回；預警不是容量遷移已完成 |
| 相容容量遷移 | 未執行 | 有安全的舊客戶端退休／拒絕舊寫入協定，再移除相容大文件；不得直接刪課程 ID |
| AA 同等角色 | 真實 staging AA 主管校區隔離、月份切換、通知接收及已讀回寫／重開驗收通過；已精確恢復原排課權限並核對零殘留 | 此為 AA 同等角色驗證，不是 Lucas 本人登入；正式規則切換仍須處理舊非 Owner 分頁相容性 |
| 帳務及管理員 MFA | 未確認完成 | 核對有效帳戶／預算通知；涉及付費及憑證設定由使用者完成 |
| 還原演練證據 | 既有 clone 收據 ready-read-only，同一 operation done=true／無 error；16 集合 2208 筆零差異，formalDataWrites=0 | 這是 2026-09-01 已保存的比對，不是今天資料的重比對，也不代表 clone 全功能 UI 驗收 |
| 文件一致性 | 正在整理 | 舊看板明確歸檔，現行證據有測試範圍和未涵蓋項目 |
| 排課前資料檢查／月底對帳／通知追蹤 | 待確認現有實作並補足 | 無修改公式、無費用洩漏給 AA／一般老師；新增情境、UI 和角色測試 |

## 實測記錄

- 2026-09-12：正式 Rules 200fb995-a662-4179-8787-d8e5a1d3d0e6，SHA 2a397d540d36487ed15a70a6168ebebced40888e95a0cdebc996789637b78852；Lucas active=true、readOnly=true、branchIds=[art_museum]；33 項隔離檢查通過，正式資料寫入 0。
- 原生健康快照測試 1 項通過（有讀取失敗、舊執行覆蓋防護及正式業務零寫入情境）。第一次模擬器因 PATH 缺少 Java 未啟動；使用既有 Java 後成功，不把第一次列為通過。
- 瀏覽器：web.app 登入返回曾顯示「The requested action is invalid」；firebaseapp.com 原有老師 STAGE 工作階段不是 AA，已登出重新登入，不能當成 AA 權限驗收。
- 最新本機定向測試 68 通過、0 失敗、0 略過；健康頁 Chromium／WebKit 2 通過；含 570 KB 有效與 750 KB 封存角色的原生健康測試通過，封存資料未計入。這些不是正式端壓測。
- 2026-09-12T10:46:40Z 正式唯讀：7 個有效相容角色，最大估計 622865 bytes（含寫入端相同 2048-byte 預留），800000-byte 安全預算，77.858%；沒有超標但需要遷移計畫。
- 同次讀回：正式 AA 排課權限未變；staging AA 仍為 teacher/canManageSchedule=true，尚未變更。Lucas 正式權限為美術東四路、readOnly=true、canSubmitOwnReports=true。允許的是該校區資料與本人回報，不能誤寫成所有財務資料均不允許。
- 已在 Google 帳號選擇頁實際點 AA；返回後登入初始化出現 auth/network-request-failed／連線逾時，尚無 AA 已登入成功的 UI 證據。不繞過驗證、不偽造登入；需要連線恢復後續測。
- 本機完整 npm test：1372 項、1363 通過、0 失敗、9 略過，日誌 `/private/tmp/danbridge-318-full-regression.log`。略過不算通過。
- 重新前景顯示測試使用實際頁面事件註冊和 receiver，teacher／scheduler／branch_manager 漏接第 13 版時可經 pageshow、online、visibilitychange 事件恢復，突發事件不重複套用；資料來源為本機隔離 fixtures，非真實雲端帳號。
- 最新 Chromium／WebKit 前景重連與容量提醒合計 12 通過、0 失敗（含新鮮／過期容量提醒和未讀通知分離）；日誌 `/private/tmp/danbridge-318-foreground-capacity-browser.log`。
- 最新登入診斷：staging admin 設定和 SDK 公開 projects 設定均包含 web.app／firebaseapp.com；SDK 端點命令列 HTTP 200、257 ms。內建瀏覽器直接讀同端點回覆 `net::ERR_BLOCKED_BY_CLIENT`，是目前確定的瀏覽器阻礙；不推測是哪個擴充套件或安全設定造成，不繞過封鎖。不把 handler 的網域驗證失敗誤判成缺少 authorizedDomains。
- staging Identity Platform 回傳 mfa.state=DISABLED；這不等於 Google 帳號本身沒有兩步驟驗證，兩者不能混為一談。正式帳號 MFA 尚未查核。
- PITR 唯讀核對：`pitr-preview-202609011823-c2e72d2ed1`，operation `amOQN41d1a7SS2uHMlzH8xAqMXRzYWUtYWlzYQoiDBAgGg`，完成收據時間 2026-09-01T19:17:13.135Z。16 集合 unchanged=2208、added/changed/removed=0；同一 operation done=true/error=null。這次無 start、无資料寫入。
- 本輪仍未部署、提交或推送；正式維持 20.26.317／c6f2b38。AA 在 staging 和 production 的原權限均未修改，因此沒有待恢復的臨時角色。

## 2026-09-12 後續：AA 真實登入與可恢复角色切換

以下更新取代上方「staging AA 尚未修改」的歷史狀態；正式仍未改動。

- 使用者手動登入 AA 後，實際瀏覽器顯示「排課專員｜STAGE」。DOM 診斷 active / ready、controlRevision=375、16 集合已載入；非模擬帳號。
- 唯讀權威重建通過：epoch `v2:6ef2009d94faa7acb3b4560cec39dd00`、sourceHash `record-v1:52318cb40be7c9659746c3a80a7feb27b50429160799909915a10cf7cd1cfba7`，263 堂；投影美術東四路 90 堂。舊 main 只有 1 堂且不是驗收來源。
- 專用工具 `tools/staging-aa-branch-preflight.mjs` 預設唯讀；明確 --activate / --restore 才操作固定 staging AA。寫入前鎖定原 access、control、authority head 雜湊，先持久保存原設定；不寫任何業務集合。
- 首次 activate 在任何寫入前被工具欄位斷言阻止；核對 schema 後將檢查改為 `lastPublishId`，非略過檢查。第二次成功建立 1037 筆專屬衍生檢視，原子切換 AA access 與 control；瀏覽器實際自動登出，未保留舊排課畫面。
- 重新按 Google 登入後，handler 明確回覆 `The requested action is invalid`；尚未看見 AA 主管已登入畫面，不能列為 Lucas 同等實際驗收通過。
- 已執行 restore 並獨立讀回：AA `teacher/canManageSchedule=true`、access 與 control 內容雜湊與原始備份完全相同；權威 head `2ca41c130c0b96f8bf5e595d629c7043ac8bb89098be5c57712467403296a725` 未變。
- 僅刪除本次建立的 1037 筆衍生測試檢視，16 集合 count 獨立讀回均為 0；未新增或刪除學生、課程、收費、薪資。角色檢視可由權威資料再產生；保留 `stagingRoleAcceptance/aa-branch-318-20260912` 的恢復稽核，state=cleaned。
- 相關日誌：`/private/tmp/danbridge-318-aa-branch-preflight.log`、`/private/tmp/danbridge-318-aa-branch-activate.log`（第一次失敗）、`/private/tmp/danbridge-318-aa-branch-activate-r2.log`、`/private/tmp/danbridge-318-aa-branch-restore.log`。
- 待釐清：角色縮減後，舊角色通知是否仍能依 recipientEmail 讀取。現行訂閱和規則需補角色／範圍變更情境；尚未在主管登入完成後實際驗證，不能宣稱歷史通知隔離已通過。

## 2026-09-12 通知角色縮減安全回歸（未發布）

- 使用者再次登入後，真實 AA 頁面 active/ready，controlRevision=375；仍為原本排課專員，未再次修改 staging 權限。
- 已將「待釐清」轉為確定缺陷：正式現行 Rules 原文 SHA `2a397d540d36487ed15a70a6168ebebced40888e95a0cdebc996789637b78852` 在本機原生 Firestore 模擬器，AA 改為美術東四路主管後仍能 get 舊 scheduler 通知、get 其他校區通知，且 email-only list 同樣讀到兩者。只有合成通知，正式／staging 資料寫入皆 0；不是 Lucas 本人瀏覽器測試。
- 基準稽核刻意 exit 2 / state=security-findings，不算通過。日誌 `/private/tmp/danbridge-318-notification-scope-audit.log`。
- 新增純準備工具 `tools/production-notification-scope-rules-patch.mjs`：鎖定上述正式基準，只替換通知 read 規則，其他規則和 server-only 寫入限制保持原樣。新 Rules SHA `f76e51ec1eb6508d191244ad0c25775909c2d3644f2f571e00c041e7cf01b619`；尚未部署。
- 前端訂閱同步改成 email + 當前收件角色；一般老師再綁 teacherId，校區主管再綁完整 branchIds，Owner 保留自身歷史通知。角色範圍不明直接拒絕建立查詢，不回退 email-only。收到 callback 後再作相同條件防護，但不把前端篩選當伺服器隔離。
- 分支清單採權限原陣列的精確相等，不採 array-contains-any；舊較廣校區清單或不同角色通知不再交付。部署前仍需確認既有多校區通知的陣列順序及真實雲端查詢索引；這是明確發布門檻。
- 候選規則原生模擬器 56 項通過、0 缺陷；涵蓋各角色正常查詢、縮權後禁止舊通知、禁止較寬 list、禁止偽造通知、撤權與 AA 恢復。日誌 `/private/tmp/danbridge-318-notification-scope-candidate.log`。
- 通知回歸 37 項通過、0 失敗、0 略過，包含從實際前端抽出的訂閱函式與現行老師請假通知。日誌 `/private/tmp/danbridge-318-notification-regression.log`。這不是新版雲端瀏覽器驗收，也不能用之前 1372 項全測結果代替這次改動後的全測。
- 未部署、未推送；正式仍 20.26.317。新規則會拒絕舊非 Owner 分頁的 email-only 訂閱，發布必須搭配新版前端與非 Owner 分頁更新協調，不能只先上 Rules 造成正常通知失效。未刪除任何歷史通知。

## 歷史交接：318 staging 發布與主管登入待辦

以下取代上方未部署／AA 已恢復的歷史狀態；正式仍未發布或修改。

- 前端及對應原始碼版本戳已升 20.26.318，SW cache 為 `danbridge-v11-notification-scope-350`。staging Hosting 已部署，352 個資源逐檔 SHA256 讀回一致；證據 `/private/tmp/danbridge-318-hosting-assets-readback.json`。
- 版本戳更新第一次全測正確攔住仍為 317 的後端收據版本；補齊收據與測試版本戳後，全測 1376 項、1367 通過、0 失敗、9 略過，exit 0。日誌 `/private/tmp/danbridge-318-full-release-regression-r3.log`。
- 16 項 desktop Chromium／WebKit 通知、角色重連及健康提醒畫面通過，日誌 `/private/tmp/danbridge-318-browser-release-r3.log`。早先錯誤 project 名稱和受限本機 server 未啟動均不計通過。
- 新增唯讀 `tools/notification-scope-preflight.mjs`：正式 8 個 active access 帳號既有通知全部符合新查詢、無缺 recipientRole；staging AA 321 筆中 301 筆屬現在 scheduler 範圍、20 筆為舊角色。真實 aggregate query 成功且與逐筆 envelope 過濾數一致；這是索引／格式驗證，不是 Admin 查詢代替客戶端授權驗證。
- staging 通知候選獨立原生模擬器 42 個 checks 通過；雲端 compile 成功。只替換通知 read/update 範圍，未改其他規則與 Owner 寫入限制。
- staging 規則已部署：`projects/danbridge-d8877-staging/rulesets/58a8ec81-0afd-4723-b249-8e995e8206d6`，SHA `b5f1278ece549e34a0b5914518cc5706d3cb6ccc5e4ceb456abea927226a69ed`；發布後讀回核對成功。
- 精確規則 baseline/candidate/evidence 位於 `/private/tmp/danbridge-318-notification-rules-ZR0Txs`，基準 SHA `287caf3e92a388f9fb541ad065d78e7435ecb72f83db05308c213babec5fb85d`；正式規則未更動。
- 真實 AA 新前端 script URL 為 318，active/ready、controlRevision=375，仍能看到 216 則未讀通知。之後才啟用新的臨時角色 lease。
- **目前 staging AA 臨時主管角色仍 active，等使用者手動登入完成測試，尚未恢復。** 新 lease `stagingRoleAcceptance/aa-branch-318-notification-20260912`，與舊 cleaned lease 分開；1037 筆新衍生檢視，2 筆 access/control 原子更新，業務寫入 0。權限縮減後瀏覽器再次清空舊畫面並登出。
- 兩笔合成通知已建立：`scope318_notification_museum` 應能收到；`scope318_notification_forbidden`（scheduler）不得由主管收到。工具 `tools/staging-notification-scope-fixture.mjs` 只操作這兩筆，未新增學生或課程；目前兩筆仍未讀、待 UI 驗收。
- 驗收後必須先 `node tools/staging-notification-scope-fixture.mjs --cleanup` 精確清除兩筆通知，再 `node tools/staging-aa-branch-preflight.mjs --restore` 恢復原 access/control 並清除本次 1037 筆衍生檢視，獨立讀回原雜湊／權威 head／零殘留。不要恢復後才請使用者登入主管，否則又只驗到 scheduler。
- 使用者要求重開登入視窗；原 tab 4 已不在 session，清單為空，因此新開可見 tab 5，原 staging firebaseapp.com branch-isolation-318 URL，已 markHandoff。登入卡 Continue with Google 已可見，請登入 AA。尚無主管登入完成證據。
- Functions 未部署；正式 Hosting／Rules／業務資料未改；未 commit/push。不要宣稱全部缺陷已修完或正式已 318。

## 最新狀態：AA 真實主管驗收完成、臨時權限已恢復

此節取代上方「主管登入待辦／臨時角色 active／通知仍未讀」狀態。

- 使用者登入 AA 後，真實 staging 頁面顯示「校區管理者｜STAGE」，查看校區固定為美術東四路，只有 1 位學生、1 位老師及 9 月 8 堂課。課表沒有新增、複製、刪除入口；篩選器沒有河西一路課程或其他校區學生。靜態地點圖例不當成跨校區資料洩漏。
- 實際收到指定美術通知 1 筆，未顯示 scheduler 舊角色通知。點「知道了」後原生雲端讀回 museum read=true、forbidden read=false；重新載入並完成登入初始化後，課表通知維持 0 筆、校區仍鎖定美術東四路。
- 公司財務範圍同樣鎖定美術東四路。實際切 9 月 → 10 月 → 9 月：9 月老師 4.5 hr；10 月未帶入該筆 9 月時數；回到 9 月恢復 4.5 hr。此為零費率 staging 資料，不能宣稱所有非零計費公式均已重驗。
- 已執行本輪 `--cleanup` 與 `--restore`：精確刪除 2 筆具固定 acceptanceRun 的合成通知，恢復原 access/control，移除 1037 筆本輪衍生檢視；未刪課程或學生。衍生檢視可由權威資料重建，合成通知的產生工具仍保留。
- 獨立唯讀核對：lease `aa-branch-318-notification-20260912` 為 cleaned；AA role=teacher、canManageSchedule=true；原 access SHA `f301be1f46257c08225a3bae48e54d4054876f4a1e7f27a8e2832fd406974224`、control SHA `4029dc4695b47714bef4e64e14e5980c57c04f3d33ab32d2a5acdea4bda680fc` 完全一致；權威 head SHA `2ca41c130c0b96f8bf5e595d629c7043ac8bb89098be5c57712467403296a725` 未變；16 個衍生集合與兩筆通知均零殘留。
- 權限恢復後，瀏覽器實際自動登出並清除主管畫面；不是登入失敗，不需再請使用者登入主管。
- 這是 AA 使用 Lucas 同等美術校區權限的真實驗收，不是 Lucas 本人登入。正式仍 20.26.317，未部署本輪前端／Functions／Rules，未 commit/push。正式通知規則切換前仍需處理舊非 Owner 分頁的 email-only 訂閱相容問題。

## 四個授權帳號逐一驗收（進行中）

- 使用者要求自行操作 Daniel、Catherine、AA、張毅。輔助唯讀工具原本列舉最多 100 個帳號，被安全檢查拒絕，未執行。新增 `--authorized-four`，只以固定四個授權帳號 getAll，不列舉其他帳號；縮小範圍後執行成功，寫入 0。
- 四帳號通知查詢與 envelope 計數一致：Daniel Owner 330/330、Catherine Owner 324/324、AA scheduler 301/321（20 筆歷史其他角色排除）、張毅 teacher 320/320。這是索引／格式檢查，不是以 Admin 查詢冒充瀏覽器授權測試。
- 直接在 Google 帳號選擇頁選張毅；第一次返回顯示連線逾時，另次 handler 回覆 `The requested action is invalid`。使用者回報登入後，回到不帶強制 redirect 的原網站頁面，實際成功載入老師端；不把中途失敗記為通過，也不宣稱根因已修復。
- 張毅實際畫面：只有我的總覽、我的請假、我的課表、課程回報。9 月 15 堂、8.5 hr，課表與回報表列出同一 staging 授課老師課程；302 筆未讀課表通知正常載入。點「稍後查看」保留既有未讀狀態，未提交回報、未變更課程、未更改權限。
- 完成上述張毅唯讀檢查後已登出；切換下一帳號的 popup 未出現可操作視窗，已切回既有整頁登入流程。Daniel/Catherine 本輪瀏覽器尚待驗收；不能把四帳號後台格式檢查稱為四帳號實際功能全通過。
- 隨後已直接在 Google 帳號選擇頁點 Catherine；返回網站仍顯示登入初始化逾時。使用者要求再開：舊 tab 5 不在 session，清單為空，重開可見 tab 6 並保留。使用者再次回報已登入後，實際 DOM 仍顯示逾時；該分頁 2026-09-12T12:11:08.721Z 記錄 network error，12:11:48.506Z 記錄 `Unable to verify that the app domain is authorized`。這是網域驗證請求失敗的證據，不足以判定 authorizedDomains 設定缺漏或 Catherine 權限不足。未修改 Auth、IAM、Rules，未清除使用者資料。Catherine 及 Daniel 本輪實際登入驗收仍未完成。
- 最新更新取代 Catherine 待登入狀態：使用者再次登入後，tab 7 實際顯示「老闆｜Catherine」及 302 則未讀通知；點「稍後查看」未標記已讀。總覽全校區 15 堂，實際選美術 8 堂、河西 7 堂，再恢復全校區。9 月財務 8.5 hr → 10 月 0.5 hr；切到薪資/KPI 仍為 10 月 1 堂、0.5 hr；恢復 9 月後為 15 堂、8.5 hr，河西 4 hr＋美術 4.5 hr。僅操作篩選與查看，業務寫入 0。費率為零，未用此結果宣稱非零薪资/收費公式全部重驗通過。登入先前間歇性逾時根因仍未確認；Daniel 本輪仍待實際登入核對。
- 最新 Daniel 更新：tab 8 起初仍顯示連線逾時，保留分頁等待，使用者再次回報登入後實際顯示「老闆｜Daniel」，219 則未讀通知。已點稍後查看、保留未讀；全校區 15 堂 → 美術 8 堂 → 河西 7 堂 → 全部校區。9 月財務 8.5 hr → 10 月 0.5 hr → 恢復 9 月；薪資/KPI 15 堂、8.5 hr，河西 4 hr＋美術 4.5 hr，與 Catherine 結果一致。僅查看及篩選，未操作學生/課程/薪資寫入；保留 Daniel staging 工作階段，不再登出。
- 四個授權帳號均已有本輪實際登入/角色/既有通知呈現的證據；AA 額外完成臨時主管 scope 及合成通知已讀回寫實測且完全恢復。這不代表四帳號所有寫入功能、每筆歷史通知內容、跨帳號即時新通知或非零財務公式全部重驗完成。正式仍 20.26.317，尚未發布本輪候選。

## 最新補充：Daniel 新通知完整回寫及清理

- staging 固定合成通知 `acceptance318_daniel_ack_20260912` 僅寄給 Daniel，沒有建立課程／學生。實際頁面未讀數 219 → 220，顯示合成標題；只對該筆按「知道了」。獨立雲端讀回 `read=true`。工具只核對 `readAt` 欄位且該欄位不存在，不宣稱已讀時間戳已驗證。
- 重新載入後仍為 Daniel Owner，未讀數回到 219，合成通知未再出現；對隨後顯示的舊提醒按「稍後查看」，未更動既有通知已讀狀態。
- 已執行固定 ID 清理工具，刪除前逐欄比對不可變合成 payload，雲端讀回 `exists=false`、業務寫入 0。刪除的是一筆可由保留工具重建的測試通知，未清除歷史通知。
- 最終完整回歸：1376 項，1367 通過、0 失敗、9 略過，exit 0；`/private/tmp/danbridge-318-final-acceptance-regression.log`。略過項目不計通過。
- 本輪原生 staging 通知規則 42 checks 與健康快照測試通過，2 tests／0 failed／0 skipped；`/private/tmp/danbridge-318-final-native-acceptance.log`。日誌中的 PERMISSION_DENIED 是預期禁止寫入測項，不是允許路徑失敗。
- 正式仍 20.26.317；此補充沒有部署、推送或修改正式資料。

## 最後一輪擴充回歸與發布門檻

- 桌面 Chromium／WebKit：58 cases，57 passed、1 skipped、0 failed；覆蓋非零家庭帳單、同名孩子與不同家長、手足、團班、安親、跨年月份、重複付款去重、LINE 可編輯預覽／複製、薪資月份，以及通知不中斷操作。唯一略過為 WebKit clipboard-read/write 權限測項；Chromium 實際剪貼簿測項通過。日誌 `/private/tmp/danbridge-318-finance-roles-browser-final.log`。
- 平板／手機尺寸：iPad WebKit、mobile WebKit、Android Chromium 的 18 cases 全通過；這是瀏覽器裝置模擬，不是 3 台實體裝置驗收。日誌 `/private/tmp/danbridge-318-mobile-finance-final.log`。
- 原生 Firestore 模擬器＋Chromium／WebKit：3 tests 全通過，包含 40 堂多選、三次立即批次改時、第一筆收據刻意延遲、立即刪除與再次新增，接收端最終資料正確，通知和收據同次提交。此為合成身分及本機資料庫，不作真實雲端延遲證據。日誌 `/private/tmp/danbridge-318-published-native-final.log`。
- 正式依賴及完整開發依賴 audit 均 clean，未安裝或變更套件。日誌 `/private/tmp/danbridge-318-dependency-final.log`。
- 目前沒有尚待清除的本輪合成通知或 AA 臨時角色。正式仍 317，318 Functions 尚未部署，沒有以本機通過取代雲端發布驗證。
- 正式切換仍須：確認非 Owner 使用者舊正式分頁已存妥並可重開；新版前端先發布後，再切通知 Rules 並讀回雜湊；檢查新查詢真實接收及已讀。不得先切 Rules 使舊 email-only 訂閱失效，也不得強制刷新有未存表單的分頁。
- 前景 published reader 的正式同構 staging 雲端驗證及容量健康 Functions 發布讀回仍需補齊。容量遷移、Google 帳號 MFA／付費帳務、完整還原 UI 是獨立未完成工作，不因本輪回歸通過而改標完成。

## 已讀 API 同步補強（尚待雲端發布後驗收）

- 追查確認：兩個既有通知已讀 callable 只檢查 recipientEmail，沒有交易內讀取最新 companyAccess。新增 `production-notification-acknowledge.cjs`，staging／production／隔離工作區共用；每次交易重新核對 active、companyId、角色、teacherId／完整 branchIds，再驗證全批後更新。只改已讀授權，不改課程、計費或通知建立方式。
- 7 項新測試涵蓋四角色正常／重複已讀、撤權／錯公司／缺 profile、舊老師／舊角色／跨校區／他人通知及整批拒絕；搭配通知 policy 共 12 項通過。入口合約測試已改為核對共用 helper；另修正未納入原全測的舊 PWA cache-name 斷言，保留「不可自動 skipWaiting」安全斷言。
- 原生已讀測試第一次的競態設計在交易鎖內等待另一筆同文件寫入，測試本身形成等待並逾時，已中止，不算通過。改以撤權提交後再呼叫 API 驗證；原生四角色、整批原子拒絕與撤權測試通過，`/private/tmp/danbridge-318-ack-native-r2.log`。不宣稱該次未完成的並行競態測項通過。
- 既有隔離工作區唯讀前置檢查：124 堂、revision 4593，完整 lesson hash `record-v1:0d47c04eb61d9c924d88003608bbc58de9235a0b110b5e5f0845c75bbaceb8c5`，權威及 teacher／scheduler chunk 投影一致；未修改既有基準課程。
- 兩個 staging 函式已成功部署並獨立讀回 ACTIVE：`stagingacknowledgeschedulenotification-00003-jad`、`stagingpublishedworkspaceoperation-00037-dub`；服務帳號保持原 `danbridge-staging-v2`。下載各自來源 generation 封包後，比對 index、共用已讀 helper、workspace、read-scope、notification-policy 五個檔案 SHA256 與已測本機相同。
- 新後端部署後再建立同一固定 Daniel 合成通知，實際頁面收到並按「知道了」；雲端 `read=true`、`acknowledgedAt` 有效、`acknowledgedBy` 存在。隨後精確清理並讀回 `exists=false`，業務寫入 0。
- 改動後全測 1383 項，1374 通過、0 失敗、9 略過；`/private/tmp/danbridge-318-after-ack-regression.log`。隔離工作區原生測試 8 通過、0 失敗、0 略過；`/private/tmp/danbridge-318-workspace-native-after-ack.log`。
- 真實雲端 published 工作區新分頁使用獨立 Firebase app 身分，沒有沿用一般 staging 的 Daniel 工作階段。實際點登入後 popup 沒有出現可操作視窗，改既有 redirect 流程後 handler 回覆 `The requested action is invalid`。原一般 staging Daniel 分頁仍正常，未登出或清除。這個隔離工作區登入未完成，不作前景雲端驗收證據；未繞過 App Check／驗證、未複製權杖。
- 後續為驗收新版已讀 API 的 AA 路徑，已正常登出一般 staging Daniel 並按既有整頁登入。`firebaseapp.com` 同樣回覆 `The requested action is invalid`；改用已設定的 `staging.web.app` 正常入口後，直接回覆 `Firebase: Error (auth/network-request-failed)`，未到 Google 帳號選擇頁。這不是缺少使用者授權；本輪 AA／Catherine／張毅新後端已讀實测尚未完成。沒有建立這三位的新合成通知，沒有待清理資料；目前 tab 8 留在 web.app 登入卡。
- 正式仍 20.26.317；不能把此登入失敗當成已通過而直接發布 318。已保存可重現測試、部署 revision、來源 SHA 與清理證據，待登入／網路恢復後從這裡接續，不重跑已完成帳單等唯讀操作。
- 後續 tab 13 曾成功到 Google 帳號選擇頁；使用者選 AA 後回到 web.app 未登入卡，當頁 error/warn 空白。改用與 authDomain 一致的 firebaseapp.com 入口執行正常登入，handler 顯示 `The requested action is invalid`，console 明確為 `Unable to verify that the app domain is authorized`。再次唯讀請求 SDK 公開 projects 設定：CLI HTTP 200 且兩個 staging 網域均在 authorizedDomains；同一 URL 經內建瀏覽器新 tab 14 開啟，明確 `net::ERR_BLOCKED_BY_CLIENT`。確認瀏覽器端請求遭阻擋，但尚未確定是哪一層客戶端設定造成；沒有變更 Auth／IAM／Rules、沒有繞過封鎖，AA 本次登入未通過。
- 2026-09-12 21:18 Asia/Taipei：使用者提供 Safari AA 截圖；原分頁實際為 production `compatible-release-20.26.317`，未修改或登出。以 Safari 原生 UI 新開獨立 staging firebaseapp.com 分頁，接受該新頁既有更新提示後成功載入排課專員與 216 則通知。原通知按「稍後查看」保留未讀。建立 AA 精確合成通知 `acceptance318_aa_ack_20260912` 後，頁面即出現「318 aa 通知回寫驗收」，未讀增為 217；實際按「知道了」，獨立雲端讀回 read=true、acknowledgedAt/acknowledgedBy 均存在。精確清理後 exists=false，業務寫入 0。此為 Safari 真實 AA 新版已讀後端驗收通過，不代表其餘帳號或整版已發布。
- 2026-09-12 21:24 Asia/Taipei：Safari staging 直接選已授權 Catherine Google 帳號登入，實際畫面 Owner｜Catherine、全部管理選單、原未讀 302。固定 `acceptance318_catherine_ack_20260912` 合成通知即時出現，未讀 303；實際按「知道了」，CLI 獨立讀回 read=true 且 acknowledgedAt/acknowledgedBy 存在。精確清理 exists=false、未讀回 302，業務寫入 0。正式 Safari AA 分頁未動。
- 2026-09-12 21:27 Asia/Taipei：Safari 直接選已授權張毅 Google 帳號登入 staging，老師僅顯示我的總覽／請假／課表／回報。首次資料確認超過 20 秒安全唯讀提示，隨後正常載入 15 堂／8.5 小時；不把這次冷啟動當成即時速度達標。老師固定通知 `acceptance318_teacher_ack_20260912` 收到並實際按知道了，獨立讀回 read=true、acknowledgedAt/acknowledgedBy 存在；精確清理 exists=false。既有 302 未讀保留，業務寫入 0。至此新部署已讀後端的 Daniel／AA／Catherine／張毅四帳號正常接收、已讀回寫均有真實瀏覽器證據，與 emulator 權限拒絕證據分別記錄。
- 2026-09-12 Safari 真實隔離 published 工作區：Daniel 與張毅分別以 named Firebase app 登入，同時保留兩分頁，均顯示 20.26.318 隔離驗收標籤。測前 revision4593、124 堂，lessonRecordsHash=`record-v1:0d47c04eb61d9c924d88003608bbc58de9235a0b110b5e5f0845c75bbaceb8c5`。Daniel 以正常新增課程 UI 建立唯一 `318-SAFARI-前景同步-0912`（既有合成學生，2026-09-12 16:00–17:00，張毅隔離老師，無衝堂）；切回老師分頁顯示課名、17堂/11小時→18堂/12小時，收到新增通知並按知道了。Daniel 正常復原剛才新增操作，老師分頁隨後恢復17堂/11小時並收到取消通知，亦按知道了。獨立雲端前後核對124堂完整lessonRecordsHash不變，revision4597；teacher100parts、scheduler331parts均與權威投影相同且release318。最終獨立讀回老師新增/取消兩通知read=true。證據 `/private/tmp/danbridge-318-safari-workspace-before.json`、`-after.json`、`-final.json`。新增的測試課已經正常復原移除；系統必要的隔離稽核/刪除標記保留，沒有直接清空同步歷程或修改正式資料。工具操作間隔不是延遲量測，未宣稱2.5秒或人工模擬斷線已驗收。
