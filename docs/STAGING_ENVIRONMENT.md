# Danbridge staging 環境

## 環境隔離

| 環境 | Firebase 專案 | 網址 | 用途 |
|---|---|---|---|
| Production | `danbridge-d8877` | `https://danbridge-d8877.web.app` | 正式營運資料 |
| Staging | `danbridge-d8877-staging` | `https://danbridge-d8877-staging.web.app` | 測試資料與瀏覽器整合驗收 |

網站會依目前主機名稱選擇 Firebase 設定。staging 畫面右下角固定顯示「STAGING 測試環境」，禁止將正式個資匯入 staging。

## 安全部署

- staging：`npm run deploy:staging`
- production：`npm run deploy:production`

部署指令明確指定 Firebase 專案別名，避免因目前 CLI 專案狀態而部署到錯誤環境。

## staging 初始化

1. Firebase 專案：`danbridge-d8877-staging`
2. Firestore：Standard，`asia-east1`
3. Hosting：由 staging 部署指令建立與更新
4. Firestore Rules：與程式庫版本一致
5. Authentication：只建立測試帳號；不得使用正式老師或家長資料

## 驗收資料規則

- 使用明顯的 `TEST-` 前綴建立老師、學生與課程。
- 所有 staging 寫入測試必須可在測試完成後辨識與清理。
- 禁止由正式環境匯出後直接匯入 staging；如需資料形狀，只建立去識別化最小樣本。
- staging 測試失敗不得改用正式站重試。

## 建置狀態

- Google 登入已啟用。
- Firestore Rules 與 Hosting 已部署。
- 2026-08-08 已確認測試站會載入 staging 設定並顯示「STAGING 測試環境」標記。
- 首次功能驗收請直接登入測試站；測試資料只會留在 staging 專案，不會寫入正式資料庫。
