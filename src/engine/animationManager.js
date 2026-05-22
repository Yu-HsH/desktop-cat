const imageModules = import.meta.glob("../../assets/pets/cat/**/*.png", {
  eager: true,
  query: "?url",
  import: "default"
});

const skinConfigModules = import.meta.glob("../../assets/pets/cat/**/config.json", {
  eager: true,
  import: "default"
});

const STATE_ALIASES = {
  dragged: "idle",
  pet: "petting",
  laying: "lie",
  layDown: "lie",
  lyingDown: "lie",
  lying_down: "lie",
  yawn: "idle"
};

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/").replace(/\/+/g, "/");
}

function normalizeStateName(stateName) {
  return STATE_ALIASES[stateName] || stateName || "idle";
}

function interpolateFileName(fileName, skin) {
  return fileName.replaceAll("{filePrefix}", skin.filePrefix);
}

function createLegacyFrameMap() {
  return Object.entries(imageModules).reduce((framesByState, [filePath, url]) => {
    const normalizedPath = normalizePath(filePath);
    const match = normalizedPath.match(/^\.\.\/\.\.\/assets\/pets\/cat\/([^/]+)\/[^/]+\.png$/);

    if (!match) {
      return framesByState;
    }

    const stateName = match[1];

    if (!framesByState[stateName]) {
      framesByState[stateName] = [];
    }

    framesByState[stateName].push({ filePath: normalizedPath, url });
    return framesByState;
  }, {});
}

function parseActiveSkin(activeSkin) {
  if (typeof activeSkin === "string") {
    const [pack, skin] = activeSkin.split("/");
    return { pack, skin };
  }

  return activeSkin || {};
}

function findSkinSelection(activeSkin) {
  const requested = parseActiveSkin(activeSkin);

  for (const [configPath, config] of Object.entries(skinConfigModules)) {
    const normalizedConfigPath = normalizePath(configPath);
    const packFolder = normalizedConfigPath.split("/").at(-2);
    const packMatches = !requested.pack || requested.pack === config.packId || requested.pack === packFolder;

    if (!packMatches) {
      continue;
    }

    const skinId = requested.skin || config.defaultSkin;
    const skin = config.skins?.[skinId] || config.skins?.[config.defaultSkin];

    if (!skin) {
      continue;
    }

    return {
      config,
      configPath: normalizedConfigPath,
      skin,
      skinId
    };
  }

  return null;
}

function resolveStateDefinition(selection, stateName) {
  const { config } = selection;
  const normalizedState = normalizeStateName(stateName);
  let definition = config.states?.[normalizedState];

  if (definition?.alias) {
    definition = config.states?.[definition.alias];
  }

  if (!definition) {
    definition = config.states?.[config.fallbackState] || config.states?.idle;
  }

  return {
    stateName: definition ? normalizedState : "idle",
    definition
  };
}

function resolveAssetUrl(selection, definition, fileName) {
  const configDir = selection.configPath.replace(/\/config\.json$/, "");
  const skinPath = selection.skin.basePath ? `${selection.skin.basePath}/` : "";
  const interpolatedFile = interpolateFileName(fileName, selection.skin);
  const assetPath = normalizePath(`${configDir}/${skinPath}${interpolatedFile}`);

  return imageModules[assetPath];
}

export function createAnimationManager(config, activeSkin) {
  const legacyFramesByState = createLegacyFrameMap();
  const skinSelection = findSkinSelection(activeSkin);
  let activeAnimationKey = "idle";
  let frameIndex = 0;
  let elapsedMs = 0;

  Object.values(legacyFramesByState).forEach((frames) => {
    frames.sort((left, right) => left.filePath.localeCompare(right.filePath));
  });

  function getLegacyFramesForState(stateName) {
    const normalizedState = normalizeStateName(stateName);
    return legacyFramesByState[normalizedState] || legacyFramesByState.idle || [];
  }

  function resetIfAnimationChanged(animationKey) {
    if (activeAnimationKey === animationKey) {
      return;
    }

    activeAnimationKey = animationKey;
    frameIndex = 0;
    elapsedMs = 0;
  }

  function advanceFrame(deltaMs, frameCount, fps, loop) {
    elapsedMs += deltaMs;
    const frameDurationMs = 1000 / fps;

    while (elapsedMs >= frameDurationMs) {
      elapsedMs -= frameDurationMs;

      if (loop) {
        frameIndex = (frameIndex + 1) % frameCount;
      } else {
        frameIndex = Math.min(frameIndex + 1, frameCount - 1);
      }
    }
  }

  function updateConfiguredAnimation(stateName, deltaMs) {
    if (!skinSelection) {
      return null;
    }

    const { definition } = resolveStateDefinition(skinSelection, stateName);

    if (!definition) {
      return null;
    }

    if (definition.type === "sequence") {
      const frames = (definition.frames || [])
        .map((fileName) => resolveAssetUrl(skinSelection, definition, fileName))
        .filter(Boolean);
      const animationKey = `${skinSelection.config.packId}:${skinSelection.skinId}:${stateName}:sequence`;

      if (frames.length === 0) {
        return null;
      }

      resetIfAnimationChanged(animationKey);
      advanceFrame(deltaMs, frames.length, definition.fps || config.defaultFps, definition.loop !== false);

      return {
        type: "image",
        src: frames[frameIndex]
      };
    }

    if (definition.type === "spritesheet") {
      const src = resolveAssetUrl(skinSelection, definition, definition.file);
      const frameCount = definition.frameCount || 1;
      const animationKey = `${skinSelection.config.packId}:${skinSelection.skinId}:${stateName}:${definition.file}`;

      if (!src) {
        return null;
      }

      resetIfAnimationChanged(animationKey);
      advanceFrame(deltaMs, frameCount, definition.fps || config.defaultFps, definition.loop !== false);

      return {
        type: "spritesheet",
        src,
        frameIndex,
        frameCount,
        frameWidth: definition.frameWidth,
        frameHeight: definition.frameHeight,
        displayWidth: skinSelection.config.render?.displayWidth || definition.frameWidth,
        displayHeight: skinSelection.config.render?.displayHeight || definition.frameHeight,
        pixelated: skinSelection.config.render?.pixelated ?? false
      };
    }

    return null;
  }

  function updateLegacyAnimation(stateName, deltaMs) {
    const normalizedState = normalizeStateName(stateName);
    const frames = getLegacyFramesForState(normalizedState);

    if (frames.length === 0) {
      return null;
    }

    resetIfAnimationChanged(`legacy:${normalizedState}`);
    advanceFrame(deltaMs, frames.length, config.fpsByState[normalizedState] || config.defaultFps, true);

    return {
      type: "image",
      src: frames[frameIndex].url
    };
  }

  return {
    update(stateName, deltaMs) {
      return updateConfiguredAnimation(stateName, deltaMs) || updateLegacyAnimation(stateName, deltaMs);
    }
  };
}
