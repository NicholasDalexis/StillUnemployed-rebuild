// Build-only projection. Never publish the approved snapshot or its source notes.
import Status from '../../netlify/functions/lib/internship-status.cjs';
import Internships from '../../js/internships.js';
import Pay from '../../js/pay-display.js';

export async function loadInternshipShares({snapshot, fetchImpl=fetch, now=Date.now}={}) {
  const result=await Status.createHandler({snapshot,fetchImpl,now})({httpMethod:'GET'});
  if(result.statusCode!==200)throw new Error('Internship share source is unavailable');
  const body=JSON.parse(result.body);
  return Internships.jobs(body,now()).map(job=>({
    co:job.co, role:job.role, link:job.link, internship:true,
    applicationStatus:job.applicationStatus || job.verification.status,
    pay:Pay.compact(Internships.payLabel(job),{status:job.payStatus,basis:job.payBasis,internship:true}),
    loc:Internships.locationLabel(job), style:job.style || '', exp:''
  }));
}
