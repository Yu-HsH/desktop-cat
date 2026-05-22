export const PET_STATES = {
  IDLE: "idle",
  WALK: "walk",
  RUN: "run",
  SLEEP: "sleep",
  PETTING: "petting",
  SPEAK: "speak",
  DRAGGED: "dragged",
  SIT: "sit",
  STRETCH: "stretch",
  YAWN: "yawn",
  LIE: "lie"
};

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomBetween(range) {
  return range.minMs + Math.random() * (range.maxMs - range.minMs);
}

function getStateDuration(nextState, config, speechConfig) {
  if (nextState === PET_STATES.RUN) {
    return randomBetween(config.runDuration || config.walkDuration);
  }

  if (nextState === PET_STATES.IDLE) {
    return randomBetween(config.idleDuration);
  }

  if (nextState === PET_STATES.WALK) {
    return randomBetween(config.walkDuration);
  }

  if (nextState === PET_STATES.SLEEP) {
    return randomBetween(config.sleepDuration);
  }

  if (nextState === PET_STATES.PETTING) {
    return config.pettingDurationMs;
  }

  if (nextState === PET_STATES.SPEAK) {
    return speechConfig.durationMs;
  }

  if (config.restStates?.[nextState]) {
    return randomBetween(config.restStates[nextState].duration);
  }

  return randomBetween(config.idleDuration);
}

function pickRestState(config) {
  const restEntries = Object.entries(config.restStates || {});
  const roll = Math.random();
  let cursor = 0;

  for (const [stateName, stateConfig] of restEntries) {
    cursor += stateConfig.chance;

    if (roll < cursor) {
      return stateName;
    }
  }

  return null;
}

export function createPetStateMachine(config, speechConfig) {
  let currentState = PET_STATES.IDLE;
  let elapsedMs = 0;
  let stateLimitMs = randomBetween(config.idleDuration);
  let speech = "";
  let quietMode = false;
  let forcedSleep = false;

  function enter(nextState, options = {}) {
    currentState = nextState;
    elapsedMs = 0;
    speech = options.speech || "";
    stateLimitMs = options.durationMs || getStateDuration(nextState, config, speechConfig);
  }

  function maybeSpeak() {
    if (quietMode || Math.random() > speechConfig.chance) {
      return false;
    }

    enter(PET_STATES.SPEAK, { speech: pickRandom(speechConfig.lines) });
    return true;
  }

  function chooseNextFromIdle() {
    const roll = Math.random();

    if (roll < config.sleepChance) {
      enter(PET_STATES.SLEEP);
      return;
    }

    const restState = pickRestState(config);

    if (restState) {
      enter(restState);
      return;
    }

    if (maybeSpeak()) {
      return;
    }

    enter(PET_STATES.WALK);
  }

  function chooseNextFromWalk() {
    if (maybeSpeak()) {
      return;
    }

    enter(PET_STATES.IDLE);
  }

  return {
    update(deltaMs) {
      if (currentState === PET_STATES.DRAGGED) {
        return { name: currentState, speech };
      }

      elapsedMs += deltaMs;

      if (forcedSleep && currentState === PET_STATES.SLEEP) {
        return { name: currentState, speech };
      }

      if (elapsedMs < stateLimitMs) {
        return { name: currentState, speech };
      }

      if (currentState === PET_STATES.IDLE) {
        chooseNextFromIdle();
      } else if (currentState === PET_STATES.WALK || currentState === PET_STATES.RUN) {
        chooseNextFromWalk();
      } else if (currentState === PET_STATES.SLEEP) {
        enter(PET_STATES.IDLE);
      } else if (currentState === PET_STATES.PETTING) {
        const nextSpeech = quietMode ? "" : pickRandom(speechConfig.petLines);
        enter(quietMode ? PET_STATES.IDLE : PET_STATES.SPEAK, { speech: nextSpeech });
      } else if (currentState === PET_STATES.SPEAK) {
        enter(PET_STATES.WALK);
      } else if (config.restStates?.[currentState]) {
        enter(PET_STATES.IDLE);
      }

      return { name: currentState, speech };
    },

    pet() {
      forcedSleep = false;
      const nextSpeech = quietMode ? "" : pickRandom(speechConfig.petLines);
      enter(PET_STATES.PETTING, { speech: nextSpeech });
      return { name: currentState, speech };
    },

    beginDrag() {
      forcedSleep = false;
      enter(PET_STATES.DRAGGED);
      return { name: currentState, speech };
    },

    endDrag() {
      enter(PET_STATES.IDLE);
      return { name: currentState, speech };
    },

    force(nextState, options = {}) {
      forcedSleep = nextState === PET_STATES.SLEEP;
      enter(nextState, options);
      return { name: currentState, speech };
    },

    speak(line, durationMs = speechConfig.durationMs) {
      if (quietMode) {
        return { name: currentState, speech: "" };
      }

      enter(PET_STATES.SPEAK, { speech: line, durationMs });
      return { name: currentState, speech };
    },

    setQuietMode(enabled) {
      quietMode = enabled;

      if (enabled) {
        speech = "";
      }
    }
  };
}
