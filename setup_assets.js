const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'assets', 'Pet Cats Pack');
const destDir = path.join(__dirname, 'assets', 'pets', 'cat', 'pet-cats-pack');

console.log('Starting assets setup...');

// Ensure target directories exist
fs.mkdirSync(destDir, { recursive: true });

// Copy License.txt
const licenseSrc = path.join(srcDir, 'License.txt');
const licenseDest = path.join(destDir, 'License.txt');
if (fs.existsSync(licenseSrc)) {
  fs.copyFileSync(licenseSrc, licenseDest);
  console.log('Copied License.txt');
} else {
  console.warn('License.txt not found in source!');
}

// Copy preview.png
const previewSrc = path.join(srcDir, 'preview.png');
const previewDest = path.join(destDir, 'preview.png');
if (fs.existsSync(previewSrc)) {
  fs.copyFileSync(previewSrc, previewDest);
  console.log('Copied preview.png');
} else {
  console.warn('preview.png not found in source!');
}

// Copy Cat-1 ~ Cat-6
const skins = ['cat-1', 'cat-2', 'cat-3', 'cat-4', 'cat-5', 'cat-6'];
const skinsMapping = {};

skins.forEach(skin => {
  const folderNum = skin.split('-')[1]; // '1', '2' ...
  const srcSubDirName = `Cat-${folderNum}`;
  const srcSubDir = path.join(srcDir, srcSubDirName);
  const destSubDir = path.join(destDir, skin);

  if (fs.existsSync(srcSubDir)) {
    fs.mkdirSync(destSubDir, { recursive: true });
    const files = fs.readdirSync(srcSubDir);
    files.forEach(file => {
      if (file.endsWith('.png')) {
        fs.copyFileSync(path.join(srcSubDir, file), path.join(destSubDir, file));
      }
    });
    console.log(`Copied assets for ${skin}`);
    skinsMapping[skin] = {
      basePath: skin,
      filePrefix: srcSubDirName
    };
  } else {
    console.warn(`Source folder ${srcSubDirName} not found!`);
  }
});

// Check file existence for the states
const stateSpecs = {
  idle: { file: '{filePrefix}-Idle.png', frameCount: 10, fps: 10 },
  walk: { file: '{filePrefix}-Walk.png', frameCount: 8, fps: 8 },
  run: { file: '{filePrefix}-Run.png', frameCount: 8, fps: 10 },
  speak: { file: '{filePrefix}-Meow.png', frameCount: 4, fps: 6 },
  sleep: { file: '{filePrefix}-Sleeping1.png', frameCount: 1, fps: 1 },
  sit: { file: '{filePrefix}-Sitting.png', frameCount: 1, fps: 1 },
  petting: { file: '{filePrefix}-Licking 1.png', frameCount: 5, fps: 8 },
  stretch: { file: '{filePrefix}-Stretching.png', frameCount: 13, fps: 8 },
  lie: { file: '{filePrefix}-Laying.png', frameCount: 8, fps: 8 }
};

const finalStates = {};

// We will verify for each state if the file actually exists in all skin directories.
// If it exists in at least some skin directories or all, we define it in global states.
// (animationManager.js resolves asset URL by substituting {filePrefix} at runtime)
Object.entries(stateSpecs).forEach(([stateName, spec]) => {
  let allExist = true;
  let existsCount = 0;

  skins.forEach(skin => {
    const filePrefix = skinsMapping[skin].filePrefix;
    const fileName = spec.file.replace('{filePrefix}', filePrefix);
    const filePath = path.join(destDir, skin, fileName);
    if (fs.existsSync(filePath)) {
      existsCount++;
    } else {
      allExist = false;
      console.warn(`State "${stateName}" file "${fileName}" missing for skin "${skin}"`);
    }
  });

  if (existsCount > 0) {
    finalStates[stateName] = {
      type: 'spritesheet',
      file: spec.file,
      frameCount: spec.frameCount,
      frameWidth: 50,
      frameHeight: 50,
      fps: spec.fps
    };
    console.log(`State "${stateName}" configured (exists in ${existsCount}/${skins.length} skins)`);
  } else {
    console.error(`State "${stateName}" files are missing in ALL skins! Skipping state config.`);
  }
});

// Generate config.json
const configJson = {
  packId: 'pet-cats-pack',
  packName: 'Pet Cats Pack',
  defaultSkin: 'cat-1',
  render: {
    displayWidth: 160,
    displayHeight: 160,
    pixelated: true
  },
  skins: skinsMapping,
  states: finalStates
};

fs.writeFileSync(
  path.join(destDir, 'config.json'),
  JSON.stringify(configJson, null, 2),
  'utf8'
);
console.log('Generated config.json');

// Generate credits.json
const creditsJson = {
  assets: [
    {
      id: "pet-cats-pack",
      name: "Pet Cats Pack",
      creator: "LuizMelo",
      license: "Creative Commons Zero v1.0 Universal",
      licenseShortName: "CC0-1.0",
      localLicenseFile: "assets/pets/cat/pet-cats-pack/License.txt",
      sourceUrl: "https://luizmelo.itch.io/pet-cat-pack",
      notes: "Original pack copied into assets/pets/cat/pet-cats-pack and configured as selectable cat skins."
    }
  ]
};

fs.writeFileSync(
  path.join(destDir, 'credits.json'),
  JSON.stringify(creditsJson, null, 2),
  'utf8'
);
console.log('Generated credits.json');

console.log('Assets setup completed successfully!');
