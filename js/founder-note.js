/* One About Nic note shared by board and tracker. */
(function(global){
'use strict';
function html(){return '<div class="su-founder-overlay" data-act="closeModal" style="position: fixed; inset: 0; z-index: 200; background: rgba(44,33,24,0.58); display: flex; align-items: flex-start; justify-content: center; padding: 24px; overflow-y: auto; -webkit-overflow-scrolling: touch;">' +
          '<div class="su-founder-note" data-act="stop" style="margin: auto;width: 588px; max-width: 100%; background: #FCFAF3; border-radius: 5px; position: relative; box-shadow: 0 40px 90px rgba(44,33,24,0.4); transform: rotate(-0.8deg); font-family: var(--su-body);">' +
            '<div style="position: absolute; top: -13px; left: 66px; width: 122px; height: 30px; background: rgba(228,202,128,0.72); transform: rotate(-4deg); box-shadow: 0 2px 5px rgba(44,33,24,0.14); z-index: 5;"></div>' +
            '<div style="position: absolute; top: -12px; right: 62px; width: 122px; height: 30px; background: rgba(228,202,128,0.72); transform: rotate(3.5deg); box-shadow: 0 2px 5px rgba(44,33,24,0.14); z-index: 5;"></div>' +
            '<button type="button" data-act="closeModal" aria-label="Close founder note" style="border:0; padding:0; position: absolute; top: 20px; right: 20px; width: 38px; height: 38px; border-radius: 50%; background: rgba(252,250,243,0.94); display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 8; box-shadow: 0 2px 8px rgba(44,33,24,0.2);">' +
              '<svg class="su-close-icon" color="#5C4033" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"></path></svg>' +
            '</button>' +
            '<div class="su-founder-image-wrap" style="padding: 16px 16px 0;">' +
              '<div class="su-founder-image" style="position: relative; height: 244px; overflow: hidden; border-radius: 3px; box-shadow: inset 0 0 0 1px rgba(44,33,24,0.06);">' +
                '<img src="assets/home-founder-nic.jpg" alt="Nic on SiriusXM" style="width: 100%; height: 100%; object-fit: cover; object-position: 50% 22%; filter: saturate(1.04) brightness(1.02);">' +
                '<div style="position: absolute; bottom: 14px; left: 14px; display: inline-flex; align-items: center; gap: 6px; border: 2.6px solid #FFFFFF; color: #FFFFFF; border-radius: 5px; padding: 5px 10px; font-family: var(--su-body); font-weight: 900; font-size: 11.5px; letter-spacing: 0.14em; transform: rotate(-3deg); box-shadow: 0 2px 10px rgba(0,0,0,0.28);">' +
                  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="flex: none;"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.4"></circle><path d="M8.3 12.2l2.4 2.4 4.9-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>' +
                  'THE REAL ONE' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="su-founder-copy" style="padding: 22px 42px 40px;">' +
              '<div class="su-founder-hello" style="font-family: \'Indie Flower\', cursive; font-weight: 700; font-size: 23px; color: #D8502E; transform: rotate(-1.5deg); display: block;">hey stranger,</div>' +
              '<div style="position: relative; display: block; margin-top: 4px;">' +
                '<div class="su-founder-title" style="font-family: \'Archivo Black\', sans-serif; font-weight: 900; font-size: 32px; line-height: 1.06; letter-spacing: -0.02em; color: #2C2118; width: 300px;">Hey, I\'m Nic. I built this.</div>' +
                '<svg width="220" height="12" viewBox="0 0 220 12" fill="none" style="position: absolute; left: 4px; bottom: -8px;"><path d="M3 7 C 55 2, 120 2, 217 6" stroke="#F2C231" stroke-width="4" stroke-linecap="round"></path></svg>' +
              '</div>' +
              '<div class="su-founder-bio" style="font-size: 15.5px; line-height: 1.62; color: #3a3026; font-weight: 500; margin-top: 18px;">I sent <strong style="font-weight: 800; color: #2C2118;">1,500 applications</strong> and got ghosted more times than I can count. Seven months later, <strong style="font-weight: 800; color: #2C2118;">Instagram</strong> said yes. <strong style="font-weight: 800; color: #2C2118;">StillUnemployed</strong> is the board I wish I\'d had. Find roles with salary information, save the ones that fit and keep your applications together.</div>' +
              '<div class="su-founder-credit" style="font-size: 13px; font-weight: 600; color: #6f6253; letter-spacing: 0.01em; margin-top: 18px;">Content Specialist at Instagram · Class of 2025</div>' +
              '<div class="su-founder-actions" style="display: flex; align-items: center; gap: 16px; margin-top: 22px; flex-wrap: wrap;">' +
                '<a href="https://NicholasAlexis.com" target="_blank" rel="noopener" style="display: inline-flex; align-items: center; gap: 11px; background: #5C4033; color: #F4EEE2; font-size: 16px; font-weight: 700; padding: 15px 26px; border-radius: 12px; cursor: pointer; box-shadow: 0 10px 24px rgba(44,33,24,0.22); text-decoration: none; transform: rotate(-1deg); font-family: var(--su-body);">View My Portfolio' +
                  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="#F4EEE2" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>' +
                '</a>' +
                '<div style="font-family: \'Indie Flower\', cursive; font-size: 22px; color: #6F5E45; transform: rotate(-2deg);">- Nic</div>' +
              '</div>' +
              '<div class="su-founder-release"><a href="/versions.html" data-su-version>Version history</a></div>' +
            '</div>' +
          '</div>' +
        '</div>';}
function open(trigger){
 var dialog=document.getElementById('su-tracker-founder');
 if(!dialog){dialog=document.createElement('dialog');dialog.id='su-tracker-founder';dialog.className='su-tracker-founder';dialog.setAttribute('aria-label','About Nic');dialog.innerHTML=html();document.body.appendChild(dialog);dialog.addEventListener('click',function(event){var target=event.target.closest('[data-act]');if(target&&target.getAttribute('data-act')==='closeModal')dialog.close();});dialog.addEventListener('close',function(){if(dialog._trigger&&dialog._trigger.isConnected)dialog._trigger.focus({preventScroll:true});});}
 dialog._trigger=trigger;dialog.showModal();dialog.querySelector('[data-act="closeModal"][style*="absolute"]').focus({preventScroll:true});
}
global.SUFounderNote={html:html,open:open};
})(window);
