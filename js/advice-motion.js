/* Small, finite editorial sequences inside the original drawings. No card motion,
 * timers per card, remote assets, storage or telemetry. Static artwork is the fallback. */
(function () {
  'use strict';
  if (!window.IntersectionObserver || !Element.prototype.animate) return;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var states = new Map();
  // [shape indexes, action, start ms, duration ms]. These are authored for the
  // original SVG's top-level parts, not a generic stagger over the whole card.
  var stories = {
    'first-come': [[[0,1,2],'arrive',0,600],[[3],'draw',600,550],[[4],'arrive',1100,550],[[5],'draw',1650,700]],
    'ghosted': [[[0,1],'send',0,1000],[[2],'draw',800,550],[[3],'draw',1300,1000],[[4,5,6],'reveal',2300,350]],
    'manifesting': [[[0],'draw',0,600],[[1],'arrive',500,600],[[2],'draw',1100,1800]],
    'canva-resume': [[[0,1],'arrive',0,600],[[2],'draw',650,550],[[3],'arrive',1100,600],[[4],'draw',1650,1400]],
    'follow-up': [[[0],'arrive',0,650],[[1],'reveal',650,400],[[2],'reveal',1200,400],[[3],'reveal',1750,400],[[4],'draw',2200,550]],
    'show-dont-ask': [[[2,3],'arrive',0,700],[[0],'draw',500,900],[[1],'draw',1400,1100]],
    'not-linkedin': [[[0],'draw',0,1700],[[1],'reveal',900,400],[[2],'reveal',1600,400],[[3],'draw',2000,600]],
    'cold-referral': [[[0,1,2],'arrive',0,650],[[3],'draw',650,600],[[4,5],'send',1100,1000],[[6],'draw',2100,500]],
    'linkedin-dms': [[[0,1,2],'arrive',0,800],[[5],'draw',900,550],[[3,4],'reply',1500,800]],
    'resume-layout': [[[0],'arrive',0,650],[[1],'draw',650,1700],[[2],'draw',2200,700]],
    'wish-list': [[[0,1],'arrive',0,600],[[2],'draw',600,700],[[3,4],'reply',1200,600],[[5],'draw',1800,700],[[6],'draw',2550,650]],
    'volume-trap': [[[0,1,2,3,4],'arrive',0,750],[[5],'draw',750,550],[[6,7],'reply',1300,650],[[8],'draw',1850,700],[[9],'draw',2550,900],[[10],'reveal',3200,400]],
    'keyword-stuffing': [[[0,1,2,3],'arrive',0,600],[[4],'draw',650,500],[[5,6],'reply',1150,650],[[7],'draw',1800,900],[[8],'draw',2700,600]],
    'major-cage': [[[0,1],'arrive',0,650],[[2],'draw',650,1100],[[3,6],'reply',1300,550],[[4,7],'reply',1850,550],[[5,8],'reply',2400,550]],
    'experience-internship': [[[0,1,2,3],'arrive',0,700],[[4],'draw',700,600],[[5],'reply',1300,600],[[6],'draw',1850,1300]],
    'experience-campus': [[[0],'draw',0,1200],[[1],'draw',1200,650],[[2,3],'reply',1850,550],[[4],'draw',2400,850]],
    'experience-ambassador': [[[0,1,2],'arrive',0,650],[[3],'draw',650,700],[[4,5],'reply',1250,650],[[6,7],'reply',2050,650]],
    'experience-honest-dates': [[[0,2],'arrive',0,700],[[1,3],'arrive',850,700],[[4],'draw',1550,800],[[5],'draw',2350,600],[[6],'reveal',2950,450]],
    'experience-read-requirement': [[[0,1],'arrive',0,600],[[2],'draw',600,700],[[3,4,5,6],'inspect',1250,1800]],
    'experience-graduation': [[[0],'draw',0,950],[[1,2],'reply',950,700],[[3],'draw',1650,1100],[[4],'draw',2750,650]]
  };
  function animate(state, node, frames, delay, duration) {
    var anim = node.animate(frames, {delay:delay,duration:duration,easing:'cubic-bezier(.22,.65,.3,1)',fill:'both',iterations:1});
    state.animations.push(anim);
    // Return to the unmodified static drawing, with no retained animation layers.
    anim.finished.then(function () { anim.cancel(); }, function () {});
  }
  function draw(state, node, delay, duration) {
    var paths = node.matches('path,rect,circle,line,polyline,polygon') ? [node] : Array.from(node.querySelectorAll('path,rect,circle,line,polyline,polygon'));
    paths.forEach(function (shape, i) {
      if (!shape.getTotalLength || getComputedStyle(shape).stroke === 'none') return;
      var length = shape.getTotalLength();
      if (!Number.isFinite(length) || !length) return;
      animate(state,shape,[{strokeDasharray:length+' '+length,strokeDashoffset:length},{strokeDasharray:length+' '+length,strokeDashoffset:0}],delay+i*60,Math.max(200,duration-i*60));
    });
  }
  function prepare(el) {
    var root = el.querySelector('.su-advice-illustration svg > g');
    var story = stories[el.dataset.adviceMotion];
    var state = {el:el,animations:[],played:false,groups:[]};
    if (root && story) {
      var parts = Array.from(root.children);
      story.forEach(function (step) {
        var nodes = step[0].map(function (i) {return parts[i];}).filter(Boolean);
        if (!nodes.length) return;
        var group = document.createElementNS('http://www.w3.org/2000/svg','g');
        root.insertBefore(group,nodes[0]);
        nodes.forEach(function (node) {group.appendChild(node);});
        state.groups.push({node:group,action:step[1],delay:step[2],duration:step[3]});
      });
    }
    return state;
  }
  function play(state) {
    if (state.played || reduced.matches || document.hidden) return;
    if (!state.prepared) {
      state.groups=prepare(state.el).groups;state.prepared=true;
    }
    state.played=true;
    state.groups.forEach(function (part) {
      var node=part.node, delay=part.delay, duration=part.duration;
      if(part.action==='draw') return draw(state,node,delay,duration);
      var frames;
      if(part.action==='send') frames=[{transform:'translate(-24px, 9px)',opacity:0},{transform:'translate(-6px, 0)',opacity:1,offset:.65},{transform:'translate(0, 0)',opacity:1}];
      else if(part.action==='inspect') frames=[{transform:'translate(-58px, 10px)',opacity:0},{transform:'translate(-38px, 8px)',opacity:1,offset:.25},{transform:'translate(0, 0)',opacity:1}];
      else if(part.action==='reply') frames=[{transform:'translate(18px, 0)',opacity:0},{transform:'translate(0, 0)',opacity:1}];
      else if(part.action==='arrive') frames=[{transform:'translate(0, 12px)',opacity:0},{transform:'translate(0, 0)',opacity:1}];
      else frames=[{opacity:0},{opacity:1}];
      animate(state,node,frames,delay,duration);
    });
    // Preserve the four original multi-SVG drawings. Trace the calendar's actual
    // three break days; follow the board loop; draw the figures and experience marks.
    if(!state.groups.length) {
      var id=state.el.dataset.adviceMotion;
      var shapes=Array.from(state.el.querySelectorAll('svg path,svg circle'));
      shapes.forEach(function (shape,i) {
        var delay=id==='board-trap'?Math.floor(i/2)*850:i*160;
        draw(state,shape,delay,id==='board-trap'?700:650);
      });
    }
  }
  function settle(state) {state.animations.forEach(function (a) {a.cancel();});state.animations=[];}
  var observer=new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var state=states.get(entry.target);if(!state)return;
      if(entry.isIntersecting && entry.intersectionRatio>=.45)play(state);
      else settle(state);
    });
  },{threshold:[0,.45]});
  function add(root) {
    if(root.nodeType!==1)return;
    var cards=root.matches('[data-advice-motion]')?[root]:Array.from(root.querySelectorAll('[data-advice-motion]'));
    cards.forEach(function (el) {if(states.has(el))return;states.set(el,{el:el,animations:[],played:false,prepared:false,groups:[]});observer.observe(el);});
  }
  function start() {
    add(document.body);
    // Only inspect added subtrees, never rescan the whole board during typing.
    new MutationObserver(function (changes) {
      changes.forEach(function (change) {change.addedNodes.forEach(add);});
      states.forEach(function (state,el) {if(!el.isConnected){settle(state);observer.unobserve(el);states.delete(el);}});
    }).observe(document.body,{childList:true,subtree:true});
  }
  reduced.addEventListener('change',function () {if(reduced.matches)states.forEach(settle);});
  document.addEventListener('visibilitychange',function () {if(document.hidden)states.forEach(settle);});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}());
