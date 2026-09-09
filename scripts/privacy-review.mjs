/* A checked review receipt is required when shipped source changes. This is a
 * release-process check, never a claim of legal clearance. */
import {readFileSync} from 'node:fs';import {fileURLToPath} from 'node:url';import {resolve,join} from 'node:path';import {publicSourceFingerprint} from './version.mjs';
export function check(root){const receipt=JSON.parse(readFileSync(join(root,'docs/privacy-review.json'),'utf8'));const current=publicSourceFingerprint(root);if(receipt.sourceDigest!==current.digest||!receipt.reviewedAt||receipt.status!=='local-reviewed')throw Error('Privacy and terms review receipt does not match current source. Review both policies, then record a new receipt.');return true;}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{check(resolve(fileURLToPath(new URL('..',import.meta.url))));}catch(e){console.error(e.message);process.exitCode=1;}}
