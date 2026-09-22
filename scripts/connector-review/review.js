'use strict';
const form=document.querySelector('#search-form'),results=document.querySelector('#results'),status=document.querySelector('#status'),more=document.querySelector('#more');
let activeQuery='',snapshot='',nextOffset=null,generation=0,shown=0;
const element=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
async function json(url){const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(10000)});const body=await response.json();if(!response.ok)throw Error(body.error?.message||'Search is unavailable. Please retry.');return body;}
function card(job){
  const article=element('article',undefined,'job');
  article.append(element('p',job.company,'company'),element('h3',job.title),element('p',job.salary.text,'pay'),element('p',[job.location,job.work_mode_text,job.experience.text].filter(Boolean).join(' · ')),element('p',job.summary,'summary'));
  const actions=element('div',undefined,'actions'),button=element('button','Check details','secondary'),link=element('a','View on StillUnemployed ↗');
  link.href=job.board_url;link.target='_blank';link.rel='noopener noreferrer';
  const detail=element('div');detail.hidden=true;detail.setAttribute('role','status');
  button.addEventListener('click',async()=>{
    button.disabled=true;button.textContent='Checking…';detail.hidden=false;detail.replaceChildren();
    try{const response=await json('/api/jobs/'+job.id);detail.append(element('p',response.job.description||response.job.summary||'See the employer posting for full requirements.','detail'));const employer=element('a','Open employer posting ↗');employer.href=response.job.employer_url;employer.target='_blank';employer.rel='noopener noreferrer';detail.append(employer);button.textContent='Check again';}
    catch(error){detail.append(element('p',error.message));button.textContent='Retry details';}
    finally{button.disabled=false;}
  });
  actions.append(button,link);article.append(actions,detail);return article;
}
async function search(append=false){
  const run=++generation;
  if(!append){const params=new URLSearchParams();for(const [key,value]of new FormData(form))if(value.trim())params.set(key,value.trim());params.set('limit','10');activeQuery=params.toString();snapshot='';nextOffset=null;shown=0;results.replaceChildren();}
  const params=new URLSearchParams(activeQuery);if(append){params.set('snapshot',snapshot);params.set('offset',String(nextOffset));}
  const url='/api/jobs/search?'+params;
  status.textContent='Checking current listings…';results.setAttribute('aria-busy','true');more.hidden=true;
  document.querySelector('#search-button').disabled=true;document.querySelector('#freshness').textContent='';
  document.querySelector('#request-link').href=url;
  try{const body=await json(url);if(run!==generation)return;snapshot=body.snapshot;nextOffset=body.next_offset;shown+=body.jobs.length;body.jobs.forEach(job=>results.append(card(job)));status.textContent=body.total?`${shown} of ${body.total} matching jobs.`:'No matching jobs. Try fewer filters or browse all jobs.';document.querySelector('#freshness').textContent='Board visibility checked '+new Date(body.visibility_checked_at).toLocaleTimeString()+'. Employer availability is not reverified by this search.';document.querySelector('#raw').textContent=JSON.stringify(body,null,2);more.hidden=nextOffset===null;}
  catch(error){if(run!==generation)return;status.textContent=error.message+' Select Find jobs to retry.';document.querySelector('#raw').textContent=error.message;}
  finally{if(run===generation){results.setAttribute('aria-busy','false');document.querySelector('#search-button').disabled=false;}}
}
form.addEventListener('submit',event=>{event.preventDefault();search();});
document.querySelector('#browse').addEventListener('click',()=>{form.reset();search();});
more.addEventListener('click',()=>search(true));
