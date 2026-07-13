"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { generateOutputs } = require("../scripts/pixel-art/generate.js");
const { PixelCanvas, decodePngRgba, logicalDimensions } = require("../scripts/pixel-art/lib.js");
const { validateCoarseBlocks, validateDirectory } = require("../scripts/pixel-art/validate.js");

test("pixel-art generation is deterministic and committed outputs are current", () => {
  const first = generateOutputs();
  const second = generateOutputs();
  assert.deepEqual(Object.keys(first), Object.keys(second));
  for (const name of Object.keys(first)) assert.ok(first[name].equals(second[name]), `${name} must be byte-identical`);
  assert.deepEqual(validateDirectory(), { files: 8, sprites: 69 });

  const manifest = JSON.parse(first["manifest.json"].toString("utf8"));
  assert.equal(manifest.schema, "taptics-pixel-art-manifest");
  assert.equal(manifest.version, 2);
  assert.equal(Object.hasOwn(manifest, "logicalScale"), false, "coarse scale must be declared per sprite");
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
  const decodedAtlases = Object.fromEntries(Object.entries(manifest.atlases).map(([name, atlas]) => [name, decodePngRgba(first[atlas.file])]));
  for (const [name, sprite] of Object.entries(manifest.sprites)) {
    assert.match(generatedCss, new RegExp(`^\\.pixel-${name} \\{`, "m"), `${name} must preserve its generated CSS class`);
    assert.match(sprite.sha256, /^[a-f0-9]{64}$/, `${name} must have a deterministic pixel hash`);
    assert.ok(sprite.opaquePixels > 0, `${name} must contain visible pixels`);
    assert.ok(Number.isInteger(sprite.pixelScale) && sprite.pixelScale > 1, `${name} must declare a coarse pixel scale`);
    assert.equal(sprite.logicalWidth, sprite.width / sprite.pixelScale, `${name} must declare its logical width`);
    assert.equal(sprite.logicalHeight, sprite.height / sprite.pixelScale, `${name} must declare its logical height`);
    assert.equal(sprite.opaquePixels % (sprite.pixelScale ** 2), 0, `${name} opacity must cover complete coarse blocks`);
    validateCoarseBlocks(decodedAtlases[sprite.atlas], sprite, name);

    let expectedScale;
    if (sprite.atlas === "cards" || sprite.atlas === "weapons") expectedScale = 3;
    else if (sprite.atlas === "structures" || sprite.atlas === "effects") expectedScale = 4;
    else if (sprite.atlas === "ui") expectedScale = name === "portrait-fallback" ? 4 : 2;
    else expectedScale = ["battle-cannon", "battle-volley"].includes(name) ? 3 : name === "effect-siphon-pip" ? 2 : 4;
    assert.equal(sprite.pixelScale, expectedScale, `${name} must use its assigned coarse scale`);
  }
  const portraitHashes = spriteNames
    .filter((name) => name.startsWith("card-") || name.startsWith("weapon-"))
    .map((name) => manifest.sprites[name].sha256);
  assert.equal(new Set(portraitHashes).size, 31, "all card and weapon portraits must be pixel-unique");

  const cardNames = spriteNames.filter((name) => name.startsWith("card-"));
  const logicalMotifs = Object.fromEntries(cardNames.map((name) => {
    const sprite = manifest.sprites[name];
    const atlas = decodedAtlases[sprite.atlas];
    const colors = [];
    for (let logicalY = 2; logicalY < sprite.logicalHeight - 2; logicalY += 1) {
      for (let logicalX = 2; logicalX < sprite.logicalWidth - 2; logicalX += 1) {
        const pixel = ((sprite.y + logicalY * sprite.pixelScale) * atlas.width + sprite.x + logicalX * sprite.pixelScale) * 4;
        colors.push(atlas.data.readUInt32BE(pixel));
      }
    }
    return [name, colors];
  }));
  for (let left = 0; left < cardNames.length; left += 1) {
    for (let right = left + 1; right < cardNames.length; right += 1) {
      const leftName = cardNames[left];
      const rightName = cardNames[right];
      const leftMotif = logicalMotifs[leftName];
      const rightMotif = logicalMotifs[rightName];
      const differences = leftMotif.reduce((total, color, index) => total + Number(color !== rightMotif[index]), 0);
      assert.ok(differences >= 24, `${leftName} and ${rightName} must differ across at least 24 central logical cells`);
    }
  }

  const coarseSprite = manifest.sprites["portrait-fallback"];
  const corruptAtlas = { ...decodedAtlases.ui, data: Buffer.from(decodedAtlases.ui.data) };
  const corruptIndex = (coarseSprite.y * corruptAtlas.width + coarseSprite.x + 1) * 4;
  corruptAtlas.data[corruptIndex] ^= 0xff;
  assert.throws(() => validateCoarseBlocks(corruptAtlas, coarseSprite, "portrait-fallback"), /non-uniform 4x4 block/);
});

test("coarse-pixel dimensions and nearest-neighbor scaling are strict", () => {
  assert.deepEqual(logicalDimensions(48, 48, 3, "Portrait"), { width: 16, height: 16 });
  assert.deepEqual(logicalDimensions(64, 32, 4, "Wall"), { width: 16, height: 8 });
  assert.throws(() => logicalDimensions(48, 48, undefined, "Missing"), /pixelScale must be a positive integer/);
  assert.throws(() => logicalDimensions(48, 48, 0, "Zero"), /pixelScale must be a positive integer/);
  assert.throws(() => logicalDimensions(48, 48, 1.5, "Fractional"), /pixelScale must be a positive integer/);
  assert.throws(() => logicalDimensions(16, 15, 2, "Indivisible"), /must be divisible by pixelScale 2/);
  assert.throws(() => logicalDimensions(0, 16, 2, "Empty"), /positive integer physical dimensions/);

  const logical = new PixelCanvas(2, 1);
  logical.pixel(0, 0, "#11223344");
  logical.pixel(1, 0, "#aabbccdd");
  const physical = new PixelCanvas(6, 3);
  physical.blitNearestNeighbor(logical, 0, 0, 3);
  const decoded = decodePngRgba(physical.encodePng());
  const sprite = { x: 0, y: 0, width: 6, height: 3, pixelScale: 3 };
  assert.doesNotThrow(() => validateCoarseBlocks(decoded, sprite, "scaled-proof"));
  assert.deepEqual([...decoded.data.subarray(0, 4)], [0x11, 0x22, 0x33, 0x44]);
  assert.deepEqual([...decoded.data.subarray(5 * 4, 6 * 4)], [0xaa, 0xbb, 0xcc, 0xdd]);
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

test("pixel-art validation rejects invalid manifest scale metadata", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "taptics-pixel-metadata-"));
  const outputs = generateOutputs();
  const manifestPath = path.join(temporary, "manifest.json");
  const freshManifest = () => JSON.parse(outputs["manifest.json"].toString("utf8"));
  const writeManifest = (manifest) => fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  try {
    for (const [name, contents] of Object.entries(outputs)) fs.writeFileSync(path.join(temporary, name), contents);

    const invalidScale = freshManifest();
    delete invalidScale.sprites.crest.pixelScale;
    writeManifest(invalidScale);
    assert.throws(() => validateDirectory(temporary), /Invalid pixel scale for crest/);

    const invalidDimensions = freshManifest();
    invalidDimensions.sprites.crest.logicalWidth += 1;
    writeManifest(invalidDimensions);
    assert.throws(() => validateDirectory(temporary), /Invalid logical dimensions for crest/);

    const invalidSchema = freshManifest();
    invalidSchema.version = 1;
    writeManifest(invalidSchema);
    assert.throws(() => validateDirectory(temporary), /manifest must use taptics-pixel-art-manifest version 2/i);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
