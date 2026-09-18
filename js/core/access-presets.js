/**
 * Explicit, immutable permission packages.
 *
 * Account identity (email / teacherId) and managed campuses are always chosen
 * separately.  Applying a package therefore changes capabilities without ever
 * guessing who the account belongs to or widening its financial campus scope.
 */
export const ACCESS_PRESETS=Object.freeze({
 owner:Object.freeze({label:'備援 Owner／完整管理',role:'owner',readOnly:false,canSubmitOwnReports:true,canManageSchedule:false,canMoveSchedule:false,hideFinancials:false,canViewBranchFinance:true,scheduleScope:'all'}),
 teacher:Object.freeze({label:'老師／本人課表與回報',role:'teacher',readOnly:false,canSubmitOwnReports:true,canManageSchedule:false,canMoveSchedule:false,hideFinancials:true,canViewBranchFinance:false,scheduleScope:'own'}),
 scheduler:Object.freeze({label:'排課專員／全校排課、隱藏財務',role:'teacher',readOnly:false,canSubmitOwnReports:true,canManageSchedule:true,canMoveSchedule:false,hideFinancials:true,canViewBranchFinance:false,scheduleScope:'all'}),
 branch_schedule:Object.freeze({label:'校區管理者／兩校區課表、本校財務唯讀',role:'branch_manager',readOnly:true,canSubmitOwnReports:false,canManageSchedule:false,canMoveSchedule:false,hideFinancials:true,canViewBranchFinance:true,scheduleScope:'all'}),
 branch_local_schedule:Object.freeze({label:'校區管理者／本校課表與財務唯讀',role:'branch_manager',readOnly:true,canSubmitOwnReports:false,canManageSchedule:false,canMoveSchedule:false,hideFinancials:true,canViewBranchFinance:true,scheduleScope:'managed'})
});

export const ACCESS_PRESET_GROUPS=Object.freeze({
 teacher:Object.freeze(['teacher','scheduler']),
 branch_manager:Object.freeze(['branch_schedule','branch_local_schedule']),
 owner:Object.freeze(['owner'])
});

export function listAccessPresets(group){
 const ids=ACCESS_PRESET_GROUPS[group]||[];
 return ids.map(id=>Object.freeze({id,label:ACCESS_PRESETS[id].label,role:ACCESS_PRESETS[id].role}));
}

export function isSchedulerAccess(value={}){
 return value?.active!==false&&value?.role==='teacher'&&value?.canManageSchedule===true&&typeof value?.teacherId==='string'&&value.teacherId.trim()!=='';
}

export function buildAccessPreset(id,{teacherId='',branchIds=[]}={}){
 const preset=ACCESS_PRESETS[id];
 if(!preset)throw Error('未知權限套裝');
 if(id!=='owner'&&(!String(teacherId).trim()))throw Error('請先綁定本人老師');
 const branches=[...new Set(branchIds)];
 if(branches.some(id=>!['art_museum','hexi'].includes(id)))throw Error('管理校區無效');
 if(preset.role==='branch_manager'&&!branches.length)throw Error('請先選擇管理校區');
 const {label,scheduleScope,...capabilities}=preset;
 const scheduleBranchIds=scheduleScope==='all'?['art_museum','hexi']:scheduleScope==='managed'?[...branches]:[];
 return {...capabilities,teacherId:id==='owner'?'':String(teacherId),branchIds:preset.role==='branch_manager'?branches:[],scheduleBranchIds};
}
