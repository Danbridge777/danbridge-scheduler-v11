# Changelog

## 2026-08-11 — 移除輸入框提示字

- 全站輸入框與文字區域不再顯示重複用途、範例或「請輸入」等提示字，保留正式欄位名稱、錯誤訊息與權限警告。
- 動態建立的搜尋框、營隊欄位、帳號欄位與課堂回報欄位套用相同規則，同時保留無障礙名稱。

## 2026-08-11 — 今天與未來複製課程的回報隔離

- 所有週複製、月複製、選取複製與貼上建立的新課，持續移除來源課程的回報內容、狀態、回報人、時間與補課關聯。
- 新副本記錄獨立回報生命週期；老師端今天或未來的副本只接受建立副本後新送出的回報，較早的雲端回報不得套入。
- 老師與校區管理者檢視額外清除修正前已存在的未來舊回報；未來課一律未回報，今天只接受今天實際送出的新回報。
- 新增來源回報欄位、雲端舊回報、全複製入口與新回報可正常儲存的回歸檢查。

## 2026-08-11 — Safari 月曆課程單點編輯

- 修正 Safari 在尚未拖曳時就把指標事件鎖到整個月曆，導致藍色課程卡的單點編輯事件被改送到背景。
- 指標鎖定改為只有移動超過拖曳距離後才啟用，保留原有單堂拖曳、多選拖曳與框選操作。
- 新增事件順序回歸檢查，防止後續再次於單點階段過早啟用指標鎖定。

## 2026-08-11 — 月曆藍色課程卡直接編輯

- 老闆端月曆中的藍色課程卡新增直接點擊入口，點卡片任一位置都以該堂原始課程 ID 開啟完整編輯表單。
- 直接入口與既有拖曳／多選事件分離，既有週課表、複製、權限、薪資與課堂回報邏輯均不變。
- 新增精確課程 ID 回歸檢查，防止後續事件控制器載入順序使月曆卡片失去編輯入口。

## 2026-08-11 — 老闆課程編輯與老師課表付款資訊隔離

- 正式站逐一驗證老闆端月課表、週課表、卡片內文字與課程紀錄，單點均帶入原課程 ID 並開啟完整可編輯表單。
- 老師課表卡不再把已從權限資料移除的付款欄位誤判為「未繳」，已繳、未繳與免收均不顯示。
- 老師課程回報清單同步隱藏付款標籤；老闆端仍保留付款資訊與完整課程編輯權限。
- 新增老師／老闆卡片差異及老闆表單不得鎖欄位的回歸檢查。

## 2026-08-11 — 課程複製建立全新回報與老師當週課表

- 框選貼上、整週複製、選取複製到下月與整月複製統一建立全新課程 ID，不再攜帶原課堂回報、回報人、回報時間、完成狀態或補課關聯。
- 新副本保留學生、時間與正常排課設定，狀態重設為未上課、付款重設為未繳，並與原重複系列解除關聯。
- 老闆或校區管理者在課表選擇老師時，自動切換到今天所在週；老師登入後也只先顯示當週週一至週日，仍可自行前後切週。
- 新增舊回報、補課代碼、剪貼簿、週複製、月複製與重新登入的回歸檢查。

## 2026-08-10 — 課表薪資公式版本與大量資料驗收

- 老師薪資結果與新建立的月結快照記錄 `teacher-payroll-v1-formal-timetable`，讓內部觀察期的薪資結果可對應公式版本。
- 新增閏年二月、跨月份、固定薪不足扣款與 100 位老師／3,100 堂正式課表的大量計算驗收。
- 大量驗收包含重複老師 ID 去重，確保共同授課資料不會因重複關聯而重複計薪。
- 老師首頁時數改用與薪資相同的正式課表公式，並分開顯示課表時數、計薪時數、正式課堂數與回報進度。
- 校區管理者首頁統計改為授權校區的學生、老師、正式課、課表時數與待補課，新增課表、課程紀錄、補課及校區財務只讀快捷入口。

## 2026-08-10 — 桌面、iPad、手機操作外觀整理

- iPad 導覽依 Owner、老師與校區管理者改為角色對應網格，移除會與按鈕重疊的側欄品牌偽元素。
- 手機切換主功能時回到新頁頂端；iPad／手機 CRM 移除輸入欄位外層重複框線，降低表單厚重感。
- 快速新增按鈕只在總覽、課表與課程紀錄顯示，避免遮住 CRM、財務與設定表單。
- 財務中心保留單一共用月份控制，隱藏會同步變動的重複月份欄位。

## 2026-08-10 — iPad 全功能導覽點擊區修正

- 701–1100px 橫向導覽明確移除桌面側欄分組間距，避免學生、老師、課程紀錄、補課、財務與安全設定看得到卻點不到。
- iPad 導覽恢復各功能圖示，不再沿用桌面側欄的營運／課務／財務分組偽元素。
- 新增斷點覆蓋順序回歸檢查，防止後載入樣式再次把按鈕點擊區推離導覽容器。
- 新增全系統入口稽核，永久檢查 10 個主頁、所有 HTML 操作函式、11 個核心功能群與關鍵載入順序。

## 2026-08-10 — 老師 KPI 與薪資正式課表工時一致

- 老師 KPI 的堂數、學生數與授課時數改用和薪資相同的正式課表集合，不再只計已完成課程。
- 老師 KPI 公司營收同步依所選月份的全部正式課程計算，與同頁薪資明細一致。
- 「全部校區」的老師薪資與課程營收會保留未歸屬的正式課表課程；只有固定與一次性支出仍排除未歸屬資料。
- 保留草稿排除與營隊同老師同時段去重，並新增載入版本與舊規則覆蓋回歸檢查。

## 2026-08-10 — Safari 與 iPad Safari 自動驗收矩陣

- Playwright E2E 新增桌面 WebKit 與 iPad WebKit，與既有桌機、iPad、手機 Chromium 共用相同驗收條件。
- CI 同時安裝 Chromium 與 WebKit，避免只在 Chromium 通過、到 Safari 才發現登入隔離、版本或溢出問題。

## 2026-08-10 — 自動瀏覽器煙霧測試與乾淨部署內容

- 新增 Playwright E2E，使用桌機、iPad 與手機三種視窗驗證未登入內容鎖定、核心資源版本及水平溢出。
- GitHub Actions 在既有語法、情境與 Rules 測試後安裝 Chromium 並執行瀏覽器煙霧測試。
- Firebase Hosting 明確排除測試、工具、文件、Firebase Rules 與套件設定，只發布網站執行所需內容。
- Playwright 鎖定已修補的 1.55.1，測試報告與失敗截圖不納入 Git。

## 2026-08-10 — 老師工時、薪資與權限關係一致性稽核

- 通知中心的每週不足工時改用與老師薪資相同的正式課表工時計算，明確不計薪的正式課仍會算入實際工時。
- 老師雲端切片、課堂回報與課表通知統一使用主要／共同老師關係；舊資料若共同老師清單為空，會安全回退至主要老師。
- 新增回歸檢查，防止工時通知再使用是否計薪條件，也防止舊課程因空老師清單而從老師權限範圍消失。

## 2026-08-10 — 學生 CRM 課表老師關係

- 老師篩選改以正式課表為唯一關係來源，納入主要老師與共同授課老師。
- 沒有設定固定老師、但實際排在該老師課表中的學生，現在也會正確出現在篩選結果。
- 單獨設定固定老師但尚未排課不會出現在結果；草稿課程也不納入。清空老師篩選仍恢復目前權限範圍內的全部學生。

## 2026-08-10 — 學生 CRM 老師篩選

- 學生清單搜尋列新增老師篩選，可選擇全部老師或指定老師。
- 指定老師後只顯示「固定老師」精確綁定為該老師的學生，並可與姓名、家長、學校、程度及電話搜尋同時使用。
- 老師選項直接來自目前帳號可見的老師資料，角色範圍不會因篩選功能而擴大。
- 桌面搜尋列改為標題、文字搜尋與老師篩選三欄；窄螢幕維持單欄排列，避免水平溢出。

## 2026-08-10 — 正式課表老師時數完整納入

- 老師實際時數改為納入選定月份課表上的所有正式課程，不再因未上課、請假、取消或不計薪狀態而從課表時數消失。
- 草稿課程不計入；同一老師在相同營隊同時段跨班仍只計一次，避免重複時數。
- 「不計薪」課程仍顯示在課表實際時數，但純時薪金額不增加；薪資公式會分別標示課表時數與計薪時數。
- 新增完整課程狀態矩陣、跨月份及不計薪課程的工時與薪資回歸測試。

## 2026-08-10 — 財務月份控制完整同步

- 修正財務中心的可見月份欄位雖已切換，但隱藏的財務、月結與老師 KPI 月份控制仍保留前一個月份。
- 老師薪資卡、週別明細、學生收款、財務總覽與支出管理現在都使用同一個選定月份同步重算。
- 新增月份控制 ID 綁定回歸檢查，避免把元素 ID 誤當成 HTML 標籤查找。

## 2026-08-10 — 財務老師月份、工時與薪資修正

- 財務中心切換資料月份時，老師薪資、實際時數、每週明細及應付金額都依選定月份重新計算。
- 老師時數納入該月份課表上的全部正式課程；草稿或明確設定「不計薪」的課程不納入。
- 同一老師在相同營隊、相同日期與時段跨多班授課只計一次工時及薪資，避免營隊平行班重複累加。
- 新增跨月份、未上課正式課程及營隊同時段去重的薪資回歸測試。

## 2026-08-10 — Owner 單點課程編輯還原

- 修正老師／校區管理者登出後改用 Owner 登入時，課程側欄「編輯課程」仍被舊角色的強制隱藏樣式遮蔽。
- 響應式角色模組現在會標記自己隱藏的控制項，Owner 套用角色畫面時完整還原。
- Owner 每次開啟課程側欄時再次確認編輯按鈕可見，單點課程後可正常進入修改視窗。

## 2026-08-09 — 帳號邀請狀態

- 新建老師或校區管理者授權時記錄邀請時間與邀請者，更新既有綁定不會重設原始邀請。
- 帳號清單明確區分「待首次登入／已加入／停權」，首次通過授權並留下登入紀錄後才顯示已加入。
- 新增「複製登入邀請」，只複製受邀 Gmail 與正式登入網址，不會自動寄信或傳送營運資料。

## 2026-08-09 — 權限變更完整防護

- 老師專屬檢視必須與目前 `teacherId` 完全一致，換綁老師後舊檢視立即拒絕。
- 校區檢視必須與目前 `branchIds` 完全一致，增加或縮減校區時舊範圍立即拒絕。
- 補齊角色雙向轉換、老師換綁、校區變更、停權／啟用與刪除後撤權測試；刪除時清理兩種可能殘留的角色檢視。

## 2026-08-09 — 帳號角色安全轉換

- 老師與校區管理者可在 Owner 明確確認後互相轉換，不必先刪除帳號。
- 轉為老師時會清除舊校區範圍與管理者快照；轉為校區管理者時會清除舊老師專屬檢視。
- 角色簽章變更會讓既有登入立即失效，避免舊角色畫面或資料繼續留在同一工作階段。

## 2026-08-09 — 帳號停權與重新啟用

- 老師與校區管理者帳號新增獨立的「停權／重新啟用」，不必刪除權限才能阻止登入。
- 停權只更新 `active`，保留 Email、角色、老師／校區綁定與最後登入紀錄；重新啟用後恢復原範圍。
- 現有登入會由即時權限監聽撤銷；新增 Rules 測試驗證停權立即拒絕、重新啟用後只恢復原老師檢視。

## 2026-08-09 — 角色切換隔離還原

- 老師與校區管理者隱藏的元素會加上專用角色隔離標記，避免一般畫面狀態與權限狀態混在一起。
- 同一頁面登出後改用 Owner 登入時，只還原由角色隔離系統隱藏的選單、按鈕、篩選列與統計，不會保留上一個角色的誤鎖狀態。
- 校區管理者重新同步仍由持續 CSS 保護，禁止操作不會因重新繪製而出現。

## 2026-08-09 — 校區管理者介面持續隔離

- 校區管理者登入期間持續隱藏新版快速新增、浮動操作、課表編輯選單、Owner 專用視窗及所有資料修改按鈕，重新繪製後也不會重新出現。
- 不允許的選單、頁面與視窗同步套用 `inert`、`aria-hidden` 與鍵盤焦點隔離，不只做視覺隱藏。
- 非 Owner 的課表右鍵、多選、複製貼上、刪除及復原快捷鍵在事件入口直接停止，不會形成暫時的本機修改。

## 2026-08-09 — 老師與校區檢視嚴格分離

- Firestore 的老師專屬檢視除了比對本人 Email，現在也強制要求 `teacher` 角色；校區管理者不能讀取同 Email 殘留的老師檢視。
- 新增雙向拒絕測試：老師不能讀取校區檢視，校區管理者不能讀取老師檢視。
- Owner 仍可讀寫全部公司資料與所有角色檢視。

## 2026-08-09 — 帳號最後登入時間

- 老師與校區管理者通過授權檢查後，更新本人 `users` 帳號的最後登入時間，不改動角色或資料範圍。
- Owner 的老師帳號與校區管理者清單新增「最後登入」；尚未登入的授權帳號會明確顯示「尚未登入」。
- 老師帳號清單只列出老師角色，避免校區管理者重複出現在兩個權限區塊。

## 2026-08-09 — 登出資料隔離與正確版本監控

- 未登入或登出時會關閉並清空通知中心、課程側欄與課表通知內容，避免上一個登入角色的資料留在背景 DOM。
- 登入畫面以外的介面在未登入期間套用 `inert` 與 `aria-hidden`，背景按鈕不再能被鍵盤聚焦或閱讀輔助工具讀取；授權登入後才解除隔離。
- 錯誤監控 release 由過期的 `20.7.0` 更新為目前版本 `20.13.5`。

## 2026-08-09 — Firebase 防倒灌與失敗重試驗收

- 將 Owner 同步的 snapshot 套用、上傳確認與重試延遲抽成可重複驗收的決策函式，原有同步行為不變。
- 新增舊 snapshot 不得覆蓋未確認本機修改、同步期間的新修改必須續傳，以及相同 snapshot 不重複重繪的情境測試。
- 新增同步失敗保持待傳、顯示狀態並按 1～30 秒指數退避重試的驗收；P0-04 僅剩 staging 雙角色瀏覽器操作待完成。

## 2026-08-09 — 跨午夜與共同授課衝突驗收

- 單堂拖曳若會讓課程跨過午夜，現在會取消操作並說明課程必須安排在同一日期內，不再把結束時間循環到隔日凌晨。
- 新增共同授課老師重疊測試，確認共享老師即使不是既有課程的主要老師，也會指出正確老師與來源課程。
- 補齊學生與教室衝突訊息來源驗收，並將 P0-03 衝堂判斷更新為已自動驗收。

## 2026-08-09 — 支出管理校區總計

- 支出管理新增獨立的「固定＋一次性支出」統計格，不混入老師薪資。
- 總計會跟隨資料月份與支出校區切換，並清楚標示目前統計校區。
- 總計格獨立排列於篩選列下方，桌面與窄螢幕皆不遮擋或產生水平溢出。
- 財務總覽仍以固定開銷、一次性支出與老師薪資計算總支出；老師薪資區維持只呈現老師項目。

## 2026-08-09 — 支出校區範圍與總支出

- 支出管理新增「全部校區」篩選，選項只包含正式校區，不提供未歸屬。
- 全部校區統計會排除未歸屬課程與支出；課程優先依唯一匹配的教室判定校區，再使用既有校區資料。
- 財務總覽新增「總支出」卡片，金額包含固定開銷、一次性支出與老師薪資。
- 六張財務摘要卡重新排列，桌機、平板與手機依寬度自動調整。

## 2026-08-09 — 表單與動態狀態可及性基礎

- 將既有視覺標題自動綁定到對應的輸入、選單與文字欄位，不改變原本事件與操作。
- 搜尋與匯入欄位補上閱讀輔助工具可辨識的名稱。
- 儲存提示、搜尋結果與雲端同步狀態使用禮貌宣告，不打斷目前操作。
- 動態新增的表單欄位會自動套用相同規則，並加入對應回歸檢查。

## 2026-08-09 — 通知重試防覆蓋

- 課表通知改為原子性的「不存在才建立」，同一同步批次即使逾時重試也不覆寫既有通知。
- 老師或校區管理者已確認的通知不會因 Owner 背景補送而重新變成未讀。
- 新增通知重試不得直接覆寫文件、必須使用建立一次交易的回歸檢查。

## 2026-08-09 — 課表通知來源與保留政策

- 老師與校區管理者收到的課表新增、修改、取消通知新增「查看課表」，可返回異動日期及仍存在的原課程。
- 已讀課表通知保留 30 天、未讀通知保留 90 天；逾期文件由 Owner 登入後每次最多清理 100 筆。
- 老師與校區管理者端即使尚未完成雲端清理，也不再顯示超過 90 天的未讀通知。
- 新增已讀、未讀與待寫入伺服器時間的保留期限回歸測試。

## 2026-08-09 — 通知學生與家長辨識收緊

- 未收款通知只採用學生／家長 CRM 中確實存在的學生，不再替缺少有效學生資料的課程猜測對象。
- 以學生唯一編號精準分組；同名學生不會合併，也不使用課名、老師、地點或模糊文字辨識。
- 通知顯示 CRM 內輸入的學生姓名與家長姓名，並新增同名不同學生、未知學生排除的回歸測試。

## 2026-08-08 — 通知去重、期限與來源導向

- 未收款通知改為依學生合併，同一學生多堂未收款只顯示一則並加總金額。
- 未完成課堂回報只保留近 30 天，未收款提醒只保留近 120 天，避免過期待辦無限累積。
- 點擊未收款通知會直接開啟對應月份及學生的課程紀錄。
- 新增通知期限、已收款排除、過期排除、合併堂數與金額的自動回歸案例。

## 2026-08-08 — 全老師每週空堂分析

- 空堂分析只依目前週與老師選項計算，不再被學生、地點、教室或搜尋篩選誤刪老師課程。
- 「全部老師」逐位納入所有老師，並顯示每位老師本週堂數、空堂數或本週無課程。
- 切換單一老師時，週課表與整份空堂分析同步切換；週外、取消及停課課程不納入。
- 每日改為分析 09:00–22:00；完全無課顯示整段空堂，有課則列出課前、課間與課後空檔。
- 草稿排課視為已占用時段，重疊課程先合併後再計算，避免漏算或產生假空堂。
- 週一至週五顯示當週；週六、週日自動改為顯示下一週。
- 新增全部老師、單一老師、週範圍與課程狀態的自動回歸案例。

## 2026-08-08 — 月結月份與校區一致性防護

- 月結畫面與鎖定流程一律使用目前選取的結算月份，不再受財務工作區暫存月份影響。
- 建立快照與調整紀錄前強制核對月份及校區；不一致時拒絕寫入，避免錯掛紀錄。
- 新增月份、校區、合法跨校區紀錄與錯誤掛載拒絕的自動回歸案例。

## 2026-08-08 — 月結鎖定快照與調整紀錄

- 同月份、同校區的月結改為只能鎖定一次，原始結算數字不可覆寫或刪除。
- 鎖定快照保留公式版本、財務總計、課程來源與老師／學生計算來源。
- 結算後新增、刪除、拖曳、改課或費率變更時，自動新增差額調整紀錄；相同狀態重複儲存不會重複開單。
- 資料復原時建立反向調整，既有舊版月結會安全補上鎖定基準，不竄改原紀錄。
- 新增原始金額不可變、正向調整、去重與反向調整的自動驗收案例。

## 2026-08-08 — 發布與回滾演練

- 新增正式發布前檢查、版本建立、部署驗證與回滾判斷清單。
- 在 staging 實際完成 `20.7.1 → 20.5.9 → 20.7.1` Hosting 回滾與恢復。
- 回滾與恢復均在 5 分鐘內完成；恢復後首頁 SHA-256 與演練前版本一致。
- 清除演練用 Hosting channels 與本機暫存檔，正式網站及 Firestore 資料未受影響。

## 2026-08-08 — Backup V3 與還原演練

- JSON 備份加入 16 個資料集合的筆數、schema 版本與內容校驗碼。
- 匯入前驗證集合筆數與校驗碼；檔案不完整或損壞時不取代目前資料。
- 保留舊版備份相容性，並在匯入確認畫面標示驗證狀態。
- 在獨立 Firestore Emulator 完成備份、清空、還原、主要關聯及完整快照比對，未接觸正式資料。

## 2026-08-08 — 最小化錯誤監控

- 集中記錄未捕捉錯誤、主要 Firebase 讀寫失敗與角色檢視發布失敗。
- 事件只保留版本、環境、錯誤類型、操作區域、代碼、角色、重試屬性與伺服器時間。
- 新增去重、單次工作階段上限及 Firestore Rules 隱私限制；一般成員只能新增，只有 Owner 能查詢。
- Rules Emulator 增加有效成員、停權帳號、偽造角色與敏感欄位拒絕案例。

## 2026-08-08 — GitHub Actions 自動檢查

- 新增 push、pull request 與手動執行的 CI 流程。
- 自動執行專案驗證、manifest 一致性、應用情境與 Firestore Rules 測試。
- 自動執行 npm 相依套件安全掃描；流程採唯讀權限且不接觸 Firebase 正式資料。

## 2026-08-08 — 建立獨立 Firebase staging 環境

- 建立 `danbridge-d8877-staging` Firebase 專案、Web App 與 `asia-east1` Firestore 資料庫。
- 網站依 production／staging 網域自動使用對應 Firebase 設定，正式網域仍連接原正式專案。
- 新增明確指定專案的 production／staging 部署指令，避免部署目標混淆。
- staging 畫面加入固定環境標記，並記錄測試資料隔離規則。

## 2026-08-08 — 貼上落位與 Firebase 即時同步整合測試

- 使用正式貼上函式驗證課程會立即加入目標日期與時間、維持目前老師並只觸發一次儲存。
- 新增隔離的 Firestore Emulator 雙客戶端測試，驗證一端寫入課表後另一端的即時監聽會收到更新。
- 權限與同步測試由 10 項增加為 11 項，全程不讀寫正式課程資料。
- 本次只增加測試與驗收紀錄，未修改網站功能或畫面。

## 2026-08-08 — 補齊課表互動範圍回歸測試

- 新增框選使用放開座標、一般框選取代舊選取的程式回歸檢查。
- 新增混合老師選取時，剪貼簿只保留目前老師課程的自動測試。
- 新增目前老師批次候選不影響其他老師課程的自動測試。
- 本次只增加測試與驗收紀錄，未修改網站功能或畫面。

## 2026-08-08 — 結束多選時關閉右鍵選單

- 多選後開啟右鍵複製選單，再按清除選取或結束多選時，選單會同步消失。
- 將關閉條件綁定到統一選取狀態更新，涵蓋工具列、點擊空白處與其他取消入口。

## 2026-08-08 — 空堂時段與英文版對齊修正

- 空堂分析加入每天最後一堂課結束至 21:30 的空檔，維持至少 30 分鐘門檻。
- 無空堂日期的星期、日期與狀態改為穩定置中，不再偏斜或遭截斷。
- 英文版側邊欄長標籤可在欄內換行，右上帳號與操作按鈕統一高度及垂直對齊。
- 修正桌面頁首寬度包含側邊欄而造成右側操作超出畫面的問題。

## 2026-08-08 — 精簡無空堂日期顯示

- 沒有空堂的日期改為星期、日期與「本日無空堂」單行狀態，不再出現直向斷字與大片空白卡片。
- 有空堂的日期仍保留完整老師、時間與空堂時數資訊。

## 2026-08-08 — 修正空堂週表顯示與寬度

- 排除空堂日期標題與網站頁首共用元素造成的樣式衝突，七天內容會正常顯示。
- 七欄改為依容器寬度縮放，窄畫面自動切換兩欄或單欄，不再撐破主畫面。

## 2026-08-08 — 空堂分析改為一週分日呈現

- 老師空堂分析改為週一到週日七個分區，日期、老師、空堂時間與時數可直接逐日查看。
- 保留原本同日相鄰課程間至少 30 分鐘、目前老師與課表篩選條件等計算規則。
- 沒有空堂的日期仍會顯示，避免誤以為該日未納入分析。

## 2026-08-08 — 課表範圍與衝堂自動回歸

- 新增老師限定的週複製、整月複製與選取複製自動測試，避免混入其他老師課程。
- 補回整月複製所需的月曆週次日期映射，並驗證目標月份不存在的日期格會安全略過。
- 新增不同日期、相鄰時段、相同學生、同教室、不同資源及取消課程的衝堂邊界測試。
- 專案預設測試會一併執行既有情境與新的課表回歸情境。

## 2026-08-07 — Firestore 角色權限自動驗收

- 建立隔離的 Firestore Emulator 測試環境與一鍵測試指令。
- 新增 10 項匿名、停權、Owner、老師、校區管理者、課堂回報與通知權限測試。
- 強制課堂回報的老師清單與校區必須符合可信任的 `lessonMeta`，拒絕偽造範圍欄位。
- P0-01 標記為已自動驗收，下一項轉為課表範圍與衝堂回歸測試。

## 2026-08-07 — 建立功能與驗收狀態基準

- 依完整網站建置文件建立 P0／P1／P2 功能清單與驗收狀態看板。
- 明確區分已自動驗收、已人工驗收、部分完成、未開始與需要決策。
- 將 Firestore Rules Emulator 權限測試列為下一個 P0 實作項目。
- 補上核心課表回歸狀態與正式平台的建議執行順序。

## V11 initial clean repository

- Recreated the application from the latest validated v10 source without its Git history, macOS metadata, or historical audit reports.
- Preserved Firebase project configuration, owner/teacher/branch roles, cloud data paths, calendar interaction fixes, and notification flows.
- Added `.nojekyll` for direct static GitHub Pages publishing and assigned a v11-specific Service Worker cache.

## V18.22.25 — 重建桌面課表互動核心

- 移除每次渲染後複製並替換整個課表容器的機制，選取、貼上與拖曳改用單一永久事件層。
- 課表內容更新不再刪除互動事件，消除偶爾可用、慢一步及部分卡片無法拖曳。
- 桌面拖曳的開始、目標標示、放下與清理全部由永久課表事件層接管。
- 一般單人課程只採用目前主要老師判斷撞課，忽略舊資料殘留的多老師陣列。
- 團班仍保留多老師撞課判斷，不影響共同授課規則。
- 課表紅色衝堂標示同步排除草稿、取消與停課，只標示正式課程的真實時間重疊。

## V18.22.24 — 移除操作慢一步與永久恢復拖曳

- 貼上由延後的 click 改為 pointerdown 當下執行，第一下就完成，不再由下一個動作觸發上一筆。
- 移除多選期間略過拖曳事件綁定的設計；事件永久存在，只在多選當下暫停。
- 退出多選後直接恢復拖曳，不再依賴重新渲染或非同步重綁。
- 貼上模式點到另一張課程時先結束舊貼上，避免舊剪貼簿干擾下一次選取。

## V18.22.23 — 重綁拖曳與排除隱藏重複資料

- 複製並退出多選後立即重建課表，恢復每一張課程卡片的拖曳事件。
- 貼上重複檢查排除草稿、取消及停課，不再被畫面未顯示的資料擋住。
- 貼上模式移動滑鼠時即時標示目標日期／時間格，點擊後使用同一目標貼上。
- 課表區禁止瀏覽器原生文字反黑，框選與拖曳不再互相干擾。

## V18.22.22 — 跨週跨老師貼上與假撞課修正

- 複製後切換週次、日期、顯示模式或目標老師時，保留待貼課程與貼上模式。
- 修正 7/30 複製後切到 8/6、或切換 Kim 等老師時被自動取消貼上的問題。
- 草稿課程不再阻擋正式課程拖移或貼上，避免畫面空白卻提示撞課。
- 貼上若因完全重複、學生或教室衝突而全部略過，直接列出實際原因。

## V18.22.21 — 統一撞課、複製貼上與拖移狀態

- 指定老師課表中拖移課程時，改以目前選取老師作為目標，不再沿用原老師造成假撞課。
- 拖移仍排除課程本身，只在學生、教室或目標老師真正時間重疊時提示。
- 複製完成立即退出多選狀態並保留待貼課程，點目標格即可貼上。
- 貼上、拖移、批次更新與整週複製完成後，統一清除多選及貼上操作狀態。

## V18.22.20 — 修復重建課表後無法貼上

- 修正框選功能重建課表畫布後，貼上事件被一併移除的問題。
- 貼上模式點擊空白日期／時間格時優先執行貼上，不再被誤判為取消多選。
- 桌面月檢視、週檢視與手機週卡片共用同一套最終貼上處理。

## V18.22.19 — 修復電腦版課程貼上

- 桌面月課表與週課表改用統一貼上事件，點日期格或時間格即可可靠貼上。
- 每次複製後清除來源格的舊貼上位置，避免誤判成貼回原課程位置。
- 鍵盤貼上優先採用滑鼠目前所在格，再使用最後有效目標。

## V18.22.18 — 恢復手機課程複製貼上

- 多選課程工具列新增可直接操作的「複製選取」。
- 手機週課表每一天重新綁定貼上日期，複製後可直接點目標日期完成貼上。
- 輸入框與文字區域恢復手機原生長按選取、複製及貼上。

## V18.22.17 — 手機月份欄位與課程日期對齊

- 課程紀錄與營隊報名的月份標籤恢復靠左，僅輸入框內年月置中。
- 限制營隊報名月份欄位與父層寬度，避免手機版格子向右超出。
- 課程紀錄卡片的日期數字在內容欄置中，保留欄位標籤靠左。

## V18.22.16 — 手機營隊日期滑動與月份置中
- 冬／夏令營報名日期月曆加入獨立橫向滑動容器，七個星期欄可完整左右查看與勾選。
- 776px 日期月曆固定收納在手機卡片內，不再撐寬頁面或讓右側日期超出畫面。
- 報名月份與課程紀錄月份的年月數字及標籤強制置中，維持相同欄寬與數字間距。

## V18.22.15 — 全角色手機排版、週課表與角色切換修正
- 老闆端財務中心分頁固定為兩欄手機網格，所有標題、說明與金額限制在卡片內並置中。
- 老闆、主管與老師的課程紀錄共用同一套手機卡片；時間／時數、學生／老師、回報內容、狀態、費用與操作對齊固定欄位。
- 長回報內容、薪資與收費資料在卡片內自然換行，統一手機字級，不再向右超出。
- 手機週課表改為七天直向行程卡，完整列出所選老師每天的課程；桌機維持原本 5 分鐘週格線。
- 老師切回老闆帳號時自動恢復原始分頁名稱、課表篩選、分析區及新增／復原工具，不必重新整理。

## V18.22.14 — 回報欄位左對齊與底部導覽避讓
- 課程回報的標籤、輸入內容、提示文字與預留文字統一靠左對齊。
- 手機上課狀態改為單欄等寬選項，圓鈕與文字使用固定欄位，不再左右錯位或留下落單選項。
- 回報視窗層級提高至底部導覽列之上，往下滑時操作按鈕不再被手機選單遮住。
- 回報視窗上下保留 iPhone 安全距離，並維持視窗內獨立捲動。

## V18.22.13 — 回報卡單列資訊與獨立捲動視窗
- 老師回報卡的時間／時數、學生／老師、地點／教室改為同一列，以細分隔線清楚區分並對齊固定內容欄。
- 每個資訊列保留獨立底線，長內容可自然換行但不會再產生不一致的大空隙。
- 課程回報視窗開啟時鎖住背景，只允許回報視窗本身順暢捲動。
- 「開始上課」改為高對比綠底白字；不可使用時仍保留清楚的柔和綠色狀態。

## V18.22.12 — 老師回報卡內容列與操作區對齊
- 課程回報卡每個欄位改為固定標籤欄與單一內容區，換行不再把時數、老師或地點推到錯誤欄位。
- 日期、時間、學生／老師、課程內容與狀態統一字級、行高及左右對齊。
- 月份標籤與月份值在手機卡片中置中顯示。
- 回報視窗的開始上課、一鍵完成、儲存回報與取消改為等寬兩欄按鈕，文字與間距一致。

## V18.22.11 — 老師手機課表操作卡重新編排
- 手機版將日期導覽、課程搜尋與課表工具拆成三張同寬卡片，桌機版維持原排版。
- 顯示模式、基準日期、前後日期與今天按鈕統一邊界、寬度、間距及高度。
- Apple 行事曆與列印／PDF 改為並排手機按鈕，搜尋文案改為老師實際可用的日期、學生與課程名稱。
- 老師登入後直接移除全域新增課程工具，避免其他模組或舊樣式再次顯示浮動加號。

## V18.22.10 — 老師課表欄位與回報卡片強制收斂
- 老師登入完成後直接移除老師、地點、學生／班級、教室及課程狀態欄位，只保留日期與關鍵字搜尋。
- 權限介面於登入後再次套用，避免模組載入順序造成老師專用樣式失效。
- 課程回報卡的標籤、日期、時間、學生、課程內容與狀態統一為相同字級和固定欄寬。
- 操作按鈕限制在卡片內容欄內，新增課程浮動按鈕也以老師登入 class 強制隱藏。
- 手機頁首固定保留雲端狀態列空間，不再壓住 Danbridge Operations。

## V18.22.9 — 老師手機介面與權限內容一次整理
- 老師總覽的歡迎卡與雙按鈕限制在卡片寬度內，統一間距並移除手機版溢出。
- 課程回報列表改為老師專用的緊湊卡片，日期、時間、學生、課程、狀態與操作欄位對齊。
- 老師端移除老師、學生／班級、教室與內部狀態篩選，也不再產生教室使用率及老師空堂分析。
- 強制隱藏老師端新增課程浮動按鈕；舊版回報監聽權限不足時不再用紅色錯誤遮住畫面，課表仍可正常載入。
- 更新相關樣式與程式快取版本，確保手機立即套用新版。

## V18.22.8 — 老師手機面板字體與防溢出調整
- 老師手機頁首、歡迎面板、統計卡與今日課程改為更柔和一致的字重、行高與字距。
- 英文眉題、姓名、統計數值及按鈕文字依螢幕寬度縮放與安全換行，不再超出卡片。
- 老師手機樣式加入版本參數，避免瀏覽器沿用舊快取而持續顯示溢出版面。

## V18.22.7 — 雲端狀態置頂且不遮擋頁首
- 手機版雲端同步狀態固定顯示於螢幕最上方。
- 狀態顯示期間自動替頁首保留高度，避免覆蓋品牌標題、帳號與操作按鈕。

## V18.22.6 — 手機與 iPad 響應式細節修正
- 手機月曆恢復單欄寬度，完整日期與課程卡片不再被 700px 月曆畫布裁切。
- 同步狀態移至底部導覽列上方，避免遮住手機頁首與標題。
- 手機與 iPad 導覽斷點統一為 700px；iPad 直向、橫向及分割畫面維持平板導覽。
- 手機隱藏返回頂端浮動按鈕，避免遮住課程內容與操作區。

## V18.22.5 — 手機月曆顯示完整日期
- 手機版每個月曆日期群組改為顯示「月日・星期」，不再只顯示單一日期數字。
- 展開／收合提示保留在日期標題右側，桌機與 iPad 月曆排版不變。

## V18.22.4 — 完整移除課堂照片與修正校區請假率
- 移除舊課堂照片的資料同步、課程列表／詳情顯示、樣式與 Firebase Storage Rules；課堂回報只保留文字、作業、回饋、狀態及內部備註。
- 校區結算的課表總堂數改為全部正式課程，請假率使用相同分母並限制在 0～100%。
- 新增校區結算請假率回歸測試，涵蓋「收費堂數少於請假堂數」的邊界。

## V18.22.3 — 停用課堂照片上傳
- 移除課堂回報中的照片選擇、預覽與 Firebase Storage 上傳流程；文字、作業、回饋、狀態及內部備註維持原同步方式。
- Firebase 部署改為只需要 Firestore Rules，不再因尚未啟用 Storage 而中止。
- 舊回報若已有照片資料仍保留唯讀顯示；新版儲存不會清除既有照片欄位。

## V18.22.2 — 登入頁首幀直接顯示新版
- 將 HTML 初始登入畫面同步為目前黑金羽毛設計，網頁剛開啟的第一幀即顯示新版。
- 移除 Firebase 登入模組載入前短暫出現舊版藍黑登入頁的畫面閃換。
- Google 登入完成載入後仍沿用原驗證流程；權限、同步與營運資料不變。

## V18.22.1 — 老師空堂固定單週
- 老師空堂分析固定只列出課表基準日期所屬的週一至週日，不再跟著月曆顯示整個月份。
- 當基準日期為週日時，改列出隔天週一起至下個週日，規則與 Apple 行事曆一週匯出一致。
- 教室使用率仍依目前月／週顯示範圍計算；課表、薪資、財務、營隊與既有資料不變。

## V18.22 — 不改功能的操作便利性
- 桌機可按 Command／Ctrl＋K 直接定位目前頁面的搜尋欄，支援營運總覽、學生 CRM 與課程管理。
- Escape 可關閉最上層彈窗；彈窗開啟後會自動定位第一個可操作欄位，減少滑鼠移動。
- 切換功能頁面時會記住各頁捲動位置，返回後接續先前閱讀處；資料只存在目前瀏覽分頁。
- 手機橫向導覽會自動將目前頁籤捲入可見範圍，並補強鍵盤焦點標記；不變更計算、資料結構、權限或同步。

## V18.21.11 — 品牌名稱與標語比例
- Danbridge 公司名稱再放大一級，桌機、iPad 與手機版同步強化品牌主體。
- Quiet precision 與 Exceptional learning 兩行標語同步縮小，進一步降低輔助文案的視覺比重。
- 僅調整登入頁文字比例，不變更登入、權限、同步或營運資料。

## V18.21.10 — 品牌字加粗與陰影強化
- Danbridge 品牌名稱提升至最高字重並加入細緻金色描邊，補強精品襯線字偏細的筆畫。
- 陰影改為清楚的深金偏移層、深色立體陰影與柔和金色光暈，提升黑色背景上的辨識度。
- 僅調整登入頁品牌文字，不變更登入、權限、同步或營運資料。

## V18.21.9 — 品牌字標加重與標語正體
- Danbridge 品牌名稱再加粗，加入輕微斜體與克制的金色立體陰影，提升字標力量與精品感。
- Exceptional learning 取消斜體並與 Quiet precision 統一為穩定正體，降低輔助標語的視覺搶占。
- 僅調整登入頁字體視覺，不變更登入、權限、同步或營運資料。

## V18.21.8 — 精品品牌字與羽毛提亮
- Danbridge 公司名稱改用 Didot／Bodoni 精品襯線字體序列，調整字重、字距與金色光澤。
- 金色羽毛提高亮度、飽和度與柔和高光，但維持既有尺寸與視覺層級。
- 僅調整登入頁品牌視覺，不變更登入、權限、同步或營運資料。

## V18.21.7 — 公司名稱強化與視覺降噪
- Danbridge 公司名稱改為更粗、更大的精品襯線字，提升清晰度與品牌力量。
- 金色羽毛縮小並降低亮度與飽和度，不再搶過公司名稱的視覺焦點。
- Quiet precision 與 Exceptional learning 再縮小並降低對比，明確作為輔助品牌標語。

## V18.21.6 — 登入頁品牌層級與卡片比例
- 將 Danbridge 提升為左側主要品牌標題，改用放大的精品襯線字體與較自然的字距。
- 縮小 Quiet precision 與 Exceptional learning 標語，讓視覺層級回到公司名稱與金色羽毛。
- 收緊登入卡上下留白與高度，保留舒適間距但移除過多空白，桌機與手機版同步調整。

## V18.21.5 — 羽毛融合與登入卡圓角
- 登入頁背景統一為純黑並柔化羽毛圖片外緣，移除可見的矩形圖片邊界。
- 公司名稱移除前方小型 D 圖章並放大 DANBRIDGE 字樣，強化品牌辨識。
- 登入卡與 Google 按鈕改為柔和圓角，移除卡片左上方多餘的金色短線裝飾。

## V18.21.4 — 寫實金色羽毛與英文登入頁
- 將扁平羽毛圖示替換為具細緻羽絲與金屬光澤的寫實金色羽毛主視覺。
- 登入介面的標題、說明、按鈕與安全提示統一改為英文，移除中英混用。
- 放寬主標題行距、字距、段落與登入卡留白，提升桌機、iPad 與手機的閱讀舒適度。

## V18.21.3 — 黑金羽毛筆登入頁
- 登入頁改為簡約雙欄構圖，以金色羽毛筆作為主視覺，維持 Danbridge 黑金品牌風格。
- 移除裝飾性營運儀表板、重複權限說明與過多狀態資訊，聚焦品牌與 Google 登入操作。
- 桌機、iPad 與手機皆採精簡響應式排版；僅調整登入畫面，不變更權限、同步或任何營運資料。

## V18.21.2 — 營隊資料季別完整隔離
- 營隊報名的編輯、載入與刪除明確帶入夏令營或冬令營季別，不再只靠紀錄 ID 猜測資料來源。
- 資料完整性中心同步檢查與整理冬、夏令營報名，並偵測兩季間重複的紀錄 ID。
- LINE 對帳維持「該月正式家教＋單一所選營隊季別」，公司總財務才合計兩季實際收入。

## V18.21.1 — LINE 對帳營隊季別隔離
- 財務中心與營隊頁的 LINE 預覽一律只計目前選擇的夏令營或冬令營，不再將兩季混合在同一則訊息。
- LINE 明細仍會加上該月份所有正式家教課程；若學生有目前季別的營隊報名，再加入該季日期、計價與小計。
- 預覽視窗新增營隊季別切換，切換後立即重算，並記住目前選擇；財務總帳仍完整合計冬、夏令營所有實際收入。

## V18.21 — 冬／夏令營收費切換
- 左側「夏令營收費」改為「冬／夏令營」，營隊學生收費頁新增夏令營／冬令營季別選擇。
- 同一學生同月份的冬令營與夏令營報名分開保存、載入、編輯、刪除與合計；既有紀錄自動維持為夏令營資料，不搬移也不覆蓋。
- 營隊頁的 LINE 預覽依目前選擇顯示「夏令營」或「冬令營」及該季日期、計價公式與小計；財務中心的家庭 LINE 仍可合併顯示兩季。
- 公司財務與學生應收會合計冬／夏令營收入，畫面文字同步改為冬／夏令營；桌機、iPad 與手機皆支援季別切換。

## V18.20.3 — 月曆選取標記精簡
- 桌機與 iPad 月曆的選取勾勾縮為小型圓形標記，改用較低飽和的藍色，仍能清楚辨識。
- 選取外框由厚重亮藍框改為細緻柔和線條，縮小左側留白；多選操作與選取範圍維持不變。

## V18.20.2 — 週日匯出下一週
- Apple Calendar 一週匯出在基準日期為週日時，改為匯出隔天週一起至下個週日；週一至週六仍匯出所在週。
- 匯出範圍仍固定為完整 7 天，其他課表篩選、行程名稱與內容維持不變。

## V18.20.1 — Apple 行事曆固定一週與游標修正
- Apple Calendar 匯出固定以課表「基準日期」所在週的週一至週日為範圍，無論月曆或週曆模式都剛好 7 天，不多也不少。
- 仍套用目前老師、學生、地點、教室、課程狀態與搜尋篩選；按鈕文字改為「加入本週 Apple 行事曆」。
- 滑鼠移到月曆及週曆課程時維持一般箭頭，不再因完整資訊提示顯示問號游標；多選模式仍保留可點擊指標。

## V18.20 — 課表一鍵加入 Apple 行事曆
- 課表工具列新增「加入 Apple 行事曆」，依目前月／週範圍及老師、學生、地點、教室、狀態與搜尋篩選匯出正式課程。
- Apple 行事曆事件標題顯示「月／日＋學生／班級姓名」，並保留正確上課時間、老師、課程、地點與狀態說明。
- 桌機、iPad 與手機皆輸出標準 `.ics` 檔案；不修改課表資料，Apple 系統仍會要求使用者確認加入。

## V18.19.1 — 浮動按鈕與右鍵選單排版
- 右下角復原／重做／新增操作與快速新增圓形按鈕錯開排列，不再互相遮擋；手機版分置左右並避開底部導覽列。
- 課表右鍵選單改為輕量圓角浮層，加入線條圖示、細線分隔與柔和陰影，並會自動保持在螢幕範圍內。
- 回到頂端按鈕在手機版移至快速新增按鈕上方，避免新的浮動元件再次重疊。

## V18.19 — 桌機、iPad 與手機操作便利性
- 月曆可點日期標題展開當日課程，集中查看完整老師、地點與課程資訊，再次點擊即可收合。
- iPad 與手機的寬表格左右滑動時固定第一欄，降低學生、日期或老師資料看錯列的機會。
- 課表、課程紀錄、老師 KPI、財務與收款的月份及篩選條件會記住在目前裝置，下次返回頁面可延續操作。
- 長頁面新增回到頂端按鈕，手機版會自動避開底部導覽列與安全區。
- 學生、課程、補課、收款、薪資、支出及結算沒有資料時，顯示一致且清楚的空白提示。
- 課程編輯、課堂回報、批次調整及 LINE 預覽的主要操作按鈕固定於視窗底部；只改善操作與排版，不更動資料及計算。

## V18.18.1 — 手機復原提示位置修正
- 手機版課程修改後的「復原」提示移至底部導覽列上方，避免按鈕與導覽列互相遮擋。
- 桌面版提示位置與課程、財務及其他功能維持不變。

## V18.18 — Notion 式單行月曆課程
- 桌面與 iPad 的月曆模式改為緊湊單行橫向課程列，時間與學生／班級顯示在同一排。
- 隱藏月曆卡片內重複的老師、地點與付款第二行，完整資訊仍可透過提示或點開課程查看。
- 保留老師顏色、草稿、撞課、選取、拖曳與點擊編輯狀態；週曆與手機顯示不變。

## V18.17 — 六項日常便利功能
- 編輯既有課程時先預覽日期、時間、學生、老師、校區、教室、狀態與付款差異，確認後才儲存；成功後提供 8 秒快速復原。
- LINE 預覽可為家庭設定媽咪、爸爸、家長或自訂稱謂，開頭與結尾會同步套用且不影響費用計算。
- 學生收款新增家庭勾選與批次標記已通知、已收款、恢復待通知，並可記錄收款方式與日期。
- LINE 確認複製成功後自動留下通知紀錄，避免同一月份重複通知或漏發。
- 財務總覽新增月底待辦，顯示尚未通知、尚未收款、學生單價異常與老師薪資設定異常數量。
- 新增的收款追蹤資料獨立存放，不更動既有課程、財務、薪資、權限與同步計算結構。

## V18.16.4 — 移除 LINE 重複小計
- 移除每位孩子明細結尾重複出現的額外小計。
- 家教與 Summer Camp 各自的項目小計仍保留，訊息最後維持月份共計。

## V18.16.3 — LINE 每位孩子小計文字
- 家庭 LINE 明細中每位孩子結尾的「小朋友小計」簡化為「小計」。
- 家教與營隊項目小計、每位孩子小計及最後月份共計的金額計算維持不變。

## V18.16.2 — LINE 開頭隱藏孩子姓名
- LINE 費用明細開頭統一顯示「以下是小朋友」，不再列出全部孩子姓名。
- 多位孩子的個別姓名仍保留在後續費用分段，時數、單價、家庭合併與總額計算不變。

## V18.16.1 — 編輯課程儲存後可見性保護
- 編輯既有課程成功後會自動定位到該堂課的新日期，避免跨日或跨月修改後看起來像課程消失。
- 只清除與該堂課不相符的老師、學生、校區、教室、狀態或搜尋篩選，確保儲存後仍能立即看到課程。
- 儲存後會再次確認原課程 ID 仍存在；若資料異常則立即警告，不執行誤導性的畫面切換。

## V18.16 — LINE 複製前預覽
- 家庭 LINE 與完整 LINE 收費改為先開啟預覽視窗，不再按下後立即複製。
- 預覽內容可於複製前直接編輯；編輯只影響當次剪貼簿文字，不會修改學生、課程或收費資料。
- 確認複製成功後自動關閉預覽並顯示完成提示，取消或點擊背景可安全關閉。

## V18.15 — 月底一次檢查
- 財務總覽新增「月底一次檢查」，依目前月份與校區掃描學生單價、課程時間、重複課程、家長姓名、老師薪資設定與營隊報名。
- 檢查結果會列出需修正與提醒項目，並核對家教財務收入與學生應收是否一致。
- 同時顯示家教堂數與收入、營隊報名與收入、老師及學生數量；檢查過程不修改任何營運資料。

## V18.14.3 — 財務月份雙向同步
- 財務總覽上方資料月份與中間財務月份改為雙向同步，任一欄位變更都會更新全部財務模組。
- 「重新計算」會依目前財務月份強制更新收入、支出、薪資、學生收款與老師 KPI，並顯示完成提示。

## V18.14.2 — 學生收款與 LINE 計算一致化
- 所有已排入正式課表的家教課程一律計入學生收費，不再因舊的「不向學生收費」欄位而漏算。
- 學生收款的收費堂數、收費時數、家教金額、財務收入與 LINE 明細統一使用同一批正式課表家教課程。
- 營隊課表不重複計入家教收費；Summer Camp 仍只依報名紀錄計費。
- 原定堂數與請假率仍依該月全部正式排課統計，老師工時、薪資及既有課程資料不受影響。

## V18.14.1 — 家庭 LINE 月份共計標籤
- 家庭 LINE 對帳的總額文字由「家庭本月應收」改為依財務月份顯示的「X月共計」。
- 單一學生的 LINE 對帳同樣使用「X月共計」，費用計算與家庭合併邏輯維持不變。

## V18.14 — 跨老師課表複製貼上
- 複製課程後切換老師篩選不再退出貼上模式。
- 選取老師後貼上，課程會改派給該位目標老師；選擇全部老師時則保留原老師。
- 貼上提示會顯示目標老師，完成訊息也會確認實際貼給哪位老師。

## V18.13.2 — 同名家長隱藏空白修正
- 家庭仍只依家長姓名合併，但比對前會清除前後空白與不可見空白字元。
- 同名家庭會納入所有學生資料，不因學生狀態而漏掉兄弟姊妹。
- 當月為 0 堂的孩子仍會顯示在家庭 LINE 標題，費用明細則只列出實際有課程或營隊費用的孩子。

## V18.13.1 — 家長姓名精確對帳
- 家庭成員只依家長姓名完全相同進行合併，不再參考電話、LINE、Email 或推測式家庭編號。
- LINE 對帳使用畫面目前實際顯示的財務月份，修正有課程但複製內容顯示 0 元的月份錯置。
- 同一家長的多位孩子仍會分別計算家教與夏令營，再合併為一份家庭 LINE 對帳。

## V17.25 — Teacher Schedule Row Revenue Audit
- Replaced teacher-count multiplication with explicit per-teacher timetable revenue rows.
- Each timetable row calculates student hourly rate × scheduled duration.
- Repeated lessons remain counted; no revenue deduplication.
- Collection/payment/report/status fields do not affect revenue.

## V17.14 — 每位老師個別設定底薪
- 移除所有正職老師共用 NT$35,000 的預設底薪。
- 每位老師的固定底薪必須由管理者自行輸入並獨立儲存。
- 正職老師未填固定底薪時禁止儲存，避免月底結算套用錯誤金額。
- 兼職老師未設定底薪時維持按實際工時 × 時薪計算。
- 老師清單在未設定底薪時顯示「尚未設定」。


## V17.13 — 正職底薪＋超時薪資公式
- 正職薪資改為：固定底薪＋超過本月最低工時的時數×超時時薪。
- 既有正職老師未設定底薪時，預設使用 NT$35,000。
- 兼職與未設定底薪老師維持按實際授課時數計薪。
# V17.2 Executive Authentication UI

- Upgraded the login screen to a full-width black-and-gold executive workspace.
- Added a code-rendered operations dashboard, status cards, schedule chart, and trust indicators.
- Preserved Google authentication, Firebase synchronization, roles, and permissions without logic changes.

# V16.8 — Teacher Schedule Change Notifications

- Owner schedule changes now notify only affected teachers in real time.
- Added, modified, reassigned, and removed lessons include readable change details.
- Teachers can acknowledge a notification so it does not reappear.
- Existing scheduling, synchronization, payroll, finance, permissions, and removed request features remain unchanged.

# V16.7 — Payroll Fluid KPI Layout

- Fixed long salary values being clipped or pushing teacher cards outside the viewport.
- Removed fixed KPI minimum widths and switched to fluid zero-minimum grid columns.
- Added responsive and container-aware KPI typography.
- Kept hour units on the same line while preserving full salary values.
- Reduced teacher card vertical spacing and weekly-row height.
- No calculation, data, permission, sync, ID, or event-handler changes.

# V16.6 — Payroll KPI single-line refinement

- Keep teacher difference values such as `多 10.8 hr` and `少 94.3 hr` on one line.
- Use responsive KPI typography and numeric alignment.
- Adjust KPI grid breakpoints so values retain adequate width.
- Visual-only change; calculations, data, permissions, sync and event handlers are unchanged.


## V16.4 — Premium Teacher Payroll UI
- Redesigned teacher work-hour and payroll cards.
- Teacher full names now wrap and remain fully visible.
- Visual-only change; calculations and functionality unchanged.
## V15.28.8 — Final Lesson Report Permission Fix

- Unified client and Firestore authorization on `extensionUntil`.
- Eliminated false permission-denied results from timestamp arithmetic and duplicated metadata comparisons.
- Preserved teacher ownership, active lesson, manager branch, and expiration controls.

# V15.28.3 — Final Lesson ID Integrity Lock

- Owner-only legacy Lesson ID migration authority.
- Teacher and branch-manager cloud views never generate local replacement IDs.
- Backup restore and every save pass through the same identity normalization guard.
- Duplicate legacy IDs are remapped only by exact lesson fingerprint; ambiguous records are preserved and logged instead of being attached to the wrong lesson.
- Grant, request, lessonMeta, Firestore Rules, and Storage Rules verify the same lesson date, time, student, and teacher fingerprint.
- Existing scheduling, reporting, finance, camp, backup, and permission behavior remains unchanged.

# V15.28.2 — Unified Lesson Identity Core

- All new lesson IDs use canonical `lsn_<UUID>` format.
- Existing lesson IDs are migrated once with local references rewritten.
- Firestore lessonMeta, lessonReports, reportExtensionRequests and reportExtensionGrants share the exact lesson ID as document ID.
- Single and batch requests write one canonical request document per lesson.
- Lesson copy/recurrence/camp creation always generates a new lesson ID.
- Existing non-lesson entity IDs and application behavior remain unchanged.

# V15.27.11 — Approved Grant UI Synchronization Fix

- Fixes the approval loop where an approved request arrived before the matching grant snapshot.
- Approved requests no longer show the request button again while grant synchronization is pending.
- Teacher schedule and open course drawer re-render immediately after grants arrive.
- Approved grants are filtered by the currently signed-in teacher.
- A direct Firestore grant refresh is triggered after approval to remove listener timing races.

# V15.27.11 — Lesson Report Workflow Stability

## Fixed
- 核准不再使用兩個平行寫入，避免申請已核准但 grant 未建立的半完成狀態。
- 多堂課分開申請與核准時，每堂課的授權完全獨立。
- 儲存前驗證正式 grant，錯誤訊息可區分未核准、資料不完整與伺服器時間尚未回寫。
- Firestore request create rules 驗證 requesterTeacherId 與 lessonMeta.teacherIds。


## V15.28.7 — Lesson Report Authorization Source Fix
- Lesson report writes now authorize from authenticated membership plus trusted lessonMeta.
- Removed payload identity fields as authorization gates to prevent false permission-denied.
- Teacher/manager scope, lesson ownership, branch scope, and report time window remain enforced.

## V15.28.11
- Fixed permission-denied when an authorized teacher or branch manager submits a new extension request for a lesson that already has an older request document.
- Removed fragile exact date/time/student/teacher-array comparisons from request authorization.
- Added branch scope validation for branch managers.


## V15.29.1 Cloud Sync Dirty Guard
- Fixed schedule drag changes reverting before cloud upload completed.
- Added a local dirty-state guard so stale Firestore snapshots cannot overwrite unsynced local changes.
- Added immediate retry when a stale snapshot arrives during the save/upload window.
- Preserved all existing features; no removed application/request feature was restored.
- Bumped module and service-worker cache versions.

## V16.2 — Global Design System
- Added a visual-only final CSS layer for consistent navigation, cards, forms, buttons, tables, KPI panels and dialogs.
- Added sidebar visual grouping while preserving the original navigation buttons and permission logic.
- Preserved all V16.1 synchronization and no-overlay fixes.
- Updated the PWA cache key.

## V16.3 Premium CRM and Pages
- Added visual-only premium refinement for Student / Parent CRM and related management pages.
- Preserved all IDs, handlers, synchronization, permissions, calculations, and data behavior.

## V17.3 — Authentication Card Alignment Polish
- Corrected the Danbridge logo lockup alignment in the authentication card.
- Enlarged the right-side login panel for stronger visual balance.
- Preserved all authentication and cloud-sync behavior.

## V17.4 — Aligned Authentication Stage
- Aligned the executive dashboard and secure access panel to the same top and bottom edges.
- Expanded the dashboard vertically for a balanced two-column enterprise composition.
- Enlarged the access card, logo and Google sign-in control while preserving all authentication behavior.
- Responsive tablet and mobile layouts remain stacked and fully usable.

## V17.5 — iPad Drag Recovery and Lesson Record Toolbar
- Fixed iPad touch drags remaining in a locked/dragging state after pointer release outside the lesson card.
- Added pointer cancellation, lost-capture, and global release cleanup.
- Prevented lesson-record Month and Student filters from overlapping at iPad widths.
- No Firebase, permission, payroll, or lesson business logic was changed.

## V17.12
- Restored the missing right border on the lesson month field.
- Forced month text centering across desktop Safari and iPadOS.

## V17.16 — Unified Payroll Core
- Added a single payroll calculation result shared by finance, settlement, dashboard payroll and exports.
- Added per-teacher payroll mode, overtime rate and short-hours deduction rate fields.
- Added fixed-salary deductions when actual hours are below the monthly minimum.
- Removed branch-specific fallback to legacy hourly payroll in settlement and finance.
- Upgraded branch-manager teacher payroll cards to display full minimum hours, actual hours, difference, formula, breakdown and weekly details.
- Left branch assignment and unassigned-branch data unchanged.

## V17.17 — Student CRM Independent Scroll
- Added separate vertical scrolling for the Student / Parent CRM editor and student list on desktop and landscape tablet layouts.
- Kept the CRM search toolbar and student table header visible while the student list scrolls.
- Added viewport-aware height recalculation for resize, orientation change, and iPad visual viewport changes.
- Preserved normal document scrolling on stacked tablet and mobile layouts.
- No CRM data, permissions, synchronization, or business logic changed.

## V17.18
- Added per-teacher company revenue KPI calculated from scheduled chargeable lessons.
## V17.19
- Enlarged each teacher company revenue KPI card and payable salary card.
- Prevented the five-card payroll KPI row from becoming too narrow.
- Preserved responsive tablet and mobile layouts.


## V18.0 — Information Architecture & Finance Center
- Dashboard now focuses on lesson counts, teaching hours, students, teachers, makeups and operational changes; monetary cards are hidden.
- Consolidated Company Finance, Teacher KPI and Monthly Settlement into one Finance Center with internal tabs.
- Added collapsible finance detail cards so expense and payroll details are loaded on demand visually.
- Added teacher KPI search and sorting controls.
- Renamed primary navigation around operations, CRM, course management and finance.
- Added a global floating quick-action menu for lessons, students, teachers, expenses and camp registration.
- Preserved existing finance, payroll, settlement and revenue calculation functions and data IDs.

## V18.1 — Enterprise Finance Center
- Reorganized Finance Center into Finance Overview, Teacher Salary / KPI, Student Collections and Expense Management.
- Removed the standalone Monthly Settlement navigation entry while preserving its calculations, records and exports.
- Rebuilt Teacher KPI as a searchable left-list and right-detail workspace.
- Added Student Collections summary cards and a collapsed searchable complete list.
- Restored reliable finance rendering by preserving every existing data target while moving it into the new modules.
- Standardized card alignment, grid containment and responsive desktop, iPad and mobile layouts.
- Preserved Firebase, permissions, synchronization, revenue formulas, payroll formulas and stored data structures.

## V18.1.1 — Finance UI Cleanup
- Removed the standalone Monthly Settlement navigation item and all settlement-only controls from the visible Student Collections workflow.
- Renamed the remaining collection filters and refresh action around student receivables.
- Replaced the dark navy and gold finance treatment with a lighter blue-gray enterprise palette.
- Isolated nested Finance Center navigation from global sidebar group labels that caused misalignment.
- Standardized finance headings, descriptions, tab labels and active-state alignment.
- Locked all four Finance Center module controls to identical dimensions in both normal and active states.
- Increased heading, description and module-label contrast for clearer reading.
- Replaced circular teacher initials with slim accent rails and decorated name rows.
- Added a light profile header, accent rule and stronger name hierarchy to Teacher KPI details.
- Aligned every teacher-list accent rail and name to fixed grid columns.
- Removed teacher-initial avatars from complete payroll cards and replaced them with line-decorated headers.
- Constrained desktop payroll cards and KPI grids to prevent horizontal overflow while preserving iPad stacking.

## V18.2 — Unified Tutoring and Summer Camp Revenue
- Defined total monthly revenue as tutoring timetable revenue plus summer-camp registration fees.
- Excluded camp timetable rows from student revenue so multi-teacher camps never multiply tuition.
- Preserved camp timetable rows for teacher hours and payroll calculations.
- Added separate Tutoring Revenue and Summer Camp Revenue lines to the finance breakdown and copied summary.
- Applied the same calculation to company-wide and branch-scoped finance views.

## V18.3 — Student LINE Billing Copy
- Added a per-student Copy LINE action to the monthly Student Collections table.
- Combined tutoring hours and Summer Camp registration dates into one parent-facing monthly message.
- Kept parent tutoring charges independent of teacher headcount.
- Omitted empty tutoring or Summer Camp sections automatically.
- Used the approved opening, totals and confirmation wording for the copied message.

## V18.3.1 — Family LINE Billing
- Grouped all children sharing the same parent into one LINE billing message.
- Added a per-child subtotal and one combined family monthly total.

## V18.3.2 — Finance Number Fit and Parent Matching
- Sized revenue cards for million-level totals and expense cards for hundred-thousand-level totals without overflow.
- Restricted family billing groups to students with the same normalized parent name only.
- Removed decorative brackets from parent-facing billing text.

## V18.3.3 — Visible Family Billing Scope
- Built each family message from the current month's visible settlement rows only.
- Prevented archived or unrelated database records from entering a parent's copied LINE bill.

## V18.3.4 — Complete Active Family Members
- Included active siblings sharing the same parent name even when a sibling is absent from the tutoring settlement rows.
- Continued excluding camp backing records and inactive student records.

## V18.3.5 — Complete Student Collections List
- Included Summer Camp registration-only students in the branch-scoped Student Collections table.
- Kept every student with either monthly lesson rows or Summer Camp receivables visible.

## V18.3.6 — Full Student Directory in Collections
- Displayed every student record in Student Collections, including students with zero activity in the selected month.
- Added the full student count to the expandable list heading.
- Kept the average leave rate based on students with lesson activity so zero-activity rows do not dilute it.

## V18.3.7 — Parent Search
- Added a dedicated parent-name search field beside the student search in Student Collections.
- Allowed student and parent filters to work independently or together.

## V18.4 — Finance Reconciliation
- Counted each tutoring lesson once for company revenue regardless of how many teachers share the lesson.
- Kept Summer Camp revenue sourced only from student registrations.
- Included all applicable teachers in KPI, payroll and salary detail lists, including zero-lesson and fixed-salary teachers.
- Reconciled finance revenue with Student Collections receivables.
- Standardized all five finance summary cards to the same height and reduced number typography to prevent clipping.

## V18.5 — Interface Clarity Refresh
- Separated calendar navigation, filters and tools into three visually distinct control bands.
- Simplified the calendar student filter by removing the redundant inline search box.
- Narrowed and condensed the Student CRM editor while widening the student directory.
- Improved CRM table hierarchy with clearer headers, zebra rows and compact actions.
- Reworked Lesson Records into a compact filter panel and scan-friendly fixed-column table.

## V18.6 — One-click Chinese / English UI
- Added a persistent EN / 中文 toggle for the complete application interface.
- Translated navigation, forms, filters, buttons, statuses, finance, camps, CRM, reports and dynamic UI labels.
- Preserved student, parent, teacher, course and financial data exactly as entered.
- Remembered the selected language across reloads and translated newly rendered interface elements automatically.

## V18.7 — Synchronized Finance Month
- Added a Data Month selector to Financial Overview, Teacher KPI, Student Collections and Expense Management.
- Synchronized all four selectors and underlying native month fields.
- Recalculated all four finance modules immediately after any month change.
- Filtered recurring expenses to records active in the selected month and one-time expenses to that exact month.

## V18.7.1 — Safari Month and Language Button Fix
- Updated finance data on month input, selection, blur or Enter in Safari.
- Persisted the active finance workspace month as the authoritative value for all finance calculations.
- Moved the language toggle into the header action group and automatically remounted it after authentication refreshes.
# V18.8 — 營隊課表與報名流程整合

- 將夏令營操作整理為「建立營隊課表」與「學生報名與收費」兩個連續步驟，明確區分老師工時與學生收入。
- 夏令營學生報名可選擇既有營隊課表，並一鍵帶入所選月份的全部課表日期，不必重複勾選。
- 報名紀錄保存所屬營隊；舊紀錄仍可依原日期推斷營隊，不破壞既有資料。
- 冬令營介面同步簡化說明，避免把建立課表誤認為另一套報名功能。
# V18.9 — 冬夏令營建立介面精簡

- 冬、夏令營改為單一建立表單，不再要求選擇學生、營隊代碼、教師群組或教室。
- 校區只保留「美術東」與「河西一路」，班級名稱改為直接輸入並自動建立班級資料。
- 新增早上／下午時段選項，仍可調整開始與結束時間、上課星期及日期範圍。
- 收費直接設定在營隊班級；既有學生報名與費用資料保留但不再顯示重複表單。
# V18.9.1 — 營隊日期欄位窄版修正

- 冬、夏令營表單在窄版畫面自動切換為單欄，開始與結束日期可完整顯示。
- 限制日期、時間、金額與選單寬度不超出卡片，避免 iPad 分割畫面或窄視窗裁切內容。
# V18.9.2 — 營隊日期完整顯示

- 營隊建立表單固定最多兩欄，不再以整個瀏覽器寬度誤判版面。
- 日期欄位取得足夠寬度，可完整顯示年、月、日。
# V18.9.3 — 日期欄改為完整列

- 開始日期與結束日期各自獨占一整列，避免 Safari 日期控制元件裁掉最後的天數。
- 調整日期欄字級與內距，完整顯示年、月、日。
# V18.10 — 移除冬夏令營獨立介面

- 側邊欄移除「夏令營」與「冬令營」，快速新增選單同步移除夏令營報名入口。
- 冬夏令營獨立建立介面停止顯示，營隊課程改由一般課表直接安排。
- 財務中心「學生收款」完整保留；既有營隊課程、收費與歷史資料均未刪除。
# V18.10.1 — 保留夏令營學生收費

- 側邊欄恢復單一「夏令營收費」入口，只顯示學生報名日期與費用功能。
- 夏令營班級建立、教師群組、整期排課與冬令營介面維持移除。
- 營隊課程繼續使用一般課表安排；既有夏令營收費紀錄完整保留。
# V18.11 — 夏令營收費版面與 LINE 合併對帳

- 夏令營收費重新分區為學生／月份、計價、日期與應收摘要；只顯示目前計價方式需要的費率欄位。
- 日期選擇改為清楚的七欄卡片，改善勾選框、日期與星期的辨識度及響應式排列。
- 新增「複製完整 LINE 收費」：家教與夏令營分開列小計，最後合併本月應收；同一家長的多位孩子一起統計。
- 確認收入計算仍維持一般課表家教收入與夏令營報名收入分流，避免重複計算。
# V18.12 — 夏令營日期改為課表月曆排列

- 日期選擇改為與課表管理一致的週一至週日七欄月曆。
- 每月第一天依實際星期定位，前方自動留白，不再把 1 日固定放在第一欄。
- 週末使用不同底色；窄版維持完整七欄並提供橫向查看，星期位置不會被打亂。
# V18.12.1 — 夏令營收費欄位等尺寸

- 學生、校區、月份、計價方式、費率與應收摘要統一為三欄等寬卡片。
- 所有設定卡片統一高度、內距、邊框與輸入框高度，消除大小不一的視覺落差。
- iPad 自動改為兩欄，手機改為單欄。
# V18.12.2 — 夏令營收費高級等尺寸卡片

- 上方六個設定區改為完全一致的高度、內距、圓角、邊框與細緻漸層飾線。
- 標題、輸入內容及摘要數值統一字級與字重，移除金額過度放大的視覺落差。
- 學生選擇移除重複下拉框，只保留單一可搜尋選擇欄位。

# V20.2 — 桌面課表互動控制器重建

- 桌面課表的點選、框選、複製、貼上與拖曳改由單一事件控制器處理，不再同時執行舊版逐課程事件。
- 第一次 Control／Command 點選立即生效；複製後直接點日期或時間格即可立即貼上。
- 月曆日期格與週課表五分鐘時間格共用同一拖放目標判斷，完成貼上或拖曳後自動退出多選狀態。
- 日曆重新繪製時只更新課程卡狀態，不再重複綁定事件；服務工作程式同步換版以清除舊快取。
- 撞課檢查統一排除取消、已取消、停課及舊英文停用狀態，避免空白日期被歷史紀錄誤擋。
- 滑鼠停在課程上可直接按 Control／Command+C 複製，不必先進行第二次選取。
- 複製貼上的鍵盤、滑鼠、框選、右鍵與目標日期處理全部集中到同一控制器，綜合功能模組不再註冊課表剪貼簿事件。
- 月曆日期格、週課表時間格及課程卡上方皆會即時記錄貼上目標，Control／Command+V 不再等待下一個滑鼠動作。
- 桌面拖曳不再依賴 Safari 原生 drag/drop，改由指標座標直接辨識放開位置；課程拖到月曆日期格或週課表時間格後立即移動。
- 桌面選取、複製貼上與拖曳完整回復到最後可用的 `799c30b` 實作，移除其後連續堆疊的互動控制器版本；其他權限、資料、手機與財務修正維持不變。

# V20.4.1 — 課表拖曳與即時貼上修復

- 日曆固定使用同一個容器，不再透過複製替換節點清除事件。
- 老闆端課程與日期格每次重畫都取得完整拖曳及放下事件；老師與校區管理者維持唯讀。
- 移除會因舊角色狀態在全頁捕獲階段誤擋老闆拖曳的攔截器。
- 複製完成立即退出多選、保留剪貼簿並恢復拖曳，點選日期或時間格即可直接貼上。
- 貼上目標持續依滑鼠所在日期／時間更新，不因日曆重畫而遺失。

# V20.5 — 單一課表互動控制器

- 框選、課程點選、拖曳、放下、複製與貼上統一由固定日曆容器處理，不再由多套事件競爭。
- 框選結束時直接使用放開座標重新計算命中課程，快速第一次滑動也能立即選取。
- 拖曳放下以瀏覽器剪貼資料或內部課程 ID 任一者為準，修正 Safari 能拉起但放不下。
- 貼上改在日期格 pointerdown 當下執行，不再依賴可能被權限攔截的 click。
- 移除老師／校區管理者的全頁日期點擊攔截；單一控制器仍依即時角色維持唯讀。
## V20.5.1 — Reliable desktop calendar completion

- Replaced desktop HTML5 `draggable`/`dataTransfer` movement with one pointer-driven controller so Safari and other desktop browsers resolve the drop date consistently.
- Restored the missing shared calendar-selection cleanup function that previously stopped a move after the lesson object changed but before save and rerender.
- Kept marquee selection, copy/paste, drag completion, and selection exit in the same delegated calendar controller.

## V20.5.2 — Immediate calendar rerender

- Calendar mutations now detect the active calendar from both the section class and the navigation state on `body`.
- Drag, paste, and other saved calendar changes rerender immediately instead of waiting for a refresh or tab round trip.

## V20.5.3 — Calendar-first rendering and focused selection

- Active calendars now rerender before unrelated dashboards and reports, so another renderer cannot delay visible schedule changes.
- Selected and dragged lessons use an inset card highlight; destination cells use a quiet background cue instead of a heavy outer frame.

## V20.5.4 — Resilient save and immediate schedule DOM

- The calendar now rerenders unconditionally at the start of every full render, including while its section is hidden.
- A failure in an unrelated view renderer is logged but can no longer abort the cloud dirty guard or upload scheduling after local data has been saved.
- Backup and undo controls update in a `finally` block after every successful local persistence write.

## V20.5.5 — Guaranteed Owner cloud scheduling

- Owner dirty-state hashing and cloud upload scheduling now run in a `finally` block around local persistence.
- Calendar updates continue to upload the main database, publish teacher and branch views, and create schedule notifications even if a local view renderer reports an error.
- Exposed the same guarded cloud queue for direct persistence workflows that do not call the standard save wrapper.

## V20.5.6 — Single persistence-to-cloud handoff

- Every successful calendar mutation now schedules cloud synchronization from the shared persistence endpoint used by drag, paste, delete, batch edit, and lesson editing.
- The Firebase wrapper remains responsible for role enforcement but no longer owns a second, order-sensitive cloud scheduling call.
- Updated the data, cloud module, and Service Worker versions so a deployed client can replace stale schedule code immediately.

## V20.5.7 — Calendar-independent immediate rendering

- Calendar rendering no longer runs settlement-month setup before drawing the month or week view.
- Full application rendering now paints the calendar before initializing unrelated sections, so their errors cannot leave the current schedule DOM stale.
- Drag, paste, delete, and lesson edits therefore display from the mutated in-memory database before cloud synchronization begins.
# V20.18.0 — 可安裝 PWA 與安全更新提示

- 老師可從系統頂端直接安裝，iPhone／iPad 會顯示清楚的 Safari「加入主畫面」步驟。
- 新版本下載完成後顯示「立即更新／稍後」提示，不再在使用途中靜默切換程式版本。
- 接受更新後只重新載入一次；已儲存的 Firebase 資料與角色權限不受影響。
- 補齊穩定的 PWA 識別、分類、顯示模式與安裝資源快取。

# V20.18.1 — 金色羽毛 App 圖示

- PWA、iPhone／iPad 主畫面與 Android 安裝圖示改用登入封面同一份金色羽毛原始素材。
- 一般圖示保留完整羽毛比例，Android maskable 圖示另留安全邊界，避免圓形或圓角裁切切到羽毛。
- 新增 1024px 高解析圖示並更新快取版本；課表、薪資、資料與角色權限程式均未變更。
- 首次安裝 Service Worker 不再誤觸重新載入；只有使用者按下「立即更新」後才切換並重開。
- 更新完成同時監聽控制權切換與正式啟用事件，任一先完成都只重新載入一次，避免按下更新後仍停留舊頁。

# V20.18.3 — Owner 單點課程直接編輯

- Owner 單點月曆或週課表的課程卡，直接開啟該堂課的編輯視窗，不再先停在唯讀詳情抽屜。
- 老師仍開啟本人課堂回報；校區管理者仍依本人授課與校區權限開啟可回報或唯讀內容，角色規則不變。

# V20.19.1 — 角色切換後導覽修復

- 修正切換 Google 帳號／角色後，校區管理者左側功能選單事件失效、點擊仍停在營運總覽的問題。
- 導覽列改用單一且可重複安裝的上層點擊處理，避免登出再登入後個別按鈕事件失效。
- 課表更新通知按下「知道了」後立即關閉，不再等待大量已讀寫入完成而長時間遮住校區選單。
- 登出再切換角色時清除前一角色建立的總覽捷徑，老師端不再殘留校區管理者的課程、補課與財務按鈕。
- 老師每次開啟「我的課表」都固定回到本週週檢視，手機版工具列同步壓縮，避免底部導覽遮住列印按鈕。
