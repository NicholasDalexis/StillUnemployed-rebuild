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
  // Display only: details, search and filters retain complete source locations.
  // Count places rather than states: two California offices still count as two.
  function cardLocation(value) {
    var original = clean(value);
    if (!original) return original;
    var text = original.replace(/\([^)]*\)/g, ' ').trim();
    if (/\b(?:multiple|various)\s+locations\b|^Any\s+.+\s+Station\s+Location$/i.test(text)) return 'Multiple Locations';
    var regions = namePattern + '|District\\s+of\\s+Columbia|DC|' + Object.keys(BY_CODE).join('|');
    var suffix = new RegExp('([^,;|]+),\\s*(' + regions + ')(?=\\s*(?:,| - |\\d{5}(?:-\\d{4})?\\b|$))', 'gi');
    var prefix = new RegExp('^(' + regions + ')[\\s,-]+([A-Za-z].*)$', 'i');
    var country = /^(?:US|USA|United States(?: of America)?|Canada)$/i;
    var note = /\b(?:not (?:listed|specified)|exact city|hybrid|on[ -]?site|in[ -]person|office|schedule|hours|days|time zones?|restrictions|hub based)\b/i;
    // Known city-only labels and common aliases. Unrecognized free text stays
    // untouched; building names and timezone/attendance notes are not cities.
    var cities = {
      'nyc':['new york','NY'], 'new york':['new york','NY'], 'new york city':['new york','NY'],
      'la':['los angeles','CA'], 'los angeles':['los angeles','CA'],
      'sf':['san francisco','CA'], 'san francisco':['san francisco','CA'], 'san jose':['san jose','CA'],
      'atlanta':['atlanta','GA'], 'chicago':['chicago','IL'], 'boston':['boston','MA']
    };
    var places = Object.create(null);
    function add(city, region) {
      // Workday puts street addresses after the city in state-first labels.
      // This only changes the display label; the source value is never edited.
      city = city.replace(/\s+\d[\s\S]*$/, '').trim();
      if (!city || /^\d/.test(city) || country.test(city)) return;
      var displayCity = city;
      city = city.toLowerCase().replace(/\b(st|ft)\./g, '$1');
      var code = normalize(region) || (/^(?:dc|district\s+of\s+columbia)$/i.test(region) ? 'DC' : region);
      if (city === 'ny' && code === 'NY') city = 'new york'; // NY, New York / New York, NY
      if (Object.prototype.hasOwnProperty.call(cities, city) && (!code || code === cities[city][1])) {
        code = cities[city][1]; city = cities[city][0]; displayCity = city;
      }
      if (displayCity === displayCity.toLowerCase() || displayCity === displayCity.toUpperCase()) {
        displayCity = displayCity.toLowerCase().replace(/\b[a-z]/g, function (letter) { return letter.toUpperCase(); });
      }
      var key = city + '|' + code;
      if (!places[key]) places[key] = code ? displayCity + ', ' + code : displayCity;
    }
    text.split(/\s*(?:;|\/|\||\s+or\s+|\s+and\s+|\s+&\s+)\s*/).forEach(function (part) {
      part = part.trim();
      // A semicolon before a street address or attendance note is not a new city.
      if (!part || country.test(part) || note.test(part)) return;
      if (/^(?:(?:US|USA|United States)\s+)?Remote(?:\s*[,-]?\s*(?:US|USA|United States))?$/i.test(part)) {
        add('Remote', ''); return;
      }
      var cityList = part.toLowerCase().split(',').map(function (city) { return city.trim(); });
      if (cityList.length !== 2 && cityList.every(function (city) { return Object.prototype.hasOwnProperty.call(cities, city); })) {
        cityList.forEach(function (city) { add(city, ''); }); return;
      }
      var match, found = false;
      // Preserve reverse postal labels, particularly DC, Washington (not WA)
      // and NY, New York, before the ordinary city/state suffix scan.
      var reverse = part.match(/^([A-Z]{2})[\s,-]+([A-Za-z].*)$/);
      if (reverse && (BY_CODE[reverse[1]] || reverse[1] === 'DC')) {
        var nextRegion = normalize(reverse[2]);
        if (!nextRegion || nextRegion === reverse[1] || (reverse[1] === 'DC' && /^Washington$/i.test(reverse[2]))) {
          add(reverse[2], reverse[1]); return;
        }
      }
      suffix.lastIndex = 0;
      while ((match = suffix.exec(part))) {
        if (!country.test(match[1].trim())) { add(match[1], match[2]); found = true; }
      }
      if (found) return;
      match = part.match(prefix);
      if (match) { add(match[2], match[1]); return; }
    });
    var keys = Object.keys(places);
    if (keys.length > 1) return 'Multiple Locations';
    if (keys.length === 1) return places[keys[0]];
    return country.test(text.split(';')[0].trim()) ? 'Location not listed' : original;
  }
  return Object.freeze({ STATES: Object.freeze(STATES), BY_CODE: Object.freeze(BY_CODE), normalize: normalize, extract: extract, label: label, cardLocation: cardLocation });
});
