# 20.26.264 最終發布核對

包含 [20.26.263 全部已驗證修改](acceptance-student-workspace-20.26.263.md)，另外修正正式回讀發現的清單老師篩選 46px 與手機搜尋欄 16px 舊樣式。

控制項統一 48px 高、14px 字級；家教／團課的表單、清單搜尋與篩選全部納入尺寸斷言。所有啟用資源指紋更新為 20.26.264，Service Worker 快取世代 303。

正式資料、資料 ID、計費、薪資、雲端命令格式、每請求 30 筆安全限制、角色權限皆不變。40 筆／2 秒／持續 120Hz 尚未達標，不能宣稱所有要求已完成。

## 驗證

- 完整 `npm test` 再執行：1,052 通過、7 跳過、0 失敗。
- 最終家教／團課與全頁尺寸瀏覽器測試：24 通過、0 失敗、0 跳過，覆蓋 Chromium／WebKit 桌面、iPad、手機，以及 Windows／Android 配置；裝置配置為模擬，不冒稱實體裝置。
- 前一版完整 760 案回歸：734 通過、26 不適用跳過、0 失敗。本次追加修改僅為三個 CRM 工具列欄位 CSS 及資源指紋，已以最終程式回歸及 24 案重測驗證，不重複計入通過數。

## 發布回讀

- staging 與 production 皆已發布 20.26.264；各 341／341 個檔案 SHA-256 與本機一致，0 不一致。
- 正式 9 個 Functions 與發布前完全相同；本次沒有部署後端、Rules 或 IAM。
- 正式 safety 以深度欄位比較完全相同：state active、readAllowed／writeAllowed true、revision 634、recordRevision 633、documentCount 2,712、activeCount 2,171、tombstoneCount 541、recordDataHash 不變。沒有改正式課程、學生、收費、薪資或通知已讀。
- 獨立正式分頁以既有 Daniel 工作階段驗收；bootstrap 與 active record state 均 ready，authority 為 production-records-authoritative。實際開啟家教／團課，六個可見選單逐一回讀全為 48px 高、14px 字級、靠左；載入的工作區腳本為 20.26.264。
- 保留使用者原本的工作分頁不重新整理；驗收用 staging 分頁已關閉，沒有新增正式測試學生。

證據：`/tmp/danbridge264-unit-final.log`、`/tmp/danbridge264-ui-verified.log`、`/tmp/danbridge264-staging-hashes.json`、`/tmp/danbridge264-production-hashes.json`、`/tmp/danbridge264-production-deploy.log`、`/tmp/danbridge264-functions-after.json`、`/tmp/danbridge264-safety-after.json`。
