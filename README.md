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
```

`index.html`、JavaScript、CSS、Service Worker 與 Firebase 規則均直接保存在 repository 根目錄及其模組資料夾中。`.nojekyll` 讓 GitHub Pages 直接發布靜態檔案，不執行不需要的 Jekyll 處理。
