import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('請假頁面、三角色導覽、受保護 callable 與即時 listener 均已接線',async()=>{const [html,client,functions,rules,roleUx]=await Promise.all(['index.html','js/core/firebase-auth-and-cloud-sync.module.js','functions/index.cjs','firebase/firestore.rules','js/app/v20014-role-responsive-ux.js'].map(read));assert.match(html,/data-tab="teacherLeave"/);assert.match(html,/id="teacherLeave"/);assert.match(client,/productionTeacherLeaveOperation/);assert.match(client,/subscribeTeacherLeaves\(\)/);assert.match(client,/where\('teacherId','==',cloudTeacherId\)/);assert.match(functions,/exports\.productionTeacherLeaveOperation=onCall/);assert.match(functions,/enforceAppCheck:true,consumeAppCheckToken:true/);assert.match(functions,/productionTeacherLeaveOperationReceipts/);assert.match(rules,/match \/productionTeacherLeaveRecords\/\{leaveId\}/);assert.match(rules,/allow create, update, delete: if false/);assert.match(roleUx,/teacherLeave:'請假管理'/);assert.match(roleUx,/teacherLeave:'我的請假'/)});

test('PWA 只在使用者接受更新後切換，不再安裝完自動激活造成重複提示',async()=>{const [sw,pwa]=await Promise.all(['sw.js','js/core/pwa-installation.js'].map(read));const install=sw.slice(sw.indexOf("self.addEventListener('install'"),sw.indexOf("self.addEventListener('activate'"));assert.doesNotMatch(install,/skipWaiting/);assert.match(sw,/event\.data\?\.type==='SKIP_WAITING'/);assert.match(pwa,/worker\.postMessage\(\{type:'SKIP_WAITING'\}\)/);assert.match(pwa,/controllerchange/);assert.match(sw,/privacy-231/)});
