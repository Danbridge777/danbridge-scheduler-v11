# 314 隔離傳輸比較：尚未達標，禁止據此切正式後端

## 313 實測證據

- staging revision `stagingpublishedworkspaceoperation-00032-hik`，單堂重做／復原：11751／8739 ms；再重做／復原：14484／8374 ms。
- 加入各集合耗時觀測後 revision `stagingpublishedworkspaceoperation-00033-ruz`，重做 8130 ms；後端總計 6023 ms，changes 1965 筆讀取 4314 ms。
- 同執行器暖機復原：後端總計 4749 ms，changes 1966 筆 3335 ms、students 401 筆 2041 ms、lessons 256 筆 1888 ms、lessonMeta 124 筆 1579 ms。
- 因仍未符合 2.5 秒，未部署正式課表後端。正式 Hosting 維持 20.26.312；main 維持 ce2dd91。

## 本次比較

只把 staging 合成驗收專用 Admin app 的傳輸從 REST 改成 gRPC。預設 Admin app、正式 endpoint、資源上限、Auth／App Check、命名空間、原生交易、版本查核與權威雜湊均保留。

本機到雲端的先前 gRPC 比較未見改善，因此不以推測判定本次成功：需由相同 Safari 合成課程重做／復原實際讀回確認。若無改善，不將此比較當成正式效能修復。

執行器重用與分段觀測的 native emulator 測試已通過；gRPC 是 native 測試所用的 SDK 預設傳輸。新版仍重跑完整回歸。四帳號接收與最後合成課程復原結果需追加本輪實證。

## 部署／讀回與待辦

- 314 完整回歸成功：1354 項，1345 通過、9 項需要外部環境而略過、0 失敗。不能把略過項目算通過。
- 僅 staging 驗收函式部署完成：`stagingpublishedworkspaceoperation-00034-wag`，ACTIVE，更新時間 `2026-09-12T08:01:47.683960241Z`，維持 1 CPU／1024Mi／concurrency 4／maxInstances 2，未增加暖機常駐實例。
- 最後已完成的 REST 暖機復原，頁面確認 6765 ms；gRPC 比較版本尚無瀏覽器實際提交結果，不能聲稱改善。
- 只讀核對 revision 4417：124 堂課完整紀錄雜湊與測試前相同；16 集合 hash／counts 通過；每個動作四收件者都有同 revision、1 個唯一課程 ID 的通知；AA／老師投影含相容視圖全部與權威結果一致。
- 四個原生 Safari 分頁已登入；Daniel、AA、Catherine、老師均實際顯示過本轮單堂移動或復原通知並執行已讀。後續每輪的四帳號最終已讀尚未全部補齊，不能把先前通知當成最新 revision 的已讀證據。
- 正式健康排程於 `2026-09-12T08:00:02.973Z` 自動更新 healthy：近期錯誤 0、待處理請求 0、178 則已送達待閱讀提醒保留、PITR 與刪除保護啟用、formalDataWrites 0。
- Safari 操作兩次被使用者切換到非驗收視窗而中止，已停止在不確定焦點下點擊並請求短暫穩定操作時段。正式原子後端切換也仍待 Owner 舊頁面儲存／待送佇列清空確認。正式後端沒有切換。
- 既有桌面監控基準仍為舊設定；更新曾被權限審查拒絕，未透過檔案繞過。其既有提示允許合法新版本覆蓋舊基準；本轮正式 healthy 證據由直接唯讀查核取得。
