import {sha256Canonical} from './cloud-immutable-migration-backup.js';
import {SCHEDULER_LESSON_FIELDS,schedulerLesson} from './production-scheduler-operation.js';

export const SCHEDULE_COMMAND_SCHEMA='danbridge-schedule-command-v1';
export const SCHEDULE_COMMAND_KINDS=Object.freeze([
 'lesson.create','lesson.delete','lesson.copy','lesson.move',
 'lesson.update.time','lesson.update.teacher','lesson.update.room',
 'lesson.update.location','lesson.update.student','lesson.update.title',
 'lesson.update.status','lesson.update.note','lesson.update.fields'
]);

const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const same=(left,right)=>sha256Canonical(left??null)===sha256Canonical(right??null);
const token=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(value)&&value!=='.'&&value!=='..';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value)}return value};
const entityHash=value=>`lesson-v1:${sha256Canonical(value??null)}`;
const MOVE_FIELDS=new Set(['date','start','end']);
const KIND_FIELDS=Object.freeze({
  'lesson.update.time':new Set(['date','start','end']),
  'lesson.update.teacher':new Set(['teacherId','teacherIds']),
  'lesson.update.room':new Set(['room']),
  'lesson.update.location':new Set(['location','branchId','deliveryMode','address','onlinePlatform','meetingUrl']),
  'lesson.update.student':new Set(['studentId']),
  'lesson.update.title':new Set(['title']),
  'lesson.update.status':new Set(['status','lessonState','isDraft']),
  'lesson.update.note':new Set(['note'])
});

function normalizedEntity(value,id,label){
 if(value===null)return null;
 const entity=schedulerLesson(value);
 if(!token(id)||entity.id!==id)throw new Error(`${label}課程 ID 不一致`);
 return entity;
}
function changedFields(before,after){
 return SCHEDULER_LESSON_FIELDS.filter(field=>!same(before?.[field],after?.[field]));
}
function compatibleHint(hint,fields,{before,after}){
 if(!hint)return false;
 if(!SCHEDULE_COMMAND_KINDS.includes(hint))throw new Error('課表操作類型不在允許清單');
 if(hint==='lesson.create')return before===null&&after!==null;
 if(hint==='lesson.copy')return before===null&&after!==null;
 if(hint==='lesson.delete')return before!==null&&after===null;
 if(hint==='lesson.move')return before!==null&&after!==null&&fields.length>0&&fields.every(field=>MOVE_FIELDS.has(field));
 const allowed=KIND_FIELDS[hint];
 return before!==null&&after!==null&&Boolean(allowed)&&fields.length>0&&fields.every(field=>allowed.has(field));
}
function inferKind(before,after,fields,hint){
 if(compatibleHint(hint,fields,{before,after}))return hint;
 if(before===null)return 'lesson.create';
 if(after===null)return 'lesson.delete';
 if(fields.length&&fields.every(field=>MOVE_FIELDS.has(field)))return 'lesson.move';
 for(const [kind,allowed] of Object.entries(KIND_FIELDS))if(fields.length&&fields.every(field=>allowed.has(field)))return kind;
 return 'lesson.update.fields';
}
function assertSequence(value){if(!Number.isSafeInteger(value)||value<1)throw new Error('課表操作序號無效');return value}

export function buildScheduleCommand({before,after,deviceId,sequence,batchId,commandId,actionHint='',createdAt=new Date().toISOString()}={}){
 if(before===null&&after===null)throw new Error('課表操作前後不可同時為空');
 const id=String(after?.id??before?.id??'');
 if(!token(deviceId)||!token(batchId)||!token(commandId)||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T/.test(createdAt)||!Number.isFinite(Date.parse(createdAt)))throw new Error('課表操作 identity 或時間無效');
 const beforeEntity=normalizedEntity(before,id,'原始'),afterEntity=normalizedEntity(after,id,'目標');
 const fields=changedFields(beforeEntity,afterEntity);
 if(!fields.length)throw new Error('課表操作沒有實際變更');
 const patches=fields.map(field=>freeze({field,before:clone(beforeEntity?.[field]),after:clone(afterEntity?.[field])}));
 return freeze({schema:SCHEDULE_COMMAND_SCHEMA,commandId,deviceId,sequence:assertSequence(sequence),batchId,lessonId:id,kind:inferKind(beforeEntity,afterEntity,fields,actionHint),createdAt,baseHash:entityHash(beforeEntity),targetHash:entityHash(afterEntity),before:clone(beforeEntity),after:clone(afterEntity),patches});
}

export function applyScheduleCommand(current,input,{seenCommandIds=new Set()}={}){
 const command=assertScheduleCommand(input);
 if(seenCommandIds.has(command.commandId)||entityHash(current)===command.targetHash)return{state:'duplicate',value:clone(current),conflicts:[]};
 const safeCurrent=current===null?null:normalizedEntity(current,command.lessonId,'目前');
 if(entityHash(safeCurrent)===command.baseHash){seenCommandIds.add(command.commandId);return{state:'applied',value:clone(command.after),conflicts:[]}}
 if(command.before===null||command.after===null)return{state:'conflict',value:clone(safeCurrent),conflicts:['record']};
 const merged=clone(safeCurrent),conflicts=[];
 for(const patch of command.patches){
  const value=merged?.[patch.field];
  if(same(value,patch.after))continue;
  if(!same(value,patch.before)){conflicts.push(patch.field);continue}
  if(patch.after===undefined)delete merged[patch.field];else merged[patch.field]=clone(patch.after);
 }
 if(conflicts.length)return{state:'conflict',value:clone(safeCurrent),conflicts};
 seenCommandIds.add(command.commandId);return{state:'merged',value:merged,conflicts:[]};
}

export function coalesceScheduleCommands(inputs){
 if(!Array.isArray(inputs))throw new Error('課表操作佇列格式無效');
 const groups=new Map(),order=[];
 for(const input of inputs){const command=assertScheduleCommand(input);if(!groups.has(command.lessonId)){groups.set(command.lessonId,[]);order.push(command.lessonId)}groups.get(command.lessonId).push(command)}
 const output=[];
 for(const lessonId of order){
  const commands=groups.get(lessonId).sort((a,b)=>a.sequence-b.sequence||a.commandId.localeCompare(b.commandId));
  const commandIds=new Set(),first=commands[0];let current=clone(first.before),last=first;
  for(const command of commands){
   if(commandIds.has(command.commandId))continue;
   const result=applyScheduleCommand(current,command,{seenCommandIds:commandIds});
   if(result.state==='conflict')throw new Error(`課程 ${lessonId} 的本機操作順序不連續，未重排或覆蓋`);
   current=result.value;last=command;
  }
  if(same(first.before,current))continue;
  output.push(buildScheduleCommand({before:first.before,after:current,deviceId:first.deviceId,sequence:first.sequence,batchId:first.batchId,commandId:first.commandId,actionHint:first.before===null?(first.kind==='lesson.copy'?'lesson.copy':'lesson.create'):current===null?'lesson.delete':last.kind,createdAt:first.createdAt}));
 }
 return freeze(output);
}

export function assertScheduleCommand(value){
 if(!value||value.schema!==SCHEDULE_COMMAND_SCHEMA||!token(value.commandId)||!token(value.deviceId)||!token(value.batchId)||!token(value.lessonId)||!SCHEDULE_COMMAND_KINDS.includes(value.kind))throw new Error('課表操作格式或類型無效');
 assertSequence(value.sequence);
 if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T/.test(value.createdAt||'')||!Number.isFinite(Date.parse(value.createdAt)))throw new Error('課表操作時間無效');
 const before=normalizedEntity(value.before,value.lessonId,'原始'),after=normalizedEntity(value.after,value.lessonId,'目標'),fields=changedFields(before,after);
 if(!fields.length||value.baseHash!==entityHash(before)||value.targetHash!==entityHash(after)||!Array.isArray(value.patches)||value.patches.length!==fields.length)throw new Error('課表操作 hash 或差異無效');
 for(let index=0;index<fields.length;index++){const patch=value.patches[index];if(!patch||patch.field!==fields[index]||!same(patch.before,before?.[patch.field])||!same(patch.after,after?.[patch.field]))throw new Error('課表操作欄位差異無效')}
 if(!compatibleHint(value.kind,fields,{before,after})&&value.kind!=='lesson.update.fields')throw new Error('課表操作類型與欄位不一致');
 return value;
}

export function scheduleCommandHash(value){return entityHash(value)}
