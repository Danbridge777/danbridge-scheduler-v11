import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../js/modules/business/business-logic.js',import.meta.url),'utf8');

function runtime({students=[],lessons=[],summerCampRegistrations=[],winterCampRegistrations=[],collectionRecords=[]}={}){
  const db={students,lessons,summerCampRegistrations,winterCampRegistrations,collectionRecords,teachers:[],changes:[]};
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

test('itemized receipts cover only their original lesson and campus after new lessons are added',()=>{
  const app=runtime({students:[{id:'a',parent:'王',rate:600,courseType:'1對1'}],lessons:[lesson('one','a','2026-09-01','16:00','17:00',{billingBranchId:'hexi'}),lesson('two','a','2026-09-02','16:00','17:00',{billingBranchId:'art_museum'})]});
  const items=app.billingCollectionSnapshot(['a'],'2026-09','hexi');
  app.db.collectionRecords=[{id:'paid',month:'2026-09',branchId:'hexi',studentIds:['a'],status:'collected',amount:600,billingItemsVersion:1,billingItems:items}];
  app.db.lessons.push(lesson('new','a','2026-09-03','16:00','17:00',{billingBranchId:'hexi'}));
  assert.equal(app.studentUnpaidTuitionRevenue('2026-09'),1200);
  assert.equal(app.studentUnpaidTuitionRevenue('2026-09','hexi'),600);
  assert.equal(app.studentUnpaidTuitionRevenue('2026-09','art_museum'),600);
  assert.equal(app.billingCollectionBalance('2026-09').requiresReview,false);
});

test('legacy partial receipt without line allocation is flagged instead of silently guessing a family or campus balance',()=>{
  const app=runtime({students:[{id:'a',parent:'王',rate:600,courseType:'1對1'}],lessons:[lesson('one','a','2026-09-01','16:00','17:00',{billingBranchId:'hexi'}),lesson('two','a','2026-09-02','16:00','17:00',{billingBranchId:'art_museum'})],collectionRecords:[{id:'partial',month:'2026-09',branchId:'all',studentIds:['a'],status:'collected',amount:600}]});
  assert.equal(app.billingCollectionBalance('2026-09').requiresReview,true);
  assert.equal(app.studentUnpaidTuitionLabel('2026-09','hexi'),'需核對');
  assert.equal(app.studentUnpaidTuitionLabel('2026-09','art_museum'),'需核對');
  assert.equal(app.db.collectionRecords[0].amount,600);
});

test('camp payment cannot pay another family tuition and both kinds reconcile in the collection summary',()=>{
  const app=runtime({students:[{id:'a',parent:'王',rate:600,courseType:'1對1'},{id:'b',parent:'李',rate:800,courseType:'1對1'}],lessons:[lesson('one','a','2026-09-01','16:00','17:00'),lesson('two','b','2026-09-02','16:00','17:00')],summerCampRegistrations:[{id:'camp',studentId:'a',month:'2026-09',totalFee:9000}],collectionRecords:[{id:'family-paid',month:'2026-09',branchId:'all',studentIds:['a'],status:'collected',amount:9600}]});
  assert.equal(app.studentTuitionRevenue('2026-09'),1400);
  assert.equal(app.studentUnpaidTuitionRevenue('2026-09'),800);
  const balance=app.billingCollectionBalance('2026-09','all',true);
  assert.equal(balance.due,10400);assert.equal(balance.collected,9600);assert.equal(balance.unpaid,800);
});

test('exact itemized partial amount is not double counted with lesson paid or repeated scoped receipts',()=>{
  const app=runtime({students:[{id:'a',parent:'王',rate:600,courseType:'1對1'}],lessons:[lesson('one','a','2026-09-01','16:00','17:00',{billingBranchId:'hexi'})]});
  const items=app.billingCollectionSnapshot(['a'],'2026-09').map(item=>({...item,amount:200}));
  app.db.collectionRecords=['all','hexi'].map(branchId=>({id:branchId,month:'2026-09',branchId,studentIds:['a'],status:'collected',amount:200,billingItemsVersion:1,billingItems:items}));
  assert.equal(app.studentUnpaidTuitionRevenue('2026-09'),400);
  app.db.lessons[0].paymentStatus='paid';
  assert.equal(app.studentUnpaidTuitionRevenue('2026-09'),0);
});

test('12 months × 6 durations × 5 roster sizes reconcile child bills, campus subtotals and total revenue',()=>{
 for(let month=1;month<=12;month++)for(const minutes of [15,30,45,60,90,120])for(const count of [1,2,3,8,30]){
  const m=`2026-${String(month).padStart(2,'0')}`,other=month===12?'2027-01':`2026-${String(month+1).padStart(2,'0')}`;
  const children=Array.from({length:count},(_,i)=>({id:`s${i}`,name:'同名學生',parent:`家長${i}`,courseType:i%2?'團班':'1對1',rate:(i+1)*60}));
  const ids=children.map(s=>s.id),end=`${String(16+Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
  const app=runtime({students:[...children,{id:'g',name:'團班容器',isGroupRoster:true,groupMemberIds:ids,courseType:'團班',rate:999999}],lessons:[lesson('one','g',`${m}-08`,'16:00',end,{groupStudentIds:[...ids,ids[0]],billingBranchId:'owner',branchId:'attendance',teacherIds:['t1','t2','t3']})]});
  const expected=minutes*count*(count+1)/2;
  assert.equal(app.studentTuitionRevenue(m),expected);
  assert.equal(app.studentTuitionRevenue(m,'owner'),expected);
  assert.equal(app.studentTuitionRevenue(m,'attendance'),0);
  assert.equal(app.studentTuitionRevenue(other),0);
  for(let i=0;i<count;i++)assert.equal(app.studentMonthlyBillingData(`s${i}`,m).total,minutes*(i+1));
 }
});

test('company revenue follows explicit ownership for every student and never attendance rooms or legacy profile branches',()=>{
 const app=runtime({students:[
  {id:'care',name:'安親',courseType:'安親',rate:9000,billingBranchId:'B',branchIds:['wrong-profile']},
  {id:'a',name:'同名',courseType:'1對1',rate:600,billingBranchId:'B',branchIds:['wrong-profile']},
  {id:'b',name:'同名',courseType:'團班',rate:800},
  {id:'group',name:'班級',courseType:'團班',isGroupRoster:true,groupMemberIds:['a','b'],rate:999999}
 ],lessons:[
  lesson('care-1','care','2026-09-01','13:00','14:00',{room:'教室甲',branchId:'wrong-profile'}),
  lesson('care-2','care','2026-09-02','13:00','16:00',{room:'教室乙'}),
  lesson('care-3','care','2026-10-01','13:00','16:00',{room:'教室甲'}),
  lesson('group-1','group','2026-09-03','16:00','17:30',{room:'教室乙',branchId:'B',billingBranchId:'A',groupStudentIds:['a','b','a'],teacherIds:['t1','t2']}),
  lesson('private-1','a','2026-09-04','16:00','17:00',{room:'教室乙'}),
  lesson('private-oct','a','2026-10-04','16:00','18:00',{room:'教室甲'}),
  lesson('draft','a','2026-09-04','16:00','18:00',{room:'教室甲',isDraft:true})
 ]});
 app.db.branches=[{id:'A',rooms:['教室甲']},{id:'B',rooms:['教室乙']}];
 assert.equal(app.studentTuitionRevenue('2026-09'),11700);
 assert.equal(app.studentTuitionRevenue('2026-09','A'),2100);
 assert.equal(app.studentTuitionRevenue('2026-09','B'),9600);
 app.db.lessons.find(l=>l.id==='group-1').room='教室甲';
 assert.equal(app.studentTuitionRevenue('2026-09','A'),2100,'moving classroom cannot move group ownership revenue');
 assert.equal(app.studentTuitionRevenue('2026-09','wrong-profile'),0);
 assert.equal(app.studentTuitionRevenue('2026-09','unassigned'),0);
 assert.equal(app.studentTuitionRevenue('2026-10','A'),0);
 assert.equal(app.studentTuitionRevenue('2026-10','B'),10200);
 assert.equal(app.studentMonthlyFeeBranch('care','2026-09'),'B');
 app.db.lessons.find(l=>l.id==='care-2').end='14:00';
 assert.equal(app.studentMonthlyFeeBranch('care','2026-09'),'B','attendance hours never change ownership');
 delete app.db.students[0].billingBranchId;
 assert.equal(app.studentMonthlyFeeBranch('care','2026-11'),'unassigned','never fall back to attendance or legacy profile branchIds');
 assert.equal(app.studentTuitionRevenue('2026-11','unassigned'),9000,'unallocated monthly fees remain visible, never silently lost');
});

test('group roster bills each selected child by timetable hours, month and parent without charging the container',()=>{
 const app=runtime({students:[
  {id:'group',name:'週二團班',courseType:'團班',isGroupRoster:true,groupMemberIds:['a','b'],rate:99999},
  {id:'a',name:'同名',parent:'王家長',courseType:'1對1',rate:600},
  {id:'b',name:'同名',parent:'李家長',courseType:'團班',rate:750},
  {id:'c',name:'妹妹',parent:'王家長',courseType:'團班',rate:400}
 ],lessons:[lesson('g1','group','2026-09-08','16:00','17:30',{groupStudentIds:['a','b','a']}),lesson('g2','group','2026-10-06','16:00','18:00',{groupStudentIds:['b','c']})]});
 assert.equal(app.lessonCharge(app.db.lessons[0]),2025);
 assert.equal(app.studentMonthlyBillingData('a','2026-09').total,900);
 assert.equal(app.studentMonthlyBillingData('b','2026-09').total,1125);
 assert.equal(app.studentMonthlyBillingData('group','2026-09').total,0);
 assert.equal(app.studentTuitionRevenue('2026-09'),2025);
 assert.equal(app.studentTuitionRevenue('2026-10'),2300);
 assert.match(app.studentLineBillingText('a','2026-09'),/團班費用/);
 assert.doesNotMatch(app.studentLineBillingText('a','2026-09'),/李家長|1,125/);
 app.db.students[0].groupMemberIds=['c'];
 assert.equal(app.studentMonthlyBillingData('a','2026-09').total,900,'changing default roster cannot rewrite past lesson membership');
});

test('after-school tuition is one flat monthly fee regardless of scheduled hours',()=>{
  const app=runtime({
    students:[{id:'after-school',name:'安親學生',parent:'王家長',courseType:'安親',billing:'month',rate:8000}],
    lessons:[
      lesson('a1','after-school','2026-09-01','13:00','18:00'),
      lesson('a2','after-school','2026-09-02','13:00','18:00'),
      lesson('a3','after-school','2026-09-03','13:00','18:00'),
      lesson('oct','after-school','2026-10-01','13:00','18:00')
    ]
  });
  assert.equal(app.studentMonthlyBillingData('after-school','2026-09').total,8000);
  assert.equal(app.studentMonthlyBillingData('after-school','2026-10').total,8000);
  const text=app.studentLineBillingText('after-school','2026-09','all',null,'summer');
  assert.match(text,/安親/);
  assert.match(text,/月費/);
  assert.match(text,/9月共計：NT\$8,000/);
  assert.doesNotMatch(text,/小時 ×/);
});

test('after-school tuition follows the unarchived student record even with no lessons that month',()=>{
  const app=runtime({students:[
    {id:'current',name:'在籍安親',parent:'甲家長',courseType:'安親',rate:9000},
    {id:'archived',name:'封存安親',parent:'乙家長',courseType:'安親',rate:7000,archivedAt:'2026-08-31T00:00:00.000Z'}
  ]});
  assert.equal(app.studentMonthlyBillingData('current','2026-09').total,9000);
  assert.equal(app.studentMonthlyBillingData('archived','2026-09').total,0);
  assert.match(app.studentLineBillingText('current','2026-09'),/9月共計：NT\$9,000/);
});

test('same group class slot bills each child to that child parent only',()=>{
  const app=runtime({
    students:[
      {id:'kid-a',name:'小安',parent:'王家長',courseType:'團班',rate:600},
      {id:'kid-b',name:'小晴',parent:'李家長',courseType:'團班',rate:750}
    ],
    lessons:[
      lesson('group-a','kid-a','2026-09-05','14:00','16:00',{title:'G1 團班'}),
      lesson('group-b','kid-b','2026-09-05','14:00','16:00',{title:'G1 團班'})
    ]
  });
  const wang=app.studentLineBillingText('kid-a','2026-09');
  const lee=app.studentLineBillingText('kid-b','2026-09');
  assert.match(wang,/^王家長您好/);assert.match(wang,/學生：小安/);assert.match(wang,/NT\$1,200/);assert.doesNotMatch(wang,/李家長|小晴|1,500/);
  assert.match(lee,/^李家長您好/);assert.match(lee,/學生：小晴/);assert.match(lee,/NT\$1,500/);assert.doesNotMatch(lee,/王家長|小安|1,200/);
});

test('mixed monthly, private and per-child group totals stay exact and collected records reduce unpaid total',()=>{
  const app=runtime({
    students:[
      {id:'care',name:'安親生',parent:'陳家長',courseType:'安親',rate:9000},
      {id:'private',name:'家教生',parent:'林家長',courseType:'1對1',rate:800},
      {id:'group',name:'團班生',parent:'黃家長',courseType:'團班',rate:600}
    ],
    lessons:[
      lesson('care-1','care','2026-09-01','13:00','18:00'),
      lesson('private-1','private','2026-09-02','16:00','17:30',{paymentStatus:'paid'}),
      lesson('group-1','group','2026-09-03','18:00','20:00')
    ],
    collectionRecords:[{id:'care-paid',month:'2026-09',branchId:'all',studentIds:['care'],status:'collected',amount:9000}]
  });
  assert.equal(app.studentTuitionRevenue('2026-09'),11400);
  assert.equal(app.studentMonthlyBillingData('care','2026-09').total,9000);
  assert.equal(app.studentMonthlyBillingData('private','2026-09').total,1200);
  assert.equal(app.studentMonthlyBillingData('group','2026-09').total,1200);
  assert.equal(app.studentUnpaidTuitionRevenue('2026-09'),1200);
});

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

test('student availability text never affects billing; only timetable start and end times do',()=>{
  const app=runtime({
    students:[{id:'s',name:'課表唯一時間來源',parent:'林家長',courseType:'1對1',rate:800,availability:'週一 09:00-21:00\n週三 00:00-23:59'}],
    lessons:[
      lesson('l1','s','2026-09-07','16:10','17:40'),
      lesson('l2','s','2026-09-09','18:25','19:10')
    ]
  });
  const bill=app.studentMonthlyBillingData('s','2026-09');
  assert.equal(bill.tutoringHours,2.25);
  assert.equal(bill.total,2.25*800);
  assert.match(app.studentLineBillingText('s','2026-09'),/計算：2\.25 小時 × NT\$800 = NT\$1,800/);
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
