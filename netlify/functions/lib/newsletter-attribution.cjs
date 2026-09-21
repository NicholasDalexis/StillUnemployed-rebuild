'use strict';
const crypto=require('node:crypto');
const DAY=86400000;
const CTA=new Set(['N01','N02','N06','N07','N08','N09','N10','N11','N12','N13','N14','N16','N18','N19','N20','N21','N22','N23','N24','N26','home-recipe','signup-card']);
const CTA_LABELS={"N01": "More notes like this, every week.", "N02": "Once you get the job, unsub.", "N06": "The advice I wish I’d had.", "N07": "A little job hunt perspective.", "N08": "My rejection notes, in your inbox.", "N09": "Before your next application.", "N10": "Skip a few of my mistakes.", "N11": "What I’d do differently now.", "N12": "I wrote down what worked.", "N13": "One email. Less second-guessing.", "N14": "Lessons I learned the hard way.", "N16": "Get the job, then unsub.", "N18": "Still applying? I have a few notes.", "N19": "I wish someone had sent me this.", "N20": "Steal my notes. I’m serious.", "N21": "Save yourself a few of my mistakes.", "N22": "A little help between rejection emails.", "N23": "For the days you want to give up.", "N24": "I have a few thoughts on this job market.", "N26": "I learned a few things. Want them?", "home-recipe": "Get the next one in your inbox", "signup-card": "Feed signup card"};
const PLACEMENTS=new Set(['job-detail','advice','signup-card','homepage']);
const TOKEN=/^[a-f0-9]{64}$/;
const fail=(status,message)=>Object.assign(new Error(message),{status});
function context(input,jobs){
  if(!PLACEMENTS.has(input.placement)||!CTA.has(input.cta))throw fail(400,'Invalid newsletter context');
  const out={placement:input.placement,cta:input.cta,revision:input.cta==='N16'?2:1};
  if(input.placement==='job-detail'){
    if(!TOKEN.test(input.jobId||'')||!jobs[input.jobId])throw fail(400,'Unknown job');
    Object.assign(out,{jobId:input.jobId,jobLabel:jobs[input.jobId].jobLabel});
  }
  return out;
}
// Svix's documented HMAC scheme. Verify exact bytes before parsing any payload.
function verify(raw,headers,secret,now){
  if(!/^whsec_[A-Za-z0-9+/=]+$/.test(secret||''))throw fail(503,'Newsletter confirmation is not configured');
  if(Buffer.byteLength(raw)>65536)throw fail(413,'Request too large');
  const id=headers['svix-id'],timestamp=headers['svix-timestamp'],signatures=headers['svix-signature'];
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(id||'')||!/^\d{10,12}$/.test(timestamp||'')||Math.abs(now/1000-Number(timestamp))>300||typeof signatures!=='string'||signatures.length>2048)throw fail(401,'Invalid webhook signature');
  const expected=crypto.createHmac('sha256',Buffer.from(secret.slice(6),'base64')).update(id+'.'+timestamp+'.'+raw).digest();
  const valid=signatures.split(' ').some(s=>{if(!/^v1,[A-Za-z0-9+/]+={0,2}$/.test(s))return false;const actual=Buffer.from(s.slice(3),'base64');return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected);});
  if(!valid)throw fail(401,'Invalid webhook signature');
  try{return JSON.parse(raw);}catch{throw fail(400,'Invalid webhook payload');}
}
const millis=v=>v&&v.toMillis?v.toMillis():Number(v);
async function receive(request,d){
  if(d.env.SU_NEWSLETTER_ATTRIBUTION_ENABLED!=='true'||d.env.CONTEXT!=='production')throw fail(503,'Newsletter confirmation is not enabled');
  const payload=verify(request.body||'',request.headers,d.env.SU_BEEHIIV_WEBHOOK_SECRET,d.now());
  if(!['subscription.created','subscription.confirmed'].includes(payload.event_type))return {accepted:false};
  const data=payload.data||{};if(!['active','pending'].includes(data.status))return {accepted:false};
  const token=String(data.utm_campaign||'').replace(/^su_/,''),eventAt=Number(payload.event_timestamp)*1000;
  if(data.utm_source!=='stillunemployed'||data.utm_medium!=='website'||!String(data.utm_campaign||'').startsWith('su_')||!TOKEN.test(token))return {accepted:false};
  if(!/^sub_[a-f0-9-]{36}$/i.test(data.id||'')||!Number.isFinite(eventAt)||eventAt>d.now()+300000)throw fail(400,'Invalid subscription event');
  const ref=d.db.doc('suAnalyticsEvents/newsletter-receipt-'+token);
  return d.db.runTransaction(async tx=>{
    const snap=await tx.get(ref);if(!snap.exists)return {accepted:false};
    const receipt=snap.data();
    const created=Number(data.created)*1000;
    if(!Number.isFinite(created)||created<receipt.at-300000||created>d.now()+300000)return {accepted:false};
    if(receipt.revoked||!receipt.actor||millis(receipt.expiresAt)<=d.now()||eventAt<receipt.at-300000||eventAt>receipt.at+30*DAY)return {accepted:false};
    const profile=await tx.get(d.db.doc('suAnalyticsProfiles/'+receipt.actor));
    if(profile.exists&&(profile.data().resetAt||0)>=receipt.at)return {accepted:false};
    // Subscription identity is keyed, never the email. Both provider event types
    // converge on the same confirmation key, so retries/order cannot inflate it.
    const subscriber=crypto.createHmac('sha256',d.env.SU_ANALYTICS_SECRET).update('beehiiv:'+data.id).digest('hex');
    const submittedRef=d.db.doc('suAnalyticsEvents/newsletter-submitted-'+subscriber),confirmedRef=d.db.doc('suAnalyticsEvents/newsletter-confirmed-'+subscriber);
    const submitted=await tx.get(submittedRef),confirmed=await tx.get(confirmedRef);
    const base={...receipt.context,actor:receipt.actor,session:receipt.session,page:receipt.page,at:eventAt,expiresAt:new Date(eventAt+90*DAY),analytics:true,exposureAt:receipt.viewedAt||receipt.at,exposureId:crypto.createHash('sha256').update(token).digest('hex')};
    if(!submitted.exists)tx.set(submittedRef,{...base,id:'newsletter-submitted-'+subscriber,name:'newsletter_submitted'});
    if(data.status==='active'&&!confirmed.exists)tx.set(confirmedRef,{...base,id:'newsletter-confirmed-'+subscriber,name:'newsletter_confirmed'});
    return {accepted:true};
  });
}
function aggregate(rows){
  const impressions=new Map(),confirmations=new Map(),groups={cta:{},placement:{},job:{}};
  for(const e of rows){
    if(e.name==='newsletter_impression'&&e.exposureId)impressions.set(e.exposureId,e);
    if(e.name==='newsletter_confirmed'&&e.exposureId)confirmations.set(e.exposureId,e);
  }
  let converted=0;
  for(const [id,e] of impressions){
    const matched=confirmations.has(id);if(matched)converted++;
    for(const [dimension,label] of [['cta',CTA_LABELS[e.cta]||e.cta],['placement',({'job-detail':'Job TL;DR','advice':'Advice popup','signup-card':'Feed signup popup','homepage':'Homepage newsletter popup'})[e.placement]],['job',e.jobLabel]]){
      if(!label)continue;
      const g=groups[dimension][label] ||= {impressions:0,converted:0,actors:new Set(),convertedActors:new Set()};
      g.impressions++;g.actors.add(e.actor);if(matched){g.converted++;g.convertedActors.add(e.actor);}
    }
  }
  const list=map=>Object.entries(map).filter(([,g])=>g.actors.size>=5).map(([label,g])=>({label,impressions:g.impressions,converted:g.convertedActors.size>=5?g.converted:null,rate:g.convertedActors.size>=5?g.converted/g.impressions:null}));
  return {impressions:impressions.size,engagements:rows.filter(e=>e.name==='newsletter_engagement').length,submitted:rows.filter(e=>e.name==='newsletter_submitted').length,confirmed:rows.filter(e=>e.name==='newsletter_confirmed').length,matchedConversions:converted,rate:impressions.size?converted/impressions.size:null,cta:list(groups.cta),placement:list(groups.placement),job:list(groups.job)};
}
module.exports={DAY,TOKEN,context,verify,receive,aggregate};
