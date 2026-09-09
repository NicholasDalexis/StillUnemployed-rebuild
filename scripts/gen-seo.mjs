/* Finalize the public artifact, never the source checkout. Discovery metadata
 * must describe the current public pages, not snapshots of individual jobs. */
import { readFileSync, writeFileSync, readdirSync, existsSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ORIGIN = 'https://stillunemployed.com';
export const PAGES = Object.freeze({
  'index.html': { path:'/', title:'StillUnemployed.com | Early-career jobs, with salary up front', description:'A free US job board for early-career creative, marketing, design and technology roles. Compare pay, save jobs and organize your applications.' },
  'jobs.html': { path:'/jobs', title:'Browse creative, marketing and design jobs | StillUnemployed.com', description:'Browse US roles with disclosed pay, including creative, marketing, design and technology work. Filter the board and apply on the employer’s website.' },
  'internships.html': { path:'/internships', title:'Internships and student opportunities | StillUnemployed.com', description:'Explore internships and student opportunities with clear pay labels, program timing and eligibility details. See the employer’s full requirements before applying.' },
  'about.html': { path:'/about', title:'How this job board works | StillUnemployed.com', description:'What StillUnemployed covers, how pay and job summaries are presented, and what to check with the employer before applying.' },
  'versions.html': { path:'/versions', title:'Version history | StillUnemployed.com', description:'What has changed on StillUnemployed.com, one release at a time.' },
  'privacy.html': { path:'/privacy' },
  'terms.html': { path:'/terms' },
});
const PRIVATE = new Set(['tracker.html','analytics.html','suggest.html','style-guide.html','404.html']);
const escape = value => String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const attr = (tag, name) => { const match = tag.match(new RegExp('\\b'+name+'\\s*=\\s*(["\'])(.*?)\\1','i'));return match ? match[2].toLowerCase() : ''; };

export function pagePolicy(relative, production) {
  const page = PAGES[relative];
  const theme = /^jobs\/[a-z0-9-]+\/index\.html$/.test(relative);
  const internshipShare = /^j\/internships\/[a-z0-9-]+\/[a-z0-9]+\.html$/.test(relative);
  const share = internshipShare || /^j\/[a-z0-9-]+\/[a-z0-9]+\.html$/.test(relative);
  const canonical = page ? ORIGIN+page.path : internshipShare ? ORIGIN+'/internships' : theme || share ? ORIGIN+'/jobs' : '';
  return { page, canonical, robots:!production || PRIVATE.has(relative) || share || (!page && !theme) ? 'noindex, nofollow' : 'index, follow, max-image-preview:large' };
}

export function htmlMetadata(html, relative, production) {
  const policy = pagePolicy(relative, production);
  if (!/<head\b[^>]*>[\s\S]*?<\/head\s*>/i.test(html)) throw Error('SEO requires a complete HTML head: '+relative);
  return html.replace(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i, (whole, original) => {
    let head = original.replace(/\s*<!-- SU SEO START -->[\s\S]*?<!-- SU SEO END -->/g,'')
      .replace(/<link\b[^>]*>/gi, tag => attr(tag,'rel').split(/\s+/).includes('canonical') ? '' : tag)
      .replace(/<meta\b[^>]*>/gi, tag => ['robots','googlebot','bingbot'].includes(attr(tag,'name')) ? '' : tag)
      .replace(/<script\b[^>]*data-su-seo[^>]*>[\s\S]*?<\/script\s*>/gi, '');
    if (policy.page?.title) head = head.replace(/<title\b[^>]*>[\s\S]*?<\/title\s*>/i, '<title>'+escape(policy.page.title)+'</title>');
    let metadata = '\n  <!-- SU SEO START -->';
    if (policy.page?.description) {
      head = head.replace(/<meta\b[^>]*>/gi, tag => attr(tag,'name') === 'description' ? '' : tag);
      metadata += '\n  <meta name="description" content="'+escape(policy.page.description)+'">';
    }
    if (policy.canonical) metadata += '\n  <link rel="canonical" href="'+policy.canonical+'">';
    metadata += '\n  <meta name="robots" content="'+policy.robots+'">';
    // WebSite describes this public property. No job, review, rating, salary or
    // publication-date schema is inferred from a list or an abbreviated summary.
    if (relative === 'index.html') metadata += '\n  <script type="application/ld+json" data-su-seo>'+JSON.stringify({ '@context':'https://schema.org', '@type':'WebSite', name:'StillUnemployed.com', url:ORIGIN+'/', description:policy.page.description }).replace(/</g,'\\u003c')+'</script>';
    return '<head>'+head.trimEnd()+metadata+'\n  <!-- SU SEO END -->\n</head>';
  });
}

export function robots(production) {
  // Allow crawlers to read preview noindex directives. A robots Disallow by
  // itself can leave a URL indexed, and neither mechanism is authentication.
  const groups = ['*','OAI-SearchBot','Claude-SearchBot'].map(agent => 'User-agent: '+agent+'\nAllow: /\nDisallow: /__/\nDisallow: /.netlify/').join('\n\n');
  return '# Search access is separate from model-training access.\n# Training crawlers retain the general policy; no training-specific rule is added.\n'+groups+'\n'+(production ? '\nSitemap: '+ORIGIN+'/sitemap.xml\n' : '\n# Preview pages send noindex in both HTML and response headers.\n');
}

export function sitemap(production, available) {
  const urls = production ? Object.keys(PAGES).filter(name => available.has(name)).map(name => ORIGIN+PAGES[name].path) : [];
  // No invented lastmod dates, generated job URLs, themes or private surfaces.
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+urls.map(url => '  <url><loc>'+escape(url)+'</loc></url>').join('\n')+'\n</urlset>\n';
}

const HEADER_START = '# BEGIN SU DISCOVERY HEADERS';
const HEADER_END = '# END SU DISCOVERY HEADERS';
export function headers(existing, production) {
  const clean = existing.replace(/# BEGIN SU DISCOVERY HEADERS[\s\S]*?# END SU DISCOVERY HEADERS\n?/g,'').trimEnd();
  const paths = production ? ['/tracker','/tracker.html','/analytics','/analytics.html','/suggest','/suggest.html','/style-guide','/style-guide.html','/404.html','/j/*'] : ['/*'];
  return (clean ? clean+'\n\n' : '')+HEADER_START+'\n'+paths.map(path => path+'\n  X-Robots-Tag: noindex, nofollow').join('\n\n')+'\n'+HEADER_END+'\n';
}

export function finalizeSEO(dist, env = process.env) {
  if (!existsSync(dist)) throw Error('Build the static artifact before SEO finalization');
  const production = env.CONTEXT === 'production';
  const available = new Set(readdirSync(dist));
  const files = [];
  function walk(directory, prefix = '') {
    for (const name of readdirSync(directory)) {
      const file = join(directory,name), relative = prefix+name, stat = lstatSync(file);
      if (stat.isSymbolicLink()) throw Error('Public symlink rejected');
      if (stat.isDirectory()) { if (['jobs','j'].includes(name) || prefix) walk(file,relative+'/'); }
      else if (name.endsWith('.html')) files.push({ file, relative });
    }
  }
  walk(dist);
  for (const {file,relative} of files) writeFileSync(file,htmlMetadata(readFileSync(file,'utf8'),relative,production));
  const headerPath = join(dist,'_headers');
  writeFileSync(headerPath,headers(existsSync(headerPath) ? readFileSync(headerPath,'utf8') : '',production));
  writeFileSync(join(dist,'robots.txt'),robots(production));
  writeFileSync(join(dist,'sitemap.xml'),sitemap(production,available));
  return { pages:files.length, production, canonicalOrigin:ORIGIN };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log('SEO artifact:',finalizeSEO(resolve(process.argv[2] || fileURLToPath(new URL('../dist',import.meta.url))))); }
  catch (error) { console.error('SEO build failed:',error.message);process.exitCode=1; }
}
