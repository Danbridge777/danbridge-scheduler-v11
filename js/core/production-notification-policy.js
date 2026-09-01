const NOTIFICATION_ID=/^[A-Za-z0-9_-]{8,200}$/;
const EMAIL=/^[^\s@]+@[^\s@]+$/;

const text=(value,max)=>String(value??'').trim().slice(0,max);

export function normalizeProductionNotificationAcknowledgeRequest(request={}){
 const source=request?.notificationIds;
 if(!Array.isArray(source)||source.length<1||source.length>20)throw new Error('通知確認筆數必須介於 1 到 20 筆');
 const ids=[...new Set(source.map(value=>text(value,200)))];
 if(ids.some(id=>!NOTIFICATION_ID.test(id)))throw new Error('通知識別碼無效');
 return Object.freeze({notificationIds:Object.freeze(ids)});
}

export function normalizeProductionNotificationActor(actor={}){
 const uid=text(actor.uid,128),email=text(actor.email,320).toLowerCase();
 if(!NOTIFICATION_ID.test(uid)||!EMAIL.test(email)||actor.emailVerified!==true||actor.appVerified!==true)throw new Error('通知確認帳號未通過驗證');
 return Object.freeze({uid,email});
}

export function assertProductionNotificationRecipient(notification={},actor={}){
 const recipientEmail=text(notification?.recipientEmail,320).toLowerCase();
 if(!EMAIL.test(recipientEmail)||recipientEmail!==actor.email)throw new Error('只能確認寄給自己的通知');
 return true;
}
