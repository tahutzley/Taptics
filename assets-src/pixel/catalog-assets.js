"use strict";

const GAME_DATA = require("../../public/game-data.js");
const p = require("./palette.js");

const EXPECTED_COUNTS = Object.freeze({ cards: 29, weapons: 2, structures: 6 });

function stableText(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return `[${value.map(stableText).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${key}:${stableText(value[key])}`).join(",")}}`;
  }
  return String(value);
}

function hashText(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function artHint(entry) {
  return stableText(entry.art || (entry.presentation && entry.presentation.art) || entry.portrait || "").toLowerCase();
}

function seedFor(kind, key, entry, index) {
  return hashText([kind, key, entry.category, entry.type, artHint(entry), index].join("|"));
}

function themeFor(category) {
  if (category === "attack") return { accent: p.attack, dark: p.oxblood, light: p.gold };
  if (category === "magic") return { accent: p.magic, dark: p.ironDark, light: p.shield };
  return { accent: p.crew, dark: p.oakDark, light: p.parchmentAged };
}

function drawSignature(canvas, x, y, index, bits, light, dark) {
  const value = index + 1;
  for (let bit = 0; bit < bits; bit += 1) {
    canvas.rect(x + bit * 6, y, 4, 2, value & (1 << bit) ? light : dark);
  }
}

function drawPortraitFrame(canvas, x, y, theme, seed, index) {
  canvas.rect(x, y, 48, 48, p.shadow);
  canvas.rect(x + 1, y + 1, 46, 46, p.ironDark);
  canvas.rect(x + 3, y + 3, 42, 42, theme.accent);
  canvas.rect(x + 5, y + 5, 38, 38, p.charred);
  canvas.rect(x + 7, y + 7, 34, 32, theme.dark);
  canvas.rect(x + 8, y + 8, 32, 30, p.stoneDark);
  for (let row = 0; row < 3; row += 1) {
    const left = 9 + ((seed >>> (row * 3)) & 3);
    canvas.rect(x + left, y + 10 + row * 9, 4 + ((seed >>> (row * 4 + 5)) & 3), 2, row % 2 ? p.stone : theme.dark);
  }
  canvas.pixel(x + 4, y + 4, theme.light);
  canvas.pixel(x + 43, y + 4, theme.light);
  canvas.pixel(x + 4, y + 43, theme.light);
  canvas.pixel(x + 43, y + 43, theme.light);
  drawSignature(canvas, x + 9, y + 41, index, 5, theme.light, theme.dark);
}

function attackVariant(hint, seed) {
  if (/drum|mallet/.test(hint)) return 0;
  if (/helm|oath|frenzy/.test(hint)) return 1;
  if (/bolt|arrow|volley/.test(hint)) return 2;
  if (/trebuchet|stone|siege|barrage/.test(hint)) return 3;
  if (/writ|sword|seal|order/.test(hint)) return 4;
  return seed % 5;
}

function drawAttackMotif(canvas, x, y, variant, seed, theme) {
  if (variant === 0) {
    for (const left of [10, 26]) {
      canvas.rect(x + left, y + 21, 12, 11, p.shadow);
      canvas.rect(x + left + 2, y + 22, 8, 8, p.oxblood);
      canvas.rect(x + left + 3, y + 24, 6, 2, p.gold);
    }
    canvas.line(x + 12, y + 12, x + 29, y + 25, p.parchment);
    canvas.line(x + 35, y + 12, x + 19, y + 25, p.parchmentAged);
  } else if (variant === 1) {
    canvas.rect(x + 15, y + 15, 18, 15, p.ironDark);
    canvas.rect(x + 18, y + 12, 12, 5, p.ironLight);
    canvas.rect(x + 13, y + 18, 4, 8, p.goldDark);
    canvas.rect(x + 31, y + 18, 4, 8, p.goldDark);
    canvas.rect(x + 19, y + 23, 4, 3, p.oxblood);
    canvas.rect(x + 26, y + 23, 4, 3, p.oxblood);
    canvas.line(x + 24, y + 9, x + 24, y + 17, theme.light);
  } else if (variant === 2) {
    canvas.rect(x + 15, y + 14, 18, 20, p.ironDark);
    canvas.rect(x + 18, y + 16, 12, 15, p.iron);
    canvas.line(x + 8, y + 29, x + 38, y + 14, p.parchment);
    canvas.line(x + 9, y + 30, x + 39, y + 15, p.gold);
    canvas.line(x + 35, y + 13, x + 41, y + 14, p.parchmentAged);
    canvas.line(x + 36, y + 13, x + 38, y + 19, p.parchmentAged);
  } else if (variant === 3) {
    canvas.rect(x + 10, y + 31, 27, 3, p.oakDark);
    canvas.line(x + 16, y + 31, x + 30, y + 13, p.oakLight);
    canvas.line(x + 30, y + 13, x + 38, y + 26, p.parchmentAged);
    canvas.rect(x + 11, y + 27, 7, 7, p.ironDark);
    for (let stone = 0; stone < 3; stone += 1) canvas.rect(x + 31 + stone * 3, y + 8 + ((seed >>> stone) & 3), 3, 3, p.stoneLight);
  } else {
    canvas.rect(x + 12, y + 12, 19, 23, p.parchmentAged);
    canvas.rect(x + 15, y + 15, 13, 2, p.oxblood);
    canvas.rect(x + 16, y + 20, 11, 1, p.oak);
    canvas.rect(x + 16, y + 24, 8, 1, p.oak);
    canvas.line(x + 32, y + 9, x + 18, y + 35, p.ironLight);
    canvas.rect(x + 29, y + 9, 7, 4, p.gold);
    canvas.rect(x + 16, y + 33, 8, 4, p.oxblood);
  }
}

function crewVariant(hint, seed) {
  if (/anvil|hammer|bellows|forge/.test(hint)) return 0;
  if (/alembic|furnace|reactor/.test(hint)) return 1;
  if (/hood|gather|forager|sack/.test(hint)) return 2;
  if (/chest|bandage|store|cache/.test(hint)) return 3;
  if (/rampart|palisade|bulwark|block|tower/.test(hint)) return 4;
  if (/healer|chirurgeon|satchel|lantern/.test(hint)) return 5;
  if (/keg|miner|powder|rogue|sapper/.test(hint)) return 6;
  if (/cart|crate|pennant|tent|camp|guild/.test(hint)) return 7;
  if (/hand|coin|purse|cutpurse/.test(hint)) return 8;
  return seed % 9;
}

function drawCrewMotif(canvas, x, y, variant, seed, theme) {
  if (variant === 0) {
    canvas.rect(x + 12, y + 27, 23, 5, p.ironDark);
    canvas.rect(x + 16, y + 23, 15, 5, p.ironLight);
    canvas.rect(x + 20, y + 32, 7, 5, p.oakDark);
    canvas.line(x + 12, y + 11, x + 29, y + 27, p.oakLight);
    canvas.rect(x + 9, y + 9, 7, 6, p.ironLight);
  } else if (variant === 1) {
    canvas.rect(x + 12, y + 25, 25, 11, p.oakDark);
    canvas.rect(x + 15, y + 28, 19, 6, p.attack);
    canvas.rect(x + 22, y + 11, 5, 15, p.parchment);
    canvas.rect(x + 17, y + 10, 15, 5, p.shield);
    canvas.rect(x + 19, y + 15, 11, 8, p.magic);
  } else if (variant === 2) {
    canvas.rect(x + 18, y + 13, 12, 10, p.oakDark);
    canvas.rect(x + 15, y + 20, 18, 15, p.crew);
    canvas.rect(x + 20, y + 16, 3, 3, p.parchment);
    canvas.rect(x + 26, y + 16, 3, 3, p.parchment);
    canvas.rect(x + 32, y + 24, 8, 11, p.parchmentAged);
    canvas.rect(x + 34, y + 22, 4, 3, p.goldDark);
  } else if (variant === 3) {
    canvas.rect(x + 11, y + 18, 27, 18, p.oakDark);
    canvas.rect(x + 13, y + 21, 23, 13, p.oak);
    canvas.rect(x + 21, y + 17, 8, 5, p.goldDark);
    canvas.rect(x + 22, y + 24, 6, 8, p.parchmentAged);
    canvas.rect(x + 19, y + 27, 12, 2, theme.accent);
  } else if (variant === 4) {
    for (let column = 0; column < 5; column += 1) {
      const height = 13 + ((seed >>> column) & 7);
      canvas.rect(x + 8 + column * 7, y + 36 - height, 5, height, column % 2 ? p.stone : p.oakLight);
      canvas.rect(x + 7 + column * 7, y + 16, 7, 3, p.ironLight);
    }
  } else if (variant === 5) {
    canvas.rect(x + 13, y + 16, 19, 20, p.parchmentAged);
    canvas.rect(x + 20, y + 20, 5, 12, p.oxblood);
    canvas.rect(x + 17, y + 23, 11, 5, p.oxblood);
    canvas.rect(x + 31, y + 14, 7, 12, p.goldDark);
    canvas.rect(x + 33, y + 12, 3, 3, p.gold);
  } else if (variant === 6) {
    canvas.rect(x + 11, y + 22, 19, 14, p.oak);
    canvas.rect(x + 9, y + 19, 23, 5, p.ironDark);
    canvas.rect(x + 15, y + 25, 4, 7, p.oxblood);
    canvas.rect(x + 32, y + 16, 7, 13, p.parchmentAged);
    canvas.pixel(x + 35, y + 13, p.gold);
    canvas.pixel(x + 39, y + 10, p.attack);
  } else if (variant === 7) {
    canvas.rect(x + 10, y + 27, 27, 8, p.oakDark);
    canvas.rect(x + 13, y + 22, 9, 7, p.parchmentAged);
    canvas.rect(x + 24, y + 20, 10, 9, p.oakLight);
    canvas.rect(x + 14, y + 35, 6, 3, p.ironDark);
    canvas.rect(x + 30, y + 35, 6, 3, p.ironDark);
    canvas.line(x + 36, y + 10, x + 36, y + 30, p.parchment);
    canvas.rect(x + 37, y + 11, 7, 6, theme.accent);
  } else {
    canvas.rect(x + 13, y + 18, 7, 14, p.parchmentAged);
    canvas.rect(x + 20, y + 14, 5, 18, p.parchmentAged);
    canvas.rect(x + 25, y + 19, 5, 13, p.parchmentAged);
    canvas.rect(x + 30, y + 23, 5, 9, p.parchmentAged);
    canvas.rect(x + 16, y + 30, 17, 6, p.oakDark);
    for (let coin = 0; coin < 3; coin += 1) canvas.rect(x + 10 + coin * 11, y + 12 + (coin % 2) * 4, 4, 4, p.gold);
  }
}

function magicVariant(hint, seed) {
  if (/shield|aegis|ward/.test(hint)) return 0;
  if (/hourglass|time/.test(hint)) return 1;
  if (/spire|thorn|blood/.test(hint)) return 2;
  if (/bell|hush|silence|hex/.test(hint)) return 3;
  if (/mirror|echo|twin|menhir|vine|stone/.test(hint)) return 4;
  if (/lightning|storm|bolt/.test(hint)) return 5;
  if (/vortex|void|gravity/.test(hint)) return 6;
  if (/broken|cross|unmaking|null|counter/.test(hint)) return 7;
  return seed % 8;
}

function drawMagicMotif(canvas, x, y, variant, seed, theme) {
  if (variant === 0) {
    canvas.rect(x + 14, y + 12, 20, 5, p.shield);
    canvas.rect(x + 12, y + 16, 24, 10, p.ironDark);
    canvas.rect(x + 16, y + 25, 16, 8, p.shield);
    canvas.rect(x + 20, y + 18, 8, 10, p.magic);
  } else if (variant === 1) {
    canvas.rect(x + 14, y + 10, 20, 4, p.goldDark);
    canvas.rect(x + 14, y + 33, 20, 4, p.goldDark);
    canvas.line(x + 17, y + 14, x + 31, y + 33, p.parchmentAged);
    canvas.line(x + 31, y + 14, x + 17, y + 33, p.parchmentAged);
    canvas.rect(x + 21, y + 21, 6, 6, p.magic);
  } else if (variant === 2) {
    canvas.rect(x + 21, y + 12, 7, 24, p.oxblood);
    canvas.rect(x + 18, y + 19, 13, 15, p.magic);
    canvas.line(x + 21, y + 14, x + 13, y + 25, p.oxblood);
    canvas.line(x + 28, y + 17, x + 37, y + 29, p.oxblood);
    canvas.pixel(x + 24, y + 9, p.parchment);
  } else if (variant === 3) {
    canvas.rect(x + 17, y + 13, 14, 4, p.gold);
    canvas.rect(x + 13, y + 17, 22, 13, p.goldDark);
    canvas.rect(x + 20, y + 30, 8, 5, p.ironDark);
    canvas.line(x + 9, y + 11, x + 38, y + 35, p.magic);
    canvas.line(x + 11, y + 9, x + 40, y + 33, p.shield);
  } else if (variant === 4) {
    for (const left of [11, 27]) {
      canvas.rect(x + left, y + 13, 10, 22, p.ironDark);
      canvas.rect(x + left + 2, y + 15, 6, 18, p.magic);
      canvas.rect(x + left + 4, y + 19, 2, 10, p.parchmentAged);
    }
    canvas.line(x + 21, y + 17, x + 27, y + 23, p.shield);
    canvas.line(x + 21, y + 29, x + 27, y + 23, p.shield);
  } else if (variant === 5) {
    canvas.line(x + 27, y + 8, x + 16, y + 22, p.parchment);
    canvas.line(x + 16, y + 22, x + 27, y + 22, p.shield);
    canvas.line(x + 27, y + 22, x + 18, y + 38, p.parchment);
    canvas.rect(x + 10, y + 11, 3, 3, p.magic);
    canvas.rect(x + 35, y + 15, 4, 4, p.magic);
    canvas.rect(x + 31, y + 32, 3, 3, p.magic);
  } else if (variant === 6) {
    for (let inset = 0; inset < 4; inset += 1) {
      const color = inset % 2 ? p.magic : p.shield;
      canvas.line(x + 24, y + 9 + inset * 3, x + 38 - inset * 3, y + 23, color);
      canvas.line(x + 38 - inset * 3, y + 23, x + 24, y + 37 - inset * 3, color);
      canvas.line(x + 24, y + 37 - inset * 3, x + 10 + inset * 3, y + 23, color);
    }
    canvas.rect(x + 21, y + 20, 7, 7, p.shadow);
  } else {
    canvas.line(x + 13, y + 11, x + 35, y + 35, p.magic);
    canvas.line(x + 35, y + 11, x + 13, y + 35, p.shield);
    canvas.rect(x + 20, y + 17, 8, 3, p.parchmentAged);
    canvas.rect(x + 20, y + 27, 8, 3, p.parchmentAged);
    canvas.pixel(x + 8 + (seed & 7), y + 24, p.parchment);
  }
}

function cardDraw(key, entry, index) {
  const seed = seedFor("card", key, entry, index);
  const hint = artHint(entry);
  const theme = themeFor(entry.category);
  return (canvas, x, y) => {
    drawPortraitFrame(canvas, x, y, theme, seed, index);
    if (entry.category === "attack") drawAttackMotif(canvas, x, y, attackVariant(hint, seed), seed, theme);
    else if (entry.category === "magic") drawMagicMotif(canvas, x, y, magicVariant(hint, seed), seed, theme);
    else drawCrewMotif(canvas, x, y, crewVariant(hint, seed), seed, theme);
  };
}

function weaponDraw(key, entry, index) {
  const seed = seedFor("weapon", key, entry, index);
  const theme = themeFor("attack");
  return (canvas, x, y) => {
    drawPortraitFrame(canvas, x, y, theme, seed, index);
    if (index % 2 === 0) {
      canvas.rect(x + 8, y + 29, 28, 6, p.oakDark);
      canvas.rect(x + 12, y + 34, 7, 6, p.ironDark);
      canvas.rect(x + 29, y + 34, 7, 6, p.ironDark);
      canvas.line(x + 15, y + 28, x + 37, y + 12, p.iron);
      canvas.line(x + 16, y + 29, x + 38, y + 13, p.ironLight);
      canvas.rect(x + 34, y + 9, 8, 8, p.goldDark);
      canvas.pixel(x + 42, y + 9, p.attack);
    } else {
      for (let bow = 0; bow < 3; bow += 1) {
        const left = x + 9 + bow * 10;
        canvas.line(left, y + 15, left, y + 34, p.parchment);
        canvas.line(left, y + 15, left + 5, y + 24, p.parchment);
        canvas.line(left, y + 34, left + 5, y + 24, p.parchment);
        canvas.line(left + 5, y + 24, left + 13, y + 24, bow === 1 ? p.gold : p.ironLight);
      }
    }
  };
}

function structureVariant(hint, seed, category) {
  if (category === "magic" || /menhir|rune|monolith|stone/.test(hint)) return 5;
  if (/furnace|alembic|reactor/.test(hint)) return 0;
  if (/tower|beacon|brazier/.test(hint)) return 1;
  if (/camp|tent|out rider|outrider/.test(hint)) return 2;
  if (/cart|crate|quartermaster|store|guild/.test(hint)) return 3;
  if (/forge|anvil|bellows/.test(hint)) return 4;
  return seed % 5;
}

function drawStructure(canvas, x, y, entry, seed, index) {
  const theme = themeFor(entry.category);
  const variant = structureVariant(artHint(entry), seed, entry.category);
  canvas.rect(x + 5, y + 54, 54, 5, p.shadow);
  canvas.rect(x + 9, y + 51, 46, 5, p.stoneDark);
  if (variant === 0) {
    canvas.rect(x + 14, y + 27, 38, 25, p.oakDark);
    canvas.rect(x + 18, y + 31, 30, 17, p.attack);
    canvas.rect(x + 24, y + 34, 18, 12, p.charred);
    canvas.rect(x + 38, y + 11, 9, 22, p.ironDark);
    canvas.rect(x + 40, y + 8, 5, 5, p.stoneLight);
    canvas.rect(x + 26, y + 22, 12, 7, p.shield);
  } else if (variant === 1) {
    canvas.rect(x + 18, y + 19, 30, 34, p.stoneDark);
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) canvas.rect(x + 20 + column * 9 + (row % 2) * 3, y + 22 + row * 9, 7, 7, row % 2 ? p.stone : p.stoneLight);
    }
    for (let column = 0; column < 3; column += 1) canvas.rect(x + 18 + column * 11, y + 13, 8, 9, p.stone);
    canvas.rect(x + 28, y + 38, 9, 15, p.charred);
    canvas.rect(x + 27, y + 8, 12, 6, p.goldDark);
    canvas.rect(x + 30, y + 5, 6, 5, p.attack);
  } else if (variant === 2) {
    for (let row = 0; row < 6; row += 1) canvas.rect(x + 17 - row, y + 24 + row * 5, 30 + row * 2, 5, row % 2 ? p.parchmentAged : p.oxblood);
    canvas.line(x + 32, y + 18, x + 32, y + 52, p.oakDark);
    canvas.rect(x + 11, y + 47, 12, 5, p.oak);
    canvas.rect(x + 44, y + 44, 7, 7, p.goldDark);
    canvas.pixel(x + 47, y + 42, p.gold);
  } else if (variant === 3) {
    canvas.rect(x + 9, y + 33, 43, 17, p.oakDark);
    canvas.rect(x + 12, y + 27, 15, 16, p.oakLight);
    canvas.rect(x + 30, y + 30, 17, 13, p.parchmentAged);
    canvas.rect(x + 13, y + 49, 8, 7, p.ironDark);
    canvas.rect(x + 41, y + 49, 8, 7, p.ironDark);
    canvas.line(x + 52, y + 16, x + 52, y + 45, p.parchment);
    canvas.rect(x + 53, y + 17, 8, 9, theme.accent);
  } else if (variant === 4) {
    canvas.rect(x + 12, y + 30, 42, 22, p.oakDark);
    for (let row = 0; row < 5; row += 1) canvas.rect(x + 15 + row * 3, y + 25 - row * 3, 36 - row * 6, 4, row % 2 ? p.oxblood : p.oakLight);
    canvas.rect(x + 17, y + 35, 14, 5, p.ironLight);
    canvas.rect(x + 21, y + 40, 6, 8, p.ironDark);
    canvas.line(x + 43, y + 31, x + 33, y + 45, p.parchmentAged);
    canvas.rect(x + 41, y + 27, 7, 6, p.ironLight);
  } else {
    canvas.rect(x + 25, y + 13, 17, 39, p.ironDark);
    canvas.rect(x + 28, y + 10, 11, 39, p.stone);
    canvas.line(x + 33, y + 16, x + 33, y + 42, p.magic);
    canvas.line(x + 27, y + 27, x + 39, y + 27, p.shield);
    canvas.line(x + 18, y + 48, x + 29, y + 37, p.crew);
    canvas.line(x + 48, y + 48, x + 38, y + 35, p.crew);
    canvas.pixel(x + 21, y + 40, p.parchment);
    canvas.pixel(x + 45, y + 34, p.parchment);
  }
  drawSignature(canvas, x + 20, y + 60, index, 3, theme.light, theme.dark);
}

function structureDraw(key, entry, index) {
  const seed = seedFor("structure", key, entry, index);
  return (canvas, x, y) => drawStructure(canvas, x, y, entry, seed, index);
}

function entriesFor(record) {
  return Object.entries(record).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
}

function expectCount(label, entries) {
  if (entries.length !== EXPECTED_COUNTS[label]) {
    throw new Error(`Expected ${EXPECTED_COUNTS[label]} ${label} in GAME_DATA, found ${entries.length}`);
  }
}

function freezeRecipe(recipe) {
  Object.freeze(recipe.atlas);
  for (const sprite of recipe.sprites) Object.freeze(sprite);
  Object.freeze(recipe.sprites);
  return Object.freeze(recipe);
}

const cards = entriesFor(GAME_DATA.cards);
const weapons = entriesFor(GAME_DATA.weapons);
const structures = cards.filter(([, entry]) => entry.structure === true);
expectCount("cards", cards);
expectCount("weapons", weapons);
expectCount("structures", structures);

const cardRecipe = freezeRecipe({
  atlas: { name: "cards", width: 384, height: 192, critical: false },
  sprites: cards.map(([key, entry], index) => ({
    name: `card-${key}`,
    x: (index % 8) * 48,
    y: Math.floor(index / 8) * 48,
    width: 48,
    height: 48,
    draw: cardDraw(key, entry, index)
  }))
});

const weaponRecipe = freezeRecipe({
  atlas: { name: "weapons", width: 96, height: 48, critical: true },
  sprites: weapons.map(([key, entry], index) => ({
    name: `weapon-${key}`,
    x: index * 48,
    y: 0,
    width: 48,
    height: 48,
    draw: weaponDraw(key, entry, index)
  }))
});

const structureRecipe = freezeRecipe({
  atlas: { name: "structures", width: 384, height: 64, critical: true },
  sprites: structures.map(([key, entry], index) => ({
    name: `structure-${key}`,
    x: index * 64,
    y: 0,
    width: 64,
    height: 64,
    draw: structureDraw(key, entry, index)
  }))
});

module.exports = Object.freeze({
  recipes: Object.freeze([cardRecipe, weaponRecipe, structureRecipe])
});
