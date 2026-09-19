import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('user-controlled teacher and profile names never enter the confirmed HTML sinks unescaped',()=>{
  const workspace=read('js/app/v18-information-architecture.js');
  const auth=read('js/core/firebase-auth-and-cloud-sync.module.js');
  const batch=read('js/modules/calendar/batch-lesson-operations.js');
  assert.doesNotMatch(workspace,/b\.innerHTML=`<span>\$\{name\.slice/);
  assert.match(workspace,/initial\.textContent=name\.slice\(0,1\);label\.textContent=name/);
  assert.match(auth,/label\.textContent=`\$\{cloudCanManageSchedule/);
  assert.doesNotMatch(auth,/header\.innerHTML=`<span class="cloud-role-label"/);
  assert.match(batch,/esc\(x\.error\)/);
  assert.match(batch,/esc\(x\.warning\)/);
});

test('teacher colors are allowlisted before entering inline styles',()=>{
  const utilities=read('js/core/utils.js');
  const calendar=read('js/modules/application-and-business-features.js');
  const dashboard=read('js/modules/dashboard/dashboard.js');
  const branch=read('js/core/branch-business-scope.js');
  const teachers=read('js/modules/teachers/teachers-crm.js');
  assert.match(utilities,/function safeCssColor\(value,fallback='#2563eb'\)/);
  assert.match(utilities,/\^#\[0-9a-f\]\{6\}\$\/i/);
  for(const source of [calendar,dashboard,branch,teachers]){
    assert.doesNotMatch(source,/--teacher:\$\{[^}]*\.color\|\|/);
    assert.doesNotMatch(source,/background:\$\{t\.color\|\|/);
  }
  assert.match(calendar,/--teacher:\$\{safeCssColor\(/);
  assert.match(teachers,/background:\$\{safeCssColor\(t\.color\)\}/);
});

test('backup restore rejects identifier values that can break HTML or inline handler boundaries',()=>{
  const source=read('js/core/data-persistence.js');
  const context={window:{addEventListener(){}},localStorage:{getItem(){return null},setItem(){}},studentDefaults:value=>value,normalizeCampCode:value=>value,isCanonicalLessonId:()=>true,localDate:date=>date.toISOString().slice(0,10),console};
  vm.createContext(context);vm.runInContext(source,context);
  const empty={students:[],teachers:[],lessons:[]};
  assert.throws(()=>context.normalizeImported({...empty,teachers:[{id:"teacher');alert(1)//",name:'T'}]}),/不安全字元/);
  assert.throws(()=>context.normalizeImported({...empty,students:[{id:'student&amp;apos;bad',name:'S'}]}),/不安全字元/);
  assert.deepEqual(JSON.parse(JSON.stringify(context.normalizeImported({...empty,teachers:[{id:'老師-一',name:'<正常顯示也會被轉義>'}]}).teachers)),[{id:'老師-一',name:'<正常顯示也會被轉義>'}]);
});

test('large lesson snapshots bypass synchronous localStorage serialization path',()=>{
  const source=read('js/core/data-persistence.js');
  const branch=source.indexOf("if((db.lessons?.length||0)>=LARGE_LOCAL_SNAPSHOT_LESSON_THRESHOLD)");
  const stringify=source.indexOf('serialized=JSON.stringify(db)',branch);
  assert.ok(branch>0&&stringify>branch);
  assert.match(source.slice(branch,stringify),/persistLargeLocalSnapshot\(db,sequence\)/);
  assert.match(source,/schema:'danbridge-local-snapshot-v2',data:snapshot/);
});

test('production and staging Hosting ship anti-sniffing, framing, referrer, permissions and CSP controls',()=>{
  for(const path of ['firebase.json','firebase.production.json']){
    const config=JSON.parse(read(path)),headers=config.hosting.headers?.[0]?.headers||[],map=new Map(headers.map(row=>[row.key,row.value]));
    assert.equal(map.get('X-Content-Type-Options'),'nosniff');
    assert.equal(map.get('X-Frame-Options'),'DENY');
    assert.equal(map.get('Referrer-Policy'),'no-referrer');
    assert.match(map.get('Permissions-Policy')||'',/camera=\(\)/);
    assert.match(map.get('Content-Security-Policy')||'',/frame-ancestors 'none'/);
    assert.match(map.get('Content-Security-Policy')||'',/object-src 'none'/);
  }
});
