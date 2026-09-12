'use strict';

const PROJECT='danbridge-d8877-staging';
const APP_NAME='danbridge-published-workspace-grpc';

// Only the isolated acceptance endpoint opts into this gRPC comparison. Never reconfigure the
// default Admin app: other functions and production retain their own clients.
function createStagingWorkspaceFirestore({getApps,initializeApp,initializeFirestore,applicationDefault}){
 let client=null;
 return project=>{
  if(project!==PROJECT)throw Error('Exact staging project required');
  if(client)return client;
  let app=getApps().find(row=>row.name===APP_NAME);
  if(app&&app.options?.projectId!==PROJECT)throw Error('Workspace Admin app project mismatch');
  app??=initializeApp({projectId:PROJECT,credential:applicationDefault()},APP_NAME);
  client=initializeFirestore(app,{preferRest:false});
  return client;
 };
}
module.exports={createStagingWorkspaceFirestore};
