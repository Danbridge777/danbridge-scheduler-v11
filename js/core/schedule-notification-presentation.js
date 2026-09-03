// Notification delivery and acknowledgement stay unchanged. This controller
// only prevents an incoming notice from stealing an active editor's focus.
export function automaticScheduleNotifications(notifications,{uid='',email='',name='',seen=new Set()}={}){
 const normalizedEmail=String(email).trim().toLowerCase(),normalizedName=String(name).trim();
 return notifications.filter(item=>{
  if(!item?.id||seen.has(item.id))return false;
  const samePublisher=Boolean(uid&&item.createdBy===uid)||Boolean(normalizedEmail&&String(item.createdByEmail||'').trim().toLowerCase()===normalizedEmail);
  // A scheduler's change may be published by the Owner worker. Its actor name
  // differs, so it must still notify the Owner instead of being treated as self.
  const actorName=String(item.createdByName||'').trim();
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
  const batch=items.filter(item=>(item.notificationType||'schedule')===type);
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
