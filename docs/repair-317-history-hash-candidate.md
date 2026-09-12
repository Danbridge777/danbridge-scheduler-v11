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
