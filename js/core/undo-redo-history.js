(function(){
  function isTypingTarget(el){
    if(!el)return false;
    const tag=(el.tagName||'').toLowerCase();
    return tag==='input'||tag==='textarea'||tag==='select'||el.isContentEditable;
  }
  window.addEventListener('keydown',function(e){
    if(isTypingTarget(e.target))return;
    const mod=e.ctrlKey||e.metaKey;
    if(!mod)return;
    const key=(e.key||'').toLowerCase();
    if(key==='z'){
      e.preventDefault();
      if(e.shiftKey) window.redoLast&&window.redoLast();
      else window.undoLast&&window.undoLast();
    }else if(key==='y'){
      e.preventDefault();
      window.redoLast&&window.redoLast();
    }
  });
  window.addEventListener('DOMContentLoaded',function(){
    window.updateUndoRedoButtons&&window.updateUndoRedoButtons();
  });
})();
