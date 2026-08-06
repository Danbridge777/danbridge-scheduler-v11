/* V17.30 Searchable Student Selects
 * Adds a non-destructive search UI to every student / class selector.
 * The original <select> remains the source of truth, so existing onchange,
 * validation, save, edit and filter behavior are preserved.
 */
(function(){
  'use strict';

  const TARGET_IDS=[
    'lessonStudent',
    'filterStudent',
    'calendarStudentFilter',
    'smartStudent',
    'campStudent',
    'winterCampStudent',
    'summerRegistrationStudent'
  ];

  const states=new Map();

  function normalize(value){
    return String(value||'')
      .toLocaleLowerCase('zh-Hant')
      .normalize('NFKC')
      .replace(/\s+/g,'')
      .trim();
  }

  function optionLabel(option){
    return String(option?.textContent||option?.label||'').trim();
  }

  function searchableOptions(select){
    return Array.from(select.options||[]).filter(option=>{
      const value=String(option.value||'');
      const label=optionLabel(option);
      return value && label && !option.disabled;
    });
  }

  function closeResults(state){
    if(!state)return;
    state.results.hidden=true;
    state.results.innerHTML='';
    state.wrapper.classList.remove('is-open');
  }

  function syncInputFromSelect(state,force=false){
    if(!state||document.activeElement===state.input&&!force)return;
    const selected=state.select.options[state.select.selectedIndex];
    state.input.value=selected&&selected.value?optionLabel(selected):'';
  }

  function chooseOption(state,option){
    state.select.value=option.value;
    state.input.value=optionLabel(option);
    closeResults(state);
    state.select.dispatchEvent(new Event('change',{bubbles:true}));
    state.input.focus({preventScroll:true});
  }

  function renderResults(state){
    const query=normalize(state.input.value);
    const options=searchableOptions(state.select);
    state.results.innerHTML='';

    if(!query){
      closeResults(state);
      return;
    }

    const matches=options.filter(option=>normalize(optionLabel(option)).includes(query)).slice(0,40);
    state.results.hidden=false;
    state.wrapper.classList.add('is-open');

    if(!matches.length){
      const empty=document.createElement('div');
      empty.className='student-select-search-empty';
      empty.textContent='找不到符合的學生或班級';
      state.results.appendChild(empty);
      return;
    }

    matches.forEach(option=>{
      const button=document.createElement('button');
      button.type='button';
      button.className='student-select-search-option';
      if(option.value===state.select.value)button.classList.add('is-selected');
      button.textContent=optionLabel(option);
      button.addEventListener('pointerdown',event=>event.preventDefault());
      button.addEventListener('click',()=>chooseOption(state,option));
      state.results.appendChild(button);
    });
  }

  function enhance(select){
    if(!select||states.has(select)||select.dataset.studentSearchEnhanced==='1')return;

    const wrapper=document.createElement('div');
    wrapper.className='student-select-search';
    wrapper.dataset.forSelect=select.id||'';

    const inputWrap=document.createElement('div');
    inputWrap.className='student-select-search-input-wrap';

    const input=document.createElement('input');
    input.type='search';
    input.className='student-select-search-input';
    input.autocomplete='off';
    input.spellcheck=false;
    input.placeholder='搜尋學生姓名／班級';
    input.setAttribute('aria-label','搜尋學生姓名或班級');

    const icon=document.createElement('span');
    icon.className='student-select-search-icon';
    icon.setAttribute('aria-hidden','true');
    icon.textContent='⌕';

    const results=document.createElement('div');
    results.className='student-select-search-results';
    results.hidden=true;
    results.setAttribute('role','listbox');

    select.parentNode.insertBefore(wrapper,select);
    wrapper.appendChild(inputWrap);
    inputWrap.appendChild(icon);
    inputWrap.appendChild(input);
    wrapper.appendChild(results);
    wrapper.appendChild(select);
    select.classList.add('student-select-search-native');
    select.dataset.studentSearchEnhanced='1';

    const state={select,wrapper,input,results};
    states.set(select,state);

    input.addEventListener('input',()=>renderResults(state));
    input.addEventListener('focus',()=>{if(input.value.trim())renderResults(state)});
    input.addEventListener('keydown',event=>{
      if(event.key==='Escape'){
        closeResults(state);
        input.blur();
        return;
      }
      if(event.key==='Enter'){
        const first=results.querySelector('.student-select-search-option');
        if(first){event.preventDefault();first.click()}
      }
      if(event.key==='ArrowDown'){
        const first=results.querySelector('.student-select-search-option');
        if(first){event.preventDefault();first.focus()}
      }
    });
    results.addEventListener('keydown',event=>{
      const buttons=[...results.querySelectorAll('.student-select-search-option')];
      const index=buttons.indexOf(document.activeElement);
      if(event.key==='ArrowDown'&&index<buttons.length-1){event.preventDefault();buttons[index+1].focus()}
      if(event.key==='ArrowUp'){
        event.preventDefault();
        if(index>0)buttons[index-1].focus();else input.focus();
      }
      if(event.key==='Escape'){event.preventDefault();closeResults(state);input.focus()}
    });
    select.addEventListener('change',()=>syncInputFromSelect(state,true));

    const observer=new MutationObserver(()=>{
      syncInputFromSelect(state);
      if(document.activeElement===input&&input.value.trim())renderResults(state);
    });
    observer.observe(select,{childList:true,subtree:true,attributes:true,attributeFilter:['selected','disabled','label']});
    state.observer=observer;
    syncInputFromSelect(state,true);
  }

  function scan(){
    TARGET_IDS.forEach(id=>enhance(document.getElementById(id)));
  }

  document.addEventListener('pointerdown',event=>{
    states.forEach(state=>{
      if(!state.wrapper.contains(event.target))closeResults(state);
    });
  });

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan,{once:true});
  else scan();

  const bodyObserver=new MutationObserver(scan);
  const startObserver=()=>{if(document.body)bodyObserver.observe(document.body,{childList:true,subtree:true})};
  if(document.body)startObserver();else document.addEventListener('DOMContentLoaded',startObserver,{once:true});

  window.DanbridgeStudentSelectSearch={scan,refresh(){states.forEach(state=>syncInputFromSelect(state,true))}};
})();
