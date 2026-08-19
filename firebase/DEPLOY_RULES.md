# Firebase Rules 部署

部署前先執行本機權限測試：

```bash
npm install
npm run test:rules
```

測試使用獨立專案 ID `danbridge-rules-test` 與 Firestore Emulator，不會讀寫正式資料。全部通過後才可部署 Rules。

V15.26.4 已將「回報延長申請」整合到 `lessonReports/{lessonId}`，不再使用 `lessonReportExtensions` 集合。

課堂回報使用 Firestore。此文件只允許使用已審查的 staging wrapper：

```bash
npm run deploy:staging
```

`TARGET_CONFIG_VALID` 只表示本機部署目標設定通過，**不代表 staging readiness 已通過，也不是部署授權**。在 backup、rollback、帳號／service-account allowlist、dry-run 與 active Rules hash receipt 完成前，不得部署或寫入 staging。Production Rules 不在此流程內；任何 production 部署或啟用都需要獨立明確授權。

部署完成後：

1. Owner 登入並儲存／同步一次課表，建立最新 `lessonMeta`。
2. 老師或校區管理者打開一堂已超過下課後 3 小時的本人課程。
3. 點「申請開放 10 分鐘」。
4. Owner 在通知中心核准。
5. 從核准當下起 10 分鐘內可修改，逾時後 Firestore 會再次鎖定。

舊的 `lessonReportExtensions` 文件必須保留。本 staging 流程不得刪除任何 collection；任何 production data deletion 都需要未來獨立明確授權，以及先完成可驗證的 backup 與 restore 證據。

## V16.8 課表變更通知

V16.8 新增 `companies/danbridge/scheduleNotifications`。若未來 staging readiness 與部署授權均已通過，只能使用同一個已審查的 staging wrapper：

```bash
npm run deploy:staging
```

否則 Owner 仍可寫入通知，但老師端會因權限規則尚未部署而無法讀取或按「知道了」。
