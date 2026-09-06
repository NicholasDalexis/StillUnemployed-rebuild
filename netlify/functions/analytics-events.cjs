const service=require('./lib/analytics-service.cjs');
exports.handler=service.handler(service.collect,['POST']);
