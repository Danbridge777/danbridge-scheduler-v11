# Danbridge Scheduler V11

Danbridge 課務、課表、學生、老師、財務與課程回報系統。

## 部署

- GitHub Pages：`main` 分支的 `/(root)`
- 網站：<https://danbridge777.github.io/danbridge-scheduler-v11/>
- Firebase：沿用既有 Danbridge 專案、公司資料與角色權限

## 驗證

```bash
node tools/audit_scenarios.js
python3 tools/validate_project.py
npm run test:rules
```

`npm run test:rules` 會在隔離的 Firestore Emulator 中驗證匿名、Owner、老師、校區管理者、停權帳號、課堂回報與通知權限，不會連線或寫入正式資料。

`index.html`、JavaScript、CSS、Service Worker 與 Firebase 規則均直接保存在 repository 根目錄及其模組資料夾中。`.nojekyll` 讓 GitHub Pages 直接發布靜態檔案，不執行不需要的 Jekyll 處理。

## 開發與驗收

- [功能清單與驗收狀態看板](docs/FEATURE_ACCEPTANCE_BOARD.md)
- [Firestore Rules 部署說明](firebase/DEPLOY_RULES.md)
