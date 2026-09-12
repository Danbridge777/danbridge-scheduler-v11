# 20.26.319 — 請假／通知修補驗收

日期：2026-09-13。範圍：前輪 F1 通知失敗恢復、G1 隔離請假提交覆蓋缺口，以及請假交易授權與通知漏收。

狀態：正式 Hosting 與請假函式已發布並讀回核對完成。不是全網站所有無限情境的 100% 保證。

## 修補內容

- 正式請假與隔離驗收使用同一個受保護交易核心，路徑由隔離 adapter 限制，未開放正式資料供測試。
- 請假提交在交易內重新核對有效角色、老師範圍、資料版本及 receipt 操作者。撤權後重送、冒用他人 receipt、跨老師修改均拒絕。
- 請假通知包含有效的 Daniel、Catherine、AA 與當事老師，去除重複收件；不再遺漏其他 owner 或把所有 owner 顯示為 Daniel。
- 通知已讀失敗時保留未讀與原通知，顯示錯誤並可重試；切換帳號後舊請求不能重開前帳號通知。
- 隔離請假讀取改用受角色限制 callable，沒有擴張 Firestore Rules。正式仍保留原生 onSnapshot。
- 新回歸案例加入 `npm test` 的後續測試流程。

## 自動化證據

| 測試 | 結果 | 紀錄 |
|---|---|---|
| 原完整 npm test | 1,383 通過，0 失敗，9 條件略過 | `/private/tmp/danbridge-319-full-unit.log` |
| 新請假／通知單元與契約 | 11 通過，0 失敗，1 原生 emulator 條件略過 | `/private/tmp/danbridge-319-leave-unit-final.log` |
| 原生 Firestore 請假／workspace／通知 | 12 通過，0 失敗，0 略過，包含上列原生案例 | `/private/tmp/danbridge-319-leave-emulator.log` |
| 固定原始碼完整瀏覽器回歸 | 1,245 通過，0 失敗，59 平台條件略過 | `/private/tmp/danbridge-319-browser-final.log` |
| Worker 與 App Check 失敗恢復八配置定向重測 | 24 通過，0 失敗 | `/private/tmp/danbridge-319-browser-recheck.log` |
| 納入新案例後再次完整 npm test | 1,394 通過，0 失敗，10 條件略過 | `/private/tmp/danbridge-319-full-unit-final.log` |
| 通知恢復另做三輪 × 八配置 | 24 通過，0 失敗 | `/private/tmp/danbridge-319-ack-three-rounds.log` |

初輪瀏覽器有 8 項同一 Worker 版號預期仍為 318；實際載入 319。修正測試版號並固定來源後重跑整套，以上最終結果才是發布依據。沒有將失敗算成通過。八配置是瀏覽器引擎／尺寸模擬，不是八部實體硬體。

## 真實四帳號操作

Safari 原有正常登入分頁：Daniel、Catherine、AA、張毅。只操作合成隔離工作區 `80190109-2684-4a92-a726-abf3cae53b5a`。

1. 張毅新增 9/13 09:00–10:00 事假：1 小時、v1。
2. Catherine 修改為 09:00–10:30，備註 `ACCEPT319-LEAVE-0913`：1.5 小時、v2。
3. 張毅取消該筆：v3、cancelled，各帳號有效時數回到 0。只軟取消，保留稽核，不留有效測試假單。
4. 四個帳號各自從正常通知對話框確認三次異動。獨立雲端讀回 3 × 4 = 12 則通知，12 則全部 `read:true`，每次異動四個不同收件人。沒有用管理工具代替使用者按已讀。
5. 唯讀重建權威與角色投影一致，124 堂既有測試課完整內容雜湊與初始完全一致：`record-v1:0d47c04eb61d9c924d88003608bbc58de9235a0b110b5e5f0845c75bbaceb8c5`。正式課程／家長／帳務沒有測試寫入。

證據：`/private/tmp/danbridge-319-leave-live-final.json`、`/private/tmp/danbridge-319-workspace-final.json`。

## 部署核對

- staging Hosting 352 個受核對資產全部與本機 SHA-256 一致。
- staging callable `stagingpublishedworkspaceoperation-00038-viv`：269 個已部署 JS/CJS/MJS 檔案與本機逐一相同，來源清單 SHA-256 `f97429bb1bdc9aa3876366900df768af4a7b5492921aad0fa9352db66c31a8b0`。
- 正式發布目標限 Hosting 與 `productionTeacherLeaveOperation`。課表 Trusted／Scheduler 後端、Rules、IAM、正式業務資料不在此次修改範圍。
- 正式部署前請假函式 revision：`productionteacherleaveoperation-00002-pef`。部署後核對另記於本節，不以命令開始當成部署完成。
- 正式請假函式最終 `productionteacherleaveoperation-00004-dog`，ACTIVE；269 個来源檔逐一一致，清單雜湊與 staging 相同。服務帳號、記憶體、timeout、實例、concurrency、ingress、VPC 與 DANBRIDGE 執行模式均與部署前一致。
- 首次 CLI 部署額外加入 `DANBRIDGE_ROLE_TRANSPORT=published-v1-compatible`。後驗證明確失敗並阻止前端發布；只對請假函式移除此新增且未使用的旗標後再驗證通過，未變更 Trusted／Scheduler 執行模式。保留精確恢復腳本與部署證據。
- 正式 Hosting 352 個受核對資產全部 SHA-256 相同：`/private/tmp/danbridge-319-production-readback.json`。網站為 20.26.319；Rules 仍為 `44c05b87-192b-43c0-aae0-48a5436be790`；Trusted `00008-kas`、Scheduler `00009-xes` 均 ACTIVE 且 revision 未變。
- 正式 AA 另開新 Safari 分頁正常登入與讀取請假頁，無權限錯誤；未提交正式假單、未清除正式未讀、未重整使用者原分頁，驗證分頁已關閉。
- 正式健康 18:00:03Z 快照 healthy；18:08:55Z 獨立讀回近一天錯誤 0、pending 0、PITR 與刪除保護啟用。179 則未讀與相容投影使用 78% 安全預算屬提醒，不視為本輪通知失敗，也不宣稱容量風險已消失。

## 仍須誠實保留的界線

- F1 最初 App Check 403 的根因仍無足夠證據，本次完成的是失敗可見、未讀保留、正常重試與帳號隔離，不宣称根因已找到或永不復發。沒有停用或繞過 App Check。
- 本輪不宣稱 2.5 秒、持續 120Hz 或無限情境零故障。課表速度未另作調整。
- 前輪全功能覆蓋矩陣中的未做實機表單案例，不因這次請假修補而自動變成全部通過。Lucas 並非本人登入測試。
- 正式資料還原演練、全部實體裝置及所有網路狀態不在此次已通過範圍。
