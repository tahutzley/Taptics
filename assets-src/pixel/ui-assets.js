"use strict";

const palette = require("./palette.js");

function drawFallbackPortrait(canvas, x, y) {
  canvas.rect(x, y, 48, 48, palette.shadow);
  canvas.rect(x + 2, y + 2, 44, 44, palette.ironDark);
  canvas.rect(x + 4, y + 4, 40, 40, palette.stoneDark);
  canvas.rect(x + 7, y + 7, 34, 34, palette.charred);
  canvas.rect(x + 12, y + 11, 24, 3, palette.magic);
  canvas.rect(x + 12, y + 34, 24, 3, palette.magic);
  canvas.rect(x + 11, y + 14, 3, 20, palette.magic);
  canvas.rect(x + 34, y + 14, 3, 20, palette.magic);
  canvas.rect(x + 18, y + 18, 4, 4, palette.parchment);
  canvas.rect(x + 26, y + 18, 4, 4, palette.parchment);
  canvas.rect(x + 20, y + 28, 8, 3, palette.parchmentAged);
}

function drawCrest(canvas, x, y) {
  canvas.rect(x + 4, y + 2, 24, 3, palette.gold);
  canvas.rect(x + 2, y + 5, 28, 18, palette.oxblood);
  canvas.rect(x + 5, y + 5, 22, 20, palette.parchmentAged);
  canvas.rect(x + 8, y + 7, 16, 17, palette.oak);
  canvas.rect(x + 11, y + 8, 10, 14, palette.gold);
  canvas.rect(x + 14, y + 10, 4, 10, palette.oxblood);
  canvas.rect(x + 8, y + 23, 16, 3, palette.parchmentAged);
  canvas.rect(x + 11, y + 26, 10, 2, palette.goldDark);
  canvas.rect(x + 14, y + 28, 4, 2, palette.shadow);
}

function drawBattleIcon(canvas, x, y) {
  canvas.line(x + 3, y + 13, x + 12, y + 3, palette.parchment);
  canvas.line(x + 4, y + 13, x + 13, y + 4, palette.parchment);
  canvas.line(x + 3, y + 3, x + 12, y + 13, palette.gold);
  canvas.line(x + 4, y + 3, x + 13, y + 12, palette.gold);
  canvas.rect(x + 1, y + 11, 5, 3, palette.oak);
  canvas.rect(x + 10, y + 11, 5, 3, palette.oak);
}

function drawDeckIcon(canvas, x, y) {
  canvas.rect(x + 3, y + 1, 10, 14, palette.shadow);
  canvas.rect(x + 1, y + 3, 10, 12, palette.oakDark);
  canvas.rect(x + 2, y + 2, 10, 12, palette.parchmentAged);
  canvas.rect(x + 4, y + 4, 6, 2, palette.oxblood);
  canvas.rect(x + 4, y + 8, 6, 1, palette.oak);
  canvas.rect(x + 4, y + 11, 4, 1, palette.oak);
}

function drawChallengeIcon(canvas, x, y) {
  canvas.rect(x + 6, y + 1, 4, 3, palette.gold);
  canvas.rect(x + 3, y + 4, 10, 7, palette.goldDark);
  canvas.rect(x + 5, y + 4, 6, 8, palette.gold);
  canvas.rect(x + 6, y + 12, 4, 2, palette.parchmentAged);
  canvas.rect(x + 4, y + 14, 8, 1, palette.goldDark);
  canvas.rect(x + 1, y + 4, 3, 5, palette.parchmentAged);
  canvas.rect(x + 12, y + 4, 3, 5, palette.parchmentAged);
}

function drawSound(canvas, x, y, muted) {
  canvas.rect(x + 2, y + 6, 4, 5, palette.parchmentAged);
  canvas.rect(x + 6, y + 4, 3, 9, palette.parchment);
  if (muted) {
    canvas.line(x + 10, y + 5, x + 14, y + 11, palette.oxblood);
    canvas.line(x + 14, y + 5, x + 10, y + 11, palette.oxblood);
  } else {
    canvas.pixel(x + 11, y + 6, palette.gold);
    canvas.pixel(x + 12, y + 7, palette.gold);
    canvas.pixel(x + 12, y + 9, palette.gold);
    canvas.pixel(x + 11, y + 10, palette.gold);
    canvas.pixel(x + 14, y + 5, palette.gold);
    canvas.pixel(x + 15, y + 8, palette.gold);
    canvas.pixel(x + 14, y + 11, palette.gold);
  }
}

function drawSearchIcon(canvas, x, y) {
  canvas.rect(x + 3, y + 2, 7, 2, palette.parchment);
  canvas.rect(x + 2, y + 4, 2, 7, palette.parchment);
  canvas.rect(x + 9, y + 4, 2, 7, palette.parchment);
  canvas.rect(x + 4, y + 10, 7, 2, palette.parchment);
  canvas.line(x + 10, y + 10, x + 14, y + 14, palette.gold);
}

function drawWarningIcon(canvas, x, y) {
  canvas.line(x + 8, y + 1, x + 1, y + 14, palette.shadow);
  canvas.line(x + 8, y + 1, x + 15, y + 14, palette.shadow);
  canvas.rect(x + 2, y + 13, 13, 2, palette.shadow);
  canvas.line(x + 8, y + 3, x + 3, y + 12, palette.gold);
  canvas.line(x + 8, y + 3, x + 13, y + 12, palette.gold);
  canvas.rect(x + 4, y + 11, 9, 2, palette.gold);
  canvas.rect(x + 7, y + 6, 3, 4, palette.oxblood);
  canvas.rect(x + 7, y + 11, 3, 2, palette.oxblood);
}

function drawVictoryResult(canvas, x, y) {
  canvas.rect(x + 5, y + 21, 22, 5, palette.shadow);
  canvas.rect(x + 7, y + 18, 18, 6, palette.goldDark);
  canvas.rect(x + 6, y + 10, 4, 10, palette.gold);
  canvas.rect(x + 14, y + 6, 4, 14, palette.gold);
  canvas.rect(x + 22, y + 10, 4, 10, palette.gold);
  canvas.line(x + 7, y + 10, x + 15, y + 18, palette.gold);
  canvas.line(x + 25, y + 10, x + 17, y + 18, palette.gold);
  canvas.rect(x + 9, y + 20, 14, 3, palette.parchment);
  canvas.rect(x + 10, y + 27, 12, 2, palette.oxblood);
  canvas.pixel(x + 8, y + 8, palette.parchment);
  canvas.pixel(x + 16, y + 4, palette.parchment);
  canvas.pixel(x + 24, y + 8, palette.parchment);
}

function drawDefeatResult(canvas, x, y) {
  canvas.rect(x + 5, y + 4, 22, 3, palette.ironDark);
  canvas.rect(x + 4, y + 7, 24, 12, palette.stoneDark);
  canvas.rect(x + 7, y + 9, 18, 13, palette.iron);
  canvas.rect(x + 9, y + 11, 14, 9, palette.oxblood);
  canvas.line(x + 17, y + 5, x + 12, y + 14, palette.shadow);
  canvas.line(x + 12, y + 14, x + 18, y + 19, palette.shadow);
  canvas.line(x + 18, y + 19, x + 14, y + 26, palette.shadow);
  canvas.rect(x + 5, y + 24, 8, 3, palette.parchmentAged);
  canvas.rect(x + 20, y + 24, 7, 3, palette.parchmentAged);
  canvas.rect(x + 3, y + 28, 10, 2, palette.shadow);
  canvas.rect(x + 19, y + 28, 10, 2, palette.shadow);
}

function drawDrawResult(canvas, x, y) {
  canvas.rect(x + 14, y + 4, 4, 22, palette.goldDark);
  canvas.rect(x + 8, y + 5, 16, 3, palette.gold);
  canvas.rect(x + 11, y + 26, 10, 3, palette.shadow);
  canvas.line(x + 8, y + 8, x + 4, y + 17, palette.parchmentAged);
  canvas.line(x + 24, y + 8, x + 28, y + 17, palette.parchmentAged);
  canvas.line(x + 8, y + 8, x + 12, y + 17, palette.parchmentAged);
  canvas.line(x + 24, y + 8, x + 20, y + 17, palette.parchmentAged);
  canvas.rect(x + 3, y + 17, 10, 3, palette.iron);
  canvas.rect(x + 19, y + 17, 10, 3, palette.iron);
  canvas.rect(x + 5, y + 20, 6, 2, palette.stoneDark);
  canvas.rect(x + 21, y + 20, 6, 2, palette.stoneDark);
}

module.exports = {
  atlas: { name: "ui", width: 256, height: 64 },
  sprites: [
    { name: "status-warning", x: 64, y: 16, width: 16, height: 16, draw: drawWarningIcon },
    { name: "portrait-fallback", x: 80, y: 0, width: 48, height: 48, draw: drawFallbackPortrait },
    { name: "crest", x: 128, y: 0, width: 32, height: 32, draw: drawCrest },
    { name: "nav-battle", x: 160, y: 0, width: 16, height: 16, draw: drawBattleIcon },
    { name: "nav-deck", x: 176, y: 0, width: 16, height: 16, draw: drawDeckIcon },
    { name: "nav-challenge", x: 192, y: 0, width: 16, height: 16, draw: drawChallengeIcon },
    { name: "sound-on", x: 208, y: 0, width: 16, height: 16, draw: (canvas, x, y) => drawSound(canvas, x, y, false) },
    { name: "sound-off", x: 224, y: 0, width: 16, height: 16, draw: (canvas, x, y) => drawSound(canvas, x, y, true) },
    { name: "status-search", x: 240, y: 0, width: 16, height: 16, draw: drawSearchIcon },
    { name: "result-victory", x: 160, y: 16, width: 32, height: 32, draw: drawVictoryResult },
    { name: "result-defeat", x: 192, y: 16, width: 32, height: 32, draw: drawDefeatResult },
    { name: "result-draw", x: 224, y: 16, width: 32, height: 32, draw: drawDrawResult }
  ]
};
