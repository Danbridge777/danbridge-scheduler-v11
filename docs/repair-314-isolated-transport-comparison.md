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
