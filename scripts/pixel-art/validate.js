"use strict";

const fs = require("fs");
const path = require("path");
const GAME_DATA = require("../../public/game-data.js");
const { OUTPUT, generateOutputs } = require("./generate.js");
const { decodePngRgba, sha256 } = require("./lib.js");

const EXPECTED_COUNTS = Object.freeze({ cards: 29, weapons: 2, structures: 6, families: 10, files: 8, sprites: 69 });
const BUDGETS = Object.freeze({ critical: 300 * 1024, optional: 500 * 1024 });
const MANIFEST_SCHEMA = "taptics-pixel-art-manifest";
const MANIFEST_VERSION = 2;
const ATLAS_SPECS = Object.freeze({
  ui: Object.freeze({ file: "ui-atlas.png", width: 256, height: 64, critical: true }),
  battle: Object.freeze({ file: "battle-atlas.png", width: 256, height: 128, critical: true }),
  effects: Object.freeze({ file: "effects-atlas.png", width: 320, height: 32, critical: true }),
  cards: Object.freeze({ file: "cards-atlas.png", width: 384, height: 192, critical: false }),
  weapons: Object.freeze({ file: "weapons-atlas.png", width: 96, height: 48, critical: true }),
  structures: Object.freeze({ file: "structures-atlas.png", width: 384, height: 64, critical: true })
});
const BASE_SPRITES = Object.freeze({
  "portrait-fallback": Object.freeze({ atlas: "ui", width: 48, height: 48, pixelScale: 4 }),
  crest: Object.freeze({ atlas: "ui", width: 32, height: 32, pixelScale: 2 }),
  "nav-battle": Object.freeze({ atlas: "ui", width: 16, height: 16, pixelScale: 2 }),
  "nav-deck": Object.freeze({ atlas: "ui", width: 16, height: 16, pixelScale: 2 }),
  "nav-challenge": Object.freeze({ atlas: "ui", width: 16, height: 16, pixelScale: 2 }),
  "sound-on": Object.freeze({ atlas: "ui", width: 16, height: 16, pixelScale: 2 }),
  "sound-off": Object.freeze({ atlas: "ui", width: 16, height: 16, pixelScale: 2 }),
  "status-search": Object.freeze({ atlas: "ui", width: 16, height: 16, pixelScale: 2 }),
  "status-warning": Object.freeze({ atlas: "ui", width: 16, height: 16, pixelScale: 2 }),
  "result-victory": Object.freeze({ atlas: "ui", width: 32, height: 32, pixelScale: 2 }),
  "result-defeat": Object.freeze({ atlas: "ui", width: 32, height: 32, pixelScale: 2 }),
  "result-draw": Object.freeze({ atlas: "ui", width: 32, height: 32, pixelScale: 2 }),
  "battle-core": Object.freeze({ atlas: "battle", width: 64, height: 64, pixelScale: 4 }),
  "battle-wall": Object.freeze({ atlas: "battle", width: 64, height: 32, pixelScale: 4 }),
  "battle-shield": Object.freeze({ atlas: "battle", width: 64, height: 32, pixelScale: 4 }),
  "battle-cannon": Object.freeze({ atlas: "battle", width: 48, height: 48, pixelScale: 3 }),
  "battle-volley": Object.freeze({ atlas: "battle", width: 48, height: 48, pixelScale: 3 }),
  "battle-crew": Object.freeze({ atlas: "battle", width: 32, height: 32, pixelScale: 4 }),
  "battle-rune": Object.freeze({ atlas: "battle", width: 32, height: 32, pixelScale: 4 }),
  "effect-impact": Object.freeze({ atlas: "battle", width: 32, height: 32, pixelScale: 4 }),
  "effect-debris": Object.freeze({ atlas: "battle", width: 32, height: 32, pixelScale: 4 }),
  "effect-siphon-pip": Object.freeze({ atlas: "battle", width: 16, height: 16, pixelScale: 2 })
});

function sortedKeys(record) {
  return Object.keys(record || {}).sort();
}

function assertExactKeys(label, actual, expected) {
  const actualKeys = [...actual].sort();
  const expectedKeys = [...expected].sort();
  const missing = expectedKeys.filter((name) => !actualKeys.includes(name));
  const extra = actualKeys.filter((name) => !expectedKeys.includes(name));
  if (missing.length || extra.length) {
    const details = [missing.length ? `missing ${missing.join(", ")}` : "", extra.length ? `extra ${extra.join(", ")}` : ""].filter(Boolean).join("; ");
    throw new Error(`${label} mismatch: ${details}`);
  }
}

function requireText(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} must be non-empty text`);
}

function validateCatalogueMetadata() {
  const cardKeys = sortedKeys(GAME_DATA.cards);
  const weaponKeys = sortedKeys(GAME_DATA.weapons);
  const structureKeys = cardKeys.filter((key) => GAME_DATA.cards[key].structure === true);
  const familyKeys = sortedKeys(GAME_DATA.effectFamilies);
  if (cardKeys.length !== EXPECTED_COUNTS.cards) throw new Error(`Expected ${EXPECTED_COUNTS.cards} cards, found ${cardKeys.length}`);
  if (weaponKeys.length !== EXPECTED_COUNTS.weapons) throw new Error(`Expected ${EXPECTED_COUNTS.weapons} weapons, found ${weaponKeys.length}`);
  if (structureKeys.length !== EXPECTED_COUNTS.structures) throw new Error(`Expected ${EXPECTED_COUNTS.structures} structures, found ${structureKeys.length}`);
  if (familyKeys.length !== EXPECTED_COUNTS.families) throw new Error(`Expected ${EXPECTED_COUNTS.families} effect families, found ${familyKeys.length}`);

  for (const key of familyKeys) {
    const family = GAME_DATA.effectFamilies[key];
    requireText(family.name, `Effect family ${key} name`);
    if (family.className !== key || !/^[a-z][a-z0-9-]*$/.test(family.className)) {
      throw new Error(`Effect family ${key} must expose a matching CSS-safe className`);
    }
  }

  const artTokens = new Set();
  const usedFamilies = new Set();
  for (const [kind, keys, entries] of [["card", cardKeys, GAME_DATA.cards], ["weapon", weaponKeys, GAME_DATA.weapons]]) {
    for (const key of keys) {
      const entry = entries[key];
      requireText(entry.name, `${kind} ${key} name`);
      requireText(entry.short, `${kind} ${key} short label`);
      requireText(entry.description, `${kind} ${key} description`);
      requireText(entry.art, `${kind} ${key} art token`);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.art)) throw new Error(`${kind} ${key} has an invalid art token: ${entry.art}`);
      if (artTokens.has(entry.art)) throw new Error(`Duplicate art token: ${entry.art}`);
      artTokens.add(entry.art);
      if (!familyKeys.includes(entry.effectFamily)) throw new Error(`${kind} ${key} has unsupported effect family: ${entry.effectFamily}`);
      usedFamilies.add(entry.effectFamily);
      if (kind === "card" && !Object.hasOwn(GAME_DATA.categories, entry.category)) throw new Error(`card ${key} has unsupported category: ${entry.category}`);
    }
  }
  assertExactKeys("Used effect-family coverage", usedFamilies, familyKeys);
  return { cardKeys, weaponKeys, structureKeys, familyKeys };
}

function expectedSpriteSpecs(coverage) {
  const specs = { ...BASE_SPRITES };
  for (const key of coverage.familyKeys) specs[`family-${key}`] = { atlas: "effects", width: 32, height: 32, pixelScale: 4 };
  for (const key of coverage.cardKeys) specs[`card-${key}`] = { atlas: "cards", width: 48, height: 48, pixelScale: 3 };
  for (const key of coverage.weaponKeys) specs[`weapon-${key}`] = { atlas: "weapons", width: 48, height: 48, pixelScale: 3 };
  for (const key of coverage.structureKeys) specs[`structure-${key}`] = { atlas: "structures", width: 64, height: 64, pixelScale: 4 };
  return specs;
}

function spriteRegionData(atlas, sprite) {
  const region = Buffer.alloc(sprite.width * sprite.height * 4);
  for (let row = 0; row < sprite.height; row += 1) {
    const sourceStart = ((sprite.y + row) * atlas.width + sprite.x) * 4;
    atlas.data.copy(region, row * sprite.width * 4, sourceStart, sourceStart + sprite.width * 4);
  }
  return region;
}

function validateCoarseBlocks(atlas, sprite, name) {
  if (!atlas || !Number.isInteger(atlas.width) || !Number.isInteger(atlas.height) || !Buffer.isBuffer(atlas.data) || atlas.data.length !== atlas.width * atlas.height * 4) {
    throw new Error(`Invalid decoded atlas data for ${name}`);
  }
  if (!sprite || ![sprite.x, sprite.y, sprite.width, sprite.height, sprite.pixelScale].every(Number.isInteger) || sprite.x < 0 || sprite.y < 0 || sprite.width <= 0 || sprite.height <= 0 || sprite.pixelScale <= 0 || sprite.width % sprite.pixelScale !== 0 || sprite.height % sprite.pixelScale !== 0) {
    throw new Error(`Invalid coarse sprite dimensions for ${name}`);
  }
  if (sprite.x + sprite.width > atlas.width || sprite.y + sprite.height > atlas.height) throw new Error(`Coarse sprite exceeds decoded atlas: ${name}`);
  const scale = sprite.pixelScale;
  for (let localY = 0; localY < sprite.height; localY += scale) {
    for (let localX = 0; localX < sprite.width; localX += scale) {
      const referenceIndex = ((sprite.y + localY) * atlas.width + sprite.x + localX) * 4;
      const reference = atlas.data.subarray(referenceIndex, referenceIndex + 4);
      for (let blockY = 0; blockY < scale; blockY += 1) {
        for (let blockX = 0; blockX < scale; blockX += 1) {
          const pixelIndex = ((sprite.y + localY + blockY) * atlas.width + sprite.x + localX + blockX) * 4;
          if (!atlas.data.subarray(pixelIndex, pixelIndex + 4).equals(reference)) {
            throw new Error(`Sprite ${name} contains a non-uniform ${scale}x${scale} block at ${localX / scale},${localY / scale}`);
          }
        }
      }
    }
  }
}

function validateSprites(manifest, coverage, decodedAtlases) {
  const specs = expectedSpriteSpecs(coverage);
  const spriteNames = sortedKeys(manifest.sprites);
  assertExactKeys("Sprite coverage", spriteNames, Object.keys(specs));
  if (spriteNames.length !== EXPECTED_COUNTS.sprites) throw new Error(`Expected ${EXPECTED_COUNTS.sprites} sprites, found ${spriteNames.length}`);

  for (const name of spriteNames) {
    const sprite = manifest.sprites[name];
    const spec = specs[name];
    if (![sprite.x, sprite.y, sprite.width, sprite.height].every(Number.isInteger) || sprite.x < 0 || sprite.y < 0 || sprite.width <= 0 || sprite.height <= 0) {
      throw new Error(`Invalid sprite rectangle for ${name}`);
    }
    const atlas = manifest.atlases[sprite.atlas];
    if (!atlas || sprite.x + sprite.width > atlas.width || sprite.y + sprite.height > atlas.height) throw new Error(`Sprite exceeds atlas: ${name}`);
    if (!Number.isInteger(sprite.pixelScale) || sprite.pixelScale <= 0 || sprite.width % sprite.pixelScale !== 0 || sprite.height % sprite.pixelScale !== 0) {
      throw new Error(`Invalid pixel scale for ${name}`);
    }
    if (sprite.logicalWidth !== sprite.width / sprite.pixelScale || sprite.logicalHeight !== sprite.height / sprite.pixelScale || !Number.isInteger(sprite.logicalWidth) || !Number.isInteger(sprite.logicalHeight)) {
      throw new Error(`Invalid logical dimensions for ${name}`);
    }
    if (sprite.atlas !== spec.atlas || sprite.width !== spec.width || sprite.height !== spec.height || sprite.pixelScale !== spec.pixelScale) {
      throw new Error(`Sprite metadata mismatch for ${name}`);
    }
    if (!/^[a-f0-9]{64}$/.test(sprite.sha256)) throw new Error(`Missing deterministic sprite hash: ${name}`);
    if (!Number.isInteger(sprite.opaquePixels) || sprite.opaquePixels <= 0 || sprite.opaquePixels > sprite.width * sprite.height) {
      throw new Error(`Blank or invalid sprite: ${name}`);
    }
    if (sprite.opaquePixels % (sprite.pixelScale ** 2) !== 0) throw new Error(`Opaque pixel count does not match pixel scale for ${name}`);
    const decodedAtlas = decodedAtlases[sprite.atlas];
    if (!decodedAtlas) throw new Error(`Missing decoded atlas for ${name}`);
    const region = spriteRegionData(decodedAtlas, sprite);
    if (sha256(region) !== sprite.sha256) throw new Error(`Sprite-region hash mismatch for ${name}`);
    let opaquePixels = 0;
    for (let alpha = 3; alpha < region.length; alpha += 4) {
      if (region[alpha] !== 0) opaquePixels += 1;
    }
    if (opaquePixels !== sprite.opaquePixels) throw new Error(`Opaque pixel count mismatch for ${name}`);
    validateCoarseBlocks(decodedAtlas, sprite, name);
  }

  for (const atlasName of Object.keys(manifest.atlases)) {
    const regions = spriteNames.filter((name) => manifest.sprites[name].atlas === atlasName).map((name) => ({ name, ...manifest.sprites[name] }));
    for (let leftIndex = 0; leftIndex < regions.length; leftIndex += 1) {
      const left = regions[leftIndex];
      for (let rightIndex = leftIndex + 1; rightIndex < regions.length; rightIndex += 1) {
        const right = regions[rightIndex];
        const overlaps = left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
        if (overlaps) throw new Error(`Sprite regions overlap in ${atlasName}: ${left.name} and ${right.name}`);
      }
    }
  }

  const portraitNames = [
    ...coverage.cardKeys.map((key) => `card-${key}`),
    ...coverage.weaponKeys.map((key) => `weapon-${key}`)
  ];
  const portraitHashes = portraitNames.map((name) => manifest.sprites[name].sha256);
  if (new Set(portraitHashes).size !== portraitHashes.length) throw new Error("Card and weapon portraits must have unique pixel hashes");
}

function validateDirectory(directory = OUTPUT) {
  const coverage = validateCatalogueMetadata();
  const expected = generateOutputs();
  const expectedNames = Object.keys(expected).sort();
  const expectedFiles = [...Object.values(ATLAS_SPECS).map((atlas) => atlas.file), "manifest.json", "pixel-art.css"].sort();
  assertExactKeys("Generated file set", expectedNames, expectedFiles);
  if (expectedNames.length !== EXPECTED_COUNTS.files) throw new Error(`Expected ${EXPECTED_COUNTS.files} generated files, found ${expectedNames.length}`);

  const actualNames = fs.existsSync(directory) ? fs.readdirSync(directory).filter((name) => !name.startsWith(".")).sort() : [];
  const missing = expectedNames.filter((name) => !actualNames.includes(name));
  const orphaned = actualNames.filter((name) => !expectedNames.includes(name));
  if (missing.length) throw new Error(`Missing generated assets: ${missing.join(", ")}`);
  if (orphaned.length) throw new Error(`Orphan generated assets: ${orphaned.join(", ")}`);

  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8"));
  if (manifest.schema !== MANIFEST_SCHEMA || manifest.version !== MANIFEST_VERSION) {
    throw new Error(`Pixel-art manifest must use ${MANIFEST_SCHEMA} version ${MANIFEST_VERSION}`);
  }
  assertExactKeys("Atlas coverage", Object.keys(manifest.atlases || {}), Object.keys(ATLAS_SPECS));
  let criticalBytes = 0;
  let optionalBytes = 0;
  const decodedAtlases = {};
  for (const [atlasName, spec] of Object.entries(ATLAS_SPECS)) {
    const atlas = manifest.atlases[atlasName];
    if (atlas.file !== spec.file || atlas.width !== spec.width || atlas.height !== spec.height || atlas.critical !== spec.critical) {
      throw new Error(`Atlas metadata mismatch for ${atlasName}`);
    }
    const png = fs.readFileSync(path.join(directory, atlas.file));
    const info = decodePngRgba(png);
    if (info.width !== atlas.width || info.height !== atlas.height) throw new Error(`Dimension mismatch for ${atlasName}`);
    if (info.bitDepth !== 8 || info.colorType !== 6) throw new Error(`Atlas must be 8-bit RGBA: ${atlasName}`);
    if (info.width > 1024 || info.height > 1024) throw new Error(`Atlas exceeds 1024px budget: ${atlasName}`);
    if (png.length !== atlas.bytes) throw new Error(`Byte count mismatch for ${atlasName}`);
    if (sha256(png) !== atlas.sha256) throw new Error(`Hash mismatch for ${atlasName}`);
    decodedAtlases[atlasName] = info;
    if (atlas.critical) criticalBytes += png.length;
    else optionalBytes += png.length;
  }
  if (criticalBytes > BUDGETS.critical) throw new Error(`Critical atlases exceed ${BUDGETS.critical} byte budget: ${criticalBytes}`);
  if (optionalBytes > BUDGETS.optional) throw new Error(`Optional atlases exceed ${BUDGETS.optional} byte budget: ${optionalBytes}`);

  validateSprites(manifest, coverage, decodedAtlases);
  for (const name of expectedNames) {
    const actual = fs.readFileSync(path.join(directory, name));
    if (!actual.equals(expected[name])) throw new Error(`Generated asset is stale or nondeterministic: ${name}`);
  }
  return { files: actualNames.length, sprites: Object.keys(manifest.sprites).length };
}

if (require.main === module) {
  const result = validateDirectory();
  process.stdout.write(`Validated ${result.files} files and ${result.sprites} sprites.\n`);
}

module.exports = { validateCoarseBlocks, validateDirectory, validateSprites };
