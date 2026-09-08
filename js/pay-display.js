/* Display only. Keep employer pay untouched for disclosures, sorting and tiers. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SUPayDisplay = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var CURRENCY = '(?:US\\$|CA\\$|AU\\$|NZ\\$|USD|EUR|GBP|CAD|AUD|NZD|JPY|CHF|SEK|NOK|DKK|[$€£¥])';
  var NUMBER = '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)([kK]?)';
  var AMOUNTS = new RegExp('^(' + CURRENCY + ')?\\s*' + NUMBER + '(?:\\s*(?:[-–—]|to)\\s*(' + CURRENCY + ')?\\s*' + NUMBER + ')?(?![\\d.,a-zA-Z])', 'i');
  function currency(value) {
    if (!value) return '';
    if (/^(?:USD|US\$)$/i.test(value)) return '$';
    return /^[a-z]{3}$/i.test(value) ? value.toUpperCase() + ' ' : value;
  }
  function basisOf(value) {
    if (/(?:\/\s*|\bper\s+)(?:hour|hr|h)\b|\bhourly\b/i.test(value)) return 'hour';
    if (/(?:\/\s*|\bper\s+)(?:week|wk)\b|\bweekly\b/i.test(value)) return 'week';
    if (/(?:\/\s*|\bper\s+)(?:month|mo)\b|\bmonthly\b/i.test(value)) return 'month';
    if (/(?:\/\s*|\bper\s+)(?:year|yr)\b|\bannual(?:ized|ly)?\b/i.test(value)) return 'annualized_year';
    if (/\bfor\s+(?:the\s+)?(?:\d+(?:\.\d+)?(?:\s+|[-–])(?:days?|weeks?|months?)|(?:whole\s+)?program)\b|\bprogram (?:total|stipend)\b/i.test(value)) return 'program';
    return '';
  }
  function parse(value, fallbackBasis) {
    var prefix = '';
    value = value.trim().replace(/^(?:up to|at most|maximum(?: salary)?\s*:?)\s*/i, function () { prefix = '≤'; return ''; })
      .replace(/^(?:from|starting at|at least|minimum(?: salary)?\s*:?)\s*/i, function () { prefix = '+'; return ''; })
      .replace(/^(?:~|approximately|approx\.?|estimated)\s*/i, function () { prefix = '~'; return ''; });
    var match = value.match(AMOUNTS);
    if (!match) return null;
    var rest = value.slice(match[0].length), trailingCurrency = rest.match(new RegExp('^\\s*(' + CURRENCY + ')(?=\\s|/|$)', 'i'));
    var firstCurrency = currency(match[1]), secondCurrency = currency(match[4]), endCurrency = currency(trailingCurrency && trailingCurrency[1]);
    var currencies = [firstCurrency, secondCurrency, endCurrency].filter(Boolean);
    if (currencies.some(function (item) { return item !== currencies[0]; })) return null;
    var hasRange = match[5] !== undefined, firstK = !!match[3], secondK = !!match[6];
    // A shared K in $70-85K applies to both endpoints, not to a standalone $70.
    var first = Number(match[2].replace(/,/g, '')), second = hasRange ? Number(match[5].replace(/,/g, '')) : first;
    var sharedK = hasRange && (firstK || secondK) && first < 1000 && second < 1000;
    var low = first * (firstK || sharedK ? 1000 : 1);
    var high = hasRange ? second * (secondK || sharedK ? 1000 : 1) : low;
    if (!Number.isFinite(low) || !Number.isFinite(high) || low < 0 || high < low) return null;
    var explicitBasis = basisOf(value), basis = explicitBasis || fallbackBasis || '';
    if (/\btime unit not listed\b/i.test(value)) basis = '';
    if (!prefix && (/\bminimum\b|\+$/i.test(rest.trim()) || /^\s*\+(?=\s*(?:\/|per\b|hourly\b|weekly\b|monthly\b|annually\b|$))/i.test(rest))) prefix = '+';
    if (!prefix && /\bestimat(?:ed|e)|\bapprox(?:imate(?:ly)?)?\b/i.test(rest)) prefix = '~';
    return { low:low, high:high, currency:currencies[0] || '', basis:basis, prefix:prefix, k:firstK || secondK, range:hasRange };
  }
  function whole(value) { return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function label(parsed) {
    var annual = parsed.basis === 'annual' || parsed.basis === 'year' || parsed.basis === 'annualized_year';
    // Small explicitly annual amounts must not turn into a misleading $0K.
    var useK = (annual || ((!parsed.basis || parsed.basis === 'not_listed') && parsed.k)) && parsed.low >= 1000;
    function amount(value) { return useK ? String(Math.round(value / 1000)) + 'K' : whole(value); }
    var low = amount(parsed.low), high = amount(parsed.high);
    var suffix = { hour:'/hour', week:'/week', month:'/month', program:'/program', annualized_year:'/year', year:'/year' }[parsed.basis] || '';
    return (parsed.prefix === '+' ? '' : parsed.prefix) + parsed.currency + low + (low === high ? '' : '–' + high) + suffix + (parsed.prefix === '+' ? '+' : '');
  }
  function compact(pay, options) {
    options = options || {};
    var value = typeof pay === 'string' ? pay.trim() : '';
    if (options.status === 'unpaid' || /^unpaid\b/i.test(value)) return 'Unpaid';
    if (options.status === 'not_disclosed') return 'Pay not disclosed';
    if (!value || !/\d/.test(value)) return options.status === 'paid' || /^paid\b/i.test(value) ? '$ Paid' : 'Pay not disclosed';
    // Semicolon-separated student rates become a compact envelope. Their exact
    // qualification-specific rates and all caveats remain in the original pay.
    var parts = value.replace(/\([^)]*\)/g, '').split(';');
    var fallbackBasis = /\btime unit not listed\b/i.test(value) ? '' : options.basis;
    var parsed = parse(parts[0], fallbackBasis);
    if (!parsed) return value;
    // Nic's internship-only display convention. An explicit period always wins;
    // never apply it to ranges, multiple rates, K amounts or the Jobs board.
    if (options.internship === true && parts.length === 1 && !parsed.range && !parsed.k && parsed.low > 0 && parsed.low < 100 && !basisOf(value) && (!parsed.basis || parsed.basis === 'not_listed')) parsed.basis = 'hour';
    if (/\b(?:estimated|approximately|approximate|projected)\b/i.test(value) && !parsed.prefix) parsed.prefix = '~';
    for (var i = 1; i < parts.length; i++) {
      var next = parse(parts[i], fallbackBasis);
      if (!next) continue;
      if (next.basis !== parsed.basis || next.currency !== parsed.currency || next.prefix !== parsed.prefix) return parts.map(function (part) { var item = parse(part, fallbackBasis); return item ? label(item) : part.trim(); }).join('; ');
      parsed.low = Math.min(parsed.low, next.low); parsed.high = Math.max(parsed.high, next.high);
    }
    return label(parsed);
  }
  return { compact:compact };
});
