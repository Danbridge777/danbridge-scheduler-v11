import {createProductionSchedulerQueue,acquireProductionSchedulerLease} from './production-scheduler-queue.js';
import {projectProductionSchedulerDb,projectProductionBranchDb} from './production-role-view-projection.js';
import {assertBranchScheduleMove,schedulerLesson} from './production-scheduler-operation.js';

// Keep the manager's financial/report view intact while the durable timetable
// queue overlays only pending scheduling fields. Never overlay another campus.
export function mergeBranchMoveView(raw,timetable,branchIds){
 const scoped=projectProductionBranchDb(raw,branchIds),byId=new Map(timetable.lessons.map(row=>[row.id,row]));
 return{...scoped,lessons:scoped.lessons.filter(row=>byId.has(row.id)).map(row=>({...row,...byId.get(row.id)}))};
}

export async function createBranchScheduleMoveController({storage,locks,key,branchIds,release,send,onApply,onState,createRequestId,initialDb,revision}){
 let raw=projectProductionBranchDb(initialDb,branchIds),rawRevision=revision,receiptRaw=null,latest=projectProductionSchedulerDb(raw),stopped=false;
 const releaseLease=await acquireProductionSchedulerLease(locks,key);
 const queue=createProductionSchedulerQueue({storage,release,send:async request=>{const response=await send(request);receiptRaw=response?.branchDb?{db:response.branchDb,revision:response.sourceRecordRevision}:null;return response},createRequestId,maxChangesPerRequest:30,includeStudent:false,
  onApply:value=>{if(receiptRaw&&receiptRaw.revision===queue.diagnostics().sourceRecordRevision&&receiptRaw.revision>=rawRevision){raw=projectProductionBranchDb(receiptRaw.db,branchIds);rawRevision=receiptRaw.revision;receiptRaw=null}latest=value;if(!stopped)onApply(mergeBranchMoveView(raw,value,branchIds))},onState});
 try{await queue.start({baselineDb:latest,sourceRecordRevision:revision})}catch(error){await queue.stop();await releaseLease();throw error}
 return Object.freeze({
  diagnostics:()=>queue.diagnostics(),
  async acceptSnapshot(db,nextRevision){if(stopped||nextRevision<rawRevision||nextRevision<queue.diagnostics().sourceRecordRevision)return;raw=projectProductionBranchDb(db,branchIds);rawRevision=nextRevision;await queue.acceptSnapshot(projectProductionSchedulerDb(raw),nextRevision);if(!stopped)onApply(mergeBranchMoveView(raw,latest,branchIds))},
  async move(db){
   if(stopped)throw Error('校區登入已變更');
   const before=new Map(latest.lessons.map(row=>[row.id,row])),after=projectProductionSchedulerDb(db);
   if(after.lessons.length!==before.size||after.lessons.some(row=>!before.has(row.id)))throw Error('校區管理者僅能移動既有課程');
   for(const row of after.lessons){const prior=before.get(row.id);if(JSON.stringify(prior)!==JSON.stringify(row))assertBranchScheduleMove(prior,{before:schedulerLesson(prior),after:schedulerLesson(row)},branchIds)}
   const persisted=queue.queue(after,{scheduleAction:'lesson.move'});latest=after;onApply(mergeBranchMoveView(raw,latest,branchIds));
   await persisted;return queue.flush();
  },
  flush:()=>queue.flush(),
  async stop(){stopped=true;await queue.stop();await releaseLease()}
 });
}
