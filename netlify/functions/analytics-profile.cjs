const service=require('./lib/analytics-service.cjs');
exports.handler=service.handler(service.profile,['GET','DELETE']);
