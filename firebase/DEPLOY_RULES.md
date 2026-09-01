# Firebase Rules 部署

部署前先執行本機權限測試：

```bash
npm install
npm run test:rules
```

測試使用獨立專案 ID `danbridge-rules-test` 與 Firestore Emulator，不會讀寫正式資料。全部通過後才可部署 Rules。

Rules 測試或單獨部署成功不代表 staging readiness；完整 staging 驗證仍須依發布清單逐項通過。production 一律需要獨立明確授權，且不得由這個 Rules 流程帶入。

V15.26.4 已將「回報延長申請」整合到 `lessonReports/{lessonId}`，不再使用 `lessonReportExtensions` 集合。

課堂回報使用 Firestore。部署：

```bash
npm run deploy:staging-rules
```

部署完成後：

1. Owner 登入並儲存／同步一次課表，建立最新 `lessonMeta`。
2. 老師或校區管理者打開一堂已超過下課後 3 小時的本人課程。
3. 點「申請開放 10 分鐘」。
4. Owner 在通知中心核准。
5. 從核准當下起 10 分鐘內可修改，逾時後 Firestore 會再次鎖定。

舊的 `lessonReportExtensions` 文件可以保留，不會再被前端讀取。清理舊集合不屬於 Rules 部署流程，必須另行核准並先保留可回復證據。

## V16.8 課表變更通知

V16.8 新增 `companies/danbridge/scheduleNotifications`。部署新版後必須更新 Firestore Rules：

```bash
npm run deploy:staging-rules
```

否則 Owner 仍可寫入通知，但老師端會因權限規則尚未部署而無法讀取或按「知道了」。
