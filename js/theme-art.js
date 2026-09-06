/* Decorative vocabulary for the public board themes.
 * Rationale: loose contours, rounded pen strokes and three distinct silhouettes
 * per theme keep the notebook character without relying on emoji fonts. Ink
 * inherits from the host surface; small accents borrow the existing palette.
 * Texture copy describes css/styles.css, not a new background implementation.
 * SVGs are static, self-contained and decorative. Give meaning to nearby text,
 * never to one of these marks alone. No controls, requests or storage effects.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.SUThemeArt = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  function drawing(body) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' + body + '</g></svg>';
  }
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.keys(value).forEach(function (key) { freeze(value[key]); });
      Object.freeze(value);
    }
    return value;
  }
  return freeze({
    themes: {
      original: {
        texture: {
          name: 'Warm paper grain',
          description: 'Warm beige paper with two offset layers of tiny brown dots, repeated every 9 pixels.',
          usage: 'Use on the board canvas. Keep salary cards on their separate paper colors and place small stick figures in spare margins.'
        },
        icons: [
          { id: 'original-wave', label: 'Stick figure waving', svg: drawing(
            '<path d="M25 14c-.5-8 12-9 13-.5s-12 9-13 .5Z"/>' +
            '<path d="M31 22l-1 17M30 28l-11 3-6-8M31 28l11-7 3-9M30 39l-9 16M30 39l12 14"/>' +
            '<path d="m44 5 1-2m5 10 4-1m-4-5 3-3" stroke="#C2552F"/>'
          ) },
          { id: 'original-step', label: 'Stick figure taking a step', svg: drawing(
            '<path d="M23 15c-1-8 11-10 13-2s-10 11-13 2Z"/>' +
            '<path d="m30 23-2 16 14 10 10-1M28 39l-6 14-8 3M29 28l-10 10M29 28l12 4 6-5"/>' +
            '<path d="m43 36 12 1-1 12-12-1 1-12Zm4 0 .5-4 5 .4-.2 4" stroke="#C2552F"/>'
          ) },
          { id: 'original-pause', label: 'Stick figure taking a breather', svg: drawing(
            '<path d="M28 16c-1-8 11-10 13-2s-11 10-13 2Z"/>' +
            '<path d="m33 24-5 15 15 1 3 13M31 28l12 3 6-7M28 39l-5 13M19 35l-1 8h21M20 44l-2 11m18-11 2 11"/>' +
            '<path d="M9 20h8m-9 5h6M49 16l4-3" stroke="#C2552F"/>'
          ) }
        ]
      },
      poker: {
        texture: {
          name: 'Burgundy felt',
          description: 'Deep burgundy with two fine 9-pixel dot layers, a warm golden sheen at the top and a dark lower vignette.',
          usage: 'Use as the Casino board canvas. Chips, cards and dice are small decorative marks; salary tiers keep their white, green and dark surfaces.'
        },
        icons: [
          { id: 'poker-chip', label: 'Casino chip', svg: drawing(
            '<path d="M32 8C18 7 8 18 9 32s10 24 24 24 23-11 22-25S45 8 32 8Z"/>' +
            '<path d="M31 17c-9 0-15 7-15 16s8 15 17 15 15-8 14-17-8-14-16-14Z" stroke="#D4AF37"/>' +
            '<path d="m27 9 1 7m10-6-2 7m16 3-7 4m10 14-8-2m-6 17-4-7m-16 7 4-7M10 40l7-3M10 23l7 3"/>' +
            '<path d="m32 24 7 8-7 9-7-9 7-8Z" stroke="#D4AF37"/>'
          ) },
          { id: 'poker-cards', label: 'Pair of playing cards', svg: drawing(
            '<path d="m11 15 25-6 10 40-24 7-11-41Z"/>' +
            '<path d="m29 15 25 5-7 37-25-5 7-37Z"/>' +
            '<path d="M38 29c-4-6-11-1-8 4 2 4 7 8 7 8s8-5 10-9c2-6-6-8-9-3Z" stroke="#C0303A" fill="#C0303A" fill-opacity=".12"/>' +
            '<path d="m18 23 2-4 3 3-2 4-3-3Z" stroke="#D4AF37"/>'
          ) },
          { id: 'poker-dice', label: 'Two dice', svg: drawing(
            '<path d="m8 15 25-5 5 25-25 6-5-26Zm22 15 24 3-3 23-24-3 3-23Z"/>' +
            '<g fill="currentColor" stroke="none"><circle cx="16" cy="21" r="2.2"/><circle cx="29" cy="28" r="2.2"/><circle cx="23" cy="25" r="2.2"/><circle cx="35" cy="38" r="2.2"/><circle cx="46" cy="40" r="2.2"/><circle cx="34" cy="48" r="2.2"/><circle cx="45" cy="50" r="2.2"/></g>' +
            '<path d="m45 12 4-4m2 10 5-1" stroke="#D4AF37"/>'
          ) }
        ]
      },
      beauty: {
        texture: {
          name: 'Cream with rose wash',
          description: 'A cream base, two offset 10-pixel layers of faint wine-colored dots and a soft pink glow across the top.',
          usage: 'Keep the rose wash behind the layout. Use a lipstick, compact or kiss outline as an occasional beauty motif, away from job text.'
        },
        icons: [
          { id: 'beauty-lipstick', label: 'Lipstick', svg: drawing(
            '<path d="m23 30 19 1-1 24-19-1 1-24Zm1 9 17 1"/>' +
            '<path d="m26 30 .5-17c0-2 2-4 4-5l8-3-.5 26" stroke="#8A1E33" fill="#8A1E33" fill-opacity=".15"/>' +
            '<path d="m27 15 10-5M21 56h22M48 19l5-2m-6 10 6 2"/>'
          ) },
          { id: 'beauty-compact', label: 'Open powder compact', svg: drawing(
            '<path d="M32 7c-10-1-17 6-17 16s7 15 17 15 17-7 16-16S42 7 32 7Z"/>' +
            '<path d="m23 23 10-9m-6 16 12-12M27 38v3m10-3v3"/>' +
            '<path d="M11 47c0-7 10-12 21-11s21 5 21 12-10 12-22 11S11 54 11 47Z"/>' +
            '<ellipse cx="32" cy="47" rx="15" ry="6" fill="#F3C9D2" fill-opacity=".28" stroke="#8A1E33"/>'
          ) },
          { id: 'beauty-kiss', label: 'Kiss outline', svg: drawing(
            '<path d="M8 32c10-5 16-17 24-9 8-9 15 2 24 8-8 9-15 19-24 13C23 50 15 39 8 32Z" stroke="#8A1E33"/>' +
            '<path d="M9 32c9 3 15-2 23 0 9-3 16 1 23-1M23 24l9 8 9-8m-18 17 9-9 9 9"/>' +
            '<path d="m48 13 3-4m4 10 4-1" stroke="#8A1E33"/>'
          ) }
        ]
      },
      girly: {
        texture: {
          name: 'Pink dotted paper',
          description: 'Blush pink paper with two offset 10-pixel magenta dot layers and a white glow centered along its upper edge.',
          usage: 'Use the dotted pink field as the Girlies board canvas. Friendship charms, bows and sparkles sit beside content without changing salary colors.'
        },
        icons: [
          { id: 'girly-bff-charms', label: 'BFF split-heart charms', svg: drawing(
            '<path d="M27 24c-3-9-15-9-17 1-2 10 8 18 14 23l4-10-6-5 6-6-1-3Zm10-1c5-9 17-5 18 5 0 9-10 18-17 22l-5-10 6-6-6-6 4-5Z" fill="#E84B9C" fill-opacity=".12"/>' +
            '<path d="M17 20c-4-5-1-10 3-8s4 5 1 8M44 20c-4-5-1-10 3-8s4 5 1 8M20 12l-4-7m31 7 4-6"/>' +
            '<path d="m5 40 4 2m43 7 5 2" stroke="#E84B9C"/>'
          ) },
          { id: 'girly-bow', label: 'Ribbon bow', svg: drawing(
            '<path d="M27 29C20 22 11 14 8 20c-3 6-2 19 5 20 5 0 11-4 15-7m9-4c7-7 16-15 19-8 3 6 2 18-5 19-5 0-10-4-14-7"/>' +
            '<path d="M28 25c3-2 7-2 9 1l-1 11c-3 2-7 1-9-2l1-10ZM28 37 18 55l10-3 4 6 3-21m2 0 10 16-8-2-4 6" fill="#E84B9C" fill-opacity=".13"/>' +
            '<path d="m15 27 11 3m12 1 12-4" stroke="#E84B9C"/>'
          ) },
          { id: 'girly-sparkles', label: 'Cluster of sparkles', svg: drawing(
            '<path d="m32 9 5 15 15 6-15 5-6 16-5-16-15-5 16-6 5-15Z"/>' +
            '<path d="m52 5 2 6 6 2-6 3-2 6-2-6-6-3 6-2 2-6ZM12 43l2 6 6 2-6 3-2 6-2-6-6-3 6-2 2-6Z" stroke="#E84B9C"/>'
          ) }
        ]
      },
      mermaid: {
        texture: {
          name: 'Refracted ocean light',
          description: 'An aqua-to-blue depth gradient with offset fine dots, two broad light pools and crossing diagonal bands of refracted light. The light layers drift slowly; reduced-motion mode stops the drift.',
          usage: 'Keep the layered water effect on the board canvas. Shells, starfish and a tail are quiet edge decorations, with the existing ocean salary surfaces kept distinct.'
        },
        icons: [
          { id: 'mermaid-shell', label: 'Scallop shell', svg: drawing(
            '<path d="M12 42C5 35 7 26 14 24 12 13 25 10 31 17c7-9 19-4 18 7 8 2 10 13 2 19L36 52h-9L12 42Z"/>' +
            '<path d="m14 27 16 22m-8-28 9 28m1-29v29m10-27-9 27m16-21L34 49"/>' +
            '<path d="m27 52-1 5h11l-1-5" stroke="#FF7E67"/>'
          ) },
          { id: 'mermaid-starfish', label: 'Starfish', svg: drawing(
            '<path d="M31 7c3 0 5 13 9 17 5 1 17-2 18 1 1 3-11 10-13 15 0 5 6 15 3 17-3 1-12-9-17-10-5 2-13 12-16 9-2-2 3-13 3-18C15 34 4 28 6 25c2-3 14 1 19-2 3-5 3-16 6-16Z"/>' +
            '<g fill="#FF7E67" stroke="none"><circle cx="31" cy="24" r="1.7"/><circle cx="23" cy="30" r="1.7"/><circle cx="39" cy="30" r="1.7"/><circle cx="26" cy="40" r="1.7"/><circle cx="38" cy="41" r="1.7"/></g>'
          ) },
          { id: 'mermaid-tail', label: 'Mermaid tail', svg: drawing(
            '<path d="M23 8c-6 15 2 24 10 34 4-12 11-21 9-34M23 8c5 4 12 4 19 0"/>' +
            '<path d="M33 42c-6-5-13-7-23-5 1 13 11 22 23 12 10 12 22 4 23-9-10-3-17-1-23 2Z"/>' +
            '<path d="m16 41 13 6m22-3-13 4M25 17q4 6 8 0m0 0q4 6 8 0m-13 8q4 5 8 0" stroke="#FF7E67"/>'
          ) }
        ]
      },
      bratt: {
        texture: {
          name: 'Pale lime dotted wash',
          description: 'A pale lime base with two offset 10-pixel green dot layers and a translucent bright-lime wash across the top.',
          usage: 'Keep this pale dotted canvas behind the brighter green cards and navigation. Use the bitten apple, starburst or fresh leaf as a small mark, not an extra background pattern. Short phrases such as “fresh to the core” alternate with drawings, using the existing decorative Arial treatment; interface text keeps the shared fonts.'
        },
        icons: [
          { id: 'bratt-apple', label: 'Bitten apple', svg: drawing(
            '<path d="M31 20c-9-9-20-3-21 10-3 15 11 27 21 24 8 6 19-7 21-18-7 3-12-2-9-8-6-2-6-9 0-12-4-1-8 1-12 4Z"/>' +
            '<path d="M31 19c-1-6 0-10 3-14m0 11c5-8 11-7 16-7-3 7-8 10-16 7Z" fill="#8ACE00" fill-opacity=".24"/>' +
            '<path d="M18 29c-3 5-2 10 0 13" stroke="#8ACE00"/>'
          ) },
          { id: 'bratt-starburst', label: 'Uneven starburst', svg: drawing(
            '<path d="m30 5 5 14 11-9-3 16 16-3-12 11 12 10-16-1 3 16-12-11-7 12-2-16-16 5 9-13L5 29l16-2-8-14 14 7 3-15Z" fill="#8ACE00" fill-opacity=".18"/>' +
            '<path d="m28 27 9 9m0-10-9 11"/>'
          ) },
          { id: 'bratt-leaf', label: 'Fresh leaf', svg: drawing(
            '<path d="M15 44C8 23 28 8 53 10c2 21-13 41-38 34Z" fill="#8ACE00" fill-opacity=".17"/>' +
            '<path d="M10 55c9-17 23-26 37-39M23 37l-2-12m10 5 11 1m-4-9 1-8"/>' +
            '<path d="m5 31 3 1m44 15 4 2" stroke="#8ACE00"/>'
          ) }
        ]
      },
      noir: {
        texture: {
          name: 'Pearl satin folds',
          description: 'Warm off-white with a gathered conic fold near the lower-right corner, diagonal satin highlights and a broad light glow at the upper left. There is no repeating dot pattern.',
          usage: 'Let the soft satin canvas remain light behind the charcoal salary cards. Use the two drawn cats or crescent as sparse details, with ink inherited from their surface.'
        },
        icons: [
          { id: 'noir-cat-sitting', label: 'Stick-figure cat sitting', svg: drawing(
            '<path d="m22 22-1-13 9 7c4-2 8-1 11 0l7-7-2 14c-2 8-20 10-24-1Z"/>' +
            '<path d="m25 32 1 18-5 4h12l1-19m0 18h12l-5-20M44 51c13 7 19-6 13-12-4-4-9 1-5 5M25 24l-11-2m12 6-11 2m27-6 11-3m-12 7 12 2"/>' +
            '<path d="M29 22h1m8-1h1m-7 5 2 1 2-2"/>'
          ) },
          { id: 'noir-cat-stretching', label: 'Stick-figure cat stretching', svg: drawing(
            '<path d="m9 35-2-10 9 5 8-5 1 12c-3 6-13 6-16-2Z"/>' +
            '<path d="M25 33c9-14 19-14 26-7l1 19 6 5h-9l-6-17M29 32l-7 18-8 3m19-22-4 20-6 3M51 26c11-12 5-23-3-16M9 36l-6 1m20-1 7 3M13 34h1m5-1h1"/>'
          ) },
          { id: 'noir-moon', label: 'Crescent moon', svg: drawing(
            '<path d="M45 9C24 11 23 43 44 48 28 60 9 47 10 30 10 14 26 5 45 9Z"/>' +
            '<path d="m49 20 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5ZM37 16l1 2m13 26 2 1"/>'
          ) }
        ]
      },
      chess: {
        texture: {
          name: 'Faint ivory checks',
          description: 'Warm ivory with two very faint diagonal checker layers on 66-pixel tiles, offset by 33 pixels, plus a soft white glow along the top.',
          usage: 'Use the low-contrast checker field on the board canvas. Drawn pieces support the theme while the three salary bands keep their own surfaces.'
        },
        icons: [
          { id: 'chess-knight', label: 'Chess knight', svg: drawing(
            '<path d="M19 49c2-10 5-16 15-21l-7-3-7 5-8-6 14-13 8-1 3-5 3 10c12 6 11 22 8 34M31 14l-5 7m13 1h1"/>' +
            '<path d="m17 49 33 1 4 7H12l5-8Zm20-17c-6 6-7 11-7 17"/>'
          ) },
          { id: 'chess-pawn', label: 'Chess pawn', svg: drawing(
            '<path d="M25 15c-.5-9 14-10 15-1s-14 11-15 1ZM27 23l-3 6h17l-4-6M27 30c0 8-3 13-8 18h27c-5-6-8-10-8-18"/>' +
            '<path d="m18 49 29 1 5 7H13l5-8ZM22 44h20"/>'
          ) },
          { id: 'chess-rook', label: 'Chess rook', svg: drawing(
            '<path d="M14 10h8v8h7v-8h8v8h7v-8h8v15l-6 6-2 17H22l-2-17-6-6V10ZM20 27h26M26 32l1 11m12-11-1 11"/>' +
            '<path d="m20 49 26 1 7 7H13l7-8Z"/>'
          ) }
        ]
      }
    }
  });
});
