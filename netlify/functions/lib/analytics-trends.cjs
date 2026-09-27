'use strict';
const DAY=86400000;
// Retain totals, not visitor/session identifiers or written preferences.
// Daily distinct identities are not an all-time count of people.
function date(at){return new Date(at).toISOString().slice(0,10);}
function ref(d,at=d.now()){return d.db.doc('suAnalyticsDaily/'+date(at));}
function add(old,events,at,previous={},session){
  const day=date(at),counts={...(old?.counts||{})},sources={...(old?.sources||{})};
  const seen=previous.date===day?{...previous,sessions:[...(previous.sessions||[])]}:{date:day,sessions:[],visited:false};
  const value={date:day,at:Date.parse(day+'T00:00:00Z'),counts,sources,visitors:old?.visitors||0,visits:old?.visits||0,startedAt:old?.startedAt||at,updatedAt:at,expiresAt:new Date(at+400*DAY)};
  if(events.length&&session&&!seen.visited){value.visitors++;seen.visited=true;}
  for(const e of events){counts[e.name]=(counts[e.name]||0)+1;if(e.name==='page_view'&&session&&!seen.sessions.includes(session)){value.visits++;seen.sessions.push(session);if(seen.sessions.length>300)seen.sessions.shift();sources[e.source||'direct']=(sources[e.source||'direct']||0)+1;}}
  return {value,seen};
}
module.exports={date,ref,add};
