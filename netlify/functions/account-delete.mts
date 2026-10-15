import {handle} from './lib/account-deletion.mjs';
export default async(request: Request,context: any)=>handle(request,context);
export const config={path:'/api/account/delete'};
