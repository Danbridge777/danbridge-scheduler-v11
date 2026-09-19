import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../js/modules/reports/reports-export.js',import.meta.url),'utf8');
const archiveCss=readFileSync(new URL('../css/core/85-v2026349-bilingual-control-consistency.css',import.meta.url),'utf8');
const entry=readFileSync(new URL('../index.html',import.meta.url),'utf8');

function fixture(){
  const controls=new Map();
  for(const id of ['lessonArchiveRangeMode','lessonArchiveMonth','lessonArchiveFrom','lessonArchiveTo','lessonArchiveMonthWrap','lessonArchiveFromWrap','lessonArchiveToWrap'])controls.set(id,{id,value:'',type:'',min:'',max:'',classList:{hidden:false,toggle(_name,force){this.hidden=force}}});
  const lessons=[
    {id:'jan-a',date:'2026-01-01'},
    {id:'jan-b',date:'2026-01-31'},
    {id:'feb',date:'2026-02-14'},
    {id:'next-year',date:'2027-01-01'}
  ];
  const context={
    console,
    Date,
    Math,
    JSON,
    localStorage:{getItem(){return null},setItem(){}},
    document:{},
    navigator:{},
    db:{lessons,students:[],teachers:[]},
    monthNow:()=> '2026-02',
    $:id=>controls.get(id)||null,
    window:{DanbridgeLessonIndex:{
      byMonth(_rows,month){return lessons.filter(row=>row.date.startsWith(month))},
      between(_rows,from,to){return lessons.filter(row=>row.date>=from&&row.date<=to)}
    }}
  };
  vm.createContext(context);
  vm.runInContext(source,context);
  return{context,controls};
}

test('Excel export range supports all, month, year and custom dates without changing source rows',()=>{
  const{context,controls}=fixture(),mode=controls.get('lessonArchiveRangeMode'),period=controls.get('lessonArchiveMonth');
  const ids=rows=>Array.from(rows,row=>String(row.id));
  mode.value='all';
  const all=context.selectedLessonArchiveRange();
  assert.deepEqual(ids(all.rows),['jan-a','jan-b','feb','next-year']);
  assert.notEqual(all.rows,context.db.lessons);

  mode.value='month';context.syncLessonArchiveRangeControls();period.value='2026-01';
  const month=context.selectedLessonArchiveRange();
  assert.equal(period.type,'month');
  assert.equal(month.label,'2026-01 月');
  assert.deepEqual(ids(month.rows),['jan-a','jan-b']);

  mode.value='year';context.syncLessonArchiveRangeControls();period.value='2026';
  const year=context.selectedLessonArchiveRange();
  assert.equal(period.type,'number');
  assert.equal(year.label,'2026 年');
  assert.deepEqual(ids(year.rows),['jan-a','jan-b','feb']);

  mode.value='custom';context.syncLessonArchiveRangeControls();
  controls.get('lessonArchiveFrom').value='2026-01-31';
  controls.get('lessonArchiveTo').value='2026-02-14';
  const custom=context.selectedLessonArchiveRange();
  assert.equal(custom.label,'2026-01-31 至 2026-02-14');
  assert.deepEqual(ids(custom.rows),['jan-b','feb']);
  assert.equal(controls.get('lessonArchiveMonthWrap').classList.hidden,true);
  assert.equal(controls.get('lessonArchiveFromWrap').classList.hidden,false);
  assert.equal(controls.get('lessonArchiveToWrap').classList.hidden,false);
});

test('custom Excel export range rejects missing or reversed dates',()=>{
  const{context,controls}=fixture();
  controls.get('lessonArchiveRangeMode').value='custom';
  controls.get('lessonArchiveFrom').value='2026-02-01';
  controls.get('lessonArchiveTo').value='';
  assert.throws(()=>context.selectedLessonArchiveRange(),/請輸入正確/);
  controls.get('lessonArchiveTo').value='2026-01-01';
  assert.throws(()=>context.selectedLessonArchiveRange(),/請輸入正確/);
});

test('archive range layout hides inactive controls and keeps a full-width selector',()=>{
  assert.match(archiveCss,/#lessonArchiveCard[\s\S]*#lessonArchiveMonthWrap[\s\S]*\.hidden[\s\S]*display:none!important/);
  assert.match(entry,/lesson-archive-range-grid[\s\S]*class="col-12"><label>Excel 匯出範圍/);
  assert.match(entry,/id="lessonArchiveMonthWrap"[^>]*class="[^"]*hidden|class="[^"]*hidden[^>]*id="lessonArchiveMonthWrap"/);
});
