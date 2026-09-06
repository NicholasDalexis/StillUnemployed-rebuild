(function(){
  'use strict';
  var host=document.getElementById('experience-advice-specimens');
  if(!host||!window.SUAdviceContent||!window.SUAdviceArt)return;
  function text(tag,cls,value){var e=document.createElement(tag);e.className=cls;e.textContent=value;return e;}
  window.SUAdviceContent.additions.slice(0,2).forEach(function(note){
    var card=document.createElement('details');card.className='su-advice-card';
    var front=document.createElement('summary');front.className='su-advice-front';
    front.appendChild(text('span','su-advice-eyebrow','note to self · experience'));
    front.appendChild(text('span','su-advice-hook',note.hook));
    var art=document.createElement('span');art.innerHTML=window.SUAdviceArt.html(note.id,false);front.appendChild(art);
    front.appendChild(text('span','su-advice-cta',note.cta+' →'));card.appendChild(front);
    var back=document.createElement('div');back.className='su-advice-back';
    if(typeof note.why==='string')back.appendChild(text('p','',note.why));
    else {back.appendChild(text('p','',note.why.intro));var list=document.createElement('ul');note.why.bullets.forEach(function(b){list.appendChild(text('li','',b));});back.appendChild(list);back.appendChild(text('p','',note.why.outro));}
    card.appendChild(back);host.appendChild(card);
  });
}());
