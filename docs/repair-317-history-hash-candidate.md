# 317 歷程 canonical bytes 重用與正式發布核對

`recordDataDigest` 原先先產生每筆 changes 的 FNV 文件 ID，接著丟掉 ID、複製資料、再次產生 canonical JSON，最後才算完整 SHA-256。
候選只省去不進入完整雜湊的 ID 與重複 canonical 化；仍逐筆執行相同 lossless JSON 驗證，直接把這次得到的 canonical bytes 加入完整 16 集合 SHA。
不快取任何資料、ID、權限或整體雜湊；changes 時序、重複項目、整數屬性順序、非法值及 accessor 拒絕條件不變。

## 已完成

- 資料雜湊／同步 runtime／Worker：23 通過、0 失敗。
- 2,005 筆合成歷程，同機 Node 12 次（前兩次暖機不計）：原運算平均 22.3258 ms，候選 11.5897 ms。
- 兩者 SHA 相同：`f0ee195a519106b9f6daac35ade12c560d1cf4dd84b99603c541f9dc56f5b8e6`。
- 30,000 堂課既有雜湊等值測試通過；sparse outer changes 仍與原版一樣拒絕，不放寬成接受。
- 升版 317 後完整回歸：1358 項，1349 通過、9 項需要外部環境略過、0 失敗。
- 原生 Firestore 模擬器：11 通過、0 失敗、0 略過。
- 本機獨立瀏覽器：8 種裝置設定、16 項全部通過；涵蓋 40 堂規劃時仍能輸入、20 堂新增／移動／刪除重複六次、已提交回應遺失後重送不重複套用。裝置設定不是八種實體裝置，也不是雲端同步秒數。

## Staging 實測與使用者接受的範圍

- 317 前端已部署 staging 主站；62 個受檢瀏覽器資產 SHA 完全相同。後端是 stagingpublishedworkspaceoperation-00036-fuh（316）。
- 八堂移動／復原／重做／復原：5774、3431、3779、4054 ms；單堂移動／復原：3992、3173 ms。包含 UI 排隊到角色發布確認，不含收件端繪製。
- revision 4593 獨立讀回：124 堂，authorityVerified=true，完整課程雜湊仍為 record-v1:0d47c04eb61d9c924d88003608bbc58de9235a0b110b5e5f0845c75bbaceb8c5；AA／教師分片與相容檢視都等於權威投影，formalDataWrites=0。
- 最新補測 Chromium／WebKit 計費 LINE、薪資換月、草稿恢復、安全更新、通知、首次複製與 AA 新增後立即移動刪除：58 通過，0 失敗。
- 使用者接受目前測得速度，明確停止追求 2.5 秒。這不代表未來最慢值保證，也不代表背景分頁同步繪製或持續 120Hz 達標。
- 使用者已確認 Daniel、Catherine 所有正式分頁已儲存、同步完成且可重開。
- 不帶入未部署的 staging admission 額外優化。正式 Owner／AA 只在已驗收的新傳輸開關下使用相同版本驗證快取；不快取角色或略過完整雜湊。

## 正式切換前的容量證據

唯讀：正式 revision 645，1182 堂，7 個角色；1400 個不可變分片、14 個 head；AA 最大 head 620817 bytes，小於 800000 bytes 保守預算。沒有改正式課表。
正式部署、規則與讀回結果須以下續記錄為準，不能將本文件視為已啟用後端的證據。

## 2026-09-12 正式發布進度

- 正式前端已發布 317。全量 351 個 JS／CSS／圖片／圖示／入口與 manifest 資產均 HTTP 成功且 SHA 相同；不是只驗證變更的 62 個檔案。
- 正式未登入 Chromium／WebKit 入口檢查 4 通過；私有資料隔離、關鍵老師與財務資源版本正確。
- 使用者確認所有 Owner 分頁儲存同步完成後，09:38:54 UTC 暫停正式寫入；權威 revision 645、完整雜湊 record-v1:ae875dbfaa5e2b0165cf9192bcfef2e0ea2cfc76ba760d5db7cb2fdd4513777f 不變。只變更安全控制，不寫課程或財務。
- 正式規則新版本 200fb995-a662-4179-8787-d8e5a1d3d0e6，全文 SHA 2a397d540d36487ed15a70a6168ebebced40888e95a0cdebc996789637b78852；由原 ad7ddf44-0ef1-42d4-b534-bb03291f9e87 精確增補。第一次 API 建立因預設資料庫多送 attachment_point 遭 400；依 CLI 相同格式省略後成功，讀回全文相同。沒有把第一次失敗列為通過。
- 四個正式函式皆 ACTIVE 且 DANBRIDGE_ROLE_TRANSPORT=published-v1-compatible：trusted 00007-mug、scheduler 00008-xup、role publisher 00009-cep、notification publisher 00003-loq。
- 四個部署來源 ZIP 的 SHA 均為 aed964c68fada7cc0fe82e8399f08d01f72cec1551daba3d9938f8be037090cf；各 267 個 runtime／依賴清單檔案逐檔比對相同。
- CPU／記憶體／concurrency／minInstances／maxInstances 均維持部署前規格，沒有為秒數增加常駐資源。
- 以舊 role publisher 的 540 秒上限保留切換緩衝，避免可能的舊在途請求晚回寫。Owner 實際正式頁顯示中央暫停且資料保留。
- 切換控制保留既有稽核欄位，驗證完整事件雜湊，恢復時只接受本輪確切暫停雜湊。原生 Firestore 與正式 entry 共 41 項通過，0 失敗、0 略過。

## 正式恢復與資料驗收

- 超過 540 秒緩衝後已恢復 active／writeAllowed=true。recordRevision 645、完整權威雜湊不變。
- Daniel 已在正式 317 以原生 Safari 點擊「驗證角色權限」，按鈕實際變成「角色權限已驗證」。新 role publisher HTTP 200，初次建立分片約 10.877 秒；這是首次角色發布，不是排課同步秒數。
- 第一份獨立讀回在尚未按正式發布前因 branch_manager 缺少 manifest 而失敗，未列為通過。按鈕完成後的第二次讀回通過。
- 16 集合完整權威、7 個角色都核對成功：校區主管 228 堂、AA 1182 堂、五個一般老師分別 197／193／189／209／30 堂；各自新分片和相容 db／scopedDb 均等於後端權限投影，全部 sourceRevision=645、release=20.26.317。
- 所有 1182 堂正式課程及學生／計費／薪資資料維持切換前完整雜湊；未用修改正式課程的方式壓測。正式角色衍生資料已重發，不把這些衍生寫入說成完全零雲端寫入。
- 正式健康快照 09:45:02 UTC healthy、近 24 小時錯誤 0、pendingRequests 0；PITR／刪除保護仍開啟。178 筆通知仍是待閱讀提醒，未清除或批次已讀。
- 最終證據：/private/tmp/danbridge-317-production-all-assets.json、danbridge-317-production-source-proof.json、danbridge-317-production-functions-verified.json、danbridge-317-production-roles-final-r2.json、danbridge-317-production-health-final.json。
- 本機完整回歸 1358 項，1349 通過、9 項外部環境略過、0 失敗。另原生 41 項與瀏覽器 58 項均通過，不以略過代替通過。
- 速度標準已依使用者最新要求停止追求 2.5 秒；不承諾跨所有網路／裝置的最慢值或 120Hz。四帳號的實際通知與已讀證據為 staging 4493（見 316 報告），未冒稱新正式版有新增真實課程通知測試。
