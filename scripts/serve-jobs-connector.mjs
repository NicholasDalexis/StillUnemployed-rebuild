// Local review only. Never expose a directory server or use private credentials.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createJobsHandler} from '../netlify/functions/lib/jobs-api.mjs';
import {openapi} from '../netlify/functions/lib/jobs-openapi.mjs';

const origin='https://stillunemployed.com';
export async function readPublicIndex(path,fetchImpl=fetch) {
  if (!['/api/job-moderation','/api/job-availability'].includes(path)) throw Error('Unsupported index');
  const url=origin+path;
  const response=await fetchImpl(url,{redirect:'error',cache:'no-store',credentials:'omit',headers:{Accept:'application/json','Cache-Control':'no-cache'},signal:AbortSignal.timeout(5000)});
  if (!response.ok || (response.url && response.url !== url) || !(response.headers.get('content-type')||'').startsWith('application/json')) throw Error('Index unavailable');
  if (Number(response.headers.get('content-length')) > 4194304) throw Error('Index too large');
  const reader=response.body.getReader(),parts=[];let size=0;
  try {for (;;) {const {done,value}=await reader.read();if (done) break;size+=value.byteLength;if (size>4194304) {await reader.cancel();throw Error('Index too large');} parts.push(value);}}
  finally {reader.releaseLock();}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));
}

export function createReviewServer({handler=createJobsHandler({getModeration:()=>readPublicIndex('/api/job-moderation'),getAvailability:()=>readPublicIndex('/api/job-availability')})}={}) {
  const files=new Map([
    ['/', ['connector-review/index.html','text/html; charset=utf-8']],
    ['/review.js',['connector-review/review.js','text/javascript; charset=utf-8']],
    ['/review.css',['connector-review/review.css','text/css; charset=utf-8']],
    ['/css/brand.css',['../css/brand.css','text/css; charset=utf-8']],
    ['/css/fonts.css',['../css/fonts.css','text/css; charset=utf-8']]
  ]);
  return http.createServer(async(req,res)=>{
    try {
      const localOrigin='http://127.0.0.1:'+serverPort(req);
      // A foreign Host, Origin or browser fetch-site cannot reach the local adapter.
      if (!['127.0.0.1:'+serverPort(req),'localhost:'+serverPort(req)].includes(req.headers.host) || (req.headers.origin && ![localOrigin,localOrigin.replace('127.0.0.1','localhost')].includes(req.headers.origin)) || (req.headers['sec-fetch-site'] && !['none','same-origin'].includes(req.headers['sec-fetch-site']))) {res.writeHead(403);res.end();return;}
      const url=new URL(req.url,localOrigin);
      if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
      let response;
      if (url.pathname==='/api/jobs/openapi.json') response=new Response(JSON.stringify({...openapi,servers:[{url:localOrigin,description:'Loopback experiment using live public production data.'}]}),{headers:{'Content-Type':'application/json'}});
      else if (url.pathname.startsWith('/api/jobs/')) response=await handler(new Request(url,{method:req.method}));
      else {
        let file=files.get(url.pathname);
        if (/^\/assets\/fonts\/(?:archivo|archivo-black|indie-flower|lexend)\/[a-zA-Z0-9_.-]+\.(?:woff2?|ttf)$/.test(url.pathname)) file=['..'+url.pathname,'font/'+(url.pathname.endsWith('.ttf')?'ttf':'woff2')];
        if (!file) response=new Response('Not found',{status:404});
        else response=new Response(await readFile(new URL(file[0],import.meta.url)),{headers:{'Content-Type':file[1]}});
      }
      const headers=Object.fromEntries(response.headers);
      headers['Cache-Control']='no-store';headers['X-Content-Type-Options']='nosniff';headers['Referrer-Policy']='no-referrer';
      headers['Content-Security-Policy']="default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
      res.writeHead(response.status,headers);res.end(req.method==='HEAD'?undefined:Buffer.from(await response.arrayBuffer()));
    } catch {res.writeHead(503,{'Content-Type':'text/plain','Cache-Control':'no-store'});res.end('The local review is unavailable. Retry shortly.');}
  });
}
const serverPort=req=>req.socket.localPort;
if (process.argv[1]===fileURLToPath(import.meta.url)) {
  const port=Number(process.env.CONNECTOR_REVIEW_PORT||8791);
  if (!Number.isSafeInteger(port) || port<1024 || port>65535) throw Error('Invalid review port');
  const server=createReviewServer();server.listen(port,'127.0.0.1',()=>console.log('StillUnemployed connector review: http://127.0.0.1:'+port));
}
