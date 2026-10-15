/* Shared work families, concept search and editorial ordering. No admission gate.
 * Source titles/categories remain unchanged. Industry means the employer's business.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.SUCareerFields=api;
})(typeof window==='undefined'?this:window,function(){
  'use strict';
  var GROUPS=[
    ['Marketing & Communications',['Marketing','Brand & Marketing','Growth & CRM','PR & Partnerships','Social','Influencer','Content & Copy','Advertising','Public Relations'],/\bmarketing|\bpublic relations\b|\bpr\b|\bsocial media\b|\badvertis|\bmedia (?:planner|buyer)|\bcommunications?\b|\bcopywriter|\binfluencer/],
    ['Design',['Design','UX/UI Design','Product Design','Graphic Design','Graphic & Brand Design'],/\b(?:ux|ui|graphic|product|brand|visual|interaction|industrial|interior) design|\bdesigner\b|\billustrat|\bproduction artist\b/],
    ['Software & Engineering',['Software & Engineering','Software Engineering','Engineering','Web Development','Creative Tech','Creative Technology'],/\bengineer|\bsoftware|\bdeveloper|\bfrontend|\bfront end|\bbackend|\bback end|\bfull stack|\bweb development|\bquality assurance\b|\bdevops\b/],
    ['Data & AI',['Data & AI','Data','Artificial Intelligence','Data Science','Analytics'],/\bdata |\bdata$|\bmachine learning|\bartificial intelligence|\banalytics|\bstatistic/],
    ['Product & Project Management',['Product & Project Management','Product Management','Project Management'],/\b(?:product|project|program) (?:manager|management|coordinator|analyst)|\bapm\b/],
    ['Business & Operations',['Business & Operations','Business','Operations','Administration','Supply Chain'],/\boperations?\b|\bbusiness analyst|\badministrat|\bsupply chain|\blogistics|\bprocurement|\bexecutive assistant/],
    ['Finance & Accounting',['Finance & Accounting','Finance','Accounting'],/\bfinanc|\baccountant|\baccounting|\baudit|\binvestment|\bactuar/],
    ['People & Recruiting',['People & Recruiting','HR','Human Resources','Recruiting'],/\bhuman resources|\brecruit|\btalent acquisition|\bpeople (?:operations|partner)|\bhr\b/],
    ['Sales & Customer Success',['Sales & Customer Success','Sales','Customer Success','Customer Support'],/\bsales\b|\bcustomer (?:success|support)|\baccount executive|\bbusiness development|\bclient success/],
    ['Research & Science',['Research & Science','Research','Science'],/\bresearch|\bscientist|\blaboratory|\bbiolog|\bchemist|\bclinical trial/],
    ['Healthcare',['Healthcare','Health'],/\bhealthcare|\bhealth care|\bnurs|\bmedical|\bpharmac|\btherapist/],
    ['Legal & Compliance',['Legal & Compliance','Legal','Compliance'],/\blegal|\bparalegal|\bcompliance|\bregulatory/],
    ['Education & Community',['Education & Community','Education','Community'],/\beducation|\bteacher|\bteaching|\bstudent (?:affairs|success)|\bcommunity (?:coordinator|organizer)/],
    ['Media & Production',['Media & Production','Video & Creative','Videography','Video','Audio & Podcast'],/\bvideo|\bfilm|\bproducer|\bproduction|\baudio|\bpodcast|\beditor\b/],
    ['Fashion',['Fashion','Fashion Design'],/\bfashion|\bapparel|\btextile|\bfootwear/],
    ['Photography',['Photography'],/\bphoto/]
  ];
  function norm(v){return String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();}
  var aliases={};GROUPS.forEach(function(g){g[1].concat([g[0]]).forEach(function(a){aliases[norm(a)]=g[0];});});
  var CONCEPTS={'pr':'Marketing & Communications','public relations':'Marketing & Communications','marketing':'Marketing & Communications','communications':'Marketing & Communications','advertising':'Marketing & Communications','social media':'Marketing & Communications','agency':'Marketing & Communications','agencies':'Marketing & Communications','engineering':'Software & Engineering','software':'Software & Engineering','coding':'Software & Engineering','design':'Design','data':'Data & AI','ai':'Data & AI','finance':'Finance & Accounting','accounting':'Finance & Accounting','hr':'People & Recruiting','recruiting':'People & Recruiting','operations':'Business & Operations','sales':'Sales & Customer Success'};
  function field(job){
    var category=String(job.ind||job.category||'').trim(),mapped=aliases[norm(category)];
    var title=norm(job.role||job.title);
    if(category==='Video & Creative'&&/graphic|brand design|visual design|production artist|illustrat|packaging/.test(title))return 'Design';
    if(mapped)return mapped;
    // Specific work takes precedence over the broad word engineer/designer.
    var priority=[15,14,3,4,7,6,8,9,10,11,12,0,1,2,5,13];
    for(var i=0;i<priority.length;i++){var group=GROUPS[priority[i]];if(group[2].test(title))return group[0];}
    return category||'Other professional fields';
  }
  function matches(job,selection){return !selection||selection==='all'||norm(field(job))===norm(selection)||norm(job.ind)===norm(selection);}
  function options(jobs){
    var known=GROUPS.map(function(g){return g[0];}),extra=[];
    (jobs||[]).forEach(function(j){var f=field(j);if(known.indexOf(f)<0&&extra.indexOf(f)<0)extra.push(f);});
    var present=new Set((jobs||[]).map(field));
    return [{label:'All career fields',match:'all'}].concat(known.filter(function(f){return present.has(f);}).concat(extra.sort()).map(function(f){return {label:f,match:f};}));
  }
  function searchMatches(job,query,haystack){
    var q=norm(query),hay=norm(haystack===undefined?[job.co,job.role,job.loc,job.state,job.ind].join(' '):haystack);
    if(!q||hay.indexOf(q)>=0)return true;
    if(CONCEPTS[q])return field(job)===CONCEPTS[q];
    // Expand one work concept while keeping every other query word required.
    var keys=Object.keys(CONCEPTS).sort(function(a,b){return b.length-a.length;});
    for(var i=0;i<keys.length;i++){
      var key=keys[i],padded=' '+q+' ',token=' '+key+' ';
      if(padded.indexOf(token)>=0&&field(job)===CONCEPTS[key]){
        var rest=padded.replace(token,' ').trim();
        if(rest.split(/\s+/).filter(Boolean).every(function(word){return hay.indexOf(word)>=0;}))return true;
      }
    }
    return false;
  }
  return {groups:GROUPS.map(function(g){return g[0];}),field:field,matches:matches,options:options,searchMatches:searchMatches};
});
