/* Shared book requests; server enforces creator-only writes for every role. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let rows=[],identity={uid:'',email:''},editing=null,busy=false,refreshTimer=null,readGeneration=0,lastMutation=0,outbox=[],syncError='',draftBlocked=false,conflictId='';
 const outboxKey=()=>`danbridge-books-outbox-v1:${identity.uid}`;
 const entryKey=entry=>outboxKey()+':op:'+entry.request.operationId;
 const validEntry=e=>e?.request&&typeof e.request.operationId==='string'&&e.optimistic?.createdByUid===identity.uid&&e.optimistic?.createdByEmail===identity.email;
 function readSaved(){
  // Independent keys prevent two tabs from overwriting one shared queue array.
  const legacy=localStorage.getItem(outboxKey());
  if(legacy!==null){const saved=JSON.parse(legacy);if(!Array.isArray(saved)||saved.some(e=>!validEntry(e)))throw Error('草稿格式不符');for(const entry of saved)localStorage.setItem(entryKey(entry),JSON.stringify(entry));localStorage.removeItem(outboxKey())}
  const saved=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith(outboxKey()+':op:')){const entry=JSON.parse(localStorage.getItem(key));if(!validEntry(entry))throw Error('草稿格式不符');saved.push(entry)}}
  return saved.sort((a,b)=>a.request.id===b.request.id?a.request.expectedRevision-b.request.expectedRevision:(a.enqueuedAt||0)-(b.enqueuedAt||0));
 }
 function projectedRows(){const map=new Map(rows.map(r=>[r.id,r]));for(const entry of outbox)map.set(entry.request.id,entry.optimistic);return [...map.values()]}
 const own=row=>!!identity.uid&&row.createdByUid===identity.uid&&row.createdByEmail===identity.email;
 const status=(text,error=false)=>{const node=$('bookPurchaseStatus');if(node){node.textContent=text;node.dataset.error=String(error)}};
 function render(){
  let recovery=$('bookPurchaseRecover');if(!recovery){recovery=document.createElement('button');recovery.id='bookPurchaseRecover';recovery.type='button';recovery.className='btn';recovery.textContent='保留衝突草稿並重新編輯';recovery.addEventListener('click',recoverConflict);$('bookPurchaseStatus').after(recovery)}recovery.hidden=!conflictId;recovery.disabled=busy;
  const query=($('bookPurchaseSearch')?.value||'').trim().toLowerCase(),mine=$('bookPurchaseScope')?.value==='mine';
  const visible=projectedRows().filter(row=>!row.deleted&&(!mine||own(row))&&[row.title,row.publisher,row.isbn,row.createdByName].join(' ').toLowerCase().includes(query));
  $('bookPurchaseCount').textContent=`${visible.length} 項需求 · ${visible.reduce((sum,row)=>sum+row.quantity,0)} 本`;
  $('bookPurchaseRows').innerHTML=visible.length?visible.map(row=>`<article class="book-purchase-item"><div class="book-purchase-item-head"><h3 title="${esc(row.title)}">${esc(row.title)}</h3><span class="book-purchase-quantity">${esc(row.quantity)} 本</span></div><p class="book-purchase-meta" title="${esc(row.publisher||'—')} · ISBN ${esc(row.isbn||'—')}">${esc(row.publisher||'—')} · ISBN ${esc(row.isbn||'—')}</p><p class="book-purchase-note" title="${esc(row.note||'—')}">${esc(row.note||'—')}</p><div class="book-purchase-item-footer"><span class="book-purchase-requester" title="${esc(row.createdByName||row.createdByEmail)}">${esc(row.createdByName||row.createdByEmail)}</span>${outbox.some(e=>e.request.id===row.id)?'<span class="book-purchase-readonly">待同步</span>':''}${own(row)?`<div class="book-purchase-actions"><button class="btn" data-book-edit="${esc(row.id)}">編輯</button><button class="btn" data-book-delete="${esc(row.id)}">刪除</button></div>`:'<span class="book-purchase-readonly">僅供查看</span>'}</div></article>`).join(''):'<p class="book-purchase-empty">目前沒有符合的書籍需求</p>';
 }
 function clear(){editing=null;for(const id of ['bookTitle','bookPublisher','bookIsbn','bookNote'])$(id).value='';$('bookQuantity').value='1';$('bookPurchaseSave').textContent='新增需求';$('bookPurchaseCancelEdit').hidden=true}
 async function refresh(){
  if(!identity.uid||!window.__danbridgeBookPurchaseCall)return;
  const generation=++readGeneration,mutation=lastMutation,loaded=[];let cursor='';
  try{
   do{const result=await window.__danbridgeBookPurchaseCall({action:'list',cursor});if(generation!==readGeneration||mutation!==lastMutation)return;if(!result?.ok||!Array.isArray(result.records))throw Error('書籍資料讀取未完成');loaded.push(...result.records);if(result.nextCursor&&result.nextCursor===cursor)throw Error('書籍分頁未前進');cursor=result.nextCursor||''}while(cursor);
   rows=loaded;render();if(!busy)status(syncError|| (outbox.length?`${outbox.length} 筆待同步`:'已同步'),!!syncError);return true;
  }catch(error){if(generation===readGeneration)status(error.message||'同步失敗，保留目前內容',true)}
 }
 async function save(event){
  event.preventDefault();
  const input={title:$('bookTitle').value,publisher:$('bookPublisher').value,isbn:$('bookIsbn').value,quantity:Number($('bookQuantity').value),note:$('bookNote').value};
  if(!input.title.trim()||!Number.isInteger(input.quantity)||input.quantity<1||input.quantity>999)return status('請填寫書名及 1–999 本的數量',true);
  const result=await mutate({action:editing?'update':'create',id:editing?.id||'book-'+crypto.randomUUID(),operationId:'bookop-'+crypto.randomUUID(),expectedRevision:editing?.revision||0,input});if(result)clear();
 }
 async function mutate(payload){
  if(!identity.uid)return false;
  try{
   if(draftBlocked)throw Error('原有草稿無法讀取，已保留原檔；暫停新增以避免覆蓋');
   if(outbox.length>=1000)throw Error('待同步已達 1,000 筆，請先重新同步');
   const previous=projectedRows().find(r=>r.id===payload.id);
   if(payload.action!=='create'&&(!previous||!own(previous)))throw Error('只能修改自己的書籍');
   const optimistic={...(previous||{}),...(payload.input||{}),id:payload.id,revision:payload.expectedRevision+1,createdByUid:identity.uid,createdByEmail:identity.email,createdByName:previous?.createdByName||identity.name||identity.email,deleted:payload.action==='delete'};
   const entry={request:payload,optimistic,enqueuedAt:Date.now()};localStorage.setItem(entryKey(entry),JSON.stringify(entry));outbox=[...outbox,entry];lastMutation++;readGeneration++;render();status(`${outbox.length} 筆待同步`);void flush();return true;
  }catch(error){status(error.message||'無法保存待同步草稿，輸入內容已保留',true);return false}
 }
 async function flush(){
  if(busy||!identity.uid||draftBlocked||conflictId)return;busy=true;const user=identity;syncError='';
  try{while(outbox.length&&identity===user){const entry=outbox[0],result=await window.__danbridgeBookPurchaseCall(entry.request);if(identity!==user)return;if(!result?.ok||!result.record)throw Error('雲端尚未確認，請重新同步');localStorage.removeItem(entryKey(entry));outbox=outbox.slice(1);rows=[...rows.filter(r=>r.id!==result.record.id),result.record].filter(r=>!r.deleted);lastMutation++;readGeneration++;render();status(outbox.length?`${outbox.length} 筆待同步`:'已同步')}}
  catch(error){if(identity===user){const message=error.message||'同步失敗';if(/已更新|不存在或已刪除|已存在/.test(message))conflictId=outbox[0]?.request.id||'';syncError=`${message}；草稿已保留，${conflictId?'請先處理版本衝突':'請按重新同步'}`;status(syncError,true)}}finally{if(identity===user){busy=false;render()}}
 }
 async function recoverConflict(){
  if(!conflictId||busy||!confirm('保留這筆衝突草稿的本機備份，讀取雲端最新版本後重新編輯？目前未送出的表單內容會被草稿取代。'))return;
  const user=identity,id=conflictId;busy=true;render();
  try{
   if(!await refresh()||identity!==user)throw Error('尚未讀取最新版本，原草稿未變更');
   const entries=outbox.filter(e=>e.request.id===id),last=entries.at(-1);if(!last)throw Error('找不到待處理草稿');
   // Archive before removing any queued intent; recovery never silently rebases a write.
   localStorage.setItem(`danbridge-books-recovery-v1:${identity.uid}:${crypto.randomUUID()}`,JSON.stringify({at:new Date().toISOString(),entries}));
   for(const entry of entries)localStorage.removeItem(entryKey(entry));outbox=outbox.filter(e=>e.request.id!==id);lastMutation++;readGeneration++;conflictId='';syncError='';clear();
   const current=rows.find(r=>r.id===id&&!r.deleted);
   if(last.request.action!=='delete'){
    editing=current&&own(current)?{...current}:null;
    for(const [field,key] of [['bookTitle','title'],['bookPublisher','publisher'],['bookIsbn','isbn'],['bookQuantity','quantity'],['bookNote','note']])$(field).value=last.optimistic[key]??'';
    $('bookPurchaseSave').textContent=editing?'儲存修改':'新增需求';$('bookPurchaseCancelEdit').hidden=!editing;
   }
   status('衝突草稿已備份；請核對最新資料後重新送出',true);
  }catch(error){if(identity===user)status(error.message||'恢復失敗，草稿已保留',true)}finally{if(identity===user){busy=false;render();if(!conflictId&&outbox.length)void flush()}}
 }
 function edit(id){const row=projectedRows().find(r=>r.id===id);if(!row||!own(row))return;editing={...row};$('bookTitle').value=row.title;$('bookPublisher').value=row.publisher;$('bookIsbn').value=row.isbn;$('bookQuantity').value=row.quantity;$('bookNote').value=row.note;$('bookPurchaseSave').textContent='儲存修改';$('bookPurchaseCancelEdit').hidden=false;$('bookTitle').focus()}
 async function remove(id){const row=projectedRows().find(r=>r.id===id);if(!row||!own(row)||!confirm(`刪除自己建立的「${row.title}」？`))return;const ok=await mutate({action:'delete',id,operationId:'bookop-'+crypto.randomUUID(),expectedRevision:row.revision});if(ok&&editing?.id===id)clear()}
 window.__danbridgeSetBookIdentity=next=>{readGeneration++;lastMutation++;clearInterval(refreshTimer);identity=next||{uid:'',email:''};rows=[];outbox=[];busy=false;syncError='';draftBlocked=false;conflictId='';clear();if(identity.uid){try{outbox=readSaved()}catch{draftBlocked=true;syncError='書籍草稿無法讀取，未自動覆蓋';status(syncError,true)}refreshTimer=setInterval(()=>{if(!document.hidden&&$('bookPurchase')?.classList.contains('active'))refresh()},30000);refresh();if(!syncError)void flush()}render()};
 // Existing authenticated notification stream invalidates the list immediately.
 // The slow poll is only recovery for a missed event, not the normal sync path.
 window.addEventListener('danbridge:book-purchase-changed',()=>{if(identity.uid)void refresh()});
 window.renderBookPurchases=()=>{render();refresh()};
 document.addEventListener('DOMContentLoaded',()=>{$('bookPurchaseForm').addEventListener('submit',save);$('bookPurchaseSearch').addEventListener('input',render);$('bookPurchaseScope').addEventListener('change',render);$('bookPurchaseRefresh').addEventListener('click',()=>{void flush();void refresh()});$('bookPurchaseCancelEdit').addEventListener('click',clear);$('bookPurchaseRows').addEventListener('click',event=>{const button=event.target.closest('button');if(button?.dataset.bookEdit)edit(button.dataset.bookEdit);if(button?.dataset.bookDelete)remove(button.dataset.bookDelete)});render()});
})();
