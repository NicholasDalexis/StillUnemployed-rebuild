import manifest from '../../data/daily-selections.json' with {type:'json'};
import {createHandler} from './lib/daily-collections-core.mjs';
export default createHandler(manifest);
export const config = {path:'/api/daily-collections'};
