"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { generateOutputs } = require("../scripts/pixel-art/generate.js");
const { validateDirectory } = require("../scripts/pixel-art/validate.js");

test("pixel-art generation is deterministic and committed outputs are current", () => {
  const first = generateOutputs();
  const second = generateOutputs();
  assert.deepEqual(Object.keys(first), Object.keys(second));
  for (const name of Object.keys(first)) assert.ok(first[name].equals(second[name]), `${name} must be byte-identical`);
  assert.deepEqual(validateDirectory(), { files: 8, sprites: 69 });

  const manifest = JSON.parse(first["manifest.json"].toString("utf8"));
  const spriteNames = Object.keys(manifest.sprites);
  assert.equal(spriteNames.filter((name) => name.startsWith("card-")).length, 29);
  assert.equal(spriteNames.filter((name) => name.startsWith("weapon-")).length, 2);
  assert.equal(spriteNames.filter((name) => name.startsWith("structure-")).length, 6);
  assert.equal(spriteNames.filter((name) => name.startsWith("family-")).length, 10);
  const lifecycleSprites = ["status-warning", "result-victory", "result-defeat", "result-draw"];
  assert.deepEqual(lifecycleSprites.map((name) => [name, manifest.sprites[name].atlas, manifest.sprites[name].width, manifest.sprites[name].height]), [
    ["status-warning", "ui", 16, 16],
    ["result-victory", "ui", 32, 32],
    ["result-defeat", "ui", 32, 32],
    ["result-draw", "ui", 32, 32]
  ]);
  assert.equal(new Set(lifecycleSprites.map((name) => manifest.sprites[name].sha256)).size, lifecycleSprites.length, "result/status sprites must be pixel-unique");
  const generatedCss = first["pixel-art.css"].toString("utf8");
  for (const name of lifecycleSprites) assert.match(generatedCss, new RegExp(`\\.pixel-${name} \\{`));
  for (const [name, sprite] of Object.entries(manifest.sprites)) {
    assert.match(sprite.sha256, /^[a-f0-9]{64}$/, `${name} must have a deterministic pixel hash`);
    assert.ok(sprite.opaquePixels > 0, `${name} must contain visible pixels`);
  }
  const portraitHashes = spriteNames
    .filter((name) => name.startsWith("card-") || name.startsWith("weapon-"))
    .map((name) => manifest.sprites[name].sha256);
  assert.equal(new Set(portraitHashes).size, 31, "all card and weapon portraits must be pixel-unique");
});

test("pixel-art validation rejects missing and orphan generated files", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "taptics-pixel-"));
  const outputs = generateOutputs();
  try {
    for (const [name, contents] of Object.entries(outputs)) fs.writeFileSync(path.join(temporary, name), contents);
    fs.unlinkSync(path.join(temporary, "ui-atlas.png"));
    assert.throws(() => validateDirectory(temporary), /Missing generated assets: ui-atlas\.png/);
    fs.writeFileSync(path.join(temporary, "ui-atlas.png"), outputs["ui-atlas.png"]);
    fs.writeFileSync(path.join(temporary, "orphan.png"), outputs["ui-atlas.png"]);
    assert.throws(() => validateDirectory(temporary), /Orphan generated assets: orphan\.png/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
