"use strict";

const p = require("./palette.js");

function core(canvas, x, y) {
  canvas.rect(x + 4, y + 10, 56, 50, p.shadow);
  canvas.rect(x + 7, y + 12, 50, 45, p.stoneDark);
  for (let row = 0; row < 3; row += 1) {
    const offset = row % 2 ? 5 : 0;
    for (let column = 0; column < 5; column += 1) canvas.rect(x + 8 + offset + column * 10, y + 14 + row * 10, 8, 8, row % 2 ? p.stone : p.stoneLight);
  }
  canvas.rect(x + 21, y + 28, 22, 29, p.oakDark);
  canvas.rect(x + 25, y + 33, 14, 24, p.oxblood);
  for (let column = 0; column < 4; column += 1) canvas.rect(x + 5 + column * 16, y + 4, 10, 12, p.stone);
  canvas.rect(x + 27, y + 15, 10, 10, p.goldDark);
  canvas.rect(x + 30, y + 17, 4, 6, p.gold);
}

function wall(canvas, x, y) {
  canvas.rect(x, y + 5, 64, 27, p.shadow);
  canvas.rect(x + 2, y + 2, 60, 27, p.stoneDark);
  for (let row = 0; row < 2; row += 1) {
    const offset = row ? -7 : 0;
    for (let column = 0; column < 5; column += 1) canvas.rect(x + 4 + offset + column * 15, y + 5 + row * 11, 13, 9, row ? p.stone : p.stoneLight);
  }
  canvas.rect(x + 2, y + 25, 60, 4, p.ironDark);
}

function shield(canvas, x, y) {
  canvas.rect(x + 5, y + 2, 54, 2, p.shield);
  canvas.rect(x + 2, y + 5, 2, 20, p.shield);
  canvas.rect(x + 60, y + 5, 2, 20, p.shield);
  canvas.rect(x + 7, y + 27, 50, 2, p.shield);
  canvas.pixel(x + 4, y + 4, p.parchment);
  canvas.pixel(x + 59, y + 4, p.parchment);
  for (let column = 0; column < 7; column += 1) canvas.pixel(x + 10 + column * 7, y + 14 + (column % 2) * 4, p.parchmentAged);
}

function cannon(canvas, x, y) {
  canvas.rect(x + 5, y + 32, 38, 7, p.oakDark);
  canvas.rect(x + 9, y + 36, 8, 8, p.ironDark);
  canvas.rect(x + 31, y + 36, 8, 8, p.ironDark);
  canvas.line(x + 13, y + 31, x + 39, y + 9, p.ironDark);
  canvas.line(x + 14, y + 31, x + 40, y + 10, p.iron);
  canvas.rect(x + 35, y + 6, 8, 8, p.ironLight);
  canvas.rect(x + 7, y + 28, 11, 5, p.goldDark);
}

function volley(canvas, x, y) {
  for (let index = 0; index < 3; index += 1) {
    const left = x + 5 + index * 13;
    canvas.rect(left + 3, y + 11, 7, 7, index === 1 ? p.gold : p.parchmentAged);
    canvas.rect(left + 2, y + 18, 9, 17, index === 1 ? p.oxblood : p.oak);
    canvas.line(left, y + 15, left, y + 34, p.parchment);
    canvas.line(left, y + 15, left + 5, y + 24, p.parchment);
    canvas.line(left, y + 34, left + 5, y + 24, p.parchment);
    canvas.line(left + 5, y + 24, left + 13, y + 24, p.ironLight);
  }
}

function crew(canvas, x, y) {
  for (let index = 0; index < 3; index += 1) {
    const left = x + 3 + index * 9;
    canvas.rect(left + 2, y + 6 + (index % 2) * 2, 5, 5, p.parchmentAged);
    canvas.rect(left, y + 11 + (index % 2) * 2, 9, 14, index === 1 ? p.crew : p.oak);
    canvas.rect(left + 2, y + 25, 2, 5, p.shadow);
    canvas.rect(left + 6, y + 25, 2, 5, p.shadow);
  }
}

function rune(canvas, x, y) {
  canvas.line(x + 16, y + 2, x + 29, y + 16, p.magic);
  canvas.line(x + 29, y + 16, x + 16, y + 29, p.magic);
  canvas.line(x + 16, y + 29, x + 2, y + 16, p.magic);
  canvas.line(x + 2, y + 16, x + 16, y + 2, p.magic);
  canvas.rect(x + 14, y + 9, 4, 14, p.parchmentAged);
  canvas.rect(x + 9, y + 14, 14, 4, p.parchmentAged);
}

function impact(canvas, x, y) {
  canvas.rect(x + 14, y + 2, 4, 28, p.gold);
  canvas.rect(x + 2, y + 14, 28, 4, p.gold);
  canvas.rect(x + 7, y + 7, 18, 18, p.attack);
  canvas.rect(x + 11, y + 11, 10, 10, p.parchment);
}

function debris(canvas, x, y) {
  canvas.rect(x + 2, y + 19, 9, 8, p.stoneDark);
  canvas.rect(x + 13, y + 9, 8, 11, p.stoneLight);
  canvas.rect(x + 23, y + 18, 7, 9, p.stone);
  canvas.pixel(x + 6, y + 10, p.stone);
  canvas.pixel(x + 26, y + 6, p.stoneLight);
}

function pip(canvas, x, y) {
  canvas.rect(x + 3, y + 3, 10, 10, p.shadow);
  canvas.rect(x + 5, y + 5, 6, 6, p.magic);
  canvas.rect(x + 7, y + 7, 2, 2, p.parchment);
}

module.exports = {
  atlas: { name: "battle", width: 256, height: 128 },
  sprites: [
    { name: "battle-core", x: 0, y: 0, width: 64, height: 64, draw: core },
    { name: "battle-wall", x: 64, y: 0, width: 64, height: 32, draw: wall },
    { name: "battle-shield", x: 128, y: 0, width: 64, height: 32, draw: shield },
    { name: "battle-cannon", x: 192, y: 0, width: 48, height: 48, draw: cannon },
    { name: "battle-volley", x: 0, y: 64, width: 48, height: 48, draw: volley },
    { name: "battle-crew", x: 48, y: 64, width: 32, height: 32, draw: crew },
    { name: "battle-rune", x: 80, y: 64, width: 32, height: 32, draw: rune },
    { name: "effect-impact", x: 112, y: 64, width: 32, height: 32, draw: impact },
    { name: "effect-debris", x: 144, y: 64, width: 32, height: 32, draw: debris },
    { name: "effect-siphon-pip", x: 176, y: 64, width: 16, height: 16, draw: pip }
  ]
};
