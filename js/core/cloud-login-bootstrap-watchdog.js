(function(){
 'use strict';
 // Independent of Firebase imports: explain a stalled secure initialization
 // without signing in, clearing storage or unlocking private data.
 setTimeout(function(){
  const screen=document.getElementById('authScreen');
  if(!screen||!document.body.classList.contains('auth-locked')||document.getElementById('googleCloudLogin'))return;
  const button=screen.querySelector('.auth-google-btn[disabled]'),card=screen.querySelector('.auth-card');
  if(!button||!card||document.getElementById('authConnectionRecovery'))return;
  const panel=document.createElement('div');panel.id='authConnectionRecovery';
  const message=document.createElement('p');message.className='auth-error show';message.setAttribute('role','alert');
  message.textContent='登入服務連線逾時，尚未完成身分驗證。請確認網路後重新載入；本機課表與待同步資料不會被清除。';
  const retry=document.createElement('button');retry.type='button';retry.className='auth-google-btn';retry.textContent='重新載入登入頁';
  retry.onclick=function(){
   if(!document.body.classList.contains('auth-locked')||document.getElementById('googleCloudLogin')){panel.remove();return}
   window.location.reload();
  };
  panel.append(message,retry);card.append(panel);
 },15000);
})();
