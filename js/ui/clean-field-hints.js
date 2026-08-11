/* Keep form fields visually clean while preserving an accessible name. */
(()=>{
  'use strict';
  function clean(root=document){
    const fields=[];
    if(root?.matches?.('[placeholder]'))fields.push(root);
    root?.querySelectorAll?.('[placeholder]').forEach(field=>fields.push(field));
    fields.forEach(field=>{
      const hint=field.getAttribute('placeholder')||'';
      if(!field.getAttribute('aria-label')){
        const label=field.closest('label')?.textContent||field.previousElementSibling?.matches?.('label')&&field.previousElementSibling.textContent||hint;
        if(String(label||'').trim())field.setAttribute('aria-label',String(label).trim());
      }
      field.removeAttribute('placeholder');
    });
  }
  clean();
  new MutationObserver(records=>records.forEach(record=>clean(record.target))).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['placeholder']});
})();
