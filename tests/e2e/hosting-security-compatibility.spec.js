const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
for(const configFile of ['firebase.json','firebase.production.json'])test(configFile+' permits App Check and shared leave script without allowing arbitrary script hosts',async({page})=>{
 const config=JSON.parse(fs.readFileSync(configFile,'utf8'));
 const headers=Object.fromEntries(config.hosting.headers[0].headers.map(r=>[r.key,r.value]));
 const cjsHeaders=Object.fromEntries(config.hosting.headers.find(r=>r.source==='/js/core/teacher-leave-entitlement.cjs').headers.map(r=>[r.key,r.value]));
 await page.route('**/csp-fixture-366',route=>route.fulfill({headers:{...headers,'Content-Type':'text/html'},body:'<!doctype html><html><body><script>window.violations=[];document.addEventListener("securitypolicyviolation",e=>violations.push(e.blockedURI))</script></body></html>'}));
 await page.route('https://www.google.com/recaptcha/enterprise.js*',route=>route.fulfill({contentType:'application/javascript',body:'window.recaptchaCspLoaded=true'}));
 await page.route('https://untrusted.invalid/**',route=>route.fulfill({contentType:'application/javascript',body:'window.untrustedLoaded=true'}));
 await page.route('**/js/core/teacher-leave-entitlement.cjs',route=>route.fulfill({headers:{...headers,...cjsHeaders},body:fs.readFileSync('js/core/teacher-leave-entitlement.cjs','utf8')}));
 await page.goto('/csp-fixture-366');
 await page.evaluate(()=>{for(const src of ['https://www.google.com/recaptcha/enterprise.js?render=explicit','/js/core/teacher-leave-entitlement.cjs','https://untrusted.invalid/script.js']){const s=document.createElement('script');s.src=src;document.head.append(s)}});
 await page.waitForFunction(()=>window.recaptchaCspLoaded&&window.DanbridgeTeacherLeaveEntitlement&&window.violations.length);
 expect(await page.evaluate(()=>({loaded:window.recaptchaCspLoaded,leave:typeof window.DanbridgeTeacherLeaveEntitlement.leaveBalance,untrusted:!!window.untrustedLoaded,violations:window.violations}))).toEqual({loaded:true,leave:'function',untrusted:false,violations:['https://untrusted.invalid/script.js']});
});
