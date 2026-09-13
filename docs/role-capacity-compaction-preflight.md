# 角色容量縮減：唯讀預檢與本機候選驗證

日期：2026-09-13。正式基線 20.26.319 / f5160cd。

## 狀態與範圍

staging 與正式 20.26.320 已部署，正式容量精簡及雲端讀回已完成；未刪除正式／測試業務資料。
正式精簡結果以下方發布後讀回為準。發布後 Mac 鎖定，尚未再次操作正式 UI；不得把雲端核對稱為發布後實機全功能驗收。
使用者要求容量低於 30%，且老師可見資料、權限、功能及同步不能改變。

## 正式唯讀證據

`tools/preflight_role_capacity_compaction_readonly.mjs` 於 2026-09-13T01:25:06.951Z 完成。
authority revision 647、1,182 堂有效課、7 個角色；主資料重建雜湊與安全欄位一致。
每個角色的已發布分塊完整重建，與權限過濾後主資料及相容副本一致。
讀取前後 authority／角色文件版本一致；cloudWrites=0。

估值依原有 JSON UTF-8 bytes + 2,048 bytes 保守裕量，安全預算維持 800,000 bytes；不是整個 Firebase 空間比例，也不是 Firestore 原生序列化實測大小。

| 角色 | 現行 bytes | 只移除內嵌重複 db 後 bytes | 占安全預算 |
| --- | ---: | ---: | ---: |
| 排課 | 622865 | 77064 | 9.633% |
| 校區主管 | 367903 | 62100 | 7.7625% |
| 教師 1 | 133411 | 36547 | 4.5684% |
| 教師 2 | 129230 | 35568 | 4.446% |
| 教師 3 | 127489 | 34049 | 4.2561% |
| 教師 4 | 137391 | 36340 | 4.5425% |
| 教師 5 | 27856 | 9540 | 1.1925% |

所有角色低於目標 240,000 bytes；現有分塊最大估值 8,546 bytes。沒有刪課、改 ID、變更費率或擴張角色範圍。
這是當前資料的縮減可行性證明，不是未來無限容量保證；分塊索引仍會隨資料增長。

## 本機候選修補

- `published-role-chunk-plan.cjs`：同一 authority revision／manifest 下，由相容模式切成分塊模式時仍需移除 db/scopedDb；原本提前返回會略過這次格式切換。保留同一 manifest、分塊與權限，重複執行為空操作。
- `production-role-capacity.cjs`：分塊模式仍量測索引文件的真實大小，分開統計相容／純分塊角色，不把移除副本誤報成 0% 使用。
- 新增同版本格式切換、內容完整性、冪等與回復相容模式測試。

## 已完成驗證

- 容量／planner／health 定向：22 pass、0 fail、0 skip。
- 角色傳輸：103 pass、0 fail、2 emulator 條件略過；另行 native Firestore suite 實跑上述 Owner 模式。
- 計費、LINE、薪資、權限投影及課表熱路徑回歸：82 pass、0 fail、0 skip。
- 八種瀏覽器引擎／尺寸配置 × teacher/scheduler/branch_manager：24 pass、0 fail；40 筆新增／移動／複製／刪除循環、前景恢復與撤權拒絕。不代表八部實體裝置或真實 Google 登入。
- 本機 native Firestore Owner 相容／分塊交易、角色 Rules 及 Chromium/WebKit 原生 UI：9 pass、0 fail、0 skip。包含四收件者通知原子性、40 筆連續操作及重送／撤權。
- 新增 native 同 revision 縮減／重複執行／回復：1 pass、0 fail、0 skip；三角色分塊讀回與縮減前內容一致，權限欄位不變、沒有生成通知、所有合成資料已清除。

## 失敗與修正紀錄

- 第一輪瀏覽器 24 fail：本機 4173 已有 PID 28461，cwd 是 release-v20.26.122，測試重用此服務造成前景恢復案例失敗。沒有將失敗算通過或停止使用者服務；獨立 4289 埠同一份候選程式重測 24/24 通過。正式站未涉及。
- 第一輪 emulator 因系統 PATH 缺少 Java 無法啟動；改用既有 `/Users/daniel/.cache/danbridge-rules-runtime/Contents/Home/bin`。
- 新 native 測試先因不符既有合成 namespace 前綴被拒，再因測試主管缺少必填 teacherId 未生成第三角色。僅補正測試資料，未放寬任何隔離／授權條件；最終 1/1 通過。

## 正式切換前門檻與核對項目

1. staging 部署候選並實際驗證四個授權帳號；老師、AA、校區主管及 Owner 的正常頁面／通知／薪資不可失效。
2. 必須確認所有員工裝置上的舊分頁已儲存與同步完成，安全關閉重開。沒有證據的舊頁仍可能依赖 db/scopedDb，不能強制刷新或直接刪掉相容支援。
3. 核對所有正式角色發布端一致使用分塊模式，防止某個舊函式回寫相容副本；只改必要發布端，不改 Rules/IAM/計費/業務 ID。
4. 切換前再次以最新 authority/version 預檢，完整交易發布；事後逐角色核對内容雜湊、通知與功能、容量讀回，保留精確回復方案。

使用者已明確確認「所有人的分頁都已同步完成並重開」，並再次授權驗收通過後直接正式發布。

## staging 實際切換與修正補充

- 隔離 workspace `80190109-2684-4a92-a726-abf3cae53b5a`：角色精簡後 authority revision 4675，124 堂課完整，teacher/scheduler 已無 db；每個分塊內容等於權限過濾後權威資料。
- 原「驗證角色權限」按鈕仍以內嵌副本稽核，精簡後誤報。改成分塊稽核後，staging Rules 又正確拒絕 Owner 瀏覽器讀取其他角色分塊。因此按鈕改呼叫既有受保護 publisher 的明確 verifyReadback 選項；後端重新讀取 authority、角色及所有分塊，驗證身分／來源／內容／讀取期間版本一致後，僅回傳摘要。沒有放寬 Rules，也不增加正常排課的稽核讀取成本。
- 20.26.320 的 Daniel 按鈕實際顯示「角色權限已驗證」。受保護函式來源 271 檔逐一核對；revision `stagingpublishedworkspaceoperation-00040-yon`，來源 manifest SHA256 `c386d94a997572b68ab38885a34b6850acc0ec8e9bcee0c4a41214b0defed0e4`。沿用 319 工具輸出的 release 標籤是工具固定字串，不代表來源仍是 319；來源逐檔核對才是本輪依據。
- staging Hosting 353 個 browser assets 與本機 320 全部相同。
- Native AX setValue 首次未形成真實欄位內容差異，故第一次儲存／復原 **不算雲端寫入驗收**。改用實際鍵盤貼上，確認備註有值再儲存，authority 前進 4677；四個收件者各一則通知，全部已讀已獨立讀回。Catherine 首次已讀遇安全驗證失敗，未讀保留；重新載入後重試成功。不宣稱原 App Check 首次失敗根因已解決。
- 張毅／AA 真實頁面可讀課表；Daniel／Catherine 可見 Owner 畫面及通知；本輪沒有登入 Lucas。校區主管使用 native Rules、瀏覽器 fixture 和正式權限投影完整比對驗證，不能稱 Lucas 本人實機驗收。
- 復原後 revision 4679，124 堂逐筆 lessonRecordsHash 回到 `record-v1:0d47c04eb61d9c924d88003608bbc58de9235a0b110b5e5f0845c75bbaceb8c5`，与修改前相同；不是只比較堂數。沒有刪除既有隔離 workspace。
- 最終 native cutover／完整 audit 缺片拒絕／撤權／回復及 Owner 原子發布：7 pass，0 fail，0 skip。瀏覽器回歸重跑 24/24。通知回歸 44/44；計費等 first-priority 82/82；leave release 11 pass、1 條件略過（非此次容量修改）。
- 快取命名第一次變更不符既有測試約定，已保留原 prefix、只增到 351；重測通過。未將該失敗計為通過。

## 正式發布前再次唯讀

2026-09-13T02:10:05.494Z：revision 647，1,182 堂、7 角色，所有 authority／分塊／相容副本仍一致，最大仍 622,865 bytes。所有縮減估值與上表一致。

## 正式發布後讀回

2026-09-13 正式 20.26.320 已發布：

- Hosting 的 353 個 browser assets SHA256 與本機 320 全部一致，沒有不符檔案。
- 四個函式均 ACTIVE、DANBRIDGE_ROLE_TRANSPORT=published-v1，部署來源逐檔雜湊核對一致；服務帳號、資源設定、網路設定與其他 DANBRIDGE 環境變數未變。
  - productionTrustedOperation：productiontrustedoperation-00009-cij
  - productionSchedulerOperation：productionscheduleroperation-00010-fip
  - productionPublishRoleViews：productionpublishroleviews-00010-vus
  - productionHealthRefresh：productionhealthrefresh-00003-cec
- 精簡交易僅移除 7 個角色頭文件的重複 db/scopedDb 欄位；分塊、manifest、角色內容與權限投影前後完全相同。allRoleContentsUnchanged=true，authorityWrites=0、notificationWrites=0、permissionWrites=0。
- 正式 authority revision 647 未變，1,182 堂有效課完整保留。最大頭文件由 622,865 bytes（77.9%）降為 77,064 bytes（9.633%），7 個純分塊角色、0 個相容副本；其餘角色精簡後大小與上表一致。
- Rules 維持 projects/danbridge-d8877/rulesets/44c05b87-192b-43c0-aae0-48a5436be790；未修改 IAM、計費、薪資或業務 ID。
- 精確交易前備份保存在本機 `/private/tmp/danbridge-capacity-320-role-backup-1789265720554.json`，權限 0600，未提交 Git。該檔位於暫存目錄，不作為長期備份保證；正式 PITR 另已啟用。刪除的僅是可由保留分塊重建的重複副本。
- 2026-09-13T02:20:41.918Z 唯讀核對：health.checkedAt=2026-09-13T02:17:22.699Z，state=healthy、alerts=[]、recentErrors=0、pendingRequests=0；roleCount=7、chunkOnlyRoleCount=7、compatibleRoleCount=0、maximumBytes=77064、budgetBytes=800000。PITR 及刪除保護均啟用。
- 健康唯讀工具未解碼 Firestore doubleValue，輸出的 ratio 為 null；本報告百分比以已讀回整數 77064 / 800000 計算，不把 null 當成 0%。

範圍限制：staging 四帳號、分塊內容及通知回寫已實際驗證；發布後正式環境完成來源、容量、內容、權限投影與健康狀態核對，但因 Mac 鎖定未再次操作正式頁面。Lucas 本人帳號未登入；使用既有隔離／投影測試核對其角色範圍。本次沒有宣稱解決首次 App Check 失敗根因、未來所有情境零故障或同步速度新保證。
