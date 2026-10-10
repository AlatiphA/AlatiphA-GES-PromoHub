'use strict';
const plans=Object.freeze({m1:{months:1,price:20,label:'1 month'},m3:{months:3,price:50,label:'3 months'},m6:{months:6,price:80,label:'6 months'},m12:{months:12,price:100,label:'12 months'}});
const trialMs=7*24*60*60*1000;
function addMonths(time,months){
 const d=new Date(time),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);
 const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.getTime();
}
function paid(p,now=Date.now()){return p?.subscriptionSchema===1 && p.accountTier==='premium' && Number(p.subscriptionEndsAtMs)>now;}
function legacy(p){return p?.subscriptionSchema!==1 && p?.securitySchemaVersion===2 && p?.accountTier==='premium';}
function cloud(p,now=Date.now()){return p?.accountStatus==='active' && (paid(p,now)||legacy(p));}
function readable(p,now=Date.now()){return p?.accountStatus==='active' && (paid(p,now)||legacy(p)||Number(p.trialEndsAtMs)>now);}
function initial(p,now=Date.now()){
 if(p.subscriptionSchema===1 || legacy(p))return {};
 return {subscriptionSchema:1,trialStartedAtMs:now,trialEndsAtMs:now+trialMs,subscriptionEndsAtMs:0,subscriptionPlan:'',subscriptionStatus:'trial'};
}
function reference(text){if(typeof text!=='string')return null;const r=text.trim().toUpperCase();return /^[A-Z0-9-]{6,80}$/.test(r)?r:null;}
module.exports={plans,trialMs,addMonths,paid,legacy,cloud,readable,initial,reference};
