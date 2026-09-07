/* Topic drawings for advice notes. Original SVG paths, no remote assets or user input. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SUAdviceArt=api;}(typeof window!=='undefined'?window:this,function(){
  'use strict';
  var ink='#2A2118',accent='#B14D28';
  function path(d,color){return '<path d="'+d+'" stroke="'+(color||ink)+'"/>';}
  function label(x,y,text,size){return '<text x="'+x+'" y="'+y+'" fill="'+ink+'" stroke="none" text-anchor="middle" font-family="Indie Flower, cursive" font-size="'+(size||14)+'">'+text+'</text>';}
  function paper(x,y,w,h,rot){return '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="2" fill="#FFFEF9" stroke="'+ink+'" transform="rotate('+(rot||0)+' '+(x+w/2)+' '+(y+h/2)+')"/>';}
  function arrow(x,y){return path('M'+x+' '+y+' q14 -4 28 0 m-8 -6 8 6 -8 6',accent);}
  var drawings={
    'first-come': paper(16,15,48,65,-5)+label(40,42,'new')+label(40,61,'role')+arrow(75,50)+paper(122,17,51,65,4)+path('M135 49 l9 9 16 -23',accent),
    'ghosted': paper(12,22,56,50,-4)+path('M17 28 l23 20 22 -20')+arrow(78,49)+path('M124 75 Q119 24 146 21 Q172 25 170 75 l-8 -7 -8 7 -8 -7 -8 7 -7 -7 -7 7')+'<circle cx="139" cy="43" r="2" fill="'+ink+'"/><circle cx="156" cy="43" r="2" fill="'+ink+'"/>'+path('M140 56 q7 5 13 -1'),
    'manifesting': path('M25 19 v17 m-8 -9 h16 M47 9 v12 m-6 -6 h12',accent)+paper(74,12,98,76,3)+path('M87 31 l5 5 9 -11 M87 52 l5 5 9 -11 M107 31 h45 M107 52 h39 M86 72 h58'),
    'canva-resume': paper(24,12,64,76,-4)+path('M35 27 h42 M35 42 h14 M58 42 h17 M35 53 h14 M58 53 h17 M35 67 h39')+arrow(93,50)+paper(131,13,48,73,3)+path('M139 28 h28 M139 40 h28 M139 51 h23 M139 63 h27 M139 74 h18',accent),
    'follow-up': paper(34,8,116,80,-3)+label(91,29,'thank you')+label(91,51,'one detail')+label(91,73,'next steps?')+path('M14 31 l10 0 M160 56 l13 0 M155 74 l13 6',accent),
    'show-dont-ask': path('M25 38 h20 l34 -20 v60 l-34 -20 H25 Z M42 59 l8 26 h14 l-9 -20')+path('M94 29 l20 -10 M99 48 h27 M94 66 l20 12',accent)+paper(137,19,38,61,4)+path('M145 32 h21 M145 45 h21 M145 59 h16'),
    'not-linkedin': path('M95 91 V62 Q96 50 58 36 L42 21 M96 62 Q96 49 139 35 L157 18 M34 28 l8 -8 10 3 M147 17 l11 0 0 11')+label(41,63,'one route')+label(148,63,'more doors')+path('M139 33 l18 -15',accent),
    'cold-referral': paper(15,18,53,63,-5)+label(42,43,'your')+label(42,61,'work')+arrow(75,49)+paper(117,26,65,47,3)+path('M122 32 l28 23 27 -22')+path('M150 11 v8 M179 14 l-5 7',accent),
    'linkedin-dms': paper(14,13,108,55,-3)+label(67,36,'I saw your work…',13)+path('M29 66 l-5 13 22 -10')+paper(106,62,74,30,3)+label(143,82,'tell me more',12)+path('M134 48 h39',accent),
    'resume-layout': paper(50,7,86,85,-3)+path('M63 23 h44 M63 35 h57 M63 47 h52 M63 59 h56 M63 71 h49 M63 83 h35')+path('M25 30 h14 m-6 -6 6 6 -6 6 M147 64 h22 m-6 -6 6 6 -6 6',accent),
    'wish-list': paper(13,14,79,77,-4)+label(52,36,'required',13)+path('M27 49 h9 v9 h-9 Z M45 53 h32 M27 69 h9 v9 h-9 Z M45 73 h27')+paper(106,16,80,76,3)+label(146,38,'preferred',13)+path('M120 53 h9 v9 h-9 Z M138 57 h32 M120 71 h9 v9 h-9 Z M138 75 h26')+path('M39 99 q54 -7 115 -1',accent),
    'volume-trap': paper(20,16,54,66,5)+paper(15,12,54,66,1)+paper(10,8,54,66,-4)+label(38,31,'base',13)+path('M22 42 h28 M22 53 h28 M22 64 h20')+arrow(81,44)+paper(123,11,60,70,3)+label(153,33,'tailored',12)+path('M135 44 h33 M135 56 h30')+path('M139 67 q12 -5 28 -1 M168 93 l17 -24 6 5 -18 23 -8 4 Z',accent)+label(58,97,'a little extra care',12),
    'keyword-stuffing': paper(10,17,76,72,-3)+label(48,38,'skills skills',12)+label(48,54,'skills skills',12)+label(48,70,'skills skills',12)+arrow(91,48)+paper(133,17,56,72,3)+label(161,39,'my work',12)+path('M143 50 h35 M143 63 h31 M143 76 h33')+path('M141 65 q18 -3 38 -1',accent),
    'major-cage': paper(12,33,59,34,-4)+label(41,55,'your major',12)+path('M77 49 Q99 49 112 22 M77 49 h36 M77 49 Q99 49 113 78',accent)+paper(121,8,62,25,3)+paper(121,40,62,25,-2)+paper(121,73,62,25,2)+label(152,26,'social',13)+label(152,58,'brand',13)+label(152,91,'content',13),
    'experience-internship': paper(15,12,62,78,-5)+path('M31 12 v-5 h29 v6')+label(46,47,'INTERN',15)+path('M31 64 h31')+arrow(85,48)+paper(128,18,51,65,3)+path('M138 35 h29 M138 49 h29 M138 65 l8 6 15 -18',accent),
    'experience-campus': path('M11 35 l39 -25 39 25 H11 M23 37 v43 M42 37 v43 M59 37 v43 M78 37 v43 M14 82 h74')+arrow(94,49)+paper(137,17,43,68,3)+label(157,39,'work',13)+path('M146 49 h24 M146 61 h21 M146 73 h25',accent),
    'experience-ambassador': paper(8,20,50,65,-5)+label(33,45,'brand',13)+label(33,62,'rep',13)+path('M71 36 h24 M71 69 h24',accent)+paper(106,9,34,69,4)+path('M113 24 h19 v26 h-19 Z M120 65 h6')+paper(149,46,39,42,-3)+label(168,72,'event',11),
    'experience-honest-dates': label(42,21,'role A',13)+label(42,52,'role B',13)+paper(79,6,102,24,-1)+paper(79,38,102,24,1)+path('M112 7 v22 M146 7 v22 M112 39 v22 M146 39 v22')+path('M80 72 v7 h101 v-7',accent)+label(130,96,'same three months',12),
    'experience-read-requirement': paper(9,13,102,72,-3)+label(60,36,'required',13)+path('M24 49 h68 M24 64 h52')+'<circle cx="139" cy="40" r="23" stroke="'+accent+'"/>'+path('M155 58 l27 25',accent)+label(140,38,'full',12)+label(140,52,'time?',12),
    'experience-graduation': paper(13,17,71,70,-4)+label(48,43,'degree',15)+label(48,64,'school',15)+arrow(91,49)+paper(126,17,64,59,3)+label(158,41,'true date',12)+label(158,58,'+ your work',11)+path('M135 76 l-4 10 16 -10',accent)
  };
  function has(id){return Object.prototype.hasOwnProperty.call(drawings,id);}
  function html(id,big){
    if(!has(id))return '';
    return '<div class="su-advice-illustration" data-advice-illustration="'+id+'" style="margin:16px auto 2px;width:100%;max-width:'+(big?'250':'220')+'px;pointer-events:none;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 108" width="200" height="108" aria-hidden="true" focusable="false" style="display:block;width:100%;height:auto;overflow:visible"><g fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'+drawings[id]+'</g></svg></div>';
  }
  return {html:html,has:has,ids:Object.keys(drawings)};
}));
