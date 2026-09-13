'use strict';
const Queue=require('./report-queue-core.cjs');
function ensureAlert(record,reason,at){
  if(!['unknown_evidence','contradictory_report'].includes(reason))throw Error('Invalid alert reason');
  const id=Queue.hash(record.reportId+'|'+record.revision+'|'+reason);record.outbox ||= [];
  if(!record.outbox.some(item=>item.id===id))record.outbox.push({id,reason,status:'pending',createdAt:new Date(at).toISOString(),attempts:0});
  return id;
}
function payload(record,alert,scope){return {schemaVersion:1,alertId:alert.id,scope,kind:alert.reason,job:{link:record.link,company:String(record.metadata?.co||'').slice(0,200),role:String(record.metadata?.role||'').slice(0,300)},createdAt:alert.createdAt};}
module.exports={ensureAlert,payload};
