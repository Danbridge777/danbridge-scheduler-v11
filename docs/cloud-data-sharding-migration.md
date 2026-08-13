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
