import {createHash} from 'node:crypto';
import Discovery from './job-discovery.cjs';
import Identity from '../../../js/job-identity.js';
import States from '../../../js/us-states.js';
import Experience from '../../../js/board-experience.js';

export const LIMITS = Object.freeze({query: 160, location: 100, category: 80, page: 25, offset: 10000, sourceMs: 15000, indexMs: 5000, deadlineMs: 7000});
export const NOTICE = 'Listed on StillUnemployed when checked. This is not a fresh employer verification or a guarantee that applications remain open. Confirm details with the employer. Salary filters use overlap with disclosed annual USD ranges and do not guarantee an offer at that pay.';
const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','CDN-Cache-Control':'no-store','Netlify-CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'};
const invalid = message => Object.assign(new Error(message), {apiStatus:400, code:'invalid_request'});
const unavailable = () => new Error('Catalog unavailable');
const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
const fresh = (at, now, age) => Number.isFinite(at) && at <= now + 1000 && now - at <= age;

function reply(status, value, method, extra = {}) {
  return new Response(method === 'HEAD' ? null : JSON.stringify(value), {status, headers:{...headers, ...extra}});
}

export function parseSearch(params) {
  const allowed = new Set(['q','location','work_mode','category','min_salary','max_salary','max_experience','limit','offset','snapshot']);
  for (const key of params.keys()) {
    if (!allowed.has(key) || params.getAll(key).length !== 1) throw invalid('Unknown or repeated search parameter.');
  }
  const text = (key, max) => {
    const value = params.get(key) || '';
    if (value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw invalid('Search text is too long or contains unsupported characters.');
    return value.trim();
  };
  const number = (key, min, max, fallback = null) => {
    if (!params.has(key)) return fallback;
    const raw = params.get(key);
    if (!/^\d{1,7}$/.test(raw) || Number(raw) < min || Number(raw) > max) throw invalid('Invalid ' + key + '.');
    return Number(raw);
  };
  const result = {
    q:text('q', LIMITS.query), location:text('location', LIMITS.location), category:text('category', LIMITS.category),
    work_mode:text('work_mode', 20), min_salary:number('min_salary',0,1000000), max_salary:number('max_salary',0,1000000),
    max_experience:number('max_experience',0,3), limit:number('limit',1,LIMITS.page,10), offset:number('offset',0,LIMITS.offset,0),
    snapshot:text('snapshot',64)
  };
  if (result.work_mode && !['remote','hybrid','onsite'].includes(result.work_mode)) throw invalid('work_mode must be remote, hybrid or onsite.');
  if (result.min_salary !== null && result.max_salary !== null && result.min_salary > result.max_salary) throw invalid('min_salary must not exceed max_salary.');
  if (result.snapshot && !/^[a-f0-9]{64}$/.test(result.snapshot)) throw invalid('Invalid snapshot.');
  if (result.offset && !result.snapshot) throw invalid('Use the snapshot from the first page when requesting another page.');
  return result;
}

export function salaryFacts(raw) {
  const text = String(raw || '');
  const currency = /\$|\bUSD\b/i.test(text) && !/\b(?:CAD|AUD|NZD|HKD|SGD)\b|[€£¥]/i.test(text) ? 'USD' : null;
  const hourly = /\/\s*(?:h|hr|hour)\b|\b(?:hourly|per hour)\b/i.test(text);
  // Complex multi-period, bonus, percentage and up-to figures remain raw.
  const complex = /%|\b(?:bonus|commission|total compensation|up to|month|week|day|project|stipend)\b/i.test(text);
  const annual = currency && !hourly && !complex ? Experience.annualRange(text) : null;
  return {text, currency, period:hourly?'hour':annual?'year':'unknown', min:annual?.min ?? null, max:Number.isFinite(annual?.max)?annual.max:null, open_ended:annual?.max === Infinity};
}

export function minimumExperience(raw) {
  const text = normalize(raw).replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/g, word => String(['zero','one','two','three','four','five','six','seven','eight','nine','ten'].indexOf(word)));
  if (/^(?:none|no experience(?: required)?|0(?: years?)?)$/.test(text)) return 0;
  if (!/^\d+(?:\.\d+)?\s*(?:(?:-|–|—|to)\s*\d+(?:\.\d+)?)?\s*\+?\s*(?:(?:years?|yrs?)(?: of experience)?)?$/.test(text)) return null;
  return Number(text.match(/^\d+(?:\.\d+)?/)[0]);
}

function workMode(job) {
  const text = normalize(job.style);
  if (/\bhybrid\b/.test(text)) return 'hybrid';
  if (/\bon[ -]?site\b|\bin[ -]?person\b/.test(text)) return 'onsite';
  if (/\bremote\b/.test(text)) return 'remote';
  return 'unknown';
}

function locationMatches(job, input) {
  if (!input) return true;
  const value = normalize(input);
  const state = States.normalize(value);
  if (state) return States.extract('', job.loc).includes(state);
  if (['dc','washington dc','washington, dc','district of columbia'].includes(value)) return /\bDC\b|district of columbia/i.test(job.loc);
  if (['nyc','new york city'].includes(value)) return /\bNYC\b|\bNew York(?: City)?(?:,|$)/i.test(job.loc);
  return normalize(job.loc).includes(value);
}

function matches(job, filters) {
  const query = States.searchQuery(filters.q);
  if (query.states.length && !query.states.some(state => locationMatches(job,state))) return false;
  const haystack = normalize([job.role,job.co,job.ind,job.loc,job.style].join(' '));
  if (query.text && !query.text.split(/\s+/).every(word => haystack.includes(word))) return false;
  if (!locationMatches(job, filters.location)) return false;
  if (filters.work_mode && workMode(job) !== filters.work_mode) return false;
  if (filters.category && normalize(job.ind) !== normalize(filters.category)) return false;
  if (filters.min_salary !== null || filters.max_salary !== null) {
    const salary = salaryFacts(job.pay);
    if (salary.period !== 'year' || salary.currency !== 'USD' || salary.min === null) return false;
    if ((salary.max ?? Infinity) < (filters.min_salary ?? 0) || salary.min > (filters.max_salary ?? Infinity)) return false;
  }
  if (filters.max_experience !== null) {
    const years = minimumExperience(job.exp);
    if (years === null || years > filters.max_experience) return false;
  }
  return true;
}

export function validateIndex(index, now) {
  if (index?.schemaVersion !== 1 || !Number.isSafeInteger(index.revision) || index.revision < 0 || !Array.isArray(index.removed) || index.removed.length > 10000 || !fresh(Date.parse(index.checkedAt),now,LIMITS.indexMs)) throw unavailable();
  const keys = new Set(), slugs = new Set();
  for (const record of index.removed) {
    if (!record || !Array.isArray(record.keys) || !record.keys.length || record.keys.length > 64 || record.keys.some(key => typeof key !== 'string' || key.length > 8200 || !/^(?:url:|ats:)/.test(key)) || !Array.isArray(record.slugs) || record.slugs.length > 64 || record.slugs.some(slug => typeof slug !== 'string' || !/^[a-zA-Z0-9_-]{1,300}$/.test(slug))) throw unavailable();
    record.keys.forEach(key=>keys.add(key)); record.slugs.forEach(slug=>slugs.add(slug));
  }
  return {keys,slugs};
}

// Per-instance cache only for the public source. Visibility authorities are read
// anew on every request. An expired source is never returned after a failure.
export function createCatalogCache({load=Discovery.fetchCatalog,now=Date.now}={}) {
  let cached, pending;
  return async () => {
    if (cached && fresh(cached.checkedAt,now(),LIMITS.sourceMs)) return cached;
    if (!pending) pending = Promise.resolve().then(load).then(value => {cached=value;return value;}).finally(()=>{pending=null;});
    return pending;
  };
}

function publicJob(job, detail=false) {
  const board = new URL('https://stillunemployed.com/jobs.html');
  board.searchParams.set('job',Buffer.from(job.link).toString('base64'));
  const value = {id:job.id,title:job.role,company:job.co,location:job.loc,states:States.extract('',job.loc),work_mode:workMode(job),work_mode_text:job.style,category:job.ind,salary:salaryFacts(job.pay),experience:{text:job.exp,minimum_years:minimumExperience(job.exp)},summary:job.summary||'',employer_url:job.link,board_url:board.href,availability:'listed',employer_verified_at:null};
  if (detail) {value.description=job.description||'';value.date_posted_text=job.posted||null;}
  return value;
}

export function createJobsHandler({getCatalog=createCatalogCache(),getModeration,getAvailability,now=Date.now,timeoutMs=LIMITS.deadlineMs}={}) {
  return async (request,context) => {
    const method=request.method;
    if (!['GET','HEAD'].includes(method)) return reply(405,{error:{code:'method_not_allowed',message:'Use GET or HEAD. Only public job discovery is supported.'}},method,{Allow:'GET, HEAD'});
    let timer;
    try {
      const url = new URL(request.url), search = url.pathname === '/api/jobs/search';
      const detail = url.pathname.match(/^\/api\/jobs\/([a-f0-9]{24})$/);
      if (!search && !detail) return reply(404,{error:{code:'not_found',message:'Use the documented jobs API routes.'}},method);
      if (url.href.length > 2048) throw invalid('Request URL is too long.');
      const filters = search ? parseSearch(url.searchParams) : null;
      if (detail && url.search) throw invalid('Job detail does not accept query parameters.');
      if (typeof getModeration !== 'function' || typeof getAvailability !== 'function') throw unavailable();
      const [source,moderation,availability] = await Promise.race([
        Promise.all([getCatalog(),getModeration(context,request),getAvailability(context,request)]),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(unavailable()),timeoutMs);})
      ]);
      const checked = now();
      if (!source || !Array.isArray(source.jobs) || source.jobs.length > 10000 || !fresh(source.checkedAt,checked,LIMITS.sourceMs)) throw unavailable();
      const blocked = [validateIndex(moderation,checked),validateIndex(availability,checked)];
      const ids=new Set();
      const jobs=source.jobs.filter(job=>{
        if (!job || !/^[a-f0-9]{24}$/.test(job.id) || ids.has(job.id) || !/^[a-f0-9]{64}$/.test(job.sourceRevision) || !Array.isArray(job.aliases)) throw unavailable();
        ids.add(job.id);
        const keys=Identity.keys(job.link);
        if (!keys.length) throw unavailable();
        return !blocked.some(index => [job.identity,...keys].some(key=>index.keys.has(key)) || job.aliases.some(slug=>index.slugs.has(slug)));
      }).sort((a,b)=>a.id.localeCompare(b.id));
      const snapshot=createHash('sha256').update(JSON.stringify([jobs.map(job=>[job.id,job.sourceRevision]),moderation.revision,availability.revision])).digest('hex');
      const meta={api_version:'1.0.0',source_checked_at:new Date(source.checkedAt).toISOString(),visibility_checked_at:new Date(Math.min(Date.parse(moderation.checkedAt),Date.parse(availability.checkedAt))).toISOString(),snapshot,notice:NOTICE};
      if (detail) {
        const job=jobs.find(job=>job.id===detail[1]);
        return job ? reply(200,{...meta,job:publicJob(job,true)},method) : reply(404,{error:{code:'job_not_listed',message:'This job is not currently available through StillUnemployed. This does not confirm employer closure.'}},method);
      }
      if (filters.snapshot && snapshot !== filters.snapshot) return reply(409,{error:{code:'catalog_changed',message:'The catalog changed. Restart at offset 0 without a snapshot.'}},method);
      const selected=jobs.filter(job=>matches(job,filters));
      const nextOffset=filters.offset+filters.limit;
      return reply(200,{...meta,total:selected.length,limit:filters.limit,offset:filters.offset,next_offset:nextOffset<selected.length?nextOffset:null,filters,categories:[...new Set(jobs.map(job=>job.ind).filter(Boolean))].sort(),jobs:selected.slice(filters.offset,nextOffset).map(job=>publicJob(job))},method);
    } catch(error) {
      if (error.apiStatus===400) return reply(400,{error:{code:error.code,message:error.message}},method);
      return reply(503,{error:{code:'catalog_unavailable',message:'Current job visibility could not be checked. Retry shortly; do not treat this as an empty catalog or confirmed closure.'}},method,{'Retry-After':'30'});
    } finally {clearTimeout(timer);}
  };
}
