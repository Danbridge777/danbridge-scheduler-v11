/** Danbridge accessibility baseline: names existing controls without changing behavior. */
(function(){
 const controlSelector='input:not([type="hidden"]),select,textarea';
 const explicitNames={
  dashboardBranchScope:'查看校區',globalSearch:'搜尋學生、老師、課程或日期',
  calendarSearch:'搜尋學生、老師、課名或教室',importFile:'匯入備份檔案'
 };
 let generatedId=0;
 const elements=(root,selector)=>[...(root.matches?.(selector)?[root]:[]),...(root.querySelectorAll?.(selector)||[])];
 function ensureId(control){if(!control.id)control.id=`danbridgeAccessibleControl${++generatedId}`;return control.id}
 function associateLabels(root=document){
  elements(root,'label:not([for])').forEach(label=>{
   const wrapped=label.querySelector(controlSelector);
   const sibling=label.nextElementSibling?.matches?.(controlSelector)?label.nextElementSibling:null;
   const control=wrapped||sibling;if(control)label.htmlFor=ensureId(control);
  });
 }
 function nameControls(root=document){
  elements(root,controlSelector).forEach(control=>{
   if(control.getAttribute('aria-label')||control.getAttribute('aria-labelledby')||document.querySelector(`label[for="${CSS.escape(ensureId(control))}"]`))return;
   const name=explicitNames[control.id]||control.placeholder||control.title;
   if(name)control.setAttribute('aria-label',String(name).trim());
  });
 }
 function enhanceLiveRegions(){
  const toast=document.getElementById('toast');if(toast){toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');toast.setAttribute('aria-atomic','true')}
  const search=document.getElementById('globalSearchResults');if(search){search.setAttribute('role','status');search.setAttribute('aria-live','polite')}
  const cloud=document.getElementById('firebaseCloudStatus');if(cloud){cloud.setAttribute('role','status');cloud.setAttribute('aria-live','polite');cloud.setAttribute('aria-atomic','true')}
 }
 function apply(root=document){associateLabels(root);nameControls(root);enhanceLiveRegions()}
 apply();
 new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===1)apply(node)}))).observe(document.body,{childList:true,subtree:true});
 window.DanbridgeAccessibility={apply};
})();
