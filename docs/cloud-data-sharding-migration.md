# Danbridge 主資料分片遷移規格

## 不可妥協條件

- 正式資料遷移前再次取得使用者確認。
- 遷移期間既有 `companies/danbridge/data/main` 始終是唯一正式來源；未啟用分片不能被任何角色讀取為正式資料。
- 不允許整份舊資料覆蓋較新的正式版本。
- 16 個集合、每個集合筆數、總筆數與完整資料雜湊必須全部一致，否則停止。
- `changes` 沒有固定 ID；legacy 畫面維持最新在前，但逐筆儲存改為最舊到最新的不可變追加序列，不做去重，讀回時再還原原畫面順序。
- 未知集合、缺片、重複片、單筆超限或重組雜湊不符一律停止。

## 分片範圍

`students`、`teachers`、`lessons`、`makeups`、`changes`、`teacherGroups`、`winterTeacherGroups`、`summerCampClasses`、`summerCampRegistrations`、`winterCampRegistrations`、`winterCampClasses`、`settlementRecords`、`fixedExpenses`、`oneTimeExpenses`、`collectionRecords`、`branches`。

## 安全啟用流程

1. 唯讀取得正式主文件與 `clientHash`，產生固定 generation ID。
2. 在記憶體建立每片不超過 180,000 bytes 的新世代。
3. 將新世代寫入未啟用命名空間；舊版客戶端完全不會讀取。
4. 重新讀回所有分片，逐集合驗證分片序號、筆數、總筆數及完整雜湊。
5. 交易內再次讀取舊主文件；若 `clientHash` 已變，整次啟用作廢並從新版本重做。
6. 只有舊主文件雜湊仍等於新世代 `sourceHash` 時，才在交易內建立啟用指標。
7. 新版客戶端看到啟用指標後，仍須讀完並驗證新世代；驗證失敗時阻止操作，不可默默退回可能不同版本。
8. 完成雙讀觀察期與跨裝置壓力測試後，才另案移除舊主文件寫入；舊文件不在本階段刪除。

目前狀態：上述正式寫入與啟用功能尚未接入正式網站；新增的 Firestore 規則與交易情境只在 Emulator 驗證，不部署 production。

## 併發保護

- Owner 與 Owner：延續 Base／Local／Remote 三方合併；最終世代指標以正式最新版雜湊作前置條件。
- aa 與 Owner：aa 要求仍先以單筆 request 排隊；Owner 依最新版套用，不能由 aa 直接重寫分片。
- 上傳中新增修改：本機 mutation version 改變時繼續排入下一輪，不算完成。
- 相同欄位衝突：正式值與可恢復衝突備份仍須在同一原子提交邏輯中完成。

## 正式遷移前必須產出的確認資料

- 正式主文件 SHA-256、估計 bytes、16 集合各自筆數。
- 預計 generation ID、分片總數、每片 bytes、重組後 SHA-256。
- aa pending／隔離數、Owner 待上傳狀態、角色檢視待送狀態。
- 最近安全快照日期與雜湊。
- Emulator 雙 Owner 各新增 100 堂、舊 Base 修改、同欄衝突、刪除對修改、三來源連寫全部通過證據。

## staging 遷移前不可覆寫備份

- 備份使用頂層 `stagingMigrationBackups` 命名空間，不受 `companies/{companyId}/{document=**}` Owner 萬用寫入規則影響。
- 每個分片與 v2 verified manifest 都只能建立，任何 Owner 均不能更新或刪除。
- 完整性雜湊必須是 canonical JSON 的 64 字元 SHA-256；早期 v1 非加密雜湊 run 不具最終遷移保護點資格。
- 分片全部寫完後必須從 Firestore 重新讀回並重組 16 個集合；來源版本、SHA-256、集合筆數、總筆數或分片數任一不符，皆不得建立 verified manifest。
- 目前仍是 staging Owner 手動入口，未接入 `uploadOwnerState()`、未接管讀取，也未部署 production。

## staging 隔離復原演練

- 只接受 v2 verified immutable backup ID，先重新讀取 manifest 與全部來源分片並驗證 SHA-256。
- 重建的 16 集合只寫入頂層 `stagingMigrationRestoreDrills` 沙盒，不寫入 `companies/danbridge/data/main`。
- 沙盒分片寫完後再次從 Firestore 讀回、重組、核對集合筆數、總筆數與 SHA-256。
- 演練前後主文件 `clientHash` 必須相同；任何版本變動都不建立 verified receipt。
- 沙盒分片與 receipt 同樣只能建立，Owner 不能更新或刪除；老師、排課專員與校區管理者不能讀取。

## staging 全 16 集合逐筆影子層

- 使用獨立 `stagingFullRecordShadows` 命名空間，涵蓋本規格列出的全部 16 集合，不取代既有三集合影子層。
- 除 `changes` 外，每筆文件沿用資料本身的穩定 ID；缺少、重複或無效 ID 時整批停止。
- `changes` 不增加業務 ID，影子文件鍵由不可變追加序號與 canonical 內容指紋組成；legacy 每次插在陣列最前的新異動只會在逐筆層尾端新增一筆，重新讀回時強制序號連續、保留重複內容並恢復最新在前的畫面順序。
- 每次新增、修改、墓碑及墓碑重建都增加 revision；transaction 必須先讀完同批現況才寫，衝突立即停止。
- staging 實機已完成首次 16 筆寫入、逐集合雲端讀回、第二批中斷、只續傳剩餘兩筆、清理墓碑與重新整理零寫入驗證。
- 此層仍是 staging Owner 手動入口，不接入 `uploadOwnerState()`、不接管任何角色讀取，也不部署 production。

## staging live 逐筆執行預檢

- 首次灌入時 live 逐筆集合可以是空的；遷移前 verified 備份與復原 receipt 必須對應即將遷入的完整 legacy 目標資料，不可錯拿空的 live 來源比對。
- 預檢會唯讀取得 legacy 主文件、不可覆寫備份、持久化復原 receipt、16 個 live 集合與 live 控制文件，再重新演算每筆 operation 的 revision 與前後 SHA-256 鏈。
- manifest 同時鎖定完整 operation plan hash 與逐筆 operation list hash、來源與目標逐集合筆數、有效／墓碑／實體文件數、本次配額上限及含三輪交易讀取重試的保守預估；每筆按 record、控制、不可覆寫憑證實際計為 3 讀／3 寫。每輪最多 100 筆，分批輪數、每輪重新核對五份啟用證據、三次中斷／雙分頁額外重進、兩次全量讀回與最終啟用成本都另行計入。任何版本改變、缺集合、筆數或 hash 不符都停止。
- 唯讀預檢與執行入口嚴格分離：預檢永遠是 `writes: 0`；執行必須另帶 `stagingLiveExecute=manual` 並由 Owner 再按一次按鈕，不會自動觸發。
- 執行前先把完整 manifest 與操作計畫放進同一個 environment／email／manifest 專屬 IndexedDB 原子封套，並重新計算逐筆清單 hash；保存完成後才允許同一交易建立不可覆寫雲端 manifest 與 v2 控制。每次續傳都先核對雲端 manifest；若中斷發生在雲端 manifest 建立前，則由本機封套完整驗證並冪等補建，因此不能遺失恢復依據，也不能越過失敗或隔離的首筆。
- 每筆 record、控制與不可覆寫完成憑證必須在同一交易推進；實體刪除永久禁止。另一台裝置即使已往後執行，較早操作仍可由憑證辨認為已完成，不會重寫或假確認。完成後重新讀回 16 集合，SHA-256、文件數、有效數與墓碑數全部一致才將控制由 `verifying` 改為 `active`，啟用後再做第二次完整讀回。
- 前一輪只有在 `active` 完成狀態才能原子換綁下一份 manifest；全域 root revision 延續、每輪 confirmed 計數歸零。Emulator 已連續驗證新增、修改、墓碑、墓碑重建 revision 1→4。
- release `20.26.92` 將逐筆計畫由每筆重算整份資料 SHA-256，改為每筆不可竄改的小型 SHA-256 鏈，最後仍重新建立完整 16 集合並核對整份 SHA-256；實際 1,709 筆備份由 128 秒降至 1 秒內，10,000 筆首次建立也完成完整 hash／revision 重建驗證。
- release `20.26.93` 將 verified 備份、復原、憑證重讀與失敗演練改成可見的 Owner 手動按鈕；開啟或重整測試網址不會自動寫入，實測不再依賴隱藏狀態。
- release `20.26.94` 讓逐筆執行與重整續傳按鈕顯示完整 manifest SHA-256，所有續傳證據可直接由畫面核對。
- release `20.26.95` 將 legacy 最新在前的 `changes` 轉成逐筆層最舊到最新的永久追加序列，避免正常新增被誤判成歷史重排；讀回仍恢復原畫面順序。
- 這些執行元件只部署到 `danbridge-d8877-staging`，只提供 Owner 手動測試入口；仍未部署 production，且 `uploadOwnerStateAttached: false`、`readTakeover: false`、`productionAllowed: false`。

## 2026-08-15 staging live gate 紀錄

- staging Hosting 與 Firestore Rules 只用完整專案 ID `danbridge-d8877-staging` 部署；本機 `.firebaserc` 的 default 是 production，因此禁止省略 `--project danbridge-d8877-staging`。
- staging 線上 `index.html`、`sw.js`、主同步模組、live activation、Firebase adapter 與瀏覽器永久日誌模組的 SHA-256 已逐一比對本機且完全一致。
- Daniel Owner 實際登入後確認 staging legacy 主資料仍是學生 1、老師 1、課程 1；沒有接管讀取或掛入 `uploadOwnerState()`。
- 2026-08-15 13:45（Asia/Taipei）建立當下版本不可覆寫備份時，Firestore 在第一批交易回覆 `Quota exceeded`。候選 backup ID `erLB88af6FaAsDyTHEFo` 的 `completedChunks` 為 0、`verified` 為 false，禁止作為任何後續預檢或執行證據，也不應嘗試補成 verified。
- 配額重置後必須從當下 legacy 主文件重新產生全新 backup ID，完成全部分片讀回與 verified manifest，再以該新 ID 建立全新 restore drill／receipt；不得重用本次失敗 ID或更舊版本的 receipt。
- 第一輪 live 執行仍須先按「唯讀預檢」，核對 `writes: 0`、16 集合、來源／目標 hash、文件／有效／墓碑數和保守配額；只有同一頁面證據保持不變時，才可按獨立的手動執行按鈕。
- staging 實跑尚待完成：首次逐筆建立、修改、墓碑、墓碑重建、重整後第二次讀回、失敗／中斷續傳、雙分頁競爭與 Daniel／Catherine／aa／一般老師角色矩陣。完成前不得接管任何讀寫，也不得部署 production。

## 舊碼與回復安全網保留原則

- 已淘汰的 live v1 控制格式與寫入邏輯已由 v2 manifest 綁定控制取代，Rules 不再接受 v1。
- 目前其餘 legacy 主文件、不可覆寫備份、復原沙盒、既有候選影子與角色檢視仍有比對或回復用途，不屬於死碼；在 staging 真人回歸、讀取候選、回復演練與觀察期全部完成前不得刪除。
- 每次清理前必須先做全專案引用掃描與完整回歸；找不到明確零入口、零測試、零回復依賴證據時一律保留。
