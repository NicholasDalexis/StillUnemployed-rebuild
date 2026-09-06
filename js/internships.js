/* Separate reviewed feed. An Active cell alone is never publication evidence. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SUInternships=api;})(typeof window!=='undefined'?window:this,function(){
 'use strict';
 function jobs(data){
   if(!data||data.schemaVersion!==1||!Array.isArray(data.jobs))throw Error('Invalid internship feed');
   if(data.status==='awaiting_verification')return [];
   if(data.status!=='verified')throw Error('Internship feed not verified');
   var seen=new Set();return data.jobs.filter(function(j){
     if(!j||!j.co||!j.role||!j.loc||!j.eligibility||!j.verification||j.verification.status!=='open'||!Number.isFinite(Date.parse(j.verification.checkedAt)))return false;
     try{var u=new URL(j.link);if(!/^https?:$/.test(u.protocol)||u.username||u.password)return false;}catch(e){return false;}
     if(j.payStatus!=='paid'&&j.payStatus!=='unpaid'&&j.payStatus!=='not_disclosed')return false;
     if(j.payStatus==='paid'&&!/\d/.test(j.pay||''))return false;
     if(j.payStatus==='unpaid'&&j.pay!=='Unpaid')return false;
     if(j.payStatus==='not_disclosed'&&j.pay!=='Not disclosed')return false;
     if(j.deadlineISO&&/^\d{4}-\d{2}-\d{2}$/.test(j.deadlineISO)&&j.deadlineISO<new Date().toISOString().slice(0,10))return false;
     if(seen.has(j.link))return false;seen.add(j.link);return true;
   }).map(function(j){return Object.assign({},j,{internship:true,pick:false,exp:j.exp||'See eligibility',state:j.state||j.loc});});
 }
 return {jobs:jobs};
});
