'use strict';

const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

// Execute the SAME versioned payroll functions shipped to the Owner. Only
// repository-owned source is compiled; record strings are data, never code.
const business=new vm.Script(fs.readFileSync(path.join(__dirname,'../js/modules/business/business-logic.js'),'utf8'),{filename:'business-logic.js'});
const primitives=new vm.Script(`
 function student(id){return db.students.find(x=>x.id===id)||{}}
 function teacher(id){return db.teachers.find(x=>x.id===id)||{}}
 function lessonTeacherIds(l){const ids=student(l?.studentId).courseType==='團班'&&Array.isArray(l?.teacherIds)&&l.teacherIds.length?l.teacherIds:[l?.teacherId||(Array.isArray(l?.teacherIds)?l.teacherIds[0]:'')];return [...new Set(ids.filter(Boolean))]}
 function normalizeCampCode(v){return String(v||'').trim().replace(/\\s+/g,'').toUpperCase()}
 function effectiveCampId(l){return normalizeCampCode(l?.campId)}
 function legacyCampAliases(l){return new Set([normalizeCampCode(l?.title),normalizeCampCode(student(l?.studentId).name)].filter(Boolean))}
 function sameCampIdentity(a,b){const ca=effectiveCampId(a),cb=effectiveCampId(b);if(ca&&cb)return ca===cb;if(ca&&!cb)return legacyCampAliases(b).has(ca);if(!ca&&cb)return legacyCampAliases(a).has(cb);return false}
 function sameCampSlot(a,b){return !!(effectiveCampId(a)||effectiveCampId(b))&&sameCampIdentity(a,b)&&a.date===b.date&&a.start===b.start&&a.end===b.end}
 function hours(a,b){if(!a||!b)return 0;const[ah,am]=a.split(':').map(Number),[bh,bm]=b.split(':').map(Number);return Math.max(0,(bh*60+bm-ah*60-am)/60)}
 function localDate(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
`,{filename:'payroll-primitives.js'});
const calculation=new vm.Script(`output=db.teachers.filter(t=>teacherIncludedForMonth(t,month)).map(t=>{
 const result=teacherPayrollByBillingBranch(t,month,scope),p=result.payroll;
 const payroll={authoritativeScope:scope,month,formulaVersion:p.formulaVersion,mode:p.mode,configured:p.configured};
 for(const key of ['amount','actualHours','paidHours','expectedHours','diff','baseSalary','addition','shortageDeduction','leaveDeduction','deduction','overtimeHours','shortHours','leaveHours','hourlyRate','overtimeRate','deductionRate']){
  const value=p[key];if(value!==undefined){if(value!==null&&!Number.isFinite(value))throw Error('Non-finite payroll result');payroll[key]=value}
 }
 payroll.leaveReviewReasons=p.leaveReviewReasons||[];
 // No fullPayroll, foreign lesson IDs, full-month amount, leave dates/reasons,
 // student identities or source pricing records may cross this boundary.
 const weeks=teacherWeekBreakdown(t,month).map(w=>{
  const expected=w.expected*(p.allocation?.ratio??1),actual=result.rows.filter(l=>l.date>=w.from&&l.date<=w.to).reduce((sum,l)=>sum+hours(l.start,l.end),0);
  return {from:w.from,to:w.to,expected,actual,diff:actual-expected};
 });
 return {teacherId:t.id,payroll,lessonIds:result.rows.map(r=>r.id),count:result.rows.length,weeks};
}).filter(r=>r.count||r.payroll.amount);`,{filename:'scoped-payroll-result.js'});

function calculateScopedPayroll({db,leaves,month,scope}){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!['hexi','art_museum','unassigned'].includes(scope))throw Error('Invalid payroll scope/month');
 if(!db||!['students','teachers','lessons'].every(k=>Array.isArray(db[k]))||!Array.isArray(leaves))throw Error('Verified payroll source required');
 const input=JSON.parse(JSON.stringify({db:{...db,teacherLeaveRecords:leaves},month,scope}));
 const context=vm.createContext({...input,window:{},output:null},{codeGeneration:{strings:false,wasm:false}});
 primitives.runInContext(context,{timeout:5000});business.runInContext(context,{timeout:5000});calculation.runInContext(context,{timeout:10000});
 return JSON.parse(JSON.stringify(context.output));
}
module.exports={calculateScopedPayroll};
