"use strict";

const palette = require("./palette.js");

function drawFallbackPortrait(canvas, x, y) {
  canvas.rect(x, y, 12, 12, palette.shadow);
  canvas.rect(x + 1, y + 1, 10, 10, palette.ironDark);
  canvas.rect(x + 2, y + 2, 8, 8, palette.charred);
  canvas.rect(x + 3, y + 2, 6, 1, palette.magic);
  canvas.rect(x + 2, y + 3, 1, 6, palette.magic);
  canvas.rect(x + 9, y + 3, 1, 6, palette.magic);
  canvas.rect(x + 3, y + 9, 6, 1, palette.magic);
  canvas.pixel(x + 4, y + 5, palette.parchment);
  canvas.pixel(x + 7, y + 5, palette.parchment);
  canvas.rect(x + 5, y + 7, 2, 1, palette.parchmentAged);
}

function drawCrest(canvas, x, y) {
  canvas.rect(x + 2, y + 1, 12, 2, palette.gold);
  canvas.rect(x + 1, y + 3, 14, 7, palette.oxblood);
  canvas.rect(x + 2, y + 10, 12, 2, palette.oxblood);
  canvas.rect(x + 3, y + 12, 10, 1, palette.oxblood);
  canvas.rect(x + 5, y + 13, 6, 1, palette.oxblood);
  canvas.rect(x + 7, y + 14, 2, 1, palette.shadow);
  canvas.rect(x + 3, y + 3, 10, 7, palette.parchmentAged);
  canvas.rect(x + 3, y + 10, 10, 1, palette.parchmentAged);
  canvas.rect(x + 4, y + 11, 8, 1, palette.parchmentAged);
  canvas.rect(x + 5, y + 12, 6, 1, palette.parchmentAged);
  canvas.rect(x + 7, y + 13, 2, 1, palette.parchmentAged);
  canvas.rect(x + 5, y + 4, 6, 6, palette.oak);
  canvas.rect(x + 7, y + 4, 2, 7, palette.gold);
  canvas.rect(x + 7, y + 5, 2, 4, palette.oxblood);
}

function drawBattleIcon(canvas, x, y) {
  canvas.line(x + 1, y + 1, x + 6, y + 6, palette.parchment);
  canvas.line(x + 6, y + 1, x + 1, y + 6, palette.gold);
  canvas.rect(x, y + 5, 3, 2, palette.oak);
  canvas.rect(x + 5, y + 5, 3, 2, palette.oak);
}

function drawDeckIcon(canvas, x, y) {
  canvas.rect(x + 2, y, 5, 7, palette.shadow);
  canvas.rect(x, y + 2, 5, 6, palette.oakDark);
  canvas.rect(x + 1, y + 1, 5, 6, palette.parchmentAged);
  canvas.rect(x + 2, y + 2, 3, 1, palette.oxblood);
  canvas.rect(x + 2, y + 4, 3, 1, palette.oak);
}

function drawChallengeIcon(canvas, x, y) {
  canvas.rect(x + 2, y, 4, 1, palette.goldDark);
  canvas.rect(x + 2, y + 1, 4, 3, palette.gold);
  canvas.rect(x + 1, y + 1, 1, 2, palette.parchmentAged);
  canvas.rect(x + 6, y + 1, 1, 2, palette.parchmentAged);
  canvas.pixel(x, y + 1, palette.parchmentAged);
  canvas.pixel(x + 7, y + 1, palette.parchmentAged);
  canvas.rect(x + 3, y + 4, 2, 2, palette.gold);
  canvas.rect(x + 1, y + 6, 6, 1, palette.goldDark);
  canvas.rect(x + 2, y + 7, 4, 1, palette.shadow);
}

function drawSound(canvas, x, y, muted) {
  canvas.rect(x, y + 3, 2, 3, palette.parchmentAged);
  canvas.rect(x + 2, y + 2, 2, 5, palette.parchment);
  if (muted) {
    canvas.line(x + 4, y + 2, x + 7, y + 5, palette.oxblood);
    canvas.line(x + 7, y + 2, x + 4, y + 5, palette.oxblood);
  } else {
    canvas.pixel(x + 5, y + 2, palette.gold);
    canvas.pixel(x + 6, y + 3, palette.gold);
    canvas.pixel(x + 6, y + 5, palette.gold);
    canvas.pixel(x + 5, y + 6, palette.gold);
    canvas.pixel(x + 7, y + 1, palette.gold);
    canvas.pixel(x + 7, y + 7, palette.gold);
  }
}

function drawSearchIcon(canvas, x, y) {
  canvas.rect(x + 1, y, 3, 1, palette.parchment);
  canvas.pixel(x, y + 1, palette.parchment);
  canvas.pixel(x + 4, y + 1, palette.parchment);
  canvas.pixel(x, y + 2, palette.parchment);
  canvas.pixel(x + 4, y + 2, palette.parchment);
  canvas.rect(x + 1, y + 3, 3, 1, palette.parchment);
  canvas.line(x + 4, y + 3, x + 7, y + 6, palette.gold);
}

function drawWarningIcon(canvas, x, y) {
  canvas.rect(x + 3, y, 2, 1, palette.shadow);
  canvas.rect(x + 2, y + 1, 4, 2, palette.gold);
  canvas.rect(x + 1, y + 3, 6, 2, palette.gold);
  canvas.rect(x, y + 5, 8, 2, palette.gold);
  canvas.rect(x, y + 7, 8, 1, palette.shadow);
  canvas.rect(x + 3, y + 2, 2, 3, palette.oxblood);
  canvas.rect(x + 3, y + 6, 2, 1, palette.oxblood);
}

function drawVictoryResult(canvas, x, y) {
  canvas.rect(x + 3, y + 5, 2, 5, palette.gold);
  canvas.rect(x + 7, y + 2, 2, 8, palette.gold);
  canvas.rect(x + 11, y + 5, 2, 5, palette.gold);
  canvas.line(x + 4, y + 5, x + 7, y + 8, palette.gold);
  canvas.line(x + 12, y + 5, x + 8, y + 9, palette.gold);
  canvas.rect(x + 3, y + 8, 10, 3, palette.gold);
  canvas.rect(x + 5, y + 9, 6, 1, palette.parchment);
  canvas.rect(x + 2, y + 11, 12, 3, palette.shadow);
  canvas.rect(x + 3, y + 11, 10, 2, palette.goldDark);
  canvas.rect(x + 5, y + 14, 6, 1, palette.oxblood);
}

function drawDefeatResult(canvas, x, y) {
  canvas.rect(x + 3, y + 1, 10, 2, palette.ironDark);
  canvas.rect(x + 2, y + 3, 12, 7, palette.stoneDark);
  canvas.rect(x + 3, y + 4, 10, 7, palette.iron);
  canvas.rect(x + 5, y + 5, 6, 4, palette.oxblood);
  canvas.line(x + 8, y + 2, x + 6, y + 6, palette.shadow);
  canvas.line(x + 6, y + 6, x + 9, y + 9, palette.shadow);
  canvas.line(x + 9, y + 9, x + 7, y + 13, palette.shadow);
  canvas.rect(x + 1, y + 12, 5, 2, palette.parchmentAged);
  canvas.rect(x + 10, y + 12, 5, 2, palette.parchmentAged);
  canvas.rect(x, y + 14, 6, 1, palette.shadow);
  canvas.rect(x + 10, y + 14, 6, 1, palette.shadow);
}

function drawDrawResult(canvas, x, y) {
  canvas.rect(x + 7, y + 2, 2, 11, palette.goldDark);
  canvas.rect(x + 3, y + 3, 10, 2, palette.gold);
  canvas.line(x + 3, y + 5, x + 1, y + 9, palette.parchmentAged);
  canvas.line(x + 3, y + 5, x + 5, y + 9, palette.parchmentAged);
  canvas.line(x + 12, y + 5, x + 10, y + 9, palette.parchmentAged);
  canvas.line(x + 12, y + 5, x + 14, y + 9, palette.parchmentAged);
  canvas.rect(x, y + 9, 6, 2, palette.iron);
  canvas.rect(x + 10, y + 9, 6, 2, palette.iron);
  canvas.rect(x + 1, y + 11, 4, 1, palette.stoneDark);
  canvas.rect(x + 11, y + 11, 4, 1, palette.stoneDark);
  canvas.rect(x + 5, y + 13, 6, 2, palette.shadow);
}

module.exports = {
  atlas: { name: "ui", width: 256, height: 64 },
  sprites: [
    { name: "status-warning", x: 64, y: 16, width: 16, height: 16, pixelScale: 2, draw: drawWarningIcon },
    { name: "portrait-fallback", x: 80, y: 0, width: 48, height: 48, pixelScale: 4, draw: drawFallbackPortrait },
    { name: "crest", x: 128, y: 0, width: 32, height: 32, pixelScale: 2, draw: drawCrest },
    { name: "nav-battle", x: 160, y: 0, width: 16, height: 16, pixelScale: 2, draw: drawBattleIcon },
    { name: "nav-deck", x: 176, y: 0, width: 16, height: 16, pixelScale: 2, draw: drawDeckIcon },
    { name: "nav-challenge", x: 192, y: 0, width: 16, height: 16, pixelScale: 2, draw: drawChallengeIcon },
    { name: "sound-on", x: 208, y: 0, width: 16, height: 16, pixelScale: 2, draw: (canvas, x, y) => drawSound(canvas, x, y, false) },
    { name: "sound-off", x: 224, y: 0, width: 16, height: 16, pixelScale: 2, draw: (canvas, x, y) => drawSound(canvas, x, y, true) },
    { name: "status-search", x: 240, y: 0, width: 16, height: 16, pixelScale: 2, draw: drawSearchIcon },
    { name: "result-victory", x: 160, y: 16, width: 32, height: 32, pixelScale: 2, draw: drawVictoryResult },
    { name: "result-defeat", x: 192, y: 16, width: 32, height: 32, pixelScale: 2, draw: drawDefeatResult },
    { name: "result-draw", x: 224, y: 16, width: 32, height: 32, pixelScale: 2, draw: drawDrawResult }
  ]
};
