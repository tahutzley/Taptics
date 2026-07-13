"use strict";

const GAME_DATA = require("../../public/game-data.js");
const p = require("./palette.js");

// Effect glyphs are authored on an 8x8 grid and enlarged four times by the
// generator. Their surrounding UI already supplies state frames, so these
// recipes stay transparent and devote the full sprite to one readable mark.
const draws = {
  projectile(canvas) {
    canvas.line(1, 6, 6, 1, p.parchment);
    canvas.rect(4, 1, 3, 1, p.gold);
    canvas.rect(6, 1, 1, 3, p.gold);
    canvas.pixel(0, 6, p.oak);
    canvas.pixel(1, 7, p.oak);
  },
  siege(canvas) {
    canvas.rect(1, 6, 6, 1, p.oakDark);
    canvas.line(2, 5, 5, 2, p.ironLight);
    canvas.rect(5, 1, 2, 2, p.stoneLight);
    canvas.rect(1, 4, 2, 2, p.stone);
  },
  restore(canvas) {
    canvas.rect(3, 1, 2, 6, p.parchment);
    canvas.rect(1, 3, 6, 2, p.parchment);
    canvas.pixel(2, 2, p.healing);
    canvas.pixel(5, 5, p.shield);
  },
  build(canvas) {
    canvas.line(2, 1, 6, 5, p.oakLight);
    canvas.rect(1, 1, 3, 2, p.ironLight);
    canvas.rect(4, 5, 3, 2, p.stone);
    canvas.pixel(6, 4, p.crew);
  },
  resource(canvas) {
    for (const [x, y] of [[1, 4], [3, 1], [5, 4]]) {
      canvas.rect(x, y, 2, 2, p.goldDark);
      canvas.pixel(x + 1, y, p.gold);
    }
    canvas.rect(2, 6, 4, 1, p.oakDark);
  },
  buff(canvas) {
    canvas.rect(1, 3, 2, 3, p.oxblood);
    canvas.rect(5, 3, 2, 3, p.oxblood);
    canvas.pixel(1, 2, p.parchmentAged);
    canvas.pixel(6, 2, p.parchmentAged);
    canvas.line(1, 1, 4, 4, p.oakLight);
    canvas.line(6, 1, 3, 4, p.gold);
  },
  delay(canvas) {
    canvas.rect(1, 1, 6, 1, p.parchmentAged);
    canvas.rect(1, 6, 6, 1, p.parchmentAged);
    canvas.line(2, 2, 5, 5, p.parchment);
    canvas.line(5, 2, 2, 5, p.parchment);
    canvas.rect(3, 4, 2, 2, p.gold);
  },
  counter(canvas) {
    canvas.line(1, 1, 6, 6, p.parchment);
    canvas.line(6, 1, 1, 6, p.shield);
    canvas.rect(3, 3, 2, 2, p.magic);
  },
  ritual(canvas) {
    canvas.line(4, 1, 7, 6, p.magic);
    canvas.line(7, 6, 1, 6, p.magic);
    canvas.line(1, 6, 4, 1, p.magic);
    canvas.rect(3, 4, 2, 2, p.gold);
    canvas.pixel(4, 0, p.oxblood);
  },
  echo(canvas) {
    canvas.line(1, 1, 4, 4, p.magic);
    canvas.line(4, 4, 1, 7, p.magic);
    canvas.line(5, 1, 2, 4, p.shield);
    canvas.line(2, 4, 5, 7, p.shield);
    canvas.pixel(6, 4, p.parchment);
  }
};

const families = Object.keys(GAME_DATA.effectFamilies);
for (const family of families) {
  if (!draws[family]) throw new Error(`Missing effect-family art: ${family}`);
}

module.exports = {
  atlas: { name: "effects", width: families.length * 32, height: 32, critical: true },
  sprites: families.map((family, index) => ({
    name: `family-${family}`,
    x: index * 32,
    y: 0,
    width: 32,
    height: 32,
    pixelScale: 4,
    draw: draws[family]
  }))
};
