/* State filter vocabulary and conservative location parsing. No storage or I/O. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SUStates = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var STATES = [
    ['AL','Alabama'], ['AK','Alaska'], ['AZ','Arizona'], ['AR','Arkansas'],
    ['CA','California'], ['CO','Colorado'], ['CT','Connecticut'], ['DE','Delaware'],
    ['FL','Florida'], ['GA','Georgia'], ['HI','Hawaii'], ['ID','Idaho'],
    ['IL','Illinois'], ['IN','Indiana'], ['IA','Iowa'], ['KS','Kansas'],
    ['KY','Kentucky'], ['LA','Louisiana'], ['ME','Maine'], ['MD','Maryland'],
    ['MA','Massachusetts'], ['MI','Michigan'], ['MN','Minnesota'], ['MS','Mississippi'],
    ['MO','Missouri'], ['MT','Montana'], ['NE','Nebraska'], ['NV','Nevada'],
    ['NH','New Hampshire'], ['NJ','New Jersey'], ['NM','New Mexico'], ['NY','New York'],
    ['NC','North Carolina'], ['ND','North Dakota'], ['OH','Ohio'], ['OK','Oklahoma'],
    ['OR','Oregon'], ['PA','Pennsylvania'], ['RI','Rhode Island'], ['SC','South Carolina'],
    ['SD','South Dakota'], ['TN','Tennessee'], ['TX','Texas'], ['UT','Utah'],
    ['VT','Vermont'], ['VA','Virginia'], ['WA','Washington'], ['WV','West Virginia'],
    ['WI','Wisconsin'], ['WY','Wyoming']
  ].map(function (state) { return Object.freeze({ code: state[0], name: state[1] }); });
  var BY_CODE = Object.create(null), BY_NAME = Object.create(null);
  STATES.forEach(function (state) { BY_CODE[state.code] = state.name; BY_NAME[state.name.toLowerCase()] = state.code; });
  var namePattern = STATES.map(function (state) { return state.name; })
    .sort(function (a,b) { return b.length-a.length; }).join('|').replace(/ /g, '\\s+');
  var ambiguous = /^(?:IN|OR|ME|HI|OK|ID)$/;
  function clean(value) { return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''; }

  // Exact values only, suitable for a dropdown or an old full-name selection.
  function normalize(value) {
    var text = clean(value), code = text.toUpperCase();
    return BY_CODE[code] ? code : BY_NAME[text.toLowerCase()] || '';
  }
  function label(value) { return BY_CODE[normalize(value)] || ''; }

  function scan(value, found, structured) {
    var text = clean(value);
    if (!text) return;
    var exact = normalize(text);
    if (exact && (structured || text.length > 2 || text === text.toUpperCase())) {
      found[exact] = true; return;
    }
    // DC is not one of the requested 50 states. Remove its place label before
    // searching so neither order (Washington, DC / DC Washington) becomes WA.
    text = text.replace(/\bWashington[\s,.-]*(?:D\.?\s*C\.?\b|District\s+of\s+Columbia\b)|\b(?:D\.?\s*C\.?|District\s+of\s+Columbia)[\s,.-]+Washington\b/gi, ' ');
    if (/\bNYC\b/i.test(text)) found.NY = true;
    var names = new RegExp('\\b(' + namePattern + ')\\b', 'gi'), match;
    while ((match = names.exec(text))) {
      // A street or institution named for a state is not a state location.
      if (/^\s+(?:street|st\.?|avenue|ave\.?|road|rd\.?|boulevard|blvd\.?|drive|dr\.?|lane|ln\.?|way|court|ct\.?|university)\b/i.test(text.slice(names.lastIndex))) continue;
      found[normalize(match[1])] = true;
    }
    var codes = /\b[A-Z]{2}\b/g;
    while ((match = codes.exec(text))) {
      var code = match[0];
      if (!BY_CODE[code]) continue;
      var before = text.slice(0, match.index), after = text.slice(codes.lastIndex);
      // Postal codes must occupy a location segment, not an ordinary sentence
      // or a street's NE/NW compass suffix. Ambiguous words need an end/ZIP.
      var segmentStart = !before.trim() || /[,;/|(]\s*$/.test(before);
      var segmentEnd = /^\s*(?:$|[,;/|)]|\d{5}(?:-\d{4})?\b|(?:or|and)\b)/.test(after);
      var addressPrefix = !ambiguous.test(code) && /^[\s-]+[A-Z][a-z]/.test(after);
      var citySuffix = !ambiguous.test(code) && /,\s*$/.test(before);
      if (segmentStart && (segmentEnd || addressPrefix || citySuffix)) found[code] = true;
    }
  }

  // Include every explicit state in the structured field and the location.
  // Results use a stable alphabetical order; neither input is mutated. Empty
  // means unknown/DC/territory/remote, not nationwide eligibility. Callers must
  // decide remote eligibility separately and must not expand unknown geography.
  function extract(state, location) {
    var found = Object.create(null);
    scan(state, found, true); scan(location, found, false);
    return STATES.filter(function (item) { return found[item.code]; }).map(function (item) { return item.code; });
  }
  return Object.freeze({ STATES: Object.freeze(STATES), BY_CODE: Object.freeze(BY_CODE), normalize: normalize, extract: extract, label: label });
});
