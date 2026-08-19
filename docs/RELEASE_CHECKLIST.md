# Danbridge 發布與回滾清單

## 發布前

- 確認位於 `main`，且 `git status --short` 沒有非預期檔案。
- 確認本次變更沒有包含正式資料、備份檔、登入憑證或暫存檔。
- 執行 `python3 tools/validate_project.py`。
- 執行 `git diff --check`。
- 執行 `npm test`。
- 執行 `npm run test:rules`；只允許使用 `danbridge-rules-test` Emulator。
- 執行 `npm run test:dependency-audit`；production 相依套件必須為 0 漏洞，dev-only 例外只接受工具內逐欄鎖定的既審 advisory。
- 涉及畫面或同步時，先部署 staging 並完成主要操作煙霧測試。

## 建立版本

1. 更新資源查詢版本與 Service Worker cache 名稱。
2. 更新 changelog、驗收看板與必要操作文件。
3. 重新執行專案驗證，確保 `docs/sha256-manifest.json` 為最新。
4. 建立單一、可說明的本機 commit。
5. 對正式發布 commit 建立 annotated tag，例如 `v20.7.1`。
6. 不由自動化工具 Push；使用 GitHub Desktop Push commit 與 tag。

## 部署與確認

1. staging：`npm run deploy:staging`
2. 核對 staging 的 HTML 資源版本與關鍵檔案雜湊。
3. production：`npm run deploy:production`
4. 核對 production 的 HTML 資源版本。
5. 比對 production 與 staging 的同版關鍵檔案雜湊。
6. 確認 Git 工作目錄乾淨並記錄 commit。

## 回滾判斷

以下任一情況應停止繼續發布並回滾：

- 網站無法載入或登入。
- 課表、權限、同步或資料顯示出現重大回歸。
- 正式站資源版本混用。
- Firebase Rules 導致合法角色無法工作，或出現越權風險。

## Hosting 回滾程序

1. 在 Firebase Console 或已保存的 Hosting channel 確認上一個穩定版本。
2. 將上一穩定版本 clone 到目標 `live` channel。
3. 立即核對首頁、關鍵資源版本、登入與主要操作。
4. 若回滾版本仍有問題，停止資料寫入操作並升級事故處理。
5. 修正後先部署 staging；確認成功才恢復 production 最新版。

正式站回滾不得使用未驗證的本機檔案，也不得修改或還原 Firestore 資料。Hosting 回滾與資料還原是兩個獨立程序。
