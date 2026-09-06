async function isolateApplicationAuth(page){
  await page.route('**/js/core/firebase-auth-and-cloud-sync.module.js*',route=>route.fulfill({
    contentType:'text/javascript; charset=utf-8',
    body:'/* Browser acceptance uses an isolated identity and never contacts Firebase Auth. */'
  }));
}

module.exports={isolateApplicationAuth};
