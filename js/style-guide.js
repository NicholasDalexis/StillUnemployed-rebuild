(function (root) {
  'use strict';
  var STORE_KEY = 'su_style_guide_theme';
  var details = {
    original:{intro:'Warm paper, useful notes and a little handwriting. The original look turns the job board into a wall of notes worth keeping.', colors:'Brown-speckled paper sets the canvas. The warm yellow used by high-salary cards also belongs to navigation and primary actions.', note:'One yellow family. Don’t invent a separate yellow for each button.', salary:'Cream, tan, then warm yellow. Featured markers keep the same salary colors.'},
    casino:{intro:'Burgundy felt, gold navigation and a small stack of cards. Casino keeps the board’s handwriting and reading order while changing the atmosphere.', colors:'The whole board sits on burgundy felt. White, green and black salary cards carry the casino palette; gold belongs to navigation and selected highlights.', note:'Felt behind the cards. Gold where it helps someone find the next move.', salary:'White for the low band, green for the middle band, black and gold for the high band. Light ink belongs on the darker cards.'},
    beauty:{intro:'Cream, rose and burgundy. Beauty brings the feel of a dressing table to the same useful, handwritten board.', colors:'A cream canvas carries soft rose light. Pink salary papers deepen into burgundy, with warm gold ink on the high band.', note:'Keep the rose gentle and the important words clear.', salary:'Pale pink, deeper rose, then burgundy with warm gold ink. The salary boundaries stay the same.'},
    girlies:{intro:'Pink paper, hearts and a little extra personality. For the girlies keeps the board’s practical structure and lets the details feel playful.', colors:'A pink canvas and pink navigation surround the notes. The first two salary bands retain the original cream and tan; only the high band becomes hot pink.', note:'Hearts are a detail. The salary and the next step still lead.', salary:'Original cream and tan for the first two bands, hot pink for the high band. The rounded heart stamp is this look’s special detail.'},
    mermaid:{intro:'Pearl notes over moving water. Mermaidcore takes the canvas from pale blue to deep teal without changing the way a job card reads.', colors:'Layered water gradients fill the board. Pearl salary notes become deep teal in the high band, with coral accents and pale text on dark paper.', note:'Let the water move softly. Reduced-motion settings keep it still.', salary:'Two distinct pearl gradients for the first bands; deep teal and pale ink for the high band. Coral Apply text remains tied to its card surface.'},
    bratt:{intro:'A pale lime canvas with bright green energy. bratt uses bold color around the same clear, handwritten notes.', colors:'The canvas is pale lime, not solid neon. Salary papers step from white-lime through pale green to the vivid green high band.', note:'Bright green is the accent. Give the rest of the page room to breathe.', salary:'White-lime, pale green, then bright green. Dark ink keeps the salary visible across all three bands.'},
    blackcat:{intro:'White silk around charcoal notes. Black Cat is quiet, sharp and monochrome, with the same handwriting and card rhythm.', colors:'The canvas stays light with layered silk highlights. The salary cards, rather than the entire page, move through gray, charcoal and black.', note:'Light silk outside. Silver ink on the darker notes.', salary:'Gray, charcoal, then black. Light ink and silver stamps remain readable on these darker salary surfaces.'},
    chess:{intro:'A faint marble checker behind stone and ivory notes. Chess keeps the composition calm and the contrast deliberate.', colors:'The board uses a light marble checker. Stone and warm ivory cards lead to black in the high band; navigation stays black with light ink.', note:'The checker stays in the background. The job stays in the foreground.', salary:'Cool stone, warm ivory, then black. The high band reverses the ink to white without changing the card hierarchy.'}
  };
  function own(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }
  function findTheme(catalog, value) {
    if (typeof value !== 'string' || !own(catalog.aliases, value)) return null;
    var look = catalog.aliases[value];
    return catalog.themes.find(function (theme) { return theme.look === look; }) || null;
  }
  function chooseTheme(catalog, search, storage) {
    var value = new URLSearchParams(search || '').get('theme'), query = findTheme(catalog, value);
    if (query) return query;
    try { return findTheme(catalog, storage && storage.getItem(STORE_KEY)) || catalog.themes[0]; }
    catch (_) { return catalog.themes[0]; }
  }
  function luminance(hex) {
    var match = /^#([0-9a-f]{6})$/i.exec(hex || '');if (!match) return null;
    var values = [0,2,4].map(function (i) { var n=parseInt(match[1].slice(i,i+2),16)/255;return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4); });
    return .2126*values[0]+.7152*values[1]+.0722*values[2];
  }
  function contrast(ink, background) {
    var a=luminance(ink), stops=(background || '').match(/#[0-9a-f]{6}\b/gi);
    if (a===null || !stops || !stops.length) return null;
    return Math.min.apply(null,stops.map(function (stop) { var b=luminance(stop);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05); }));
  }
  function safeInk(ink, background) {
    if (contrast(ink,background)>=4.5) return ink;
    return contrast('#2A2118',background)>=contrast('#FCFAF3',background)?'#2A2118':'#FCFAF3';
  }
  function boardRoute(theme) { return theme.slug==='original'?'/jobs.html':'/jobs/'+theme.slug; }
  function mount(win, doc, catalog) {
    if (!catalog || !catalog.themes || !catalog.themes.length) return null;
    var canvas=doc.getElementById('guide-canvas'), trigger=doc.getElementById('theme-trigger'), dialog=doc.getElementById('guide-theme-dialog');
    if (!canvas || !trigger || !dialog) return null;
    var storage;try { storage=win.localStorage; }catch (_) {}
    var current=chooseTheme(catalog,win.location.search,storage), returnFocus=null, oldOverflow='';
    function setText(id,value) { var el=doc.getElementById(id);if(el)el.textContent=value; }
    function element(tag,className,text) { var el=doc.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el; }
    function canvasStyle(el,theme,animated) {
      ['background-color','background-image','background-size','background-position','background-repeat','animation'].forEach(function (name) { el.style.setProperty(name,theme.canvas[name] || (name==='animation'?'none':'')); });
      if (!animated) el.style.setProperty('animation','none');
    }
    function swatch(title,value,note,style,ink) {
      var figure=element('figure','swatch'), paint=element('div','swatch-color'+(ink?' swatch-pair':''),ink?'Aa · 123':undefined);
      if(typeof style==='object')Object.keys(style).forEach(function(key){paint.style.setProperty(key,style[key]);});else paint.style.background=style;
      if(ink)paint.style.color=ink;paint.setAttribute('aria-hidden','true');figure.appendChild(paint);
      var caption=element('figcaption');caption.appendChild(element('strong','',title));caption.appendChild(element('code','',value));caption.appendChild(element('p','',note));figure.appendChild(caption);return figure;
    }
    function renderArt(theme) {
      if (!theme.art) return;
      var texture=theme.art.texture, preview=doc.getElementById('theme-texture-preview');
      canvasStyle(preview,theme,true);
      setText('theme-texture-name',texture.name);setText('theme-texture-description',texture.description);
      var animation=theme.canvas.animation, duration=animation && animation.match(/(?:^|\s)([\d.]+m?s)(?=\s|$)/);
      setText('theme-texture-motion',animation?'Slow, alternating movement'+(duration?' ('+duration[1]+')':'')+'. Reduced-motion preferences keep this texture still.':'This texture stays still. No movement is needed to give it character.');
      setText('theme-texture-usage',texture.usage);
      setText('theme-icons-intro',theme.look==='original' ? 'The Original look keeps its earlier stick figures. These are three examples from the full set around the board’s notes.' : theme.label+' uses these drawn accents around the board’s notes. They add character while the company, role and next step stay in charge.');
      var icons=doc.getElementById('theme-icon-specimens');icons.textContent='';
      theme.art.icons.forEach(function(icon){
        var figure=element('figure','sheet icon-specimen'), stage=element('div','icon-stage'), drawing=element('div','icon-drawing');
        figure.setAttribute('data-theme-icon',icon.id);canvasStyle(stage,theme,false);stage.style.color=theme.palette.ink;
        stage.setAttribute('aria-hidden','true');
        // These fixed SVGs come only from the shared, generated artwork catalog, never visitor text.
        drawing.innerHTML=icon.svg;stage.appendChild(drawing);figure.appendChild(stage);
        var caption=element('figcaption');caption.appendChild(element('h3','',icon.label));figure.appendChild(caption);icons.appendChild(figure);
      });
    }
    function render(theme,announce) {
      current=theme;var P=theme.palette, info=details[theme.slug], navInk=safeInk(P.navInk,P.navBg);
      canvasStyle(canvas,theme,true);canvas.setAttribute('data-guide-theme',theme.slug);
      doc.body.style.setProperty('--sg-gutter',theme.gutter);canvas.style.setProperty('--sg-canvas-ink',theme.slug==='mermaid'?'#2A2118':P.ink);
      canvas.style.setProperty('--sg-nav-bg',P.navBg);canvas.style.setProperty('--sg-nav-safe-ink',navInk);
      // Use shared dark ink for long guidance on Mermaid's darker lower canvas; swatches retain the source palette.
      setText('theme-eyebrow',theme.label+' look');setText('theme-intro',info.intro);setText('theme-color-intro',info.colors);
      setText('theme-color-note',info.note);setText('theme-type-intro',theme.label);setText('theme-layout-intro',theme.label);setText('theme-salary-note',info.salary);
      setText('theme-footer','StillUnemployed.com · '+theme.label+' look');
      renderArt(theme);
      setText('theme-action-note','The '+theme.label+' action paper keeps its matching ink. These links open this look on the board.');
      doc.querySelectorAll('[data-theme-board-link]').forEach(function(link){link.setAttribute('href',boardRoute(theme));});
      var swatches=doc.getElementById('theme-swatches');swatches.textContent='';
      swatches.appendChild(swatch('Board canvas',theme.canvas['background-color'],info.colors+' See the texture section for its background layers.',theme.canvas));
      swatches.appendChild(swatch('Navigation paper',P.navBg,'The source navigation surface for '+theme.label+'.',P.navBg));
      swatches.appendChild(swatch('Navigation ink',P.navInk,'Pair this ink with its navigation paper.',P.navInk));
      swatches.appendChild(swatch('Board heading ink',P.ink,'Headings on this theme’s canvas. Supporting ink: '+P.sub+'.',P.ink));
      swatches.appendChild(swatch('Accent',P.acc,'Decorative emphasis. Accent ink: '+P.accInk+'.',P.acc));
      ['low','mid','high'].forEach(function(tier){var band=theme.bands[tier];swatches.appendChild(swatch(({low:'Under $80K',mid:'$80–99K',high:'$100K+'})[tier]+' paper',band.background+' · ink '+band.ink,'Apply: '+band.apply+' · Stamp: '+band.stamp+'.',band.background,band.ink));});
      doc.querySelectorAll('[data-salary-band]').forEach(function(card){
        var tier=card.getAttribute('data-salary-band'), band=theme.bands[tier];card.style.background=band.background;card.style.color=band.ink;
        card.querySelector('[data-theme-apply]').style.color=band.apply;
        // This HTML is generated exclusively from the site's own fixed stamp renderer, never URL or visitor input.
        var stamp=card.querySelector('[data-theme-stamp]');stamp.innerHTML=band.stampHTML;stamp.setAttribute('aria-hidden','true');
        card.querySelector('[data-theme-band-value]').textContent=band.background+' · ink '+band.ink+' · Apply '+band.apply;
      });
      doc.querySelectorAll('[data-guide-choice]').forEach(function(button){button.setAttribute('aria-pressed',String(button.getAttribute('data-guide-choice')===theme.slug));});
      if(announce)setText('theme-status',theme.label+' style guide selected.');
    }
    function persist(theme) {
      try { if(storage)storage.setItem(STORE_KEY,theme.slug); }catch (_) {}
      try { var url=new URL(win.location.href);url.searchParams.set('theme',theme.slug);win.history.replaceState(null,'',url.pathname+url.search+url.hash); }catch (_) {}
    }
    function close() { if(dialog.open)dialog.close(); }
    function open() {
      if(typeof dialog.showModal!=='function')return;
      returnFocus=doc.activeElement;oldOverflow=doc.body.style.overflow;dialog.showModal();doc.body.style.overflow='hidden';
      var selected=dialog.querySelector('[aria-pressed="true"]');if(selected)selected.focus();
    }
    var options=doc.getElementById('theme-options');
    catalog.themes.forEach(function(theme){
      var option=element('button','theme-option');option.type='button';option.setAttribute('data-guide-choice',theme.slug);option.setAttribute('aria-pressed','false');canvasStyle(option,theme,false);
      option.appendChild(element('span','theme-option-title',theme.label));var cards=element('span','theme-option-cards');cards.setAttribute('aria-hidden','true');
      ['low','mid','high'].forEach(function(tier){var paper=element('i');paper.style.background=theme.bands[tier].background;cards.appendChild(paper);});option.appendChild(cards);
      var selected=element('span','theme-option-selected','Selected');selected.setAttribute('aria-hidden','true');option.appendChild(selected);
      option.addEventListener('click',function(){render(theme,true);persist(theme);close();});options.appendChild(option);
    });
    if(catalog.motion){var motion=element('style');motion.textContent=catalog.motion;doc.head.appendChild(motion);}
    trigger.hidden=typeof dialog.showModal!=='function';trigger.addEventListener('click',open);doc.getElementById('theme-close').addEventListener('click',close);
    dialog.addEventListener('click',function(event){if(event.target!==dialog)return;var r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();});
    dialog.addEventListener('cancel',function(event){event.preventDefault();close();});
    dialog.addEventListener('close',function(){doc.body.style.overflow=oldOverflow;if(returnFocus&&returnFocus.isConnected&&returnFocus!==doc.body)returnFocus.focus();else trigger.focus();});
    dialog.addEventListener('keydown',function(event){if(event.key!=='Tab')return;var controls=Array.prototype.slice.call(dialog.querySelectorAll('button:not(:disabled)')),first=controls[0],last=controls[controls.length-1];if(!first)return;if(event.shiftKey&&(doc.activeElement===first||!dialog.contains(doc.activeElement))){event.preventDefault();last.focus();}else if(!event.shiftKey&&(doc.activeElement===last||!dialog.contains(doc.activeElement))){event.preventDefault();first.focus();}});
    win.addEventListener('popstate',function(){render(chooseTheme(catalog,win.location.search,storage),false);});
    render(current,false);return { render:render, open:open, close:close, current:function(){return current;} };
  }
  var api=Object.freeze({key:STORE_KEY,findTheme:findTheme,chooseTheme:chooseTheme,contrast:contrast,safeInk:safeInk,boardRoute:boardRoute,mount:mount});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else if(root.document){root.SUStyleGuide=api;mount(root,root.document,root.SUStyleThemes);}
})(typeof window==='undefined'?globalThis:window);
