/** Danbridge Scheduler V15.20 — role permissions and branch data scope. */
(function(){
  const DEFAULT_BRANCHES=[
    {id:'art_museum',name:'美術東四路',locations:['美術東四路'],rooms:['教室 1','教室 2','教室 3']},
    {id:'hexi',name:'河西一路',locations:['河西一路'],rooms:['教室 1','教室 2']}
  ];
  const ROLE_LABELS={owner:'老闆',branch_manager:'校區管理者',teacher:'老師'};
  const ROLE_PERMISSIONS={
    owner:['*'],
    branch_manager:['VIEW_BRANCH_DASHBOARD','VIEW_BRANCH_STUDENTS','VIEW_BRANCH_TEACHERS','VIEW_BRANCH_LESSONS','VIEW_BRANCH_REVENUE','VIEW_BRANCH_PAYROLL','VIEW_BRANCH_EXPENSES','VIEW_BRANCH_REPORTS','SUBMIT_OWN_CLASS_REPORT','VIEW_OWN_HOURS'],
    teacher:['VIEW_OWN_DASHBOARD','VIEW_OWN_LESSONS','SUBMIT_CLASS_REPORT','VIEW_OWN_HOURS']
  };
  let context={role:'owner',branchIds:[],teacherId:'',email:'',readOnly:false,canSubmitOwnReports:true};
  function branchIdFromLocation(location=''){const hit=DEFAULT_BRANCHES.find(b=>b.locations.includes(location));return hit?.id||(location==='到府'||location==='線上課'?'unassigned':'art_museum')}
  function branchName(branchId=''){return DEFAULT_BRANCHES.find(b=>b.id===branchId)?.name||'未歸屬校區'}
  function deliveryModeFromLesson(l={}){return l.deliveryMode||(l.location==='到府'?'home':l.location==='線上課'?'online':'onsite')}
  function deliveryModeLabel(mode='onsite'){return mode==='home'?'到府':mode==='online'?'線上':'校區實體'}
  function normalizeBranchIds(ids){return [...new Set((Array.isArray(ids)?ids:[]).filter(Boolean))]}
  function setContext(next={}){context={...context,...next,branchIds:normalizeBranchIds(next.branchIds??context.branchIds),canSubmitOwnReports:next.canSubmitOwnReports??context.canSubmitOwnReports};document.body.dataset.cloudRole=context.role||'';document.body.dataset.branchIds=context.branchIds.join(',');document.body.classList.toggle('branch-manager-cloud-role',context.role==='branch_manager')}
  function getContext(){return {...context,branchIds:[...context.branchIds]}}
  function can(permission){const list=ROLE_PERMISSIONS[context.role]||[];return list.includes('*')||list.includes(permission)}
  function canAccessBranch(branchId){return context.role==='owner'||context.branchIds.includes(branchId)}
  function recordBranchId(record){return record?.branchId||branchIdFromLocation(record?.location||'')}
  function filterRecords(records){if(context.role==='owner')return records||[];return (records||[]).filter(r=>canAccessBranch(recordBranchId(r)))}
  window.DanbridgeAccess={DEFAULT_BRANCHES,ROLE_LABELS,ROLE_PERMISSIONS,branchIdFromLocation,branchName,deliveryModeFromLesson,deliveryModeLabel,normalizeBranchIds,setContext,getContext,can,canAccessBranch,recordBranchId,filterRecords};
})();
