import test from 'node:test';
import assert from 'node:assert/strict';

await import('../js/core/permanent-operation-history.js');
const {lessonTransitions,reversedChangeIds}=globalThis.DanbridgePermanentOperationHistory;

test('課程刪除與同 ID 重建只產生精確 transition',()=>{
  const lesson={id:'lesson-stable',title:'A',date:'2026-08-16'};
  assert.deepEqual(lessonTransitions([lesson],[]),[{kind:'delete',lessonId:'lesson-stable',before:lesson,after:null}]);
  assert.deepEqual(lessonTransitions([],[lesson]),[{kind:'create',lessonId:'lesson-stable',before:null,after:lesson}]);
});

test('修改只記錄同一 ID 的前後內容且不誤判未變資料',()=>{
  const before={id:'lesson-stable',title:'A'},after={id:'lesson-stable',title:'B'};
  assert.deepEqual(lessonTransitions([before],[after]),[{kind:'update',lessonId:'lesson-stable',before,after}]);
  assert.deepEqual(lessonTransitions([before],[structuredClone(before)]),[]);
});

test('回復以追加關聯表示，不修改或刪除任何舊紀錄',()=>{
  const rows=[
    {id:'undo-2',undoOfChangeId:'undo-1'},
    {id:'undo-1',undoOfChangeId:'original'},
    {id:'original',type:'刪除課程'}
  ];
  const original=structuredClone(rows),reversed=reversedChangeIds(rows);
  assert.equal(reversed.has('original'),false,'回復操作再被回復後，原操作重新生效');
  assert.equal(reversed.has('undo-1'),true);
  assert.equal(reversed.has('undo-2'),false);
  assert.deepEqual(rows,original,'判定不得改寫永久歷史');
});

test('重複回復分支與舊版 undone 均 fail closed 為已回復',()=>{
  const rows=[
    {id:'undo-a',undoOfChangeId:'original'},
    {id:'undo-b',undoOfChangeId:'original'},
    {id:'original'},
    {id:'legacy',undone:true}
  ];
  const reversed=reversedChangeIds(rows);
  assert.equal(reversed.has('original'),true);
  assert.equal(reversed.has('legacy'),true);
});
