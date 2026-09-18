/** Explicit role presets. Identity and branch assignment are never inferred. */
export const ACCESS_PRESETS=Object.freeze({
 owner:Object.freeze({label:'完整管理',role:'owner',readOnly:false,canManageSchedule:false,canMoveSchedule:false,hideFinancials:false,scheduleBranchIds:[]}),
 teacher:Object.freeze({label:'老師本人',role:'teacher',readOnly:false,canSubmitOwnReports:true,canManageSchedule:false,canMoveSchedule:false,hideFinancials:true,scheduleBranchIds:[]}),
 scheduler:Object.freeze({label:'排課專員',role:'teacher',readOnly:false,canSubmitOwnReports:true,canManageSchedule:true,canMoveSchedule:false,hideFinancials:true,scheduleBranchIds:[]}),
 branch_schedule:Object.freeze({label:'跨校區課表唯讀／無財務',role:'branch_manager',readOnly:true,canSubmitOwnReports:false,canManageSchedule:false,canMoveSchedule:false,hideFinancials:true,scheduleBranchIds:Object.freeze(['art_museum','hexi'])})
});

export function buildAccessPreset(id,{teacherId='',branchIds=[]}={}){
 if(id==='branch_local_schedule'){
  const preset=buildAccessPreset('branch_schedule',{teacherId,branchIds});
  return {...preset,scheduleBranchIds:[...preset.branchIds]};
 }
 const preset=ACCESS_PRESETS[id];
 if(!preset)throw Error('未知權限套裝');
 if(id!=='owner'&&(!String(teacherId).trim()))throw Error('請先綁定本人老師');
 const branches=[...new Set(branchIds)];
 if(branches.some(id=>!['art_museum','hexi'].includes(id)))throw Error('管理校區無效');
 if(id==='branch_schedule'&&!branches.length)throw Error('請先選擇管理校區');
 const {label,...capabilities}=preset;
 return {...capabilities,teacherId:id==='owner'?'':teacherId,branchIds:id==='branch_schedule'?branches:[],scheduleBranchIds:[...preset.scheduleBranchIds]};
}
