import {test,before,after} from 'node:test';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,deleteDoc} from 'firebase/firestore';
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-stillunemployed',firestore:{host:'127.0.0.1',port:8086,rules:await readFile(new URL('../../firestore.rules',import.meta.url),'utf8')}});});
after(async()=>{if(env)await env.cleanup();});
const payload={saved:{},savedJobs:{},tracker:[],syncVersion:2,records:{saved:{},tracker:{},discovery:{}}};
test('guest and cross-UID reads/writes fail; both Google and Apple own UID can sync',async()=>{
  for(const provider of ['google.com','apple.com']){
    const uid=provider.replace('.','-'),db=env.authenticatedContext(uid,{firebase:{sign_in_provider:provider}}).firestore();
    await assertSucceeds(setDoc(doc(db,'users',uid),payload));await assertSucceeds(getDoc(doc(db,'users',uid)));
    await assertFails(setDoc(doc(db,'users','other'),payload));await assertFails(getDoc(doc(db,'users','other')));await assertFails(deleteDoc(doc(db,'users',uid)));
  }
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'users','google-com')));
});
test('server deletion marker blocks sync and cannot be read or altered by clients',async()=>{
  const uid='deleting',db=env.authenticatedContext(uid).firestore();await assertSucceeds(setDoc(doc(db,'users',uid),payload));
  await env.withSecurityRulesDisabled(async context=>setDoc(doc(context.firestore(),'suAccountDeletion',uid),{state:'deleting'}));
  await assertFails(setDoc(doc(db,'users',uid),payload));await assertFails(getDoc(doc(db,'users',uid)));await assertFails(getDoc(doc(db,'suAccountDeletion',uid)));await assertFails(deleteDoc(doc(db,'suAccountDeletion',uid)));await assertFails(setDoc(doc(db,'suAnalyticsEvents','fake'),{}));
});
test('existing legacy account data can migrate without erasing unrelated historical fields',async()=>{
  const uid='legacy',db=env.authenticatedContext(uid).firestore();await env.withSecurityRulesDisabled(async context=>setDoc(doc(context.firestore(),'users',uid),{saved:{old:true},tracker:[],legacyUpdatedAt:1}));
  await assertSucceeds(setDoc(doc(db,'users',uid),payload,{merge:true}));await assertSucceeds(getDoc(doc(db,'users',uid)));
});
