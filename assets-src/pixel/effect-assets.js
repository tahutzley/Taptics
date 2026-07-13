"use strict";

const GAME_DATA = require("../../public/game-data.js");
const p = require("./palette.js");

function frame(canvas, x, y, color) {
  canvas.rect(x + 2, y + 2, 28, 28, p.shadow);
  canvas.rect(x + 4, y + 4, 24, 24, p.charred);
  canvas.rect(x + 5, y + 5, 22, 2, color);
}

const draws = {
  projectile(canvas, x, y) {
    frame(canvas, x, y, p.attack);
    canvas.line(x + 7, y + 23, x + 24, y + 8, p.parchment);
    canvas.line(x + 20, y + 8, x + 24, y + 8, p.gold);
    canvas.line(x + 24, y + 8, x + 24, y + 12, p.gold);
    canvas.line(x + 7, y + 23, x + 12, y + 23, p.oak);
  },
  siege(canvas, x, y) {
    frame(canvas, x, y, p.oxblood);
    canvas.rect(x + 6, y + 20, 20, 4, p.oakDark);
    canvas.line(x + 8, y + 20, x + 21, y + 8, p.ironLight);
    canvas.rect(x + 20, y + 6, 6, 6, p.stoneLight);
    canvas.rect(x + 8, y + 10, 5, 5, p.stone);
  },
  restore(canvas, x, y) {
    frame(canvas, x, y, p.healing);
    canvas.rect(x + 14, y + 8, 5, 17, p.parchment);
    canvas.rect(x + 8, y + 14, 17, 5, p.parchment);
    canvas.pixel(x + 6, y + 24, p.shield);
    canvas.pixel(x + 25, y + 24, p.shield);
  },
  build(canvas, x, y) {
    frame(canvas, x, y, p.crew);
    canvas.rect(x + 7, y + 20, 18, 5, p.stone);
    canvas.rect(x + 9, y + 14, 14, 5, p.stoneLight);
    canvas.line(x + 9, y + 9, x + 23, y + 23, p.oak);
    canvas.rect(x + 7, y + 7, 9, 5, p.ironLight);
  },
  resource(canvas, x, y) {
    frame(canvas, x, y, p.gold);
    for (const [left, top] of [[7, 16], [13, 9], [18, 17]]) {
      canvas.rect(x + left, y + top, 8, 8, p.goldDark);
      canvas.rect(x + left + 2, y + top + 2, 4, 4, p.gold);
    }
  },
  buff(canvas, x, y) {
    frame(canvas, x, y, p.attack);
    canvas.rect(x + 7, y + 13, 8, 11, p.oxblood);
    canvas.rect(x + 18, y + 13, 8, 11, p.oxblood);
    canvas.rect(x + 8, y + 11, 6, 4, p.parchmentAged);
    canvas.rect(x + 19, y + 11, 6, 4, p.parchmentAged);
    canvas.line(x + 7, y + 8, x + 15, y + 14, p.oakLight);
    canvas.line(x + 26, y + 8, x + 18, y + 14, p.oakLight);
  },
  delay(canvas, x, y) {
    frame(canvas, x, y, p.magic);
    canvas.rect(x + 9, y + 7, 14, 3, p.parchmentAged);
    canvas.rect(x + 9, y + 23, 14, 3, p.parchmentAged);
    canvas.line(x + 11, y + 10, x + 21, y + 23, p.parchment);
    canvas.line(x + 21, y + 10, x + 11, y + 23, p.parchment);
    canvas.rect(x + 14, y + 15, 4, 5, p.gold);
  },
  counter(canvas, x, y) {
    frame(canvas, x, y, p.magic);
    canvas.line(x + 8, y + 8, x + 24, y + 24, p.parchment);
    canvas.line(x + 24, y + 8, x + 8, y + 24, p.parchment);
    canvas.rect(x + 14, y + 12, 5, 9, p.magic);
  },
  ritual(canvas, x, y) {
    frame(canvas, x, y, p.oxblood);
    canvas.line(x + 16, y + 7, x + 25, y + 23, p.magic);
    canvas.line(x + 25, y + 23, x + 7, y + 23, p.magic);
    canvas.line(x + 7, y + 23, x + 16, y + 7, p.magic);
    canvas.rect(x + 14, y + 15, 5, 6, p.gold);
  },
  echo(canvas, x, y) {
    frame(canvas, x, y, p.shield);
    canvas.line(x + 11, y + 8, x + 18, y + 16, p.magic);
    canvas.line(x + 18, y + 16, x + 11, y + 24, p.magic);
    canvas.line(x + 22, y + 8, x + 15, y + 16, p.shield);
    canvas.line(x + 15, y + 16, x + 22, y + 24, p.shield);
  }
};

const families = Object.keys(GAME_DATA.effectFamilies);
for (const family of families) {
  if (!draws[family]) throw new Error(`Missing effect-family art: ${family}`);
}

module.exports = {
  atlas: { name: "effects", width: families.length * 32, height: 32, critical: true },
  sprites: families.map((family, index) => ({ name: `family-${family}`, x: index * 32, y: 0, width: 32, height: 32, draw: draws[family] }))
};
