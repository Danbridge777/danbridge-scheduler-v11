# 316 原生操作驗收：仍未達 2.5 秒

## 部署與登入

- 正式維持 20.26.312 / main ce2dd91。本輪沒有正式業務寫入或正式同步切換。
- Staging 主 Hosting 為 20.26.316 / 739aff7；以下操作時後端是 315 revision stagingpublishedworkspaceoperation-00035-xid。
- 新 history-315 預覽 hostname 起初不在前端精確允許清單；補齊並升版 316 後，App Check 仍拒絕該 domain。唯讀讀回 reCAPTCHA 設定確認沒有該 domain，未擴大任何安全允許清單。
- 改在既有已允許的 staging 主站登入 Daniel 成功，使用同一合成 namespace，不使用正式資料。

## 2026-09-12 Safari 真實操作

合成 namespace：80190109-2684-4a92-a726-abf3cae53b5a。

| 操作 | 頁面至角色發布確認 | 備份 | 規劃與重排 | 傳送與日誌 | 收尾 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 多選 9/29、9/30 各四堂，移到前一天 | 7188 ms | 141 | 1154 | 5727 | 56 |
| 復原八堂 | 5029 ms | 144 | 636 | 3276 | 849 |
| 重做八堂 | 5275 ms | 137 | 583 | 3559 | 878 |
| 接續復原八堂 | 4658 ms | 155 | 520 | 2919 | 950 |

預覽顯示可套用 8 堂、衝突 0。復原／重做都從原生 UI 按鈕操作，不由腳本注入資料。
計時含排隊、提交及角色發布，不含其他帳號畫面繪製，不能宣稱四端端到端達標。
首組復原後獨立讀回 revision 4461、124 堂，完整課程雜湊仍為
`record-v1:0d47c04eb61d9c924d88003608bbc58de9235a0b110b5e5f0845c75bbaceb8c5`，
authorityVerified=true、formalDataWrites=0。證據 `/private/tmp/danbridge-316-eight-restored.json`。

## 後續局部修補

發現隔離 scope 每次 query.docs 都建立另一層 Proxy，讓同一原生不可變快照的 materializer 快取前兩次不能命中。
改用 scope 專屬 WeakMap，僅相同原生 snapshot 物件重用 proxy，不按文件 ID 重用；新交易讀到的新 snapshot 仍是新物件。
不快取權限、根狀態或整體資料雜湊，不改正式 runtime。

- 身分／版本／跨 scope 拒絕與歷程測試：6 通過、0 失敗。
- 原生 Firestore 模擬器：11 通過、0 失敗、0 略過，包含 40 堂原子提交、目前角色撤銷、隔離範圍與歷程修改／刪除／重建。
- 此修補尚待部署及原生重測，不將本機通過當作 2.5 秒達標。
