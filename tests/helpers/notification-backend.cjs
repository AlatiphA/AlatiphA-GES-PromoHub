'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){
 const data=new Map(),authUsers=new Map(),reads=new Map();let auditId=0;
 const ref=path=>({path,id:path.split('/').at(-1),async get(){reads.set(path,(reads.get(path)||0)+1);return snap(this);},async set(v,opts){data.set(path,opts?.merge?{...data.get(path),...v}:v);},async delete(){data.delete(path);}});
 const snap=r=>({exists:data.has(r.path),data:()=>data.get(r.path),ref:r});
 const db={doc:ref,collection:path=>{const q={doc:()=>ref(path+'/'+ ++auditId),where(){return q;},orderBy(){return q;},limit(){return q;},async get(){return {docs:[...data.keys()].filter(k=>k.startsWith(path+'/') && k.split('/').length===2).map(k=>({id:k.split('/').at(-1),data:()=>data.get(k)}))};}};return q;},async runTransaction(work){const writes=[];await work({get:r=>Promise.resolve(snap(r)),set:(r,v,o)=>writes.push(()=>data.set(r.path,o?.merge?{...data.get(r.path),...v}:v)),update:(r,v)=>writes.push(()=>data.set(r.path,{...data.get(r.path),...v}))});writes.forEach(w=>w());},async recursiveDelete(r){for(const key of data.keys())if(key===r.path||key.startsWith(r.path+'/'))data.delete(key);}};
 const auth={listUsers:async()=>({users:[...authUsers].map(([uid,p])=>({uid,...p}))}),getUser:async uid=>{if(!authUsers.has(uid))throw new Error('No Auth user');return authUsers.get(uid);},revokeRefreshTokens:async()=>{},deleteUser:async uid=>authUsers.delete(uid)};
 const firestore=()=>db;firestore.FieldValue={serverTimestamp:()=>123};
 class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
 const output={};vm.runInNewContext(fs.readFileSync(require.resolve('../../functions/index'),'utf8'),{exports:output,require:name=>name==='firebase-admin'?{initializeApp(){},firestore,auth:()=>auth}:name==='firebase-functions/v2/firestore'?{onDocumentWritten:(o,f)=>f}:name==='firebase-functions/v2/https'?{onCall:(o,f)=>f,HttpsError}:require('../../functions/'+name.replace('./','')),Date,Promise});
 const request=(uid,token={},input={})=>({auth:{uid,token:{email_verified:true,auth_time:Date.now()/1000,...token}},data:input});
 return {data,authUsers,output,request,reads};
}

module.exports=setup;
