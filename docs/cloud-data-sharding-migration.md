# Danbridge 主資料分片遷移規格

## 不可妥協條件

- 正式資料遷移前再次取得使用者確認。
- 遷移期間既有 `companies/danbridge/data/main` 始終是唯一正式來源；未啟用分片不能被任何角色讀取為正式資料。
- 不允許整份舊資料覆蓋較新的正式版本。
- 16 個集合、每個集合筆數、總筆數與完整資料雜湊必須全部一致，否則停止。
- `changes` 沒有固定 ID，必須依陣列順序保存，不做去重。
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
- `changes` 不增加業務 ID，影子文件鍵由原始序號與 canonical 內容指紋組成；重新讀回時強制序號連續並保留重複內容。
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
- 這些執行元件目前只存在本機程式碼，仍未部署 staging 或 production；`uploadOwnerStateAttached: false`、`readTakeover: false`、`productionAllowed: false`。

## 舊碼與回復安全網保留原則

- 已淘汰的 live v1 控制格式與寫入邏輯已由 v2 manifest 綁定控制取代，Rules 不再接受 v1。
- 目前其餘 legacy 主文件、不可覆寫備份、復原沙盒、既有候選影子與角色檢視仍有比對或回復用途，不屬於死碼；在 staging 真人回歸、讀取候選、回復演練與觀察期全部完成前不得刪除。
- 每次清理前必須先做全專案引用掃描與完整回歸；找不到明確零入口、零測試、零回復依賴證據時一律保留。
