'use strict';
const crypto = require('node:crypto');
const P = require('../../../js/personalization.js');
const Identity = require('../../../js/job-identity.js');
const DailyLinks=require('../../../js/daily-links.js');
const Newsletter = require('./newsletter-attribution.cjs');
const COUNT_ONLY_EVENTS = new Set(['preference_save','preference_clear','preference_skip','feedback_not_fit',
  'preferred_source_click','feedback_open','feedback_dismiss','feedback_unavailable',
  'feed_ready','feed_load_error','feed_retry','feed_refresh','search_empty',
  'signin_start','signin_cancel','signin_error','signout_complete','signout_error','sync_error','sync_retry','sync_recovered',
  'preference_open','preference_error','newsletter_dismiss','bookmark_open','view_restored','render_error','share_invalid','share_missing','filters_open','preference_major_saved','preference_industry_saved','preference_location_saved','preference_info_saved']);
const EVENTS = new Set(['page_view','job_impression','job_open','job_save','job_unsave','apply_click','application_reported','tracker_open','tracker_add','tracker_delete','tracker_status','tracker_export','tracker_note_edit','theme_change','theme_vote','filter_change','search_used','privacy_open','page_engagement','outbound_started','outbound_return','outbound_unknown','auth_login','auth_logout','auth_signup','consent_change','preferences_reset','newsletter_open','newsletter_click','advice_open','advice_impression','suggest_open','suggest_received','founder_open','board_open',...COUNT_ONLY_EVENTS]);
const PAGES = new Set(['daily','home','board','internships','tracker','privacy','terms','suggest','other']);
const THEMES = new Set(['original','girly','poker','mermaid','bratt','noir','beauty','chess']);
const ADVICE_IDS=new Set(['no-weekends','board-trap','grad-school','three-years','first-come','ghosted','manifesting','canva-resume','wish-list','follow-up','show-dont-ask','volume-trap','not-linkedin','cold-referral','linkedin-dms','resume-layout','major-cage','keyword-stuffing','experience-internship','experience-campus','experience-ambassador','experience-honest-dates','experience-read-requirement','experience-graduation']);
const ID = /^[a-f0-9]{64}$/;
const hash = v => crypto.createHash('sha256').update(String(v)).digest('hex');
['daily_entry_click','daily_selection_view','daily_board_click','tldr_open','newsletter_impression','newsletter_engagement','share_arrival'].forEach(name=>EVENTS.add(name));
function jobId(job) { return hash(Identity.keys(job.link)[0] || job.link); }
function catalog(jobs) { const out={}; for (const job of jobs) out[jobId(job)]={...P.classify(job),salary:P.salary(job.pay),company:job.co||'Company not listed',jobLabel:(job.role||'Job')+' at '+(job.co||'Company not listed')};return out; }
function cleanEvent(input, jobs) {
  if (!input || !EVENTS.has(input.name) || !/^[a-zA-Z0-9_-]{16,64}$/.test(input.id||'') || !PAGES.has(input.page)) throw Object.assign(new Error('Invalid event'), {status:400});
  const out={id:input.id,name:input.name,page:input.page};
  if(['newsletter_impression','newsletter_engagement'].includes(out.name))return Object.assign(out,Newsletter.context(input,jobs));
  // These counts never retain written answers, job attribution or optional metadata.
  if(COUNT_ONLY_EVENTS.has(out.name))return out;
  if(['direct','linkedin','instagram','threads','jobhuntrecipe','referral'].includes(input.source))out.source=input.source;
  if(/^(su_daily_jobs|su_internship_friday)_\d{8}$/.test(input.campaign||''))out.campaign=input.campaign;
  if(out.source==='linkedin'&&input.campaign==='early_career_daily_jobs'){
    out.campaign=input.campaign;
    if(/^\d{8}_[a-z][a-z0-9_-]{0,31}$/.test(input.post||'')&&/^(board_footer|job_[1-5]_[a-f0-9]{8,64})$/.test(input.linkSlot||'')){out.post=input.post;out.linkSlot=input.linkSlot;}
  }
  Object.assign(out,DailyLinks.context(new URLSearchParams({utm_source:input.source||'',utm_medium:input.medium||'',utm_campaign:input.campaign||'',utm_id:input.post||'',utm_content:input.linkSlot||''})));
  if(out.campaign==='early_career_daily_jobs'&&(!out.post||!/^(board_footer|job_(?:[1-9]|10)_[a-f0-9]{8,64})$/.test(out.linkSlot||''))){delete out.post;delete out.linkSlot;}
  if(DailyLinks.validDate(input.selectionDate)&&/^20\d{2}/.test(input.selectionDate)&&input.selectionKind==='jobs'){out.selectionDate=input.selectionDate;out.selectionKind='jobs';if(Number.isInteger(input.selectionRank)&&input.selectionRank>=1&&input.selectionRank<=4)out.selectionRank=input.selectionRank;}
  if(['advice_open','advice_impression','newsletter_click'].includes(out.name)&&ADVICE_IDS.has(input.adviceId))out.adviceId=String(input.adviceId);
  if(/^[a-zA-Z0-9_-]{16,64}$/.test(input.outboundId||''))out.outboundId=input.outboundId;
  if(input.jobId) { if(!ID.test(input.jobId)||!jobs[input.jobId])throw Object.assign(new Error('Unknown job'),{status:400});out.jobId=input.jobId;out.field=jobs[input.jobId].field;out.role=jobs[input.jobId].role;out.company=jobs[input.jobId].company;out.jobLabel=jobs[input.jobId].jobLabel; }
  if(/^(job_|tldr_open|share_arrival|apply_click|application_reported|outbound_)/.test(out.name) && !out.jobId)throw Object.assign(new Error('Job required'),{status:400});
  if(input.theme && THEMES.has(input.theme))out.theme=input.theme;
  if(out.name==='theme_vote' && (!out.theme || !['up','down'].includes(input.vote)))throw Object.assign(new Error('Theme and vote required'),{status:400});
  if(['category','workstyle','pay','freshness','state','theme','saved'].includes(input.filter))out.filter=input.filter;
  if(['Applied','Interviewing','Offer','Rejected','Withdrawn','Ghosted'].includes(input.status))out.status=input.status;
  if(Number.isFinite(input.seconds))out.seconds=Math.max(0,Math.min(900,Math.round(input.seconds)));
  if(out.name==='outbound_return') {out.returned=true;out.capped=input.capped===true;}
  if(out.name==='outbound_unknown') {out.returned=false;delete out.seconds;}
  if(out.name==='theme_vote' && ['up','down'].includes(input.vote))out.vote=input.vote;
  // All arbitrary text/identity/URLs/notes are discarded, never copied.
  return out;
}
function authorizeOrigin(request, env) {
  const origin=request.headers.origin || request.headers.Origin;
  const allowed=(env.SU_ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
  const sameOriginGet=!origin && ['GET','DELETE'].includes(request.httpMethod) && request.headers['sec-fetch-site']==='same-origin' && allowed.some(o=>{try{return new URL(o).host===request.headers.host;}catch{return false;}});
  if ((!origin || !allowed.includes(origin)) && !sameOriginGet) throw Object.assign(new Error('Origin denied'),{status:403});
}
function reduceRows(rows, days=30, now=Date.now()) {
  const counts={},daily={},fields={},roles={},themes={},themeVotes={up:{},down:{}},jobs={},companies={},pageTiming={},visitors=new Set(),visits=new Set(),tracker=new Set(), signups=new Set(), logins=new Set();
  let returned=0,unknown=0,capped=0,seconds=0,events=0;const started=new Set(),finished=new Set();
  const loginUsers=new Set(),acquisition={},campaigns={},advice={},jobFunnels={},marketingLinks={},dailyCollections={};
  for(const e of rows) {
    if(e.at < now-days*86400000 || e.at>now)continue;
    events++;counts[e.name]=(counts[e.name]||0)+1;visitors.add(e.actor);if(e.name==='outbound_started'&&e.outboundId)started.add(e.actor+e.outboundId);
    if(e.name==='auth_signup')signups.add(e.actor);
    if(e.name==='auth_login'){logins.add(e.actor+':'+e.id);loginUsers.add(e.actor);}
    if(e.name==='page_view')for(const [map,key] of [[acquisition,e.source||'unattributed'],[campaigns,e.campaign]]){if(!key)continue;map[key]||={count:0,actors:new Set()};map[key].count++;map[key].actors.add(e.actor);}
    if(e.source&&e.campaign&&(e.post||e.selectionDate)&&e.linkSlot&&['page_view','tldr_open','apply_click'].includes(e.name)){
      const key=[e.source,e.campaign,e.post||e.selectionDate,e.linkSlot].join(':'),g=marketingLinks[key]||={label:(e.post||e.selectionDate)+' / '+e.linkSlot,...(e.campaign==='early_career_daily_jobs'?{}:{source:e.source,campaign:e.campaign,medium:e.medium||null,post:e.post||null,placement:e.linkSlot,selectionDate:e.selectionDate||null}),actors:new Set(),sessions:new Set(),landings:new Set(),views:0,tldr:0,apply:0};
      g.actors.add(e.actor);if(e.name==='page_view'){g.views++;g.sessions.add(e.actor+':'+e.session);g.landings.add(e.actor);}else g[e.name==='tldr_open'?'tldr':'apply']++;
    }
    if(e.selectionDate&&['daily_entry_click','daily_selection_view','tldr_open','apply_click'].includes(e.name)){
      const key=[e.selectionDate,e.source||'unattributed',e.campaign||'',e.linkSlot||''].join(':');
      const group=dailyCollections[key]||={date:e.selectionDate,kind:'jobs',source:e.source||'unattributed',campaign:e.campaign||null,placement:e.linkSlot||null,actors:new Set(),entry:0,views:0,tldr:0,apply:0};
      group.actors.add(e.actor);group[e.name==='daily_entry_click'?'entry':e.name==='daily_selection_view'?'views':e.name==='tldr_open'?'tldr':'apply']++;
    }
    if(e.jobId&&['job_impression','tldr_open','apply_click','application_reported','job_save','share_arrival'].includes(e.name)){
      const group=jobFunnels[e.jobId]||={jobId:e.jobId,label:e.jobLabel,actors:new Set(),impressions:0,tldr:0,apply:0,reported:0,saves:0,arrivals:0};
      group.actors.add(e.actor);group[{job_impression:'impressions',tldr_open:'tldr',apply_click:'apply',application_reported:'reported',job_save:'saves',share_arrival:'arrivals'}[e.name]]++;
    }
    if(e.adviceId&&['advice_open','advice_impression'].includes(e.name)){
      const group=advice[e.adviceId]||={label:'Advice '+e.adviceId,actors:new Set(),impressions:0,opens:0};group.actors.add(e.actor);group[e.name==='advice_open'?'opens':'impressions']++;
    }
    const date=new Date(e.at).toISOString().slice(0,10);daily[date] ||= {date,visits:0,job_opens:0,apply_clicks:0};
    if(e.name==='page_view'&&!visits.has(e.actor+e.session)) {visits.add(e.actor+e.session);daily[date].visits++;}
    if(e.name==='job_open'){daily[date].job_opens++;fields[e.field] ||= {count:0,actors:new Set()};fields[e.field].count++;fields[e.field].actors.add(e.actor);roles[e.role] ||= {count:0,actors:new Set()};roles[e.role].count++;roles[e.role].actors.add(e.actor);}
    if(e.name==='apply_click')daily[date].apply_clicks++;
    if(e.name==='job_open'){for(const [map,key] of [[jobs,e.jobLabel],[companies,e.company]]){if(!key)continue;map[key] ||= {count:0,actors:new Set()};map[key].count++;map[key].actors.add(e.actor);}}
    if(e.name==='page_engagement'){pageTiming[e.page] ||= {count:0,seconds:0,actors:new Set(),sessions:new Set()};pageTiming[e.page].count++;pageTiming[e.page].seconds+=e.seconds||0;pageTiming[e.page].actors.add(e.actor);pageTiming[e.page].sessions.add(e.actor+e.session);}
    if(e.name.startsWith('tracker_'))tracker.add(e.actor);
    if(e.theme&&e.name==='theme_change'){themes[e.theme] ||= {count:0,actors:new Set()};themes[e.theme].count++;themes[e.theme].actors.add(e.actor);}
    if(e.name==='theme_vote'&&THEMES.has(e.theme)&&['up','down'].includes(e.vote)){
      const group=themeVotes[e.vote][e.theme] ||= {count:0,actors:new Set()};group.count++;group.actors.add(e.actor);
    }
    if(e.name==='outbound_return'){if(e.outboundId)finished.add(e.actor+e.outboundId);returned++;seconds+=e.seconds||0;if(e.capped)capped++;}
    if(e.name==='outbound_unknown'&&e.outboundId)started.add(e.actor+e.outboundId);
  }
  unknown=Array.from(started).filter(id=>!finished.has(id)).length;
  const dimension = map=>Object.entries(map).filter(([,v])=>v.actors.size>=5).map(([label,v])=>({label,count:v.count})).sort((a,b)=>b.count-a.count);
  // Suppress each direction separately. Publishing a per-theme total could reveal
  // a withheld small dislike/like group by subtraction. Counts are vote events.
  const votes={up:dimension(themeVotes.up),down:dimension(themeVotes.down)};
  const safeGroups=map=>Object.values(map).filter(g=>g.actors.size>=5).map(({actors,...g})=>g);
  const links=Object.values(marketingLinks).filter(g=>g.actors.size>=5).map(({actors,sessions,landings,...g})=>({...g,visitors:landings.size,visits:sessions.size}));
  return {windowDays:days,generatedAt:new Date(now).toISOString(),tracking:'consent-only',totals:{events:events,visits:visits.size,visitors:visitors.size,signups:signups.size,logins:logins.size,login_users:loginUsers.size,job_opens:counts.job_open||0,saves:counts.job_save||0,apply_clicks:counts.apply_click||0,reported_applied:counts.application_reported||0,tracker_users:tracker.size},acquisition:dimension(acquisition),campaigns:dimension(campaigns),marketingLinks:links,dailyCollections:safeGroups(dailyCollections),advice:safeGroups(advice),jobFunnels:safeGroups(jobFunnels).sort((a,b)=>b.apply-a.apply),daily:Object.values(daily).sort((a,b)=>a.date.localeCompare(b.date)),fields:dimension(fields),roles:dimension(roles),themes:dimension(themes),themeVotes:votes,jobs:dimension(jobs),companies:dimension(companies),pageTiming:Object.entries(pageTiming).filter(([,v])=>v.actors.size>=5).map(([label,v])=>({label,count:v.count,meanActiveSeconds:Math.round(v.seconds/v.sessions.size)})),events:Object.entries(counts).map(([label,count])=>({label,count})),timing:{returned,unknown,capped,meanAwaySeconds:returned?Math.round(seconds/returned):null},privacy:{rawRetentionDays:90,aggregateRetentionDays:400,minimumCohort:5},questions:[]};
}
module.exports={EVENTS,hash,jobId,catalog,cleanEvent,authorizeOrigin,reduceRows};
