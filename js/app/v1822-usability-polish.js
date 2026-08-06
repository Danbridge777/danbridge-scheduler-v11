/* Danbridge Scheduler V18.22 — non-data usability polish. */
(function(){
  'use strict';
  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
  const scrollKey='danbridge_section_scroll_v1822';
  const searchBySection={dashboard:'globalSearch',students:'crmSearch',calendar:'calendarSearch'};

  function typingTarget(element){
    const tag=(element?.tagName||'').toLowerCase();
    return ['input','textarea','select'].includes(tag)||element?.isContentEditable;
  }
  function visible(element){return !!element&&element.getClientRects().length>0&&!element.disabled}
  function readScroll(){try{return JSON.parse(sessionStorage.getItem(scrollKey)||'{}')}catch{return{}}}
  function writeScroll(values){try{sessionStorage.setItem(scrollKey,JSON.stringify(values))}catch{}}

  function focusCurrentSearch(){
    const section=document.body.dataset.activeSection||$('.active[id]')?.id||'dashboard';
    const target=document.getElementById(searchBySection[section]||'');
    if(!visible(target)){window.toast?.('目前頁面沒有搜尋欄位');return}
    target.focus({preventScroll:true});
    target.select?.();
    target.scrollIntoView({behavior:'smooth',block:'center'});
  }

  function closeTopModal(){
    const open=$$('.modal-backdrop.show').filter(visible);
    const modal=open[open.length-1];
    if(!modal)return false;
    const button=$('.modal-head button, [data-close], #cancelTeacherReportBtn, button[onclick^="close"]',modal);
    if(!visible(button))return false;
    button.click();
    return true;
  }

  function focusOpenedModal(modal){
    if(!modal?.classList.contains('show')||modal.contains(document.activeElement))return;
    const target=$('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])',modal);
    if(visible(target))setTimeout(()=>{if(modal.classList.contains('show')&&!modal.contains(document.activeElement))target.focus({preventScroll:true})},40);
  }

  function installKeyboardConvenience(){
    document.addEventListener('keydown',event=>{
      const mod=event.ctrlKey||event.metaKey;
      if(mod&&event.key.toLowerCase()==='k'){
        event.preventDefault();
        focusCurrentSearch();
        return;
      }
      if(event.key==='Escape'&&!event.defaultPrevented&&!typingTarget(event.target)&&closeTopModal())event.preventDefault();
    },true);
    Object.values(searchBySection).forEach(id=>{const input=document.getElementById(id);if(input)input.title='快捷鍵：⌘/Ctrl + K'});
  }

  function installSectionMemory(){
    const original=window.switchTab;
    if(typeof original!=='function'||original.__v1822)return;
    function wrapped(tab){
      const current=document.body.dataset.activeSection||$('.active[id]')?.id;
      const positions=readScroll();
      if(current)positions[current]=window.scrollY;
      writeScroll(positions);
      original(tab);
      requestAnimationFrame(()=>window.scrollTo({top:+readScroll()[tab]||0,behavior:'auto'}));
    }
    wrapped.__v1822=true;
    window.switchTab=wrapped;
  }

  function installNavigationVisibility(){
    $('nav')?.addEventListener('click',event=>{
      const button=event.target.closest('button[data-tab]');
      if(button)setTimeout(()=>button.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'}),0);
    });
  }

  function observeModals(){
    new MutationObserver(records=>records.forEach(record=>{
      if(record.type==='attributes'&&record.attributeName==='class'&&record.target.classList?.contains('modal-backdrop'))focusOpenedModal(record.target);
    })).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});
  }

  function init(){installKeyboardConvenience();installSectionMemory();installNavigationVisibility();observeModals()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,160),{once:true});else setTimeout(init,160);
})();
