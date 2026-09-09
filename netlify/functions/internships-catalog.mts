import {handle} from './lib/internship-catalog-moderated.mjs';
export default async (request: Request, context: any) => handle(request, context);
