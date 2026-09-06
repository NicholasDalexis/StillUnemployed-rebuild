/* Reviewed experience advice. Public copy only; research receipts stay in private docs. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SUAdviceContent = api;
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var additions = [
    { id:'experience-internship', hook:'your internship counts', cta:'put the work on the page',
      why:'Relevant internship work belongs in your experience. Show what you made, managed or improved. Keep the internship title and real dates. Unless the posting specifies otherwise, do not assume “experience” only means jobs after graduation.' },
    { id:'experience-campus', hook:'a campus job is still a job', cta:'show what you did',
      why:{intro:'Ran your department’s Instagram? Designed flyers? Helped organize an event?', bullets:['Name the campus organization and your real role.','Describe your contribution with the same care as any other job.','Use results you can support.'], outro:'You did the work while taking classes. That does not erase the work.'} },
    { id:'experience-ambassador', hook:'brand ambassador? show the work', cta:'make the title mean something',
      why:'Created content, planned an activation or gathered feedback? Say that. Your real title and dates belong on the page, followed by what you delivered. “Brand ambassador” alone cannot tell the whole story.' },
    { id:'experience-honest-dates', hook:'two roles. one busy semester.', cta:'give both their credit',
      why:'List both roles and what you accomplished in each. Keep the real dates: doing two jobs during the same three months does not automatically become six months of experience. Your range of work is worth showing without changing the calendar.' },
    { id:'experience-read-requirement', hook:'read the words after “experience”', cta:'find the difference',
      why:'“Relevant experience” and “full-time experience” are different asks. Internships, campus jobs and brand ambassador work can show relevant skills. Read required versus preferred qualifications and accepted alternatives, then explain how your work fits.' },
    { id:'experience-graduation', hook:'lead with your work', sub:'your graduation year is not your whole story', cta:'keep the answer honest',
      why:{intro:'A general resume can leave off your graduation year when the employer has not requested it. Keep your degree and completion status accurate.', bullets:['If an application requests dates, provide them.','Asked directly? Answer the graduation question, then connect it to your work.'], outro:'For example: “I graduated in 2025. During college, I spent three years as a brand ambassador and worked two campus jobs alongside my classes.” Use your own true details.'} }
  ];
  var overrides = {
    'three-years':{ hook:'your experience started before graduation', cta:'count the relevant work', why:'Internships, campus jobs, brand ambassador roles and freelance work can demonstrate relevant experience. Describe the work and keep the real dates and employment type. Do not treat a 1-3 year requirement as automatically off-limits because you recently graduated; check what the employer specifically asks for.' },
    'major-cage':{ hook:'your major is not a cage', cta:'look at what the role needs', why:'Your major can point you toward a role without defining every job you can do. Compare the actual work with your skills, projects and experience. Read “or a related field” alongside any accepted alternatives. Specific required qualifications still matter.' }
  };
  function apply(notes) {
    var seen = {};
    var result = notes.map(function (note) { seen[note.id]=true; return Object.assign({},note,overrides[note.id]||{}); });
    additions.forEach(function (note) { if(!seen[note.id]) result.push(Object.assign({},note)); });
    return result;
  }
  return {apply:apply, additions:additions, overrides:overrides};
}));
