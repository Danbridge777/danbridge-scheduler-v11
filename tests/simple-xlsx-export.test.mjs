import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {createWorkbook}=require('../js/core/simple-xlsx-export.js');
const read16=(bytes,at)=>bytes[at]|bytes[at+1]<<8;
const read32=(bytes,at)=>(bytes[at]|bytes[at+1]<<8|bytes[at+2]<<16|bytes[at+3]<<24)>>>0;

function localEntries(bytes){
  const decoder=new TextDecoder(),entries=[];let at=0;
  while(read32(bytes,at)===0x04034b50){const method=read16(bytes,at+8),compressed=read32(bytes,at+18),size=read32(bytes,at+22),nameLength=read16(bytes,at+26),extraLength=read16(bytes,at+28),name=decoder.decode(bytes.slice(at+30,at+30+nameLength)),from=at+30+nameLength+extraLength;entries.push({name,method,compressed,size,bytes:bytes.slice(from,from+compressed)});at=from+compressed}
  return entries;
}

test('xlsx archive contains styled workbook and readable worksheet parts',async()=>{
  const result=await createWorkbook({sheets:[{name:'摘要',header:['項目','內容'],widths:[20,30],rows:[['課程筆數',300000],['匯出時間',new Date('2026-09-19T14:30:00+08:00')],['中文與英文','Danbridge']]},{name:'課程 1',header:['ID','日期','時數'],columnKinds:['text','date','decimal'],rows:[['a',new Date('2026-01-01T00:00:00+08:00'),1.5],['b',new Date('2026-01-02T00:00:00+08:00'),1],['c',new Date('2026-01-03T00:00:00+08:00'),2.25]]}]});
  assert.deepEqual(result.rowCounts,[3,3]);assert.deepEqual(result.sheetNames,['摘要','課程 1']);
  const bytes=new Uint8Array(await result.blob.arrayBuffer()),entries=localEntries(bytes),names=entries.map(entry=>entry.name);
  assert.ok(names.includes('[Content_Types].xml'));assert.ok(names.includes('xl/workbook.xml'));assert.ok(names.includes('xl/styles.xml'));assert.ok(names.includes('xl/worksheets/sheet1.xml'));assert.ok(names.includes('xl/worksheets/sheet2.xml'));
  const styles=entries.find(entry=>entry.name==='xl/styles.xml');assert.equal(styles.method,0);const styleXml=new TextDecoder().decode(styles.bytes);assert.match(styleXml,/formatCode="yyyy-mm-dd"/);assert.match(styleXml,/formatCode="#,##0"/);assert.match(styleXml,/formatCode="#,##0.00"/);assert.match(styleXml,/fgColor rgb="FFF3F7FB"/);assert.match(styleXml,/cellXfs count="11"/);
  assert.equal(read32(bytes,bytes.length-22),0x06054b50);
  assert.ok(result.blob.size>1000);
});

test('300,000 lesson rows split across six Excel sheets without row loss',async()=>{
  const perSheet=50_000,sheets=Array.from({length:6},(_,sheet)=>({name:`課程 ${sheet+1}`,header:['課程 ID','日期','學生'],rows:function*(){for(let row=0;row<perSheet;row++){const number=sheet*perSheet+row;yield[`lesson-${number}`,`2026-${String(number%12+1).padStart(2,'0')}-${String(number%28+1).padStart(2,'0')}`,`student-${number%1200}`]}}}));
  const result=await createWorkbook({sheets});
  assert.equal(result.rowCounts.reduce((sum,count)=>sum+count,0),300_000);
  assert.deepEqual(result.rowCounts,[50_000,50_000,50_000,50_000,50_000,50_000]);
  assert.equal(result.sheetNames.length,6);
  assert.ok(result.blob.size>1_000_000);
  assert.ok(result.blob.size<300_000_000);
});
