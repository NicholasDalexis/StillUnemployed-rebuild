import Service from './lib/analytics-service.cjs';
import { respond } from './_shared/newsletter-http.ts';
export default (request: Request, context) => respond(request, Service.newsletter, context.deploy.context);
