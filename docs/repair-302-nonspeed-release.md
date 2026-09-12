# 20.26.302 非速度修正發布

日期：2026-09-12（台北）。使用者明確要求：速度候選繼續隔離，其他可獨立驗證的修正先上正式網站。

## 邊界

- 從已發布 a90bb40477e72337c4af4eb26fb85f58e38a7e59／20.26.276 建立獨立 worktree，不將原本 301 的 dirty tree 整包發布。
- 只發布 Hosting。Functions、Rules、IAM、正式業務資料均未修改；沒有把未完成的新同步協定、REST 候選或 Worker 規劃路徑帶入。
- 比對全部既有瀏覽器資產，除下列修正與版本識別外沒有其他程式差異；另有 20 個後端／設定等受保護檔案逐位元相同。既有計費、薪資、收款及權限規則保持 276。

## 修正

1. LINE 複製完成監聽在延後的介面初始化之前註冊，首次快速複製也保留原家庭、月份與校區；仍不把複製誤記為已發送。
2. 通知視窗固定標題及確認按鈕，長內容獨立捲動；打開下一份通知回到內容頂端。
3. AA 排課永久佇列 pending／dirty／inFlight 時，不自動跳出通知遮住操作；通知仍保留可手動查看。
4. 課表卡片局部更新後，滑鼠未移動也更新當前團課學生預覽；移除或撤權目標會隱藏，不加入每張卡片的輪詢。
5. 搜尋快捷鍵立即定位，避免捲動動畫干擾下一次篩選收合點擊。
6. PWA 只在使用者接受的 worker 已啟用且接管分頁後更新；失敗或超時提供重試，不用計時器強制刷新；保留原未儲存／待同步檢查。

## 驗證

- npm test：1138 項，1131 pass／7 skip／0 fail，exit 0。
- 八組瀏覽器完整回歸：1149 pass／59 skip／0 fail。包含 Chromium／WebKit 與桌機、平板、手機尺寸，不冒稱八台實體裝置。
- 最後 LINE 初始事件與通知捲動調整另以八組配置補跑：192 pass／0 fail。此成績獨立列示，不偽稱一輪新完整回歸。
- staging 遠端模組解析、通知與更新測試：22 pass／0 fail；production 遠端模組解析：2 pass／0 fail。
- 實際瀏覽器 worker 接管與另一分頁未存表單保護亦在完整回歸中通過。
- dependency production／full audit 均為零漏洞。發布目標驗證及 149 資產引用、465 JavaScript 檔案語法、364 HTML ID 檢查通過。
- 首次發布腳本多帶參數遭 CLI 拒絕，未發布；改用既有腳本的正確呼叫後 staging 與 production Hosting 都成功。

## 正式讀回

- staging、production 各 40 個修復相關資產 HTTP／SHA256 全部相同。
- Rules：projects/danbridge-d8877/rulesets/ad7ddf44-0ef1-42d4-b534-bb03291f9e87，切版前後不變。
- productionTrustedOperation：ACTIVE／productiontrustedoperation-00006-vuh，updateTime 2026-09-10T17:11:48.704896122Z，不變。
- productionSchedulerOperation：ACTIVE／productionscheduleroperation-00007-guf，updateTime 2026-09-10T17:11:44.853555553Z，不變。
- control active／writeTakeover true；safety active／writeAllowed true。業務資料測試寫入 0。
- 健康快照仍是既有 attention，不將 HTTP 成功或舊快照當成每堂課即時同步驗收。

## 未包含

- 新協定 1～10 堂 2500 ms、兩批 20 堂及四個實際帳號最新協定的端到端驗收，仍在原 301 隔離候選，不在本版宣稱完成。
- 和新協定共用的角色原子發布、通知送達證明等修正，未拆半套到正式站；正式仍使用已發布的原交易與投影機制。
- 不強制刷新正在使用的分頁；使用者先儲存，之後接受更新或重新開啟才載入本版。

證據：/private/tmp/danbridge-302-nonspeed-unit-verified.log、danbridge-302-nonspeed-browser-final.log、danbridge-302-final-targeted.log、danbridge-302-staging-browser.log、danbridge-302-staging-readback.json、danbridge-302-production-hosting.log、danbridge-302-production-before.json、danbridge-302-production-readback.json、danbridge-302-production-browser.log。
