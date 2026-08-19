const HOST_ENVIRONMENTS=Object.freeze({
 'danbridge-d8877-staging.web.app':'staging',
 'danbridge-d8877-staging.firebaseapp.com':'staging',
 'danbridge-d8877.web.app':'production',
 'danbridge-d8877.firebaseapp.com':'production'
});

const ENVIRONMENT_PROJECT_IDS=Object.freeze({
 staging:'danbridge-d8877-staging',
 production:'danbridge-d8877'
});

export function resolveDanbridgeFirebaseEnvironment(hostname){
 if(typeof hostname!=='string'||!Object.prototype.hasOwnProperty.call(HOST_ENVIRONMENTS,hostname))throw new Error('Blocked Firebase hostname');
 return HOST_ENVIRONMENTS[hostname];
}

export function bootstrapDanbridgeFirebase({hostname,configs,initializeApp,getAuth,initializeFirestore,firestoreOptions}){
 const environment=resolveDanbridgeFirebaseEnvironment(hostname);
 const firebaseConfig=configs?.[environment];
 if(!firebaseConfig||firebaseConfig.projectId!==ENVIRONMENT_PROJECT_IDS[environment])throw new Error('Firebase environment/project mismatch');
 const app=initializeApp(firebaseConfig);
 const auth=getAuth(app);
 const cloud=initializeFirestore(app,firestoreOptions);
 return Object.freeze({environment,firebaseConfig,app,auth,cloud});
}
