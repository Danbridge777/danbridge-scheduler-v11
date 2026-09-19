import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

class FakeSelect{
 constructor(){this.options=[];this._value='';this.disabled=false}
 set innerHTML(value){this.options=[...String(value).matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)].map(match=>({value:match[1],text:match[2]}));this._value=this.options[0]?.value||''}
 get innerHTML(){return this.options.map(option=>`<option value="${option.value}">${option.text}</option>`).join('')}
 set value(value){this._value=this.options.some(option=>option.value===value)?value:''}
 get value(){return this._value}
}

function runtime(){
 const source=fs.readFileSync(new URL('../js/core/branch-business-scope.js',import.meta.url),'utf8');
 const cut=source.indexOf('  function branchBreakdown('),prefix=source.slice(0,cut),elements={dashboardBranchScope:new FakeSelect(),settlementBranchScope:new FakeSelect(),financeBranchScope:new FakeSelect()};
 let context={role:'branch_manager',email:'temporary@example.test',branchIds:['unassigned']};
 const window={DanbridgeAccess:{DEFAULT_BRANCHES:[{id:'art_museum',name:'美術東四路'},{id:'hexi',name:'河西一路'}],getContext:()=>structuredClone(context),branchIdFromLocation:()=> 'unassigned'}};
 vm.runInNewContext(prefix+'  window.DanbridgeBranchBusiness={scopes,syncSelectors};\n})();',{window,db:{branches:window.DanbridgeAccess.DEFAULT_BRANCHES},$:id=>elements[id]||null,esc:String});
 return{window,elements,setContext:value=>{context=structuredClone(value)}};
}

test('role changes reset visible business scope without leaking the previous account selection',()=>{
 const r=runtime();
 r.window.DanbridgeBranchBusiness.syncSelectors();
 assert.equal(r.elements.dashboardBranchScope.value,'unassigned');assert.equal(r.elements.dashboardBranchScope.disabled,true);
 r.setContext({role:'owner',email:'owner@example.test',branchIds:[]});r.window.DanbridgeBranchBusiness.syncSelectors();
 assert.equal(r.elements.dashboardBranchScope.value,'all');assert.equal(r.elements.dashboardBranchScope.disabled,false);
 assert.equal(r.window.DanbridgeBranchBusiness.scopes.dashboard,'all');
 r.window.DanbridgeBranchBusiness.scopes.dashboard='art_museum';r.window.DanbridgeBranchBusiness.syncSelectors();
 assert.equal(r.elements.dashboardBranchScope.value,'art_museum','same Owner keeps an intentional manual branch selection');
 r.setContext({role:'branch_manager',email:'aa@example.test',branchIds:['art_museum']});r.window.DanbridgeBranchBusiness.syncSelectors();
 assert.equal(r.elements.dashboardBranchScope.value,'art_museum');assert.equal(r.elements.dashboardBranchScope.disabled,true);
 r.setContext({role:'teacher',email:'teacher@example.test',teacherId:'t1',branchIds:[]});r.window.DanbridgeBranchBusiness.syncSelectors();
 assert.equal(r.elements.dashboardBranchScope.value,'all');assert.equal(r.elements.dashboardBranchScope.disabled,true);
});
