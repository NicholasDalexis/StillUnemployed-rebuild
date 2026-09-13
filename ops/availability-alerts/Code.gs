/** Private fixed-recipient operational receiver. Deploy separately from Monday.
 * Script property SU_AVAILABILITY_ALERT_SECRET must match the Netlify function.
 * Local file preparation does not create a web app or send an email.
 */
function suAlertHex_(bytes){return bytes.map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');}
function suAlertMac_(value,key){return suAlertHex_(Utilities.computeHmacSha256Signature(JSON.stringify(value),key,Utilities.Charset.UTF_8));}
function suAlertEqual_(a,b){if(typeof a!=='string'||!/^[a-f0-9]{64}$/.test(a))return false;var different=0;for(var i=0;i<64;i++)different|=a.charCodeAt(i)^b.charCodeAt(i);return different===0;}
function suAlertOutput_(data){return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);}
function doPost(e){
  var props=PropertiesService.getScriptProperties(),secret=props.getProperty('SU_AVAILABILITY_ALERT_SECRET');
  if(!secret||secret.length<32)return suAlertOutput_({error:'Unavailable'});
  var input;try{var raw=e&&e.postData&&e.postData.contents;if(typeof raw!=='string'||raw.length>16000)throw Error();input=JSON.parse(raw);}catch(_){return suAlertOutput_({error:'Invalid request'});}
  if(!input||Object.keys(input).some(function(k){return ['schemaVersion','alertId','scope','kind','job','createdAt','sentAt','nonce','signature'].indexOf(k)<0;})||input.schemaVersion!==1||!/^[a-f0-9]{64}$/.test(input.alertId||'')||['preview','production'].indexOf(input.scope)<0||['unknown_evidence','contradictory_report'].indexOf(input.kind)<0||!input.job||Object.keys(input.job).some(function(k){return ['link','company','role'].indexOf(k)<0;})||typeof input.job.link!=='string'||!/^https?:\/\//.test(input.job.link)||input.job.link.length>8192||/[\u0000-\u0020\u007f]/.test(input.job.link)||typeof input.job.company!=='string'||input.job.company.length>200||typeof input.job.role!=='string'||input.job.role.length>300||!isFinite(Date.parse(input.createdAt))||typeof input.sentAt!=='number'||Math.abs(Date.now()-input.sentAt)>300000||typeof input.nonce!=='string'||!/^[a-f\d-]{36}$/.test(input.nonce))return suAlertOutput_({error:'Invalid request'});
  var unsigned={schemaVersion:input.schemaVersion,alertId:input.alertId,scope:input.scope,kind:input.kind,job:input.job,createdAt:input.createdAt,sentAt:input.sentAt,nonce:input.nonce};
  if(!suAlertEqual_(input.signature,suAlertMac_(unsigned,secret)))return suAlertOutput_({error:'Not authorized'});
  function receipt(status,at){var value={schemaVersion:1,alertId:input.alertId,scope:input.scope,status:status,at:at||new Date().toISOString()};value.signature=suAlertMac_(value,secret);return suAlertOutput_(value);}
  var immutable={schemaVersion:input.schemaVersion,alertId:input.alertId,scope:input.scope,kind:input.kind,job:input.job,createdAt:input.createdAt};
  var fingerprint=suAlertHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(immutable),Utilities.Charset.UTF_8)),key='SU_ALERT_'+input.alertId,lock=LockService.getScriptLock();
  if(!lock.tryLock(3000))return receipt('retry');
  try{
    var previous=props.getProperty(key);if(previous){var prior=JSON.parse(previous);if(prior.fingerprint!==fingerprint)return suAlertOutput_({error:'Conflicting receipt'});return receipt(prior.status==='accepted_by_sender'?'accepted_by_sender':'uncertain',prior.at);}
    if(MailApp.getRemainingDailyQuota()<1)return receipt('retry');
    if(Object.keys(props.getProperties()).filter(function(k){return k.indexOf('SU_ALERT_')===0;}).length>=900)return receipt('retry');
    var at=new Date().toISOString();props.setProperty(key,JSON.stringify({fingerprint:fingerprint,status:'reserved',at:at}));
    try{
      MailApp.sendEmail({to:'NicholasdAlexis@gmail.com',subject:'StillUnemployed: job needs review ('+input.scope+')',body:[input.kind==='contradictory_report'?'A different signed-in community member reported this role after it was restored.':'The availability check could not establish whether this role is open.',input.job.company+' | '+input.job.role,input.job.link,'','The role is held for review when it was reported by a signed-in member. This is not proof of closure.','Alert ID: '+input.alertId,'Environment: '+input.scope].join('\n')});
      props.setProperty(key,JSON.stringify({fingerprint:fingerprint,status:'accepted_by_sender',at:at}));return receipt('accepted_by_sender',at);
    }catch(_){return receipt('uncertain',at);}
  }catch(_){return receipt('uncertain');}finally{lock.releaseLock();}
}
