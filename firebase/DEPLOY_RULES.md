# Firebase Rules 部署

V15.26.4 已將「回報延長申請」整合到 `lessonReports/{lessonId}`，不再使用 `lessonReportExtensions` 集合。

課堂回報使用 Firestore。部署：

```bash
firebase deploy --only firestore:rules
```

部署完成後：

1. Owner 登入並儲存／同步一次課表，建立最新 `lessonMeta`。
2. 老師或校區管理者打開一堂已超過下課後 3 小時的本人課程。
3. 點「申請開放 10 分鐘」。
4. Owner 在通知中心核准。
5. 從核准當下起 10 分鐘內可修改，逾時後 Firestore 會再次鎖定。

舊的 `lessonReportExtensions` 文件可以保留，不會再被前端讀取；確認新版運作正常後可於 Firebase Console 刪除該舊集合。

## V16.8 課表變更通知

V16.8 新增 `companies/danbridge/scheduleNotifications`。部署新版後必須更新 Firestore Rules：

```bash
firebase deploy --only firestore:rules
```

否則 Owner 仍可寫入通知，但老師端會因權限規則尚未部署而無法讀取或按「知道了」。
