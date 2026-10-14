'use strict';
const Core=require('./job-moderation-core.cjs');
const NATIVE_ORIGIN='capacitor://localhost';
function isNative(request){return request.headers.get('origin')===NATIVE_ORIGIN&&request.headers.get('x-su-native')==='1'&&!request.headers.get('sec-fetch-site');}
function authorizeOrigin(request,{native=false,readOnly=false}={}){
  if(native&&isNative(request))return;
  Core.authorizeOrigin(request,{readOnly});
}
// Origin/header values are transport policy, never authentication. Native
// account operations still independently verify the Firebase bearer token.
module.exports={NATIVE_ORIGIN,isNative,authorizeOrigin};
