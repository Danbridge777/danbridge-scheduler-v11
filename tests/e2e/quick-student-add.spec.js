const {test,expect}=require('@playwright/test');
const {isolateApplicationAuth}=require('./helpers/isolate-application-auth');

test.beforeEach(async({page})=>isolateApplicationAuth(page));

test('排課連續快速新增學生立即出現在選單，持久化留在下一幀背景執行',async({page})=>{
  await page.goto('/index.html',{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(()=>{
    window.currentCloudRole=()=> 'owner';
    window.DanbridgeAccess.setContext({role:'owner',canManageSchedule:true,readOnly:false});
    const teachers=[{id:'teacher-1',name:'測試老師',status:'active',workDays:[1,2,3,4,5]}];
    const students=Array.from({length:500},(_,index)=>({id:`existing-${index}`,name:`既有學生 ${index}`,status:'active',courseType:'1對1',billing:'hour',rate:0,branchIds:['art_museum'],attendanceBranchId:'art_museum',billingBranchId:'art_museum'}));
    window.__danbridgeSetDB({students,teachers,lessons:[],makeups:[],changes:[],teacherGroups:[],winterTeacherGroups:[],summerCampClasses:[],summerCampRegistrations:[],winterCampClasses:[],winterCampRegistrations:[],settlementRecords:[],fixedExpenses:[],oneTimeExpenses:[],collectionRecords:[],branches:window.DanbridgeAccess.DEFAULT_BRANCHES});
    renderSelects();
    const elapsed=[];
    for(let index=0;index<10;index++){
      $('quickStudentName').value=`立即學生 ${index}`;
      $('quickParentName').value=`家長 ${index}`;
      $('quickCourseType').value='1對1';
      $('quickRate').value='800';
      const started=performance.now();
      window.saveQuickStudent();
      elapsed.push(performance.now()-started);
      if($('lessonStudent').selectedOptions[0]?.textContent!==`立即學生 ${index}`)throw new Error('新增學生沒有立即選取');
    }
    return{elapsed,studentCount:window.__danbridgeGetDB().students.length,selected:$('lessonStudent').selectedOptions[0]?.textContent||''};
  });
  expect(result.studentCount).toBe(510);
  expect(result.selected).toBe('立即學生 9');
  expect(Math.max(...result.elapsed)).toBeLessThan(150);
});
