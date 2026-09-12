# 315 歷程重用：僅隔離候選，尚未完成正式切換

## 314 原生 Safari 實測

2026-09-12 16:21，指定合成空間 `80190109-2684-4a92-a726-abf3cae53b5a`。

- Daniel 單堂重做：8404 ms；復原：4666 ms。包含頁面排隊、提交及角色發布，不含接收端繪製。
- 對應 gRPC revision `stagingpublishedworkspaceoperation-00034-wag`，後端交易總計 2473／3009 ms，authority-read 1396／1411 ms。
- 這些結果仍不符合 1–10 堂 2.5 秒。不得把後端單一分段或本機測試當作端到端達標。
- 復原後 revision 4421，124 堂完整課程雜湊 `record-v1:0d47c04eb61d9c924d88003608bbc58de9235a0b110b5e5f0845c75bbaceb8c5` 與基準一致；16 集合、角色投影與相容視圖核對成功，formalDataWrites 0。
- 本輪 16:21 復原通知已於 Daniel／Catherine／AA／張毅四個原生 Safari 分頁讀取並按已讀；獨立雲端核對四人同為 revision 4421、同 sourceHash、每人 1 個唯一課程 ID、read=true。證據 `/private/tmp/danbridge-314-four-role-ack.json`。

## 315 修改界線

- 僅 `historyVersionCache` 已啟用的隔離 Owner runtime 使用不可變歷程物件重用。正式預設仍關閉，未切換正式 endpoint。
- 每次交易仍讀完整 ID membership 與原生 updateTime；新增／修改／刪除／重新建立的文件以目前交易結果為準。
- 只按原生 snapshot 物件身份保存 detached、深層凍結的 body 與 canonical bytes；不按瀏覽器 ID、版本數字或安全旗標取快取。
- 原生資料版本不同即是另一份 snapshot。完整 16 集合的 SHA、數量、連續歷程序號與授權仍重新查核，沒有快取整份資料雜湊或權限結論。
- WeakMap 不延長淘汰 snapshot 的生命；原 reader 的 16MiB／10000筆上限仍有效，另減少對同一不可變 snapshot 重複序列化計算容量。
- 未修改計費、薪資、LINE、課表 UI、正式 Rules、正式課程或正式帳號權限；候選內前端修改僅同步版本字串。

## 驗證

- 單元：獨立 materializer、深層變更阻擋、SDK data() 獨立副本、同 ID 新快照、canonical 完整雜湊等值、偽造淺層凍結物件拒絕。
- 原生 Firestore emulator：11 項通過、0 失敗、0 略過，涵蓋 Owner 40 堂原子提交、隔離範圍、角色撤銷、關閉範圍、歷程修改／刪除／重建及交易中止。
- 完整回歸：1356 項，1347 通過、9 項需要外部環境略過、0 失敗。略過不算通過。
- 315 部署及實際操作耗時仍待追加，不宣稱效能已達標。

正式維持 20.26.312、main `ce2dd91`；新同步候選未推 main，未改正式業務資料。
