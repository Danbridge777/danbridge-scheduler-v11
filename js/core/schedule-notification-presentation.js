// Notification delivery and acknowledgement stay unchanged. This controller
// only prevents an incoming notice from stealing an active editor's focus.
export function automaticScheduleNotifications(notifications,{uid='',email='',name='',seen=new Set()}={}){
 const normalizedEmail=String(email).trim().toLowerCase(),normalizedName=String(name).trim();
 return notifications.filter(item=>{
  if(!item?.id||seen.has(item.id))return false;
  const actorName=String(item.createdByName||'').trim(),actorEmail=actorName.toLowerCase();
  const sameEmail=Boolean(normalizedEmail&&(String(item.createdByEmail||'').trim().toLowerCase()===normalizedEmail||actorEmail===normalizedEmail));
  if(sameEmail)return false;
  const samePublisher=Boolean(uid&&item.createdBy===uid);
  // A scheduler's change may be published by the Owner worker. Its actor name
  // differs, so it must still notify the Owner instead of being treated as self.
  return !samePublisher||Boolean(actorName&&(!normalizedName||actorName!==normalizedName));
 });
}

export function createScheduleNotificationPresenter({document,button,render,getActor,isBusy,
 now=()=>Date.now(),setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id),idleMs=3000}={}){
 let notifications=[],seen=new Set(),timer=null,lastInteraction=now(),stopped=false;
 const cancel=()=>{if(timer!==null){clearTimer(timer);timer=null}};
 const interacted=()=>{lastInteraction=now()};
 document.addEventListener('pointerdown',interacted,true);
 document.addEventListener('keydown',interacted,true);
 const show=items=>{
  if(!items.length)return;
  const type=items[0].notificationType||'schedule';
  // Render one immutable server batch at a time.  Flattening every unread
  // notification used to create thousands of table rows and could freeze the
  // scheduler after several rapid operations.  The badge still exposes the
  // full unread count; acknowledgement advances to the next server batch.
  const batch=items.filter(item=>(item.notificationType||'schedule')===type).slice(0,1);
  batch.forEach(item=>seen.add(item.id));
  render(batch);
 };
 const attempt=()=>{
  timer=null;if(stopped)return;
  const eligible=automaticScheduleNotifications(notifications,{...getActor(),seen});
  if(!eligible.length)return;
  if(isBusy()||now()-lastInteraction<idleMs){timer=setTimer(attempt,500);return}
  show(eligible);
 };
 const open=()=>{cancel();show(notifications)};
 button.addEventListener('click',open);
 return{
  update(items){
   if(stopped)return;
   notifications=[...items];
   const ids=new Set(notifications.map(item=>item.id));seen=new Set([...seen].filter(id=>ids.has(id)));
   button.hidden=notifications.length===0;
   button.textContent=`課表通知（${notifications.length}）`;
   button.setAttribute('aria-label',`查看 ${notifications.length} 則課表通知`);
   cancel();attempt();
  },
  stop(){stopped=true;cancel();notifications=[];seen.clear();button.hidden=true;
   document.removeEventListener('pointerdown',interacted,true);
   document.removeEventListener('keydown',interacted,true);button.removeEventListener('click',open);
  }
 };
}
