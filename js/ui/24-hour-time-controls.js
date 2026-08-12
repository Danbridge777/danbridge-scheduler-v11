/* Force every editable time field to use the same locale-independent HH:mm display. */
(function(){
  'use strict';
  const options=Array.from({length:24*12},(_,index)=>{
    const minutes=index*5;
    return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
  });
  function replace(input){
    const select=document.createElement('select');
    for(const attribute of input.attributes){
      if(!['type','step','value'].includes(attribute.name))select.setAttribute(attribute.name,attribute.value);
    }
    select.classList.add('danbridge-24-hour-time');
    select.setAttribute('data-time-format','24-hour');
    select.setAttribute('aria-label',input.getAttribute('aria-label')||input.previousElementSibling?.textContent?.trim()||'時間（24 小時制）');
    select.innerHTML=options.map(value=>`<option value="${value}">${value}</option>`).join('');
    select.value=input.value&&options.includes(input.value)?input.value:(input.getAttribute('value')||options[0]);
    input.replaceWith(select);
  }
  document.querySelectorAll('input[type="time"]').forEach(replace);
  window.Danbridge24HourTime={values:options.slice(),upgrade(root=document){root.querySelectorAll?.('input[type="time"]').forEach(replace)}};
})();
