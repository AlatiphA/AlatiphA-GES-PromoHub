'use strict';
module.exports=()=>{
 const data=new Map(),authUsers=new Map(),sent=[];let auditCount=0,sendError=null;
 const snapshot=r=>({id:r.id,ref:r,exists:data.has(r.path),data:()=>data.get(r.path)});
 const ref=path=>({path,id:path.split('/').at(-1),get:async()=>snapshot(ref(path)),set:async(v,o)=>data.set(path,o?.merge?{...data.get(path),...v}:v),delete:async()=>data.delete(path)});
 const collection=path=>{let filters=[],cursor=null,maximum=Infinity;const q={where:(key,op,value)=>{filters.push([key,value]);return q;},orderBy:()=>q,startAfter:v=>{cursor=v;return q;},limit:v=>{maximum=v;return q;},get:async()=>({docs:[...data.keys()].filter(k=>k.startsWith(path+'/')&&!k.slice(path.length+1).includes('/')).map(ref).filter(r=>(!cursor||r.id>cursor)&&filters.every(([key,value])=>data.get(r.path)[key]===value)).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,maximum).map(snapshot)})};return q;};
 const db={doc:ref,collection,runTransaction:async fn=>{const writes=[];await fn({get:r=>r.get(),set:(r,v,o)=>writes.push(()=>r.set(v,o)),update:(r,v)=>writes.push(()=>r.set(v,{merge:true})),delete:r=>writes.push(()=>r.delete())});for(const write of writes)await write();}};
 class HttpsError extends Error{constructor(code,text){super(text);this.code=code;}}
 const admin={auth:()=>({getUser:async uid=>{const user=authUsers.get(uid);if(!user)throw Error('Auth unavailable');return user;}}),messaging:()=>({send:async message=>{sent.push(message);if(sendError)throw sendError;return 'message-id';}})};
 async function member(req,adminOnly=false){const uid=req.auth?.uid,p=data.get('users/'+uid),user=authUsers.get(uid);if(!uid||!req.auth.token?.email_verified||p?.accountStatus!=='active')throw new HttpsError('permission-denied','Verified active account required');if(adminOnly&&(!req.auth.token.promohubAdmin||user?.customClaims?.promohubAdmin!==true||user.disabled))throw new HttpsError('permission-denied','Administrator required');return uid;}
 const dependencies={onCall:(o,f)=>f,onDocumentWritten:(o,f)=>f,options:{region:'us-central1'},HttpsError,db,admin,member,stamp:()=>Date.now(),audit:(tx,a,action,target,details)=>tx.set(ref('auditLogs/'+ ++auditCount),{a,action,target,details})};
 const output={...require('../../functions/question-reports.cjs')(dependencies),...require('../../functions/push-notifications.cjs')(dependencies)};
 function user(uid,isAdmin=false){data.set('users/'+uid,{accountStatus:'active',displayName:uid,email:uid+'@example.test'});authUsers.set(uid,{emailVerified:true,customClaims:{promohubAdmin:isAdmin}});}
 user('u');user('admin',true);
 return {data,authUsers,sent,output,db,user,setSendError:e=>sendError=e,request:(uid,input={},claims={})=>({auth:{uid,token:{email_verified:true,promohubAdmin:uid==='admin',...claims}},data:input})};
};
