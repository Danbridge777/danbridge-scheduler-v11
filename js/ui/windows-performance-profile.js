/* Keep Windows interaction responsive without changing the macOS visual path. */
(function(){
  'use strict';
  const platform=[navigator.userAgentData?.platform,navigator.platform,navigator.userAgent].filter(Boolean).join(' ');
  const isWindows=/win/i.test(platform);
  document.documentElement.classList.toggle('danbridge-windows',isWindows);
  window.DanbridgePlatform={...(window.DanbridgePlatform||{}),isWindows};
})();
