import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('課程視窗的hidden狀態確實隱藏校區警告與條件欄位',async()=>{
  const css=await readFile(new URL('../css/calendar/31-branch-delivery-room-foundation.css',import.meta.url),'utf8');
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  assert.match(css,/\.modal \.hidden\{display:none!important\}/);
  assert.match(html,/id="lessonUnassignedWarning" class="hint hidden"/);
  assert.match(html,/id="lessonCampIdWrap" class="hidden"/);
});

test('課程修改使用非阻塞站內差異確認並防止重複送出',async()=>{
  const source=await readFile(new URL('../js/app/v18-convenience-suite.js',import.meta.url),'utf8');
  assert.match(source,/function confirmLessonDiff\(diff\)/);
  assert.match(source,/id='v181LessonDiffConfirm'/);
  assert.match(source,/setAttribute\('aria-modal','true'\)/);
  assert.match(source,/backdrop\.style\.zIndex='5200'/);
  assert.doesNotMatch(source,/backdrop\.style\.zIndex='260'/);
  assert.match(source,/approve\.textContent='確認儲存'/);
  assert.match(source,/if\(wrapped\.inFlight\)return/);
  assert.match(source,/!await confirmLessonDiff\(diff\)/);
  assert.doesNotMatch(source,/diff\.length&&!confirm\(`確定儲存以下課程修改/);
});
