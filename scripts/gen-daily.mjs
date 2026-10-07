import {readFileSync,writeFileSync} from 'node:fs';
import {validate,publicCollections} from '../netlify/functions/lib/daily-collections-core.mjs';
export function published(manifest,today){validate(manifest);return publicCollections(manifest,new Date(today+'T23:59:59-04:00'));}
if(process.argv[1]?.endsWith('/gen-daily.mjs')){
  const selections=publicCollections(JSON.parse(readFileSync(new URL('../data/daily-selections.json',import.meta.url))),new Date());
  writeFileSync(new URL('../js/daily-selection-data.js',import.meta.url),'/* Published selections only. Snapshots are historical fallbacks, never current availability. */\nwindow.SUDailySelections='+JSON.stringify(selections).replace(/</g,'\\u003c')+';\n');
  console.log('Published daily collections:',selections.length);
}
