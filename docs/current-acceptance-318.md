# 318 現行驗收與發布門檻

更新：2026-09-12。本文件是現況，不以舊看板或測試數量代表「所有情境 100% 正確」。20.26.318 已發布正式 Hosting、四個相關 Functions 與通知 Rules；Git 提交與最終唯讀核對於本次收尾完成。

## 已確認並修補的缺陷

| 項目 | 修補與證據 | 發布狀態 |
|---|---|---|
| 縮減角色後仍讀取舊範圍通知 | 查詢與 Rules 綁當前角色／老師／校區，後端已讀操作同一交易重新核對權限；正式候選 56 項原生 Rules、staging 42 項通過，AA 同等主管真實驗收通過並恢复原權限 | staging 與正式均已部署；使用者已確認員工分頁可重開 |
| 返回前景漏接角色更新 | pageshow／online／visibility 綁定重新確認來源版本，去重、失敗重試與舊回應隔離 | 三角色隔離瀏覽器通過；真實 teacher／AA 證據另見下方 |
| 總覽新增課程後數字不更新 | 排課提交在下一幀更新當下可見頁面，不只重畫隱藏課表；新單元測試先失敗後通過，實際新增按鈕瀏覽器測試通過 | staging 已部署；Safari 真實新增 17→18、復原 18→17 通過 |
| 渲染例外可能中斷排課保存 | 渲染錯誤記錄後仍保留已完成操作的保存排程；合成渲染例外測試先失敗後通過 | staging 已部署，352 個發布檔案指紋一致 |
| 資料整理入口未完整拒絕非 Owner | 未登入、缺少角色、一般老師、AA、校區主管及未知角色皆在讀寫前拒絕；Owner 保留原整理流程；7 項單元檢查通過 | staging 已部署；不以此取代後端授權 |
| 全平台測試仍引用舊發布版本 | public-entry 與 worker 測試精確改為 318；保留所有內容、順序及 worker 重用斷言 | 定向 313 通過／7 略過；隨後全平台 1229 通過／59 略過 |

## 已有功能的驗收範圍

- 課表：新增、複製、貼上、移動、刪除、復原／重做、延遲回條、同名家長預覽、團課本堂名單、跨月目標日期、批次連續操作，均有隔離瀏覽器案例。這不等於所有實體裝置皆實測，也不宣稱網路延遲上限。
- 計費／LINE：12 個月份、月費／家教／團課、每位孩子的家長、費率歷程、歸屬校區、收款抵扣、月結調整及複製失敗處理已有固定期望值與瀏覽器案例；未修改正式帳務測試。
- 薪資：整班兼職費只付一次、底薪、工作日比例、加班／不足時数、請假去重與跨月已有獨立輸出驗證。
- 年度資料：本機 30000 堂混合課程、16 集合備份往返與年度 Excel 匯出已有驗證；不是 30000 堂真實雲端容量證明。
- 備份：已保存的 2026-09-01 隔離還原演練 16 集合 2208 筆零差異；不是今天完整正式資料重新還原。
- 正式容量：最近唯讀有效角色檢視最大估計 622865／800000 bytes；新增預警不代表相容大文件容量限制已遷移。

## 真實帳號與測試清理

- Daniel、Catherine、AA、張毅：一般 staging 合成通知接收及已讀回寫全部通過；合成通知已精確清理，未讀正式／既有通知未批次清除。
- AA 臨時主管：美術校區隔離、月份切換、通知接收／已讀通過。已恢复原排課權限；本輪臨時衍生資料零殘留。不是 Lucas 本人登入。
- 隔離 workspace `80190109-2684-4a92-a726-abf3cae53b5a`：Daniel 新增→老師前景接收→Daniel 復原→老師接收取消通過；124 堂前後 lessonRecordsHash 相同，revision 4597。
- AA 合成課 `318-AA-連續操作-0912` 已透過 AA 正常復原清理，老師收到取消並回到 17 堂／11 小時。revision4601、124 堂、課程雜湊恢復基準。先前操作工具回報鎖定不代表使用者實際鎖屏，恢復控制後已完成清理。
- 最新修補重新部署後，Safari Daniel 由總覽新增 `318-總覽修補驗收-0912`，總覽立即 17→18 堂；老師與 AA 返回前景顯示新增課程，實際開啟通知並按知道了。Daniel 正常復原後總覽立即 18→17；老師與 AA 均收到取消並按知道了。獨立雲端 readback revision4605、124 堂，完整 lessonRecordsHash 與基準一致，teacher100parts／scheduler331parts 與權威投影一致。證據 `/private/tmp/danbridge-318-dashboard-final-readback.json`。未把工具執行時間當成同步延遲。

## 收尾驗證及明確保留事項

1. AA 測試清理及真實前景恢復已完成；branch_manager 前景恢復仍與本機事件模擬區分，不宣稱 Lucas 真實帳號登入通過。
2. 最新修補 staging 已重新部署，352 個資源 SHA256 全部匹配本機，證據 `/private/tmp/danbridge-318-final-staging-assets.json`。最後全量測試：八組瀏覽器 1237 通過、0 失敗、59 略過；npm test 1392 項中 1383 通過、0 失敗、9 略過，兩者 exit 0。日誌：`/private/tmp/danbridge-318-all-browser-acceptance-final.log`、`/private/tmp/danbridge-318-all-unit-acceptance-final.log`。略過不計通過；全平台指的是測試引擎／視窗設定，不是所有實體装置。語法／引用驗證通過（150 引用、565 JavaScript、364 HTML ID），相依套件安全稽核通過。
3. 使用者明確同意本次 AA／老師分頁存妥後重開。已先發布已讀後端、再發布前端並核對 352 檔案，最後發布通知 Rules，讀回精確候選 SHA256 一致。Safari AA 以正常更新流程重開，未清除登入或未讀通知；其他裝置仍需自行重開，不宣稱已遙控更新所有人的分頁。
4. 相容容量遷移、今天完整還原演練、管理員 Google 帳戶 MFA／帳务預算確認未完成；不可把 staging Identity Platform MFA 設定當成 Google 個人帳號兩步驟驗證證據。

安全邊界：正式業務資料寫入 0；沒有替學生或老師重建 ID、覆寫帳單、清空歷史、修改正式 AA／Lucas 權限。使用者已接受既有速度，不再以 2.5 秒／120Hz 宣稱本輪完成。

## 正式發布讀回證據

- Hosting：20.26.318，352 個檔案 SHA256 與 staging 驗收來源一致。`/private/tmp/danbridge-318-production-assets-before-rules.json`。
- 通知 Rules：`44c05b87-192b-43c0-aae0-48a5436be790`；SHA256 `f76e51ec1eb6508d191244ad0c25775909c2d3644f2f571e00c041e7cf01b619`，只替換通知讀取邊界，其他規則原样保留。`/private/tmp/danbridge-318-production-notification-rules-release.json`。
- Functions ACTIVE：已讀 `productionacknowledgeschedulenotification-00002-cax`；健康 `productionhealthrefresh-00002-nir`；Owner 排課 `productiontrustedoperation-00008-kas`；排課專員 `productionscheduleroperation-00009-xes`。
- 四份精確來源 generation 各有 268 個 JavaScript/CJS 檔案逐檔匹配本機，來源清單雜湊一致。`/private/tmp/danbridge-318-production-functions-verified.json`。服務帳號與 DANBRIDGE 同步模式保持原樣；唯一資源設定差異是健康檢查 maxInstanceCount 由未明列變成部署工具預設 20，已明確記錄。排課／通知設定皆未變。
- 發布後唯讀 control=active、safety.writeAllowed=true、health=healthy；沒有執行正式課程或帳務測試寫入。
- 讀回實際正式 Rules 後，47 項權限檢查通過，securityFindings=[]；與切版前 56 項候選檢查分開計數。`/private/tmp/danbridge-318-production-live-rules-final.log`。這是實際規則＋真實角色設定在本機模擬器驗證，不冒充 Lucas 登入。
- Safari AA 正式分頁在新規則發布後重新載入，正常顯示排課專員、175 則既有通知，開啟全老師課表成功；舊通知僅按稍後查看，未改未讀狀態，未改正式課程。
