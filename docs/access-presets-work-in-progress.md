# 權限套裝驗收進度（未發布）

## 342 通知隱私與老師恢復提示（2026-09-18，進行中）

- 實際讀回正式 Rules SHA `f76e51ec1eb6508d191244ad0c25775909c2d3644f2f571e00c041e7cf01b619`、staging `b5f1278ece549e34a0b5914518cc5706d3cb6ccc5e4ceb456abea927226a69ed`：branch 通知只有角色／校區限制，未區分 hideFinancials。正式 Lucas 126 則同校區通知，27 則含備註等自由文字；不表示每則都有費用，但新隱私權限必須隔離。正式 AA 仍 teacher/scheduler，尚未切換。
- 新增 schedule-only-v1 隱私標記、受限角色查詢／後端已讀條件、三條通知產生路徑標記與校驗；原通知投遞證明也綁定隱私標記，舊證明不能取代新隱私通知。舊通知由白名單重建，保留已讀與時間，不拷貝摘要／備註自由文字。
- 精確 staging Rules 最小修正已在本機 emulator 通過，包含直接 ID、寬查詢、自改標記拒絕，以及所有前端角色讀不到遷移備份。artifact `/private/tmp/danbridge-notification-privacy-IYDF2l`，候選 SHA `a482c1c540a32d925a2cb39bd727b8d30db1aa586d416ed6f79ca47f8de8274a`。尚不可當作正式已部署。
- staging AA 兩則衍生歷史通知已重建，內容指紋 `05f66f0900dcdfe7e693eac9a999dd47243af46cb232b5ab048b59177d20f5aa`，課程／權限 0 寫入；原始備份保留於 Admin-only notificationPrivacyMigrationBackups。正式未遷移。
- 張毅 Safari 再次確認登入；通知317→316已讀成功；更新341後今日課堂回報可由受保護後端讀回開啟，未提交或改寫既有課程。重載曾出現 App Check fetch-network-error 與回報連線提示；近期後端 Auth/AppCheck VALID，OPTIONS204，不能因此宣稱歷史401/403根因已解。
- 找到回報批次重試成功後舊紅色提示未清的 UX 缺陷；只在整批核對成功後清掉同類回報錯誤，不蓋過其他寫入失敗。39項老師回報／恢復專項通過。通知隱私24項通過，完整 npm test 通過（skip仍不當通過）。
- 342 staging Hosting／三個通知相關後端部署完成；staging通知規則已部署且讀回SHA一致（ruleset b45c6200-364d-4372-9382-d8ade06b688c）。四帳號真實索引預檢通過，但Admin查詢不等於實機通過。跨裝置唯讀／移課／請假排版32項通過。
- 正式補丁artifact `/private/tmp/danbridge-notification-privacy-sP47MY`，候選SHA `fe2f7b178b413b36c3ca0a420abc7c7d08575d9fc8383ccb545bf98a17a592e8`，本機emulator通過。正式126筆通知dry-run計畫指紋 `e50ef2c5cbc95428b220d156f29d30b9f7b0940c0c69f20d7e7ff34b0f16803a`，未套用，套用前必須重新預檢避免已讀狀態漂移。
- 本輪新增 staging `AUDIT342-PRIVACY-20260918`，lessonId `lsn_5d57a78d-431b-414a-af15-8e61b1fa9394`，2026-09-18 16:00–16:30，既有STAGING_SHADOW_STUDENT／STAGING_SHADOW_TEACHER、美術東四路。Daniel原生Safari保存，畫面可見；雲端4份added通知皆建立，Owner可見合成canary備註、AA與張毅均無canary；AA通知privacyScope正確。4份新通知目前未讀，尚待實際四帳號回寫與測試課清理。證據 `/tmp/danbridge-342-live-notifications.json`。不得誤刪其他STAGING_SHADOW課程。
- 私密Safari於切回Daniel後再次自動鎖定，已請用戶TouchID解鎖（不用Google重登），目前沒有回覆第二次解鎖。不要重複登入或繞過裝置鎖。正式仍332，main仍1d98af1，未提交／推送本輪修改。不得提早正式發布。

## 341 唯讀回報邊界補強（正式未發布）

- 正式發布前檢查發現 lesson-report-runtime 雖拒絕別人的課，但 branch_manager 綁到本人時未檢查 readOnly／canSubmitOwnReports；補前後端拒絕唯讀角色提交（包含已撤權後重播 receipt）。Owner 與一般可回報老師保持原行為。
- branch_schedule 安全預設 canSubmitOwnReports 改 false；舊 readOnly:true profile 即使仍 true，也被後端拒絕。管理者清單文案同步顯示「課表唯讀」，不再錯稱可回報本人課程。
- 專項39通過0跳過；全 npm test、權限27、跨裝置24通過。stagingSaveLessonReport341已部署。正式端點／Hosting尚未部署，正式AA/Lucas隱私配置尚未切換。
- 正常 Safari 第8分頁正式 firebaseapp.com 已經由Google帳號選單登入Daniel；第7分頁正式web.app是原AA排課專員，未改動其配置。私密Safari兩分頁仍是stagingAA與張毅。不要把正式登入成功誤認成正式發布完成。

## 339／340 張毅請假實測續驗

- 張毅私密 Safari 已登入，338 通知 315→314 寫回成功；九月課表 15 堂可見，9/4 非當天回報欄位禁用，未冒稱可提交。
- 發現普通 staging 請假前端原本只接 production，儲存被拒絕且沒有写入。339 加獨立 stagingTeacherLeaveOperation，保留 App Check、重放與角色檢查，專案／權威教師路徑鎖 staging；正式端點與 Rules 未部署／未變。
- staging 339 原生 Firestore 模擬器 10 通過、0 失敗、0 跳過；npm test 最終退出 0，權限 27 通過，跨裝置唯讀 16 通過。
- Safari 張毅 339 新增 2026-09-18 09:00–10:00 事假成功，讀回 1 小時 v1，通知 314→315。首次 AX setValue 備註未輸入成功，因此 v1 備註空白；真正點擊輸入後更新為 STAGING_AUDIT339_TEACHER_LEAVE_20260918，v2 讀回一致，通知 315→316。此為 staging 合成測試，非正式請假。
- 339 更新後 bootstrap 超過 20 秒安全唯讀，之後自動恢復；不宣稱延遲根因確定。
- 長備註造成取消欄超出可見區。340 加固定表格欄寬、長字換行；本機 Chromium/WebKit 八種裝置編輯／取消可達性 8 通過。取消該筆測試請假與重開讀回待續驗，不可漏清理。
- 正式仍 332，不可把 staging 339/340 當成正式上線。
- 340 Safari 長備註與操作欄均可見；同一筆 v2 重開讀回一致，原生按鈕取消成功後有效紀錄 0、時數 0，切「已取消」讀到 v3 與同一備註，僅供查閱。已沒有本輪有效測試請假，staging 取消稽核紀錄保留。
- AA 保留分頁未讀仍 0，無請假／財務入口；此次老師請假沒有把 HR 通知派給已改成校區管理者的 AA。Daniel 原有分頁收到三筆本輪請假通知，239→238 已讀確認成功（取消通知）。未把舊分頁接收當成340全部UI驗證。
- Catherine 本輪三筆通知已收到，321→320 成功回寫取消通知已讀；關閉其通知 modal 後可正常接受340更新（開著modal時更新防護正常拒絕）。340 Catherine 保留 Owner 身份，請假篩選「全部老師／已取消」讀到相同 v3 與備註、有效時數0；一般老師下拉鎖本人、Owner下拉可選。
- 340 `npm test` 退出0；published native transport/Rules 本機模擬器3通過、0失敗、0跳過。40筆數據僅為本機合成，不能充當正式雲端速度保證。
- 補充正式 Owner 原子權限發布模擬器：新增 AA/Lucas exact privacy payload、revision 3、manifest/sourceHash、重放不改版本、stale revision 拒絕、無舊 scopedDb（published-only）檢查，兩種 legacy 相容模式均通過；整套6通過0跳過。日誌 `/tmp/danbridge-340-owner-privacy.log`。
- 正式唯讀預檢：新開正式 web.app 分頁已有 AA 排課專員登入，尚未改正式 AA。另開正式 firebaseapp.com 供 Daniel Owner 登入，保留所有 staging 分頁，尚未執行正式配置寫入。

## 最新：338 學生歷程財務遮罩

### AA 私密 Safari 實機（使用者完成 Touch ID 後）

- 已確認 AA 校區管理者身分；學生表頭為「課程」，實際點擊學生歷程後課程行沒有「已繳／未繳」。
- 重新載入仍保留 AA；但本次資料 bootstrap 超過 20 秒進入安全唯讀，之後自動恢復。只讀診斷為 `cloudBootstrapState: ready`，App Check rejection evidence 為 null。不能聲稱載入延遲根因確定，也不能把沒有 observer 紀錄當成所有網路請求零錯誤。
- 恢復後河西 9/23 19:05–19:35 課程可開唯讀抽屜：教師、時間、地點可見；只有關閉，沒有費用、回報或編輯入口。老師下拉已實際選取 STAGING_SHADOW_TEACHER，兩校區課程仍可見。
- 本輪沒有新增／刪除正式資料，未發 production。

- Safari AA 點學生歷程實測發現，已剝除 paymentStatus 的資料仍被 UI 顯示成「未繳」；不是雲端金額外洩，但屬錯誤且不應出現的財務訊息。
- 338 對 hideFinancials 隱藏歷程的已繳／未繳文字，學生表頭改「課程」，每次 render 同步角色欄名，Owner 原有繳費呈現保留。
- 新增 VM 測試及 Chromium/WebKit 實際點擊歷程檢查。首輪新斷言抓到角色切換後欄名仍舊，修正後 16 項全通過；權限專項 27 通過；最終 npm test 退出 0。
- 338 已部署 staging Hosting，正式 332 未變。338 AA Safari 新版實機回測與正式配置／發布尚未完成。
- 新開 Safari 私密視窗供隔離登入；原六個分頁保留。過程誤建的單一空白群組已移除，未刪既有使用者分頁或資料。
- 私密視窗 `E4700A77-E18E-49C2-BBCF-F41F1154F2BD` 載入 staging 根網址，Google popup `0C85B755-C835-4780-B42B-CA587E3CEB3C` 已輸入 AA。系統要求 AA 通行密鑰 Touch ID；已請使用者本人完成，尚未通過 338 AA 重載實機驗收。沒有代按／繞過生物驗證。

日誌：`/tmp/danbridge-338-unit-final.log`、`/tmp/danbridge-338-access.log`、`/tmp/danbridge-338-browser-final.log`、`/tmp/danbridge-338-staging-hosting.log`。

## 最新：337 候選與 2026-09-18 四帳號续驗

### Safari 續驗讀回

- Daniel 337 的兩筆本輪新增／取消通知確認後，未讀數 238→236；沒有將舊老師 modal 的 400 算作通過。
- 張毅仍開啟的老師分頁，本輪新增／取消通知各確認一次，317→316→315；這個分頁尚未更新 337，不能冒稱新版教師全驗收。
- Catherine 現有分頁確認一筆歷史課表通知，319→318；未登出。
- 更新原老師分頁 1 後，它讀回 Daniel 登入，而其他仍開啟的老師分頁保留 STAGE。源碼一般登入使用 browserLocalPersistence；同網域分頁不應當作獨立、可重整的四帳號環境。已停止重整其餘角色分頁，避免破壞現有驗收登入。需獨立瀏覽器設定檔或明確隔離的驗收環境完成新版四角色重載案例。
- 正式仍未發布，沒有更動正式業務資料。

- 正式仍 332；本輪 337 只部署 staging Hosting，未提交／推送，尚不可宣稱全部驗收完成。
- Catherine 已登入 Owner。建立唯一 `AUDIT336-ROLE-SYNC-20260918` 測試課（9/18 16:00–16:30），AA 收到並可用課名搜尋、唯讀查看；實際拖到翌日後日期未變，詳情沒有編輯／回報／費用入口。
- Catherine 使用正常「復原」撤回該測試新增；AA 收到取消通知，該課不再出現在今日課表。本輪沒有新增學生、沒有更動正式資料；此撤回可由原頁重做。
- AA 首次新增通知確認成功。取消通知第一次提交後緊接頁面重整，出現 App Check 類驗證失敗；未捕獲 HTTP 401/403，不能冒稱是同一根因。保持頁面不重整重測，已讀由 1 降為 0；之後重新載入仍為 0。
- Safari 四身份可見：分頁 1/4/5 為張毅對應 STAGE；2 Catherine；3 AA；6 Daniel。沒有主動登出任何帳號。
- Daniel 確認取消通知實測失敗，HTTP 400「只能確認寄給自己的通知」。只讀核對 DOM notice ID `sv2_f36e4a52076a1d823b58382d84e447f0d4f7c1992ea0682b`：雲端收件人是張毅帳號而非頁面顯示 Daniel。發現切換身份後舊通知 modal 未清理，後端正確拒絕跨帳號已讀。
- 337 補上 auth 變更／訂閱重建時清除舊 modal、收件人綁定、點確認時核對 UI/Auth/notification UID 與 email、token 取得前後核對期待身份；不放寬後端檢查。
- staging profile-only 套裝範圍變更現在在同一交易讀取目前 profile 後 fail closed；涉及投影範圍的切換必須經安全重建，而不是先改 profile 讓舊衍生紀錄仍可讀。顯示名稱、移課開關、停用不受影響。通用 staging 重建尚未做成 UI 自動流程，不能稱全套切換完成。
- 最新回歸 `npm test` 退出 0；權限專項 26 通過；App Check／通知專項 46 通過；通知訂閱範圍 4 通過；跨裝置 Chromium/WebKit 16 通過。
- 337 發布後的四帳號真實通知驗收、正式 AA/Lucas 配置切換及正式發布後驗收仍須完成。

日誌：`/tmp/danbridge-337-final-unit.log`、`/tmp/danbridge-337-access.log`、`/tmp/danbridge-337-ack.log`、`/tmp/danbridge-337-browser.log`、`/tmp/danbridge-337-staging-hosting.log`。

## 2026-09-18 Safari 實機續驗與 335 修補

- Daniel 已重新登入，Owner 全部功能入口可見；一筆課表通知由 237 減為 236，重新載入仍為 236。
- Owner 安全設定確認老師 STAGE 綁定張毅的授權帳號；Google 選擇器也核對到相同帳號。此前 STAGE 的已讀 316→315 可歸入張毅案例，但不是所有老師功能完成。
- AA 更新後重新載入登入保留；通知中心的「未收款」「老師時數」分類已不顯示；兩校區課表與唯讀功能入口核對。
- 實機新發現：AA 點河西課程誤進回報服務，遭伺服器正確拒絕，但造成「沒有這堂課的回報權限」錯誤。新增唯讀課程抽屜路由，財務 helper 不執行、收費／薪資／編輯入口不顯示；教師及 Owner 原路由保留。
- 此修補已部署 staging 20.26.335，新增 2 項 VM 回歸通過，跨裝置 16 項瀏覽器測試通過。Safari 335 點課程重測仍待完成。
- Catherine Google 登入要求 Touch ID；已請使用者在 Safari 完成，尚不能算登入或角色驗收通過。
- 隨後 Safari 再次讀取回報 Mac 已鎖定，無法自動解鎖；需使用者手動解鎖，再完成 Catherine 的 Touch ID。
- 335 完整 npm test 最終退出碼 0；曾遇版本斷言仍指向 334、PWA 快取名稱契約未更新，已依 335 實際版本更新測試契約後重跑，沒有放寬安全行為斷言。
- 正式仍 332，未提交／推送本輪變更。正式 AA 未改。本輪沒有新增或刪除業務課程。
- 後續必須核對權限套裝在 staging 的既有角色切換流程，避免舊衍生紀錄仍可讀；AA 已用停用→重建→核對→啟用的專用流程完成，不代表通用切換已驗收。

日誌：`/tmp/danbridge-335-staging-hosting.log`、`/tmp/danbridge-335-browser.log`、`/tmp/danbridge-335-unit.log`。

### 續驗：同帳號舊分塊撤權

- 新增模擬器案例：管理校區及帳號不變，原子發布財務禁止的新 manifest 後，舊分塊 get 被拒，新分塊可讀；隨後更換管理校區，原 scope 新分塊亦被拒。
- `test:published-native-ui` 3 通過、0 失敗、0 跳過，包含 Chromium/WebKit 合成帳號 40 筆操作與規則案例。這是本機模擬器，不是四帳號實際雲端延遲證明。
- 權限專項重跑 24 通過。未更動正式網站或正式權限。
- Catherine 通行密鑰確認出現 Google「發生問題」，已點再試一次，保留正常身分確認頁；另外切回 AA staging 繼續驗收，沒有關閉 Google 驗證視窗。

日誌：`/tmp/danbridge-335-rules-privacy.log`、`/tmp/danbridge-335-access-final.log`。

### 336：保留老師綁定的唯讀角色

- Safari 335 AA 河西課程仍觸發回報錯誤，不能算修復通過：AA 的 teacherId 與該堂課教師相同，原先 only-not-teacher 分支不會生效。
- 改為 hideFinancials 的 branch_manager 點課程及通知回報捷徑都走唯讀詳情；抽屜回報按鈕亦固定隱藏。一般 teacher／Owner 分支不改。
- 新增雙狀態教師綁定回歸與通知捷徑測試，權限專項 25 通過；完整 npm test 最終退出碼 0。
- staging Hosting 336 部署成功，正式 332 未動。AA 336 實機重測進行中。
- Safari AA 更新 336 後，點 9/23 河西課程已成功開啟唯讀詳情，顯示學生／教師／日期時間／河西教室，只有關閉按鈕，無費用／薪資／回報／編輯入口。認證模組公開檔案 SHA-256 與本機一致。
- 拖曳拒絕實測時前景跳回 Catherine Google 驗證視窗，這次拖曳不算通過，仍須重測。Catherine 的通行密鑰尚未完成，未做正式切換。

日誌：`/tmp/danbridge-336-access.log`、`/tmp/danbridge-336-unit.log`、`/tmp/danbridge-336-staging-hosting.log`。

## 2026-09-18 接續實作（正式未發布）

- staging 後端 `stagingV2AuthoritySave`、`stagingSchedulerOperation` 已更新；Hosting 候選目前 20.26.334。
- staging AA 去財務角色副本已安全重建：1,137 舊衍生記錄替換為 267 筆；263 堂課，業務寫入 0；主權限及角色 control 讀回一致。
- AA 舊 branchViews／teacherViews 均不存在；companyAccess 無 scopedDb 或費用欄位；遷移 audit 為 active。
- Safari AA 真實操作通過老師選單、河西一路課表顯示、學生清單、老師無薪資清單、課程紀錄無費用欄位。
- Safari firebaseapp 網域現有老師 STAGE 可載入本人課表；按一筆通知「知道了」後通知由 316 減為 315。尚未以可見身份核實該 Google 帳號就是張毅，不冒稱完成張毅驗收。
- 新抓到通知分類仍有未收款入口，已修正內容過濾與 CSS；此補丁跨裝置16項通過，已發布 staging334。
- 候選333全跨裝置24項通過；主回歸1,520通過、0失敗、10跳過；新增權限專項22項通過。
- 目前繼續用 Safari 登入下一帳號；IAB 登入 auth/network-request-failed，沒有視為驗收成功。
- 尚缺四帳號完整實機矩陣、所有細分開關與正式切換；以下早期進度保留供比較。

## 本輪範圍

- Lucas 與 AA 最終配置相同：兩校區所有老師課表可查看；管理校區維持美術東四路；財務禁止；移課預設關閉。
- 正式 AA 也須跟隨此配置（本輪最新授權），不再限定 staging AA。
- 管理者可開啟移課入口；啟用後仍僅允許管理校區內移課。
- 歸屬校區營收邏輯不因課表可見範圍增加而改變。

## 已有本機證據

- 主回歸：1,520 通過、0 失敗、10 跳過；跳過不等於通過。
- 套裝、防止舊客戶端清掉新權限、通知遮罩、移課資料保留：18 通過。
- 瀏覽器跨裝置：23 通過、1 初始化 execution-context 失敗；桌面移課另重跑三次通過，但初次失敗根因未確認。
- `git diff --check` 通過。
- 新套裝模組已接入新建校區管理者的安全預設；既有管理者權限不自動改動。
- 權限稽核 afterHash 改為有效寫入 payload，包含為舊客戶端保留的隱私欄位。

## 仍不能稱完成

- 所有獨立權限開關及管理介面尚未完成；目前只有現有角色預設與移課開關，不能宣稱每項功能都可獨立配置。
- 四個真實帳號對新版的允許／拒絕／舊分頁撤權案例尚未完成。
- staging 新版後端部署、AA 舊衍生副本安全重建尚待完成。
- production Lucas／AA 隱私配置切換、發布後驗收尚待完成。
- 本輪沒有正式發布、沒有修改正式 AA；不能以本機測試替代上述驗收。

日誌：`/tmp/danbridge-permission-final-unit.log`、`/tmp/danbridge-access-suite.log`、`/tmp/danbridge-aa-final-browser.log`、`/tmp/danbridge-desktop-move-repeat.log`。
