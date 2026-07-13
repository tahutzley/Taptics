"use strict";

const GAME_DATA = require("../../public/game-data.js");
const p = require("./palette.js");

const EXPECTED_COUNTS = Object.freeze({ cards: 29, weapons: 2, structures: 6 });

function themeFor(category) {
  if (category === "attack") return { accent: p.attack, light: p.gold };
  if (category === "magic") return { accent: p.magic, light: p.shield };
  return { accent: p.crew, light: p.parchmentAged };
}

function drawPortraitFrame(canvas, theme) {
  canvas.rect(0, 0, 16, 16, p.shadow);
  canvas.rect(1, 1, 14, 14, theme.accent);
  canvas.rect(2, 2, 12, 12, p.charred);
  canvas.rect(5, 14, 6, 1, theme.light);
}

// Every exact GAME_DATA art token owns one bold glyph. These deliberately avoid
// seeded texture and footer signatures: the item silhouette carries identity.
const CARD_MOTIFS = Object.freeze({
  "forked-lightning"(canvas) {
    canvas.line(10, 3, 6, 8, p.parchment);
    canvas.line(6, 8, 9, 8, p.shield);
    canvas.line(9, 8, 5, 13, p.parchment);
    canvas.line(7, 6, 4, 5, p.magic);
    canvas.line(8, 10, 12, 11, p.magic);
  },
  "helm-blood-rune"(canvas) {
    canvas.rect(5, 5, 6, 6, p.ironDark);
    canvas.rect(6, 4, 4, 2, p.ironLight);
    canvas.pixel(4, 5, p.goldDark);
    canvas.pixel(11, 5, p.goldDark);
    canvas.rect(6, 8, 2, 2, p.oxblood);
    canvas.rect(9, 8, 2, 2, p.oxblood);
    canvas.line(8, 3, 8, 7, p.oxblood);
    canvas.pixel(8, 11, p.oxblood);
  },
  "shield-stone"(canvas) {
    canvas.rect(5, 4, 6, 2, p.stoneLight);
    canvas.rect(4, 6, 8, 5, p.ironDark);
    canvas.rect(5, 7, 6, 4, p.stone);
    canvas.rect(6, 11, 4, 2, p.stoneDark);
    canvas.rect(3, 11, 3, 2, p.stoneLight);
    canvas.rect(10, 11, 3, 2, p.stoneLight);
    canvas.line(8, 6, 8, 11, p.shield);
  },
  "mirror-runestones"(canvas) {
    for (const left of [4, 10]) {
      canvas.rect(left, 4, 3, 8, p.ironDark);
      canvas.rect(left + 1, 5, 1, 6, p.magic);
    }
    canvas.line(7, 6, 9, 8, p.shield);
    canvas.line(9, 8, 7, 10, p.shield);
    canvas.pixel(5, 7, p.parchmentAged);
    canvas.pixel(11, 9, p.parchmentAged);
  },
  "chest-bandage"(canvas) {
    canvas.rect(3, 6, 10, 7, p.oakDark);
    canvas.rect(4, 7, 8, 5, p.oak);
    canvas.rect(6, 5, 4, 2, p.goldDark);
    canvas.rect(7, 7, 2, 5, p.parchmentAged);
    canvas.rect(5, 9, 6, 2, p.parchmentAged);
  },
  "writ-sword"(canvas) {
    canvas.rect(3, 3, 7, 10, p.parchmentAged);
    canvas.rect(4, 5, 4, 1, p.oxblood);
    canvas.rect(4, 8, 3, 1, p.oak);
    canvas.line(12, 3, 7, 13, p.ironLight);
    canvas.rect(10, 3, 4, 2, p.gold);
    canvas.rect(3, 11, 4, 2, p.oxblood);
  },
  "alembic-furnace"(canvas) {
    canvas.rect(3, 9, 10, 4, p.oakDark);
    canvas.rect(4, 10, 8, 2, p.attack);
    canvas.rect(7, 4, 3, 5, p.parchment);
    canvas.rect(5, 3, 7, 2, p.shield);
    canvas.rect(6, 5, 5, 3, p.magic);
    canvas.pixel(8, 11, p.gold);
  },
  "vortex-stone"(canvas) {
    canvas.line(8, 3, 13, 8, p.shield);
    canvas.line(13, 8, 8, 13, p.magic);
    canvas.line(8, 13, 3, 8, p.shield);
    canvas.line(3, 8, 8, 3, p.magic);
    canvas.line(8, 5, 11, 8, p.magic);
    canvas.line(11, 8, 8, 11, p.shield);
    canvas.rect(7, 7, 2, 2, p.shadow);
  },
  "vine-menhir"(canvas) {
    canvas.rect(6, 3, 5, 10, p.ironDark);
    canvas.rect(7, 2, 3, 10, p.stone);
    canvas.line(8, 4, 8, 10, p.magic);
    canvas.line(4, 12, 8, 8, p.crew);
    canvas.line(12, 11, 9, 7, p.crew);
    canvas.pixel(4, 10, p.parchment);
    canvas.pixel(12, 9, p.parchment);
  },
  "broken-bell"(canvas) {
    canvas.rect(6, 4, 4, 2, p.gold);
    canvas.rect(4, 6, 8, 5, p.goldDark);
    canvas.rect(6, 11, 4, 2, p.ironDark);
    canvas.line(3, 3, 13, 12, p.magic);
    canvas.line(4, 2, 14, 11, p.shield);
  },
  "bloodthorn-spire"(canvas) {
    canvas.rect(7, 4, 3, 9, p.oxblood);
    canvas.rect(6, 8, 5, 5, p.magic);
    canvas.line(7, 5, 3, 9, p.oxblood);
    canvas.line(10, 6, 13, 10, p.oxblood);
    canvas.pixel(8, 2, p.parchment);
    canvas.pixel(3, 8, p.oxblood);
    canvas.pixel(13, 9, p.oxblood);
  },
  "mallet-stone"(canvas) {
    canvas.line(4, 4, 11, 11, p.oakLight);
    canvas.rect(3, 3, 5, 3, p.ironLight);
    canvas.rect(8, 9, 5, 4, p.stone);
    canvas.rect(9, 10, 4, 1, p.stoneLight);
  },
  "crossed-rune"(canvas) {
    canvas.line(4, 4, 12, 12, p.magic);
    canvas.line(12, 4, 4, 12, p.shield);
    canvas.rect(7, 6, 2, 1, p.parchmentAged);
    canvas.rect(7, 10, 2, 1, p.parchmentAged);
    canvas.pixel(3, 3, p.parchment);
    canvas.pixel(13, 3, p.parchment);
    canvas.pixel(3, 13, p.parchment);
  },
  "hide-drums"(canvas) {
    canvas.rect(3, 8, 4, 4, p.oxblood);
    canvas.rect(9, 8, 4, 4, p.oxblood);
    canvas.rect(4, 9, 2, 1, p.gold);
    canvas.rect(10, 9, 2, 1, p.gold);
    canvas.line(4, 4, 9, 9, p.parchment);
    canvas.line(12, 4, 7, 9, p.parchmentAged);
  },
  "runed-shield"(canvas) {
    canvas.rect(5, 4, 6, 2, p.shield);
    canvas.rect(4, 6, 8, 4, p.ironDark);
    canvas.rect(5, 10, 6, 2, p.shield);
    canvas.rect(7, 6, 2, 5, p.magic);
    canvas.rect(6, 8, 4, 1, p.parchmentAged);
    canvas.pixel(8, 12, p.shield);
  },
  "hand-purse"(canvas) {
    canvas.rect(4, 6, 2, 5, p.parchmentAged);
    canvas.rect(6, 4, 2, 7, p.parchmentAged);
    canvas.rect(8, 6, 2, 5, p.parchmentAged);
    canvas.rect(10, 8, 2, 3, p.parchmentAged);
    canvas.rect(5, 10, 7, 3, p.oakDark);
    canvas.rect(11, 4, 3, 3, p.goldDark);
    canvas.pixel(12, 5, p.gold);
  },
  "bolt-shield"(canvas) {
    canvas.rect(6, 4, 5, 8, p.ironDark);
    canvas.rect(7, 5, 3, 6, p.iron);
    canvas.line(3, 10, 13, 5, p.parchment);
    canvas.line(4, 11, 14, 6, p.gold);
    canvas.pixel(13, 4, p.parchmentAged);
    canvas.pixel(14, 5, p.parchmentAged);
  },
  "fresh-palisade"(canvas) {
    for (const left of [3, 6, 9, 12]) {
      canvas.rect(left, 5, 2, 8, left % 3 ? p.oak : p.oakLight);
      canvas.pixel(left, 4, p.parchmentAged);
    }
    canvas.rect(3, 9, 11, 2, p.ironDark);
  },
  "satchel-lantern"(canvas) {
    canvas.rect(3, 6, 7, 7, p.parchmentAged);
    canvas.rect(5, 5, 3, 2, p.oakDark);
    canvas.rect(5, 8, 3, 1, p.oxblood);
    canvas.rect(6, 7, 1, 3, p.oxblood);
    canvas.rect(11, 5, 3, 6, p.goldDark);
    canvas.rect(12, 6, 1, 3, p.gold);
    canvas.pixel(12, 4, p.parchment);
  },
  "rogue-powder"(canvas) {
    canvas.rect(3, 4, 5, 3, p.oakDark);
    canvas.rect(2, 7, 7, 5, p.crew);
    canvas.pixel(5, 5, p.parchment);
    canvas.rect(10, 7, 4, 5, p.parchmentAged);
    canvas.rect(11, 6, 2, 1, p.goldDark);
    canvas.line(12, 6, 14, 3, p.oxblood);
    canvas.pixel(14, 2, p.gold);
  },
  "cart-crates"(canvas) {
    canvas.rect(3, 8, 10, 4, p.oakDark);
    canvas.rect(4, 5, 4, 4, p.parchmentAged);
    canvas.rect(9, 6, 4, 3, p.oakLight);
    canvas.rect(4, 12, 3, 2, p.ironDark);
    canvas.rect(10, 12, 3, 2, p.ironDark);
    canvas.line(13, 5, 13, 10, p.parchment);
    canvas.pixel(14, 5, p.crew);
  },
  "miners-keg"(canvas) {
    canvas.rect(3, 4, 3, 2, p.goldDark);
    canvas.rect(10, 4, 3, 2, p.goldDark);
    canvas.pixel(4, 6, p.parchmentAged);
    canvas.pixel(11, 6, p.parchmentAged);
    canvas.rect(6, 7, 5, 6, p.oak);
    canvas.rect(6, 8, 5, 1, p.ironDark);
    canvas.rect(6, 11, 5, 1, p.ironDark);
    canvas.pixel(8, 6, p.oxblood);
  },
  "forager-sack"(canvas) {
    canvas.rect(5, 4, 5, 3, p.oakDark);
    canvas.rect(4, 7, 7, 6, p.crew);
    canvas.pixel(7, 5, p.parchment);
    canvas.rect(10, 8, 4, 5, p.parchmentAged);
    canvas.rect(11, 7, 2, 1, p.goldDark);
    canvas.pixel(3, 10, p.gold);
  },
  "tent-banner"(canvas) {
    canvas.line(7, 4, 2, 12, p.parchmentAged);
    canvas.line(7, 4, 12, 12, p.oxblood);
    canvas.rect(2, 12, 11, 1, p.oakDark);
    canvas.rect(6, 9, 3, 4, p.charred);
    canvas.line(12, 3, 12, 11, p.parchment);
    canvas.rect(13, 4, 2, 2, p.crew);
  },
  "trebuchet-stones"(canvas) {
    canvas.rect(3, 11, 9, 2, p.oakDark);
    canvas.line(5, 11, 10, 4, p.oakLight);
    canvas.line(10, 4, 13, 9, p.parchmentAged);
    canvas.rect(3, 9, 3, 3, p.ironDark);
    canvas.pixel(10, 3, p.stoneLight);
    canvas.pixel(12, 3, p.stone);
    canvas.pixel(13, 5, p.stoneLight);
  },
  "arrow-rain"(canvas) {
    for (const [left, top] of [[4, 3], [8, 4], [12, 2]]) {
      canvas.line(left, top, left - 1, top + 8, p.parchment);
      canvas.pixel(left - 2, top + 8, p.gold);
      canvas.pixel(left, top + 7, p.gold);
      canvas.pixel(left, top, p.ironLight);
    }
  },
  "anvil-bellows"(canvas) {
    canvas.rect(4, 9, 8, 3, p.ironDark);
    canvas.rect(6, 7, 5, 2, p.ironLight);
    canvas.rect(7, 12, 3, 2, p.oakDark);
    canvas.rect(3, 4, 4, 3, p.oxblood);
    canvas.line(4, 7, 7, 10, p.oakLight);
    canvas.pixel(12, 8, p.gold);
  },
  "bound-hourglass"(canvas) {
    canvas.rect(4, 3, 8, 2, p.goldDark);
    canvas.rect(4, 11, 8, 2, p.goldDark);
    canvas.line(5, 5, 10, 11, p.parchmentAged);
    canvas.line(10, 5, 5, 11, p.parchmentAged);
    canvas.rect(7, 7, 2, 3, p.magic);
    canvas.line(3, 4, 12, 12, p.oxblood);
  },
  "tower-brazier"(canvas) {
    canvas.rect(5, 6, 7, 7, p.stoneDark);
    canvas.rect(6, 7, 5, 5, p.stone);
    canvas.rect(5, 4, 2, 3, p.stoneLight);
    canvas.rect(8, 4, 2, 3, p.stone);
    canvas.rect(11, 4, 2, 3, p.stoneLight);
    canvas.rect(7, 10, 3, 3, p.charred);
    canvas.rect(7, 3, 4, 1, p.goldDark);
    canvas.pixel(8, 2, p.attack);
    canvas.pixel(9, 1, p.gold);
  }
});

const WEAPON_MOTIFS = Object.freeze({
  "iron-bombard"(canvas) {
    canvas.rect(3, 10, 10, 2, p.oakDark);
    canvas.rect(4, 12, 3, 2, p.ironDark);
    canvas.rect(10, 12, 3, 2, p.ironDark);
    canvas.line(5, 10, 12, 4, p.iron);
    canvas.line(6, 10, 13, 4, p.ironLight);
    canvas.rect(11, 3, 4, 3, p.goldDark);
    canvas.pixel(14, 3, p.attack);
  },
  "three-archers"(canvas) {
    for (const left of [3, 7, 11]) {
      canvas.line(left, 4, left, 12, p.parchment);
      canvas.line(left, 4, left + 2, 8, p.parchment);
      canvas.line(left, 12, left + 2, 8, p.parchment);
      canvas.line(left + 2, 8, left + 4, 8, p.ironLight);
    }
    canvas.rect(7, 3, 2, 2, p.gold);
  }
});

const STRUCTURE_MOTIFS = Object.freeze({
  "alembic-furnace"(canvas) {
    canvas.rect(2, 8, 11, 6, p.oakDark);
    canvas.rect(3, 9, 9, 4, p.attack);
    canvas.rect(5, 10, 5, 3, p.charred);
    canvas.rect(10, 3, 3, 6, p.ironDark);
    canvas.pixel(11, 2, p.stoneLight);
    canvas.rect(6, 6, 5, 3, p.shield);
    canvas.rect(5, 14, 9, 1, p.shadow);
  },
  "vine-menhir"(canvas) {
    canvas.rect(6, 3, 5, 11, p.ironDark);
    canvas.rect(7, 2, 3, 11, p.stone);
    canvas.line(8, 5, 8, 11, p.magic);
    canvas.line(3, 14, 7, 10, p.crew);
    canvas.line(13, 13, 9, 9, p.crew);
    canvas.pixel(3, 12, p.parchment);
    canvas.pixel(13, 11, p.parchment);
    canvas.rect(4, 14, 9, 1, p.shadow);
  },
  "cart-crates"(canvas) {
    canvas.rect(2, 8, 11, 4, p.oakDark);
    canvas.rect(3, 5, 4, 4, p.parchmentAged);
    canvas.rect(8, 6, 4, 3, p.oakLight);
    canvas.rect(3, 12, 3, 2, p.ironDark);
    canvas.rect(10, 12, 3, 2, p.ironDark);
    canvas.line(13, 3, 13, 10, p.parchment);
    canvas.rect(14, 4, 2, 3, p.crew);
    canvas.rect(2, 14, 12, 1, p.shadow);
  },
  "tent-banner"(canvas) {
    canvas.line(7, 3, 1, 13, p.parchmentAged);
    canvas.line(7, 3, 13, 13, p.oxblood);
    canvas.rect(1, 13, 13, 1, p.oakDark);
    canvas.rect(6, 9, 3, 5, p.charred);
    canvas.line(13, 2, 13, 12, p.parchment);
    canvas.rect(14, 3, 2, 3, p.crew);
    canvas.pixel(3, 12, p.gold);
    canvas.rect(1, 14, 14, 1, p.shadow);
  },
  "anvil-bellows"(canvas) {
    canvas.rect(2, 8, 12, 6, p.oakDark);
    canvas.rect(4, 9, 5, 2, p.ironLight);
    canvas.rect(5, 11, 3, 3, p.ironDark);
    canvas.rect(10, 6, 3, 3, p.oxblood);
    canvas.line(11, 9, 8, 12, p.oakLight);
    canvas.line(3, 7, 7, 11, p.parchmentAged);
    canvas.rect(2, 5, 4, 3, p.ironLight);
    canvas.rect(2, 14, 12, 1, p.shadow);
  },
  "tower-brazier"(canvas) {
    canvas.rect(4, 5, 8, 9, p.stoneDark);
    canvas.rect(5, 6, 6, 8, p.stone);
    for (const left of [4, 7, 10]) canvas.rect(left, 3, 2, 3, p.stoneLight);
    canvas.rect(7, 10, 3, 4, p.charred);
    canvas.rect(6, 2, 5, 1, p.goldDark);
    canvas.pixel(8, 1, p.attack);
    canvas.pixel(9, 0, p.gold);
    canvas.rect(3, 14, 10, 1, p.shadow);
  }
});

function entriesFor(record) {
  return Object.entries(record).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
}

function expectCount(label, entries) {
  if (entries.length !== EXPECTED_COUNTS[label]) {
    throw new Error(`Expected ${EXPECTED_COUNTS[label]} ${label} in GAME_DATA, found ${entries.length}`);
  }
}

function expectExactArtTokens(label, entries, motifs) {
  const expected = entries.map(([, entry]) => entry.art).sort();
  const actual = Object.keys(motifs).sort();
  const missing = expected.filter((token) => !actual.includes(token));
  const extra = actual.filter((token) => !expected.includes(token));
  if (missing.length || extra.length) {
    throw new Error(`${label} art recipes mismatch: missing ${missing.join(", ") || "none"}; extra ${extra.join(", ") || "none"}`);
  }
}

function cardDraw(entry) {
  const motif = CARD_MOTIFS[entry.art];
  const theme = themeFor(entry.category);
  return (canvas) => {
    drawPortraitFrame(canvas, theme);
    motif(canvas);
  };
}

function weaponDraw(entry) {
  const motif = WEAPON_MOTIFS[entry.art];
  const theme = themeFor("attack");
  return (canvas) => {
    drawPortraitFrame(canvas, theme);
    motif(canvas);
  };
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
expectExactArtTokens("Card", cards, CARD_MOTIFS);
expectExactArtTokens("Weapon", weapons, WEAPON_MOTIFS);
expectExactArtTokens("Structure", structures, STRUCTURE_MOTIFS);

const cardRecipe = freezeRecipe({
  atlas: { name: "cards", width: 384, height: 192, critical: false },
  sprites: cards.map(([key, entry], index) => ({
    name: `card-${key}`,
    x: (index % 8) * 48,
    y: Math.floor(index / 8) * 48,
    width: 48,
    height: 48,
    pixelScale: 3,
    draw: cardDraw(entry)
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
    pixelScale: 3,
    draw: weaponDraw(entry)
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
    pixelScale: 4,
    draw: STRUCTURE_MOTIFS[entry.art]
  }))
});

module.exports = Object.freeze({
  recipes: Object.freeze([cardRecipe, weaponRecipe, structureRecipe])
});
