"use strict";

const p = require("./palette.js");

function core(canvas, x, y) {
  canvas.rect(x + 1, y + 1, 3, 4, p.shadow);
  canvas.rect(x + 6, y + 1, 4, 4, p.shadow);
  canvas.rect(x + 12, y + 1, 3, 4, p.shadow);
  canvas.rect(x + 1, y + 3, 14, 12, p.shadow);
  canvas.rect(x + 2, y + 2, 2, 3, p.stone);
  canvas.rect(x + 7, y + 2, 2, 3, p.stone);
  canvas.rect(x + 12, y + 2, 2, 3, p.stone);
  canvas.rect(x + 2, y + 4, 12, 10, p.stoneDark);
  canvas.rect(x + 3, y + 6, 3, 1, p.stoneLight);
  canvas.rect(x + 10, y + 6, 3, 1, p.stoneLight);
  canvas.rect(x + 2, y + 8, 3, 1, p.stone);
  canvas.rect(x + 11, y + 8, 3, 1, p.stone);
  canvas.rect(x + 7, y + 5, 2, 2, p.goldDark);
  canvas.pixel(x + 8, y + 5, p.gold);
  canvas.rect(x + 6, y + 9, 4, 5, p.oakDark);
  canvas.rect(x + 7, y + 10, 2, 4, p.oxblood);
}

function wall(canvas, x, y) {
  canvas.rect(x, y + 1, 16, 7, p.shadow);
  canvas.rect(x, y, 16, 7, p.stoneDark);
  canvas.rect(x, y + 1, 4, 2, p.stoneLight);
  canvas.rect(x + 5, y + 1, 5, 2, p.stone);
  canvas.rect(x + 11, y + 1, 5, 2, p.stoneLight);
  canvas.rect(x, y + 4, 2, 2, p.stone);
  canvas.rect(x + 3, y + 4, 5, 2, p.stoneLight);
  canvas.rect(x + 9, y + 4, 4, 2, p.stone);
  canvas.rect(x + 14, y + 4, 2, 2, p.stoneLight);
  canvas.rect(x, y + 6, 16, 1, p.ironDark);
}

function shield(canvas, x, y) {
  canvas.rect(x + 2, y, 12, 1, p.shield);
  canvas.rect(x + 1, y + 1, 1, 2, p.shield);
  canvas.rect(x, y + 3, 1, 3, p.shield);
  canvas.pixel(x + 1, y + 6, p.shield);
  canvas.rect(x + 2, y + 7, 12, 1, p.shield);
  canvas.pixel(x + 14, y + 6, p.shield);
  canvas.rect(x + 15, y + 3, 1, 3, p.shield);
  canvas.rect(x + 14, y + 1, 1, 2, p.shield);
  canvas.pixel(x + 2, y + 1, p.parchment);
  canvas.pixel(x + 13, y + 1, p.parchment);
  canvas.pixel(x + 2, y + 6, p.parchmentAged);
  canvas.pixel(x + 13, y + 6, p.parchmentAged);
}

function cannon(canvas, x, y) {
  canvas.rect(x + 2, y + 10, 11, 3, p.oakDark);
  canvas.rect(x + 3, y + 9, 4, 2, p.goldDark);
  canvas.rect(x + 3, y + 12, 4, 4, p.ironDark);
  canvas.rect(x + 9, y + 12, 4, 4, p.ironDark);
  canvas.rect(x + 4, y + 13, 2, 2, p.ironLight);
  canvas.rect(x + 10, y + 13, 2, 2, p.ironLight);
  canvas.line(x + 5, y + 10, x + 12, y + 3, p.ironDark);
  canvas.line(x + 6, y + 10, x + 13, y + 3, p.iron);
  canvas.line(x + 7, y + 10, x + 14, y + 3, p.ironDark);
  canvas.rect(x + 12, y + 2, 4, 3, p.ironDark);
  canvas.rect(x + 13, y + 2, 3, 2, p.ironLight);
}

function volley(canvas, x, y) {
  const positions = [
    { left: 0, top: 1, head: p.parchmentAged, body: p.oak },
    { left: 5, top: 0, head: p.gold, body: p.oxblood },
    { left: 10, top: 1, head: p.parchmentAged, body: p.oak }
  ];
  for (const figure of positions) {
    const { left, top, head, body } = figure;
    canvas.rect(x + left + 2, y + top + 2, 2, 2, head);
    canvas.rect(x + left + 1, y + top + 4, 3, 5, body);
    canvas.pixel(x + left + 1, y + top + 9, p.shadow);
    canvas.pixel(x + left + 3, y + top + 9, p.shadow);
    canvas.line(x + left, y + top + 4, x + left, y + top + 10, p.parchment);
    canvas.line(x + left, y + top + 4, x + left + 2, y + top + 7, p.parchment);
    canvas.line(x + left, y + top + 10, x + left + 2, y + top + 7, p.parchment);
    canvas.line(x + left + 2, y + top + 7, x + left + 5, y + top + 7, p.ironLight);
  }
}

function crew(canvas, x, y) {
  canvas.pixel(x + 1, y + 2, p.parchmentAged);
  canvas.rect(x, y + 3, 2, 3, p.oak);
  canvas.pixel(x, y + 6, p.shadow);
  canvas.pixel(x + 1, y + 6, p.shadow);
  canvas.rect(x + 3, y + 1, 2, 2, p.parchmentAged);
  canvas.rect(x + 3, y + 3, 2, 3, p.crew);
  canvas.pixel(x + 3, y + 6, p.shadow);
  canvas.pixel(x + 4, y + 6, p.shadow);
  canvas.pixel(x + 6, y + 2, p.parchmentAged);
  canvas.rect(x + 6, y + 3, 2, 3, p.oak);
  canvas.pixel(x + 6, y + 6, p.shadow);
  canvas.pixel(x + 7, y + 6, p.shadow);
}

function rune(canvas, x, y) {
  canvas.line(x + 4, y, x + 7, y + 4, p.magic);
  canvas.line(x + 7, y + 4, x + 4, y + 7, p.magic);
  canvas.line(x + 4, y + 7, x, y + 4, p.magic);
  canvas.line(x, y + 4, x + 4, y, p.magic);
  canvas.rect(x + 3, y + 2, 2, 4, p.parchmentAged);
  canvas.rect(x + 2, y + 3, 4, 2, p.parchmentAged);
}

function impact(canvas, x, y) {
  canvas.rect(x + 3, y, 2, 8, p.gold);
  canvas.rect(x, y + 3, 8, 2, p.gold);
  canvas.rect(x + 1, y + 1, 6, 6, p.attack);
  canvas.rect(x + 3, y + 3, 2, 2, p.parchment);
}

function debris(canvas, x, y) {
  canvas.rect(x, y + 4, 3, 3, p.stoneDark);
  canvas.pixel(x + 1, y + 3, p.stoneDark);
  canvas.rect(x + 3, y + 2, 3, 5, p.stoneLight);
  canvas.pixel(x + 4, y + 1, p.stoneLight);
  canvas.rect(x + 6, y + 4, 2, 3, p.stone);
  canvas.pixel(x + 7, y + 3, p.stone);
  canvas.rect(x, y + 7, 8, 1, p.shadow);
}

function pip(canvas, x, y) {
  canvas.rect(x + 1, y + 1, 6, 6, p.shadow);
  canvas.rect(x + 2, y + 2, 4, 4, p.magic);
  canvas.rect(x + 3, y + 3, 2, 2, p.parchment);
}

module.exports = {
  atlas: { name: "battle", width: 256, height: 128 },
  sprites: [
    { name: "battle-core", x: 0, y: 0, width: 64, height: 64, pixelScale: 4, draw: core },
    { name: "battle-wall", x: 64, y: 0, width: 64, height: 32, pixelScale: 4, draw: wall },
    { name: "battle-shield", x: 128, y: 0, width: 64, height: 32, pixelScale: 4, draw: shield },
    { name: "battle-cannon", x: 192, y: 0, width: 48, height: 48, pixelScale: 3, draw: cannon },
    { name: "battle-volley", x: 0, y: 64, width: 48, height: 48, pixelScale: 3, draw: volley },
    { name: "battle-crew", x: 48, y: 64, width: 32, height: 32, pixelScale: 4, draw: crew },
    { name: "battle-rune", x: 80, y: 64, width: 32, height: 32, pixelScale: 4, draw: rune },
    { name: "effect-impact", x: 112, y: 64, width: 32, height: 32, pixelScale: 4, draw: impact },
    { name: "effect-debris", x: 144, y: 64, width: 32, height: 32, pixelScale: 4, draw: debris },
    { name: "effect-siphon-pip", x: 176, y: 64, width: 16, height: 16, pixelScale: 2, draw: pip }
  ]
};
