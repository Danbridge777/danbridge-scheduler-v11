import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../js/modules/business/business-logic.js',import.meta.url),'utf8');

function runtime({students=[],lessons=[],summerCampRegistrations=[],winterCampRegistrations=[]}={}){
  const db={students,lessons,summerCampRegistrations,winterCampRegistrations,teachers:[],changes:[]};
  const sandbox={
    db,
    window:{},
    document:{getElementById:()=>null},
    localStorage:{getItem:()=>null,setItem:()=>{}},
    student:id=>db.students.find(row=>String(row.id)===String(id))||{},
    teacher:()=>({}),
    lessonTeacherIds:lesson=>lesson.teacherIds||[lesson.teacherId].filter(Boolean),
    effectiveCampId:()=>'',
    summerRegistrationTotal:row=>Number(row.totalFee)||0,
    summerRegistrationPricingMode:row=>row.pricingMode||'daily',
    summerRegistrationWeekCount:dates=>Math.ceil((dates||[]).length/5),
    hours:(start,end)=>{
      const minutes=value=>{const[h,m]=String(value).split(':').map(Number);return h*60+m};
      return Math.max(0,(minutes(end)-minutes(start))/60);
    },
    money:value=>`NT$${Number(value||0).toLocaleString('en-US',{maximumFractionDigits:2})}`,
    TextEncoder,
    structuredClone,
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(source,sandbox,{filename:'business-logic.js'});
  return sandbox;
}

const lesson=(id,studentId,date,start,end,extra={})=>({id,studentId,date,start,end,status:'未上課',chargeStudent:'yes',...extra});

test('every chargeable private and group lesson is hours multiplied by that student rate',()=>{
  const app=runtime({
    students:[
      {id:'private',name:'小安',parent:'林家長',courseType:'1對1',rate:800},
      {id:'group',name:'小晴',parent:'陳家長',courseType:'團班',rate:600}
    ],
    lessons:[
      lesson('p1','private','2026-08-03','16:00','17:30'),
      lesson('p2','private','2026-08-10','18:00','19:00'),
      lesson('g1','group','2026-08-05','14:00','16:00'),
      lesson('g2','group','2026-08-12','16:00','17:30')
    ]
  });
  const privateBill=app.studentMonthlyBillingData('private','2026-08');
  const groupBill=app.studentMonthlyBillingData('group','2026-08');
  assert.equal(privateBill.privateHours,2.5);
  assert.equal(privateBill.privateAmount,2000);
  assert.equal(groupBill.groupHours,3.5);
  assert.equal(groupBill.groupAmount,2100);
  assert.equal(privateBill.total,2.5*800);
  assert.equal(groupBill.total,3.5*600);
});

test('legacy per-lesson or monthly billing labels cannot override hours multiplied by rate',()=>{
  const app=runtime({
    students:[
      {id:'legacy-lesson',name:'舊每堂學生',parent:'林家長',courseType:'1對1',billing:'lesson',rate:750},
      {id:'legacy-month',name:'舊月費團班',parent:'陳家長',courseType:'團班',billing:'month',rate:480}
    ],
    lessons:[
      lesson('l1','legacy-lesson','2026-08-03','16:00','17:30'),
      lesson('l2','legacy-month','2026-08-04','18:00','20:00')
    ]
  });
  const lessonBill=app.studentMonthlyBillingData('legacy-lesson','2026-08');
  const monthBill=app.studentMonthlyBillingData('legacy-month','2026-08');
  assert.equal(lessonBill.total,1.5*750);
  assert.equal(monthBill.total,2*480);
  assert.match(app.studentLineBillingText('legacy-lesson','2026-08'),/計算：1\.5 小時 × NT\$750 = NT\$1,125/);
  assert.match(app.studentLineBillingText('legacy-month','2026-08'),/計算：2 小時 × NT\$480 = NT\$960/);
});

test('LINE preview binds only the entered parent name and safely merges three siblings',()=>{
  const app=runtime({
    students:[
      {id:'a',name:'小安',parent:'  王小美  ',lineSalutation:'媽咪',courseType:'1對1',rate:800},
      {id:'b',name:'小晴',parent:'王小美',lineSalutation:'爸爸',courseType:'團班',rate:600},
      {id:'c',name:'小宇',parent:'王小美',lineSalutation:'自訂舊稱謂',courseType:'1對1',rate:500},
      {id:'outsider',name:'其他學生',parent:'李家長',courseType:'1對1',rate:999}
    ],
    lessons:[
      lesson('a1','a','2026-08-03','16:00','17:30'),
      lesson('a2','a','2026-08-10','18:00','19:00'),
      lesson('b1','b','2026-08-05','14:00','16:00'),
      lesson('b2','b','2026-08-12','16:00','17:30'),
      lesson('c1','c','2026-08-20','19:00','20:00'),
      lesson('x1','outsider','2026-08-21','19:00','20:00')
    ]
  });
  const text=app.studentLineBillingText('a','2026-08','all',['a','b','c','outsider'],'summer');
  assert.match(text,/王小美您好/);
  assert.doesNotMatch(text,/媽咪|爸爸|自訂舊稱謂/);
  assert.match(text,/學生：小安/);
  assert.match(text,/學生：小晴/);
  assert.match(text,/學生：小宇/);
  assert.doesNotMatch(text,/其他學生/);
  assert.match(text,/一般家教/);
  assert.match(text,/團班費用/);
  assert.match(text,/計算：2\.5 小時 × NT\$800 = NT\$2,000/);
  assert.match(text,/計算：3\.5 小時 × NT\$600 = NT\$2,100/);
  assert.match(text,/8月共計：NT\$4,600/);
});

test('preview lists every lesson date and time, distinct class days, lesson count and total hours',()=>{
  const app=runtime({
    students:[{id:'s',name:'IRIS',parent:'Wendy',courseType:'1對1',rate:700}],
    lessons:[
      lesson('l1','s','2026-08-03','09:00','10:00'),
      lesson('l2','s','2026-08-03','16:00','17:30'),
      lesson('l3','s','2026-08-17','10:00','12:00')
    ]
  });
  const text=app.studentLineBillingText('s','2026-08','all',null,'summer');
  assert.match(text,/- 8\/3 09:00–10:00（1 小時）/);
  assert.match(text,/- 8\/3 16:00–17:30（1\.5 小時）/);
  assert.match(text,/- 8\/17 10:00–12:00（2 小時）/);
  assert.match(text,/上課天數：2 天/);
  assert.match(text,/課程堂數：3 堂/);
  assert.match(text,/總時數：4\.5 小時/);
  assert.match(text,/計算：4\.5 小時 × NT\$700 = NT\$3,150/);
});

test('cancelled, teacher-leave, draft, no-charge and linked makeup rows never enter tuition',()=>{
  const app=runtime({
    students:[{id:'s',name:'IRIS',parent:'Wendy',courseType:'1對1',rate:1000}],
    lessons:[
      lesson('ok','s','2026-08-01','10:00','11:30'),
      lesson('cancel','s','2026-08-02','10:00','11:30',{status:'取消'}),
      lesson('leave','s','2026-08-03','10:00','11:30',{status:'老師請假'}),
      lesson('draft','s','2026-08-04','10:00','11:30',{isDraft:true}),
      lesson('free','s','2026-08-05','10:00','11:30',{chargeStudent:'no'}),
      lesson('makeup','s','2026-08-06','10:00','11:30',{makeupId:'m1'})
    ]
  });
  const bill=app.studentMonthlyBillingData('s','2026-08');
  assert.equal(bill.tutoringLessons.length,1);
  assert.equal(bill.tutoringHours,1.5);
  assert.equal(bill.tutoringAmount,1500);
});

test('missing parent name does not fall back to historical salutation data',()=>{
  const app=runtime({
    students:[{id:'s',name:'IRIS',parent:'',lineSalutation:'媽咪',courseType:'1對1',rate:700}],
    lessons:[lesson('l1','s','2026-08-03','09:00','10:00')]
  });
  const text=app.studentLineBillingText('s','2026-08','all',null,'summer');
  assert.match(text,/^家長您好/);
  assert.doesNotMatch(text,/媽咪/);
});
