import Newsletter from './lib/newsletter-attribution.cjs';
import { respond } from './_shared/newsletter-http.ts';
export default (request: Request, context) => respond(request, Newsletter.receive, context.deploy.context);
