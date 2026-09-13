/* Reviewed experience advice. Public copy only; research receipts stay in private docs. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SUAdviceContent = api;
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var additions = [
    { id:'experience-internship', hook:'your internship counts', cta:'put the work on the page',
      why:'Show what you made, managed or improved during your internship, using the real title and dates. Read the posting carefully: relevant experience may include internships, but a full-time experience requirement is different.' },
    { id:'experience-campus', hook:'a campus job is still a job', cta:'show what you did',
      why:{bullets:['Name the campus organization, your role and the real dates.','Show what you made, organized or improved.','Use results you can support.']} },
    { id:'experience-ambassador', hook:'brand ambassador? show the work', cta:'make the title mean something',
      why:'Show the content, events or feedback you delivered as a brand ambassador. Include your real title and dates so the work has context.' },
    { id:'experience-honest-dates', hook:'two roles. one busy semester.', cta:'give both their credit',
      why:'List both roles and what you accomplished in each. Keep the real dates: two jobs during the same three months do not become six months of experience.' },
    { id:'experience-read-requirement', hook:'read the words after “experience”', cta:'find the difference',
      why:'“Relevant experience” and “full-time experience” are different asks. Check required versus preferred qualifications and accepted alternatives, then show where your internships, campus work or other experience fit.' },
    { id:'experience-graduation', hook:'lead with your work', sub:'your graduation year is not your whole story', cta:'keep the answer honest',
      why:'You can leave a graduation year off a general resume when it is not requested, while keeping your degree and completion status accurate. If an application or interviewer asks for dates, answer honestly.' }
  ];
  var overrides = {
    'no-weekends':{cta:'make room for a break',why:'Plan breaks into your job hunt when you can. If a good role is open and your application is ready, send it; do not wait for a particular weekday or miss a deadline.'},
    'board-trap':{sell:'More notes like this from The Job Hunt Recipe.',why:'Seeing the same role on several boards can keep you going in circles. Save the employer’s posting and track your application so you can move on to the next opportunity.'},
    'grad-school':{why:'Before committing to grad school, compare tuition, debt and realistic job outcomes. Be clear about what the degree helps you do, beyond postponing the job hunt.'},
    'three-years':{hook:'your experience started before graduation',cta:'count the relevant work',why:'Internships, campus jobs and freelance work can demonstrate relevant experience. Keep the real dates and employment type, then check what the employer means by its experience requirement.'},
    'first-come':{hook:'found a good role? get ready to apply',cta:'send it when it is ready',why:'Apply while a suitable role is open and your application is ready. Hiring timelines vary, so check the deadline and do not assume applications are reviewed in arrival order.'},
    'ghosted':{hook:'no reply? keep your next move',cta:'keep the hunt moving',sell:'More notes like this from The Job Hunt Recipe.',why:'Silence alone cannot tell you why an employer has not replied. Follow up once when appropriate, then keep applying without treating that silence as a measure of your worth.'},
    'manifesting':{why:'Turn the goal into one task you can finish today: update a resume bullet, send an application or share a project. A small action gives you something concrete to build on.'},
    'canva-resume':{hook:'make your resume easy to read',cta:'keep the layout simple',why:'Use a simple layout with selectable text, clear headings and readable experience bullets. Follow the employer’s file instructions; a design tool alone does not determine whether your resume is rejected.'},
    'wish-list':{hook:'required or preferred? check the difference',sub:'read the exact requirements',cta:'find where your experience fits',sell:'More notes like this from The Job Hunt Recipe.',why:'Preferred qualifications can leave room for different backgrounds, while required qualifications and accepted alternatives still matter. Compare the posting with your actual experience instead of assuming every requirement is negotiable.'},
    'follow-up':{why:{intro:'Keep an interview follow-up short:',bullets:['Thank them for their time.','Mention one specific thing you discussed.','Ask about next steps if they were not already clear.']}},
    'show-dont-ask':{why:'A recruiter found my LinkedIn post about the hunt and my projects, which led to my Instagram offer. Share work you can discuss and let it show what you can do.'},
    'volume-trap':{why:'Use a strong base resume for closely related roles, then spend extra time on the opportunities you care about most. Keep every version accurate and relevant to the job.'},
    'not-linkedin':{why:'Check niche boards and company career pages alongside LinkedIn. Confirm the role on the employer’s site and track it so you do not apply twice by accident.'},
    'cold-referral':{why:{intro:'Make a cold message specific and brief:',bullets:['Name the work of theirs you appreciate.','Ask one clear question.','Share a relevant portfolio or project link.']}},
    'linkedin-dms':{why:'Reference something specific the person shared and make a small, clear request. Include relevant work when useful, without expecting a reply or sending repeated nudges.'},
    'resume-layout':{sell:'More notes like this from The Job Hunt Recipe.',why:'Start with a simple layout: contact details, relevant experience, education and skills. Use readable headings, selectable text and results you can support; follow the employer’s file instructions.'},
    'major-cage':{hook:'your major is not a cage',cta:'look at what the role needs',why:'Compare the role with your skills, projects and experience, including any accepted alternatives to a named degree. Your major need not define every job you pursue, but specific required qualifications still matter.'},
    'keyword-stuffing':{sub:'use the job’s language honestly',why:'Use the posting’s language where it truthfully describes your skills and work. Repeating keywords or copying requirements without evidence does not show what you can do.'}
  };
  function apply(notes) {
    var seen = {};
    var result = notes.map(function (note) { seen[note.id]=true; return Object.assign({},note,overrides[note.id]||{}); });
    additions.forEach(function (note) { if(!seen[note.id]) result.push(Object.assign({},note)); });
    return result;
  }
  return {apply:apply, additions:additions, overrides:overrides};
}));
