/* One bounded link contract for the daily page and Marketing's post packets. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.SUDailyLinks=factory();})(typeof window==='undefined'?this:window,function(){
  'use strict';
  var sources=['linkedin','instagram','tiktok','threads','x','facebook','jobhuntrecipe','substack'];
  function validDate(value){try{return /^\d{4}-\d{2}-\d{2}$/.test(value||'')&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}catch(_){return false;}}
  function context(params){
    var out={},source=params.get('utm_source'),campaign=params.get('utm_campaign'),post=params.get('utm_id'),content=params.get('utm_content'),medium=params.get('utm_medium');
    if(sources.indexOf(source)>=0)out.source=source;
    if(['organic_social','paid_social','email','owned_content'].indexOf(medium)>=0)out.medium=medium;
    if(/^(?:(?:su_daily_jobs|su_internship_friday|top[45])_\d{8}(?:_mixed)?|internships_\d{8}|profile_jobs|early_career_daily_jobs)$/.test(campaign||''))out.campaign=campaign;
    if(/^\d{8}_[a-z][a-z0-9_-]{0,31}$/.test(post||''))out.post=post;
    if(/^(?:bio|page_profile|comment_dm|board_footer|(?:job_|slot)(?:[1-9]|10)_[a-z0-9]{8,64})$/.test(content||''))out.linkSlot=content;
    if(/^s(?:[1-9]|10)$/.test(content||'')&&/^(?:top[45]_\d{8}(?:_mixed)?|internships_\d{8})$/.test(campaign||'')){
      out.linkSlot=content;
      if(!out.post&&out.source)out.post=campaign.match(/\d{8}/)[0]+'_'+out.source+'_'+(campaign.startsWith('internships')?'internships':campaign.slice(0,4));
    }
    return out;
  }
  function query(input){var out=new URLSearchParams();[['source','utm_source'],['medium','utm_medium'],['campaign','utm_campaign'],['post','utm_id'],['linkSlot','utm_content']].forEach(function(pair){if(input[pair[0]])out.set(pair[1],input[pair[0]]);});return new URLSearchParams(querySafe(out));}
  function querySafe(params){var safe=context(params),out=new URLSearchParams();[['source','utm_source'],['medium','utm_medium'],['campaign','utm_campaign'],['post','utm_id'],['linkSlot','utm_content']].forEach(function(pair){if(safe[pair[0]])out.set(pair[1],safe[pair[0]]);});return out.toString();}
  function build(date,input,origin){if(date!==null&&!validDate(date))throw Error('Invalid collection date');var url=new URL('/jobs/daily'+(date?'/'+date:''),origin||'https://stillunemployed.com');url.search=query(input||{}).toString();return url.href;}
  return {validDate:validDate,context:context,query:query,build:build,sources:sources};
});
