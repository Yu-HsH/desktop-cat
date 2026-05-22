import { useEffect, useMemo, useRef, useState } from "react";
import Pet from "./components/Pet.jsx";
import SpeechBubble from "./components/SpeechBubble.jsx";
import HeartEffect from "./components/HeartEffect.jsx";
import petConfig from "./data/petConfig.json";
import { createAnimationManager } from "./engine/animationManager.js";
import { createMovementEngine } from "./engine/movementEngine.js";
import { createPetStateMachine } from "./engine/petStateMachine.js";

const MOVE_IPC_MIN_INTERVAL_MS = 1000 / petConfig.movement.maxIpcFps;

const DEFAULT_RENDER_STATE = {
  petState: "idle",
  frameSrc: null,
  direction: 1,
  speech: "",
  hearts: [],
  gooseEffect: false,
  boxHidden: false,
  catnipEffect: false,
  quietMode: false,
  mischiefMode: false,
  petId: "pet-1"
};

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomDuration(range) {
  return range.min + Math.random() * (range.max - range.min);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomOffset(max = 80) {
  return Math.round((Math.random() * 2 - 1) * max);
}

function getCatnipSpeedMultiplier(now) {
  const wave = Math.sin(now / 420) * 0.45;
  const wobble = Math.sin(now / 170) * 0.25;
  const jitter = (Math.random() - 0.5) * 0.08;
  return clamp(1 + wave + wobble + jitter, 0.65, 2.1);
}

function createBrowserFallbackEnvironment() {
  return {
    workArea: {
      x: 0,
      y: 0,
      width: window.screen?.availWidth || window.innerWidth,
      height: window.screen?.availHeight || window.innerHeight
    },
    position: { x: 0, y: 0 },
    windowSize: petConfig.window,
    quietMode: false
  };
}

export default function App() {
  const [activeSkin, setActiveSkin] = useState(petConfig.activeSkin);
  const animationManager = useMemo(
    () => createAnimationManager(petConfig.animation, activeSkin),
    [activeSkin]
  );
  const movementEngine = useMemo(
    () => createMovementEngine({ ...petConfig.movement, mischief: petConfig.mischief }),
    []
  );
  const stateMachine = useMemo(
    () => createPetStateMachine(petConfig.stateMachine, petConfig.speech),
    []
  );

  const frameRef = useRef(0);
  const isReadyRef = useRef(false);
  const petIdRef = useRef(DEFAULT_RENDER_STATE.petId);
  const mischiefEnabledRef = useRef(false);
  const quietModeRef = useRef(false);
  const nextMischiefCheckAtRef = useRef(0);
  const mischiefCooldownUntilRef = useRef(0);
  const chaseMessageRef = useRef("");
  const lastTickRef = useRef(performance.now());
  const lastWindowPositionRef = useRef({ x: 0, y: 0 });
  const lastMoveIpcRef = useRef({ sentAt: 0, position: null });
  const lastFootprintRef = useRef({ createdAt: 0, position: null });
  const activeFoodRef = useRef(null);
  const activeToyRef = useRef(null);
  const goHomeRef = useRef(null);
  const boxRef = useRef({ active: false, toyId: null });
  const catnipUntilRef = useRef(0);
  const catnipStartedAtRef = useRef(0);
  const catnipWasActiveRef = useRef(false);
  const nextCatnipBurstAtRef = useRef(0);
  const nextCatnipWobbleAtRef = useRef(0);
  const catnipPauseUntilRef = useRef(0);
  const catnipDriftOffsetRef = useRef({ x: 0, y: 0 });
  const laserRef = useRef({ active: false, lastUpdateAt: 0, lastMessageAt: 0, lastCatchAt: 0 });
  const lastReportedStateRef = useRef("");
  const gooseEffectTimerRef = useRef(0);
  const speechOverrideRef = useRef({ text: "", until: 0 });
  const interactiveRef = useRef(null);
  const dragRef = useRef({
    active: false,
    pointerId: null,
    startPointer: { x: 0, y: 0 },
    startPosition: { x: 0, y: 0 },
    lastPosition: { x: 0, y: 0 },
    totalDistance: 0
  });
  const [renderState, setRenderState] = useState(DEFAULT_RENDER_STATE);

  function setInteractive(enabled) {
    if (interactiveRef.current === enabled) {
      return;
    }

    interactiveRef.current = enabled;
    window.petWindow?.setInteractive?.(enabled);
  }

  function isInPetHitbox(event) {
    const hitbox = petConfig.hitbox;
    return (
      event.clientX >= hitbox.x &&
      event.clientX <= hitbox.x + hitbox.width &&
      event.clientY >= hitbox.y &&
      event.clientY <= hitbox.y + hitbox.height
    );
  }

  function rememberWindowPosition(position, now) {
    const roundedPosition = {
      x: Math.round(position.x),
      y: Math.round(position.y)
    };

    lastWindowPositionRef.current = roundedPosition;
    lastMoveIpcRef.current = {
      sentAt: now,
      position: roundedPosition
    };
  }

  function sendWindowMove(position, now, options = {}) {
    const previousPosition = lastMoveIpcRef.current.position;
    const distance = previousPosition
      ? Math.hypot(position.x - previousPosition.x, position.y - previousPosition.y)
      : Infinity;
    const intervalElapsed = now - lastMoveIpcRef.current.sentAt >= MOVE_IPC_MIN_INTERVAL_MS;

    if (distance < petConfig.movement.minMoveDeltaPixels) {
      return false;
    }

    if (!options.force && !intervalElapsed) {
      return false;
    }

    window.petWindow?.moveTo?.(position, options);
    rememberWindowPosition(position, now);
    return true;
  }

  function getPetFootPosition(position) {
    return {
      x: position.x + petConfig.window.width * 0.5,
      y: position.y + petConfig.window.height * 0.82
    };
  }

  function maybeCreateFootprint(position, petState, direction, now) {
    const config = petConfig.footprints;

    if (!config?.enabled || !["walk", "run"].includes(petState)) {
      return;
    }

    const baseDistance = petState === "run" ? config.runDistancePx : config.walkDistancePx;
    const baseCooldown = petState === "run" ? config.runCooldownMs : config.walkCooldownMs;
    const catnipActive = now < catnipUntilRef.current;
    const distanceThreshold = baseDistance
      * (mischiefEnabledRef.current ? config.mischiefMultiplier : 1)
      * (quietModeRef.current ? config.quietMultiplier : 1)
      * (catnipActive ? 0.65 : 1);
    const cooldown = baseCooldown
      * (quietModeRef.current ? config.quietMultiplier : 1)
      * (catnipActive ? 0.7 : 1);
    const footPosition = getPetFootPosition(position);
    const previous = lastFootprintRef.current.position;
    const distance = previous ? Math.hypot(footPosition.x - previous.x, footPosition.y - previous.y) : Infinity;

    if (now - lastFootprintRef.current.createdAt < cooldown || distance < distanceThreshold) {
      return;
    }

    lastFootprintRef.current = {
      createdAt: now,
      position: footPosition
    };

    window.petWindow?.createFootprint?.({
      x: footPosition.x - (config.window.width / 2),
      y: footPosition.y - (config.window.height / 2),
      direction
    });
  }

  function showFoodHearts(now) {
    const nextHearts = Array.from({ length: petConfig.effects.heartsPerPet }, (_, index) => ({
      id: `food-${now}-${index}-${Math.random()}`,
      createdAt: now,
      x: 64 + Math.random() * 38,
      y: 44 + Math.random() * 28,
      delayMs: index * 65
    }));

    setRenderState((current) => ({
      ...current,
      hearts: [...current.hearts, ...nextHearts]
    }));
  }

  function maybeFinishFoodTarget(position, now) {
    const food = activeFoodRef.current;

    if (!food) {
      return;
    }

    const petFoot = getPetFootPosition(position);
    const foodCenter = {
      x: food.position.x + food.size.width / 2,
      y: food.position.y + food.size.height / 2
    };
    const distance = Math.hypot(petFoot.x - foodCenter.x, petFoot.y - foodCenter.y);

    if (distance > petConfig.foodReaction.arrivalDistancePx) {
      return;
    }

    const message = pickRandom(petConfig.foodReaction.messages);
    activeFoodRef.current = null;
    movementEngine.clearTargetPosition();
    stateMachine.force("petting", {
      durationMs: petConfig.foodReaction.eatDurationMs,
      speech: message
    });
    showFoodHearts(now);
    window.petWindow?.foodEaten?.({
      foodId: food.foodId,
      petId: petIdRef.current
    });
  }

  function maybeFinishGoHome(position) {
    const homeTarget = goHomeRef.current;

    if (!homeTarget) {
      return;
    }

    const petCenter = {
      x: position.x + petConfig.window.width / 2,
      y: position.y + petConfig.window.height / 2
    };
    const distance = Math.hypot(
      petCenter.x - homeTarget.housePosition.x,
      petCenter.y - homeTarget.housePosition.y
    );

    if (distance > 80) {
      return;
    }

    goHomeRef.current = null;
    movementEngine.clearTargetPosition();
    window.petWindow?.arrivedHome?.({
      petId: petIdRef.current,
      position
    });
  }

  function maybeFinishToyTarget(position) {
    const toy = activeToyRef.current;

    if (!toy) {
      return;
    }

    const petCenter = {
      x: position.x + petConfig.window.width / 2,
      y: position.y + petConfig.window.height / 2
    };
    const toyCenter = {
      x: toy.position.x + toy.size.width / 2,
      y: toy.position.y + toy.size.height / 2
    };

    if (Math.hypot(petCenter.x - toyCenter.x, petCenter.y - toyCenter.y) > 70) {
      return;
    }

    activeToyRef.current = null;
    movementEngine.clearTargetPosition();
    const messagesByType = {
      yarn: ["톡톡", "엉켰다냥", "이거 내 거야"],
      box: ["나 안 보이지?"],
      catnip: ["캣닢 최고!"]
    };
    stateMachine.speak(pickRandom(messagesByType[toy.type] || messagesByType.yarn), 1300);
    const currentWindowPosition = { ...lastWindowPositionRef.current };

    window.petWindow?.toyHit?.({
      petId: petIdRef.current,
      toyId: toy.toyId,
      type: toy.type,
      petPosition: currentWindowPosition,
      petCenter: {
        x: currentWindowPosition.x + petConfig.window.width / 2,
        y: currentWindowPosition.y + petConfig.window.height / 2
      }
    });
  }

  function stopLaserChase() {
    const wasActive = laserRef.current.active;
    laserRef.current = { active: false, lastUpdateAt: 0, lastMessageAt: 0, lastCatchAt: 0 };

    if (wasActive && !activeFoodRef.current && !goHomeRef.current) {
      movementEngine.clearTargetPosition();
      stateMachine.force("idle");
    }
  }

  function stopMischief() {
    mischiefEnabledRef.current = false;
    chaseMessageRef.current = "";
    window.clearTimeout(gooseEffectTimerRef.current);
    movementEngine.clearTargetPosition();
    stateMachine.force("idle");
    speechOverrideRef.current = { text: "", until: 0 };
    setRenderState((current) => ({
      ...current,
      mischiefMode: false,
      petState: "idle",
      speech: "",
      gooseEffect: false
    }));
  }

  function showGooseFeedback(message, phase = "running") {
    window.clearTimeout(gooseEffectTimerRef.current);

    if (message && (phase === "start" || phase === "running")) {
      speechOverrideRef.current = {
        text: message,
        until: performance.now() + 1000
      };
    } else if (message) {
      stateMachine.speak(message, phase === "running" ? 900 : petConfig.speech.durationMs);
    }

    setRenderState((current) => ({
      ...current,
      gooseEffect: phase !== "stop",
      speech: message || current.speech
    }));

    gooseEffectTimerRef.current = window.setTimeout(() => {
      setRenderState((current) => ({
        ...current,
        gooseEffect: false
      }));
    }, phase === "running" ? 900 : 1500);
  }

  async function triggerMischief(type) {
    if (!isReadyRef.current) {
      return;
    }

    const durationMs = randomDuration(petConfig.mischief.durationMs);

    if (type === "dash") {
      movementEngine.clearTargetPosition();
      stateMachine.force("run", { durationMs });
      return;
    }

    if (type === "chaseCursor") {
      chaseMessageRef.current = pickRandom(["\uC7A1\uC558\uB2E4!", "\uBB50\uD574?", "\uB098\uB791 \uB180\uC790!", "\uC26C\uB294 \uC2DC\uAC04!"]);
      stateMachine.force("run", { durationMs });
      const checks = 2 + Math.floor(Math.random() * 3);

      for (let index = 0; index < checks; index += 1) {
        const cursor = await window.petWindow?.getCursorPosition?.();

        if (!cursor) {
          return;
        }

        const side = Math.random() < 0.5 ? -1 : 1;
        movementEngine.setTargetPosition({
          x: cursor.x + side * petConfig.mischief.cursorOffset.x - petConfig.window.width / 2,
          y: cursor.y + petConfig.mischief.cursorOffset.y - petConfig.window.height / 2
        });

        await new Promise((resolve) => {
          window.setTimeout(resolve, durationMs / checks);
        });
      }
      return;
    }

    if (type === "teaseBubble") {
      stateMachine.speak(pickRandom(petConfig.mischief.messages), petConfig.speech.durationMs);
    }

    if (type === "poop") {
      await window.petWindow?.createPoop?.({
        petId: petIdRef.current,
        position: lastWindowPositionRef.current
      });
      stateMachine.speak("모른 척...", petConfig.speech.durationMs);
    }
  }

  function maybeTriggerMischief(now) {
    if (quietModeRef.current || !mischiefEnabledRef.current || now < nextMischiefCheckAtRef.current || now < mischiefCooldownUntilRef.current) {
      return;
    }

    nextMischiefCheckAtRef.current = now + 1000;

    if (Math.random() > petConfig.mischief.chance) {
      return;
    }

    const action = pickRandom(petConfig.mischief.allowedActions);
    mischiefCooldownUntilRef.current = now + petConfig.mischief.cooldownMs;
    triggerMischief(action);
  }

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const environment = window.petWindow
        ? await window.petWindow.getEnvironment()
        : createBrowserFallbackEnvironment();

      if (cancelled) {
        return;
      }

      movementEngine.setEnvironment(environment);
      movementEngine.setGooseIntensity(environment.gooseIntensity || "normal");
      stateMachine.setQuietMode(environment.quietMode);
      quietModeRef.current = environment.quietMode;
      mischiefEnabledRef.current = environment.mischiefMode;
      rememberWindowPosition(environment.position, performance.now());
      isReadyRef.current = true;
      setActiveSkin({
        pack: petConfig.activeSkin?.pack || "pet-cats-pack",
        skin: environment.selectedSkin || petConfig.activeSkin?.skin || "cat-1"
      });
      setRenderState((current) => ({
        ...current,
        quietMode: environment.quietMode,
        mischiefMode: environment.mischiefMode,
        petId: environment.petId || current.petId
      }));
      petIdRef.current = environment.petId || petIdRef.current;
    }

    boot();

    return () => {
      cancelled = true;
    };
  }, [movementEngine, stateMachine]);

  useEffect(() => {
    setInteractive(false);
  }, []);

  useEffect(() => {
    const unsubscribe = window.petWindow?.onMenuAction?.(({ action, payload }) => {
      if (action === "pet") {
        petTheCat();
      }

      if (action === "sleep") {
        stateMachine.force("sleep");
      }

      if (action === "wake") {
        stateMachine.force("idle");
      }

      if (action === "toggle-quiet-mode") {
        stateMachine.setQuietMode(payload.enabled);
        quietModeRef.current = payload.enabled;
        setRenderState((current) => ({
          ...current,
          quietMode: payload.enabled,
          speech: payload.enabled ? "" : current.speech
        }));
      }

      if (action === "toggle-mischief") {
        if (!payload.enabled) {
          stopMischief();
          return;
        }

        mischiefEnabledRef.current = true;
        setRenderState((current) => ({
          ...current,
          mischiefMode: true
        }));
      }

      if (action === "mischief-stop") {
        stopMischief();
      }

      if (action === "set-goose-intensity") {
        movementEngine.setGooseIntensity(payload.gooseIntensity || "normal");
      }

      if (action === "manual-mischief") {
        triggerMischief(payload.type || "dash");
      }

      if (action === "set-skin") {
        setActiveSkin(payload.activeSkin || petConfig.activeSkin);
        stateMachine.force("idle");
        setRenderState((current) => ({
          ...current,
          petState: "idle",
          speech: ""
        }));
      }

      if (action === "sync-position") {
        movementEngine.setPosition(payload.position);
        rememberWindowPosition(payload.position, performance.now());
      }

      if (action === "drop-feedback") {
        stateMachine.speak(payload.message || "집으로 돌아갈게!", petConfig.speech.durationMs);
      }

      if (action === "food-spawned") {
        stopLaserChase();
        activeToyRef.current = null;
        activeFoodRef.current = payload;
        const target = {
          x: payload.position.x + payload.size.width / 2 - petConfig.window.width / 2,
          y: payload.position.y + payload.size.height / 2 - petConfig.window.height * 0.82
        };
        movementEngine.setTargetPosition(target);
        stateMachine.force("run", { durationMs: 8000 });
        speechOverrideRef.current = {
          text: "간식이다!",
          until: performance.now() + 1400
        };
      }

      if (action === "food-removed") {
        const foodIds = payload.foodIds || [payload.foodId];

        if (activeFoodRef.current && foodIds.includes(activeFoodRef.current.foodId)) {
          activeFoodRef.current = null;
          movementEngine.clearTargetPosition();
          stateMachine.force("idle");
        }
      }

      if (action === "toy-spawned" || action === "toy-moved") {
        if (boxRef.current.active || goHomeRef.current || activeFoodRef.current || laserRef.current.active || !payload.position) {
          return;
        }

        activeToyRef.current = payload;
        const target = {
          x: payload.position.x + payload.size.width / 2 - petConfig.window.width / 2,
          y: payload.position.y + payload.size.height / 2 - petConfig.window.height / 2
        };
        movementEngine.setTargetPosition(target);
        const useWalk = payload.type === "yarn";
        stateMachine.force(useWalk ? "walk" : "run", {
          durationMs: useWalk ? 12000 : 10000
        });
        speechOverrideRef.current = {
          text: payload.type === "box" ? "박스다!" : payload.type === "catnip" ? "좋은 냄새!" : "실뭉치다!",
          until: performance.now() + 1300
        };
      }

      if (action === "toy-removed") {
        if (activeToyRef.current?.toyId === payload.toyId) {
          activeToyRef.current = null;
          movementEngine.clearTargetPosition();
          stateMachine.force("idle");
        }
      }

      if (action === "toy-message") {
        stateMachine.speak(payload.message || "실뭉치 놀이 끝!", 1500);
      }

      if (action === "box-enter") {
        activeToyRef.current = null;
        movementEngine.clearTargetPosition();
        boxRef.current = { active: true, toyId: payload.toyId };
        setInteractive(false);
        stateMachine.speak(payload.message || pickRandom(["나 안 보이지?", "여기 좋다냥", "숨어야지"]), 900);
        setRenderState((current) => ({
          ...current,
          boxHidden: true,
          speech: "",
          petState: "idle"
        }));
      }

      if (action === "box-exit") {
        boxRef.current = { active: false, toyId: null };

        if (payload.exitPosition) {
          const boundedPosition = movementEngine.setPosition(payload.exitPosition);
          rememberWindowPosition(boundedPosition, performance.now());
          window.petWindow?.moveTo?.(boundedPosition, { force: true, reason: "box-exit" });
        }

        const exitMessage = payload.reason === "knock"
          ? pickRandom(["알았어 나갈게!", "깜짝이야!", "들켰다냥!"])
          : "깜짝이야!";
        setInteractive(false);
        stateMachine.force("idle", { speech: exitMessage, durationMs: 1300 });
        setRenderState((current) => ({
          ...current,
          boxHidden: false,
          speech: exitMessage,
          petState: "idle"
        }));
      }

      if (action === "catnip-start") {
        activeToyRef.current = null;
        const now = performance.now();
        catnipStartedAtRef.current = now;
        catnipUntilRef.current = now + (payload.durationMs || 14000);
        nextCatnipBurstAtRef.current = now;
        nextCatnipWobbleAtRef.current = now;
        catnipPauseUntilRef.current = 0;
        catnipDriftOffsetRef.current = { x: 0, y: 0 };
        stateMachine.force("run", { durationMs: 1800 });
        speechOverrideRef.current = {
          text: pickRandom(["기분 이상하다냥", "우다다!", "캣닢 최고!", "빙글빙글냥!"]),
          until: now + 1600
        };
        showFoodHearts(now);
        setRenderState((current) => ({
          ...current,
          catnipEffect: true
        }));
      }

      if (action === "catnip-quiet") {
        activeToyRef.current = null;
        catnipStartedAtRef.current = 0;
        catnipUntilRef.current = 0;
        catnipPauseUntilRef.current = 0;
        movementEngine.setSpeedMultiplier?.(1);
        movementEngine.clearTargetPosition();
        stateMachine.speak("지금은 조용히 있을래...", petConfig.speech.durationMs);
      }

      if (action === "go-home") {
        if (boxRef.current.active) {
          return;
        }
        activeFoodRef.current = null;
        activeToyRef.current = null;
        stopLaserChase();
        const offsetIndex = payload.offsetIndex || 0;
        const offsetX = ((offsetIndex % 5) - 2) * 18;
        const target = {
          x: payload.housePosition.x - petConfig.window.width / 2 + offsetX,
          y: payload.housePosition.y - petConfig.window.height / 2 + Math.floor(offsetIndex / 5) * 12
        };
        goHomeRef.current = {
          housePosition: payload.housePosition,
          removeOnArrive: payload.removeOnArrive !== false
        };
        movementEngine.setTargetPosition(target);
        stateMachine.force("run", { durationMs: 20000 });
        speechOverrideRef.current = {
          text: payload.message || pickRandom(["집에 갈게!", "쉬러 간다냥"]),
          until: performance.now() + 1800
        };
      }

      if (action === "laser-moved") {
        if (boxRef.current.active || goHomeRef.current || !payload.position) {
          return;
        }

        const now = performance.now();
        if (payload.source !== "manual" && now - laserRef.current.lastUpdateAt < 350) {
          return;
        }

        activeFoodRef.current = null;
        activeToyRef.current = null;
        laserRef.current = {
          ...laserRef.current,
          active: true,
          lastUpdateAt: now
        };
        movementEngine.setTargetPosition({
          x: payload.position.x - petConfig.window.width / 2,
          y: payload.position.y - petConfig.window.height * 0.82
        });
        stateMachine.force("run", { durationMs: payload.source === "manual" ? 8000 : 2200 });

        if (now - laserRef.current.lastMessageAt > 4500) {
          laserRef.current.lastMessageAt = now;
          speechOverrideRef.current = {
            text: pickRandom(["저 빨간 점!", "잡는다냥!"]),
            until: now + 1200
          };
        }
      }

      if (action === "laser-stopped") {
        stopLaserChase();
      }

      if (action === "goose-prank") {
        if (boxRef.current.active) {
          return;
        }
        // start: 고양이가 현재 커서 위치로 달려감 (screen → window-local 변환)
        if (payload.phase === "start" && payload.cursor) {
          activeToyRef.current = null;
          movementEngine.setTargetPosition({
            x: payload.cursor.x - petConfig.window.width / 2,
            y: payload.cursor.y - petConfig.window.height / 2
          });
          stateMachine.force("run", { durationMs: 3500 });
        }

        // carry: escapeTarget(screen 좌표)으로 고양이 창이 실제로 이동
        if (payload.phase === "carry" && payload.target) {
          activeToyRef.current = null;
          movementEngine.setTargetPosition({
            x: payload.target.x - petConfig.window.width / 2,
            y: payload.target.y - petConfig.window.height / 2
          });
          stateMachine.force("run", { durationMs: 4500 });
        }

        showGooseFeedback(payload.message || "", payload.phase);
      }

      if (action === "clear-poops") {
        setRenderState((current) => current);
      }
    });

    return () => unsubscribe?.();
  }, [stateMachine]);

  useEffect(() => {
    function tick(now) {
      const deltaMs = Math.min(now - lastTickRef.current, 80);
      lastTickRef.current = now;

      const petSnapshot = stateMachine.update(deltaMs);
      const movementSnapshot = isReadyRef.current
        ? movementEngine.update(deltaMs, petSnapshot.name)
        : { moved: false, direction: renderState.direction, position: lastWindowPositionRef.current };
      const frameSrc = animationManager.update(petSnapshot.name, deltaMs);
      const speech = now < speechOverrideRef.current.until
        ? speechOverrideRef.current.text
        : petSnapshot.speech;
      const catnipActive = now < catnipUntilRef.current;
      const catnipBlocked = boxRef.current.active
        || goHomeRef.current
        || activeFoodRef.current
        || activeToyRef.current
        || laserRef.current.active;

      maybeTriggerMischief(now);

      if (!catnipActive && catnipWasActiveRef.current) {
        catnipWasActiveRef.current = false;
        catnipStartedAtRef.current = 0;
        catnipPauseUntilRef.current = 0;
        catnipDriftOffsetRef.current = { x: 0, y: 0 };
        movementEngine.setSpeedMultiplier?.(1);
        if (!catnipBlocked) {
          movementEngine.clearTargetPosition();
        }
      }

      if (catnipActive && !quietModeRef.current) {
        catnipWasActiveRef.current = true;
        const isPaused = now < catnipPauseUntilRef.current;
        movementEngine.setSpeedMultiplier?.(isPaused ? 0.65 : getCatnipSpeedMultiplier(now));

        if (!catnipBlocked && !isPaused && now >= nextCatnipWobbleAtRef.current) {
          const currentPosition = movementSnapshot.position || lastWindowPositionRef.current;
          catnipDriftOffsetRef.current = {
            x: randomOffset(80),
            y: randomOffset(72)
          };
          nextCatnipWobbleAtRef.current = now + randomDuration({ min: 700, max: 1400 });

          if (Math.random() < 0.18) {
            const pauseMs = randomDuration({ min: 300, max: 600 });
            catnipPauseUntilRef.current = now + pauseMs;
            movementEngine.clearTargetPosition();
            stateMachine.force("idle", {
              durationMs: pauseMs,
              speech: Math.random() < 0.35 ? "어질어질냥..." : ""
            });
          } else {
            movementEngine.setTargetPosition({
              x: currentPosition.x + catnipDriftOffsetRef.current.x,
              y: currentPosition.y + catnipDriftOffsetRef.current.y
            });
            stateMachine.force("run", { durationMs: randomDuration({ min: 900, max: 1500 }) });
          }
        }

        if (!catnipBlocked && now >= nextCatnipBurstAtRef.current) {
          nextCatnipBurstAtRef.current = now + randomDuration({ min: 1200, max: 2500 });

          if (now >= catnipPauseUntilRef.current && Math.random() < 0.72) {
            stateMachine.force("run", { durationMs: randomDuration({ min: 850, max: 1400 }) });
          }

          if (Math.random() < 0.72) {
            speechOverrideRef.current = {
              text: pickRandom(["우다다!", "빙글빙글냥!", "기분 이상하다냥", "캣닢 최고!", "어디로 가지냥?"]),
              until: now + 1050
            };
          }
          if (Math.random() < 0.62) {
            showFoodHearts(now);
          }
        }
      } else {
        movementEngine.setSpeedMultiplier?.(1);
      }

      if (petSnapshot.name !== lastReportedStateRef.current) {
        lastReportedStateRef.current = petSnapshot.name;
        window.petWindow?.reportState?.({
          petId: petIdRef.current,
          state: petSnapshot.name
        });
      }

      if (isReadyRef.current && movementSnapshot.moved) {
        const moveSent = sendWindowMove(movementSnapshot.position, now, {
          reason: petSnapshot.name === "run" ? "mischief-run" : "auto-walk"
        });

        if (moveSent) {
          maybeCreateFootprint(movementSnapshot.position, petSnapshot.name, movementSnapshot.direction, now);
          maybeFinishFoodTarget(movementSnapshot.position, now);
          maybeFinishGoHome(movementSnapshot.position);
          maybeFinishToyTarget(movementSnapshot.position);
        }
      }

      if (movementSnapshot.reachedTarget && chaseMessageRef.current) {
        stateMachine.speak(chaseMessageRef.current, petConfig.speech.durationMs);
        chaseMessageRef.current = "";
      }

      if (movementSnapshot.reachedTarget && laserRef.current.active && now - laserRef.current.lastCatchAt > 1600) {
        laserRef.current.lastCatchAt = now;
        stateMachine.speak(pickRandom(["잡았다!", "어디 갔냥?"]), 1200);
      }

      setRenderState((current) => ({
        ...current,
        petState: petSnapshot.name,
        frameSrc,
        direction: movementSnapshot.direction,
        speech,
        catnipEffect: catnipActive,
        hearts: current.hearts.filter((heart) => now - heart.createdAt < petConfig.effects.heartLifetimeMs)
      }));

      frameRef.current = requestAnimationFrame(tick);
    }

    frameRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameRef.current);
  }, [animationManager, movementEngine, stateMachine]);

  function petTheCat() {
    const nextHearts = Array.from({ length: petConfig.effects.heartsPerPet }, (_, index) => ({
      id: `${Date.now()}-${index}-${Math.random()}`,
      createdAt: performance.now(),
      x: 72 + Math.random() * 54,
      y: 55 + Math.random() * 35,
      delayMs: index * 70
    }));

    stateMachine.pet();
    setRenderState((current) => ({
      ...current,
      hearts: [...current.hearts, ...nextHearts]
    }));
  }

  function handlePetPointerDown(event) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    setInteractive(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const startPosition = lastWindowPositionRef.current;

    dragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startPointer: { x: event.screenX, y: event.screenY },
      startPosition,
      lastPosition: startPosition,
      totalDistance: 0
    };

    stateMachine.beginDrag();
    window.petWindow?.notifyDragStart?.();
    movementEngine.setPosition(startPosition);
    setRenderState((current) => ({
      ...current,
      petState: "dragged",
      speech: ""
    }));
  }

  function handlePetPointerMove(event) {
    const drag = dragRef.current;

    if (!drag.active || drag.pointerId !== event.pointerId) {
      return;
    }

    const dx = event.screenX - drag.startPointer.x;
    const dy = event.screenY - drag.startPointer.y;
    const nextPosition = {
      x: drag.startPosition.x + dx,
      y: drag.startPosition.y + dy
    };

    drag.totalDistance = Math.max(drag.totalDistance, Math.hypot(dx, dy));
    const boundedPosition = movementEngine.setPosition(nextPosition);
    drag.lastPosition = boundedPosition;
    sendWindowMove(boundedPosition, performance.now(), { force: true, reason: "drag" });

    if (Math.abs(dx) > 2) {
      setRenderState((current) => ({
        ...current,
        direction: dx >= 0 ? 1 : -1,
        petState: "dragged"
      }));
    }
  }

  function handlePetPointerUp(event) {
    const drag = dragRef.current;

    if (!drag.active || drag.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setInteractive(isInPetHitbox(event));
    dragRef.current = {
      ...drag,
      active: false
    };

    stateMachine.endDrag();
    window.petWindow?.notifyDragEnd?.();

    if (drag.totalDistance < petConfig.drag.clickThresholdPixels) {
      petTheCat();
      return;
    }

    const boundedPosition = movementEngine.setPosition(drag.lastPosition);
    sendWindowMove(boundedPosition, performance.now(), { force: true, reason: "drag" });
    movementEngine.setPosition(lastWindowPositionRef.current);
    window.petWindow?.notifyDrop?.({
      petId: petIdRef.current,
      position: boundedPosition,
      size: petConfig.window
    });
    setRenderState((current) => ({
      ...current,
      petState: "idle"
    }));
  }

  function handlePetPointerCancel(event) {
    const drag = dragRef.current;

    if (!drag.active || drag.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setInteractive(false);
    dragRef.current = {
      ...drag,
      active: false
    };
    stateMachine.endDrag();
    window.petWindow?.notifyDragEnd?.();
    movementEngine.setPosition(lastWindowPositionRef.current);
  }

  function handleContextMenu(event) {
    event.preventDefault();
    setInteractive(true);
    window.petWindow?.showContextMenu?.();
  }

  function handleStageMouseMove(event) {
    if (dragRef.current.active) {
      setInteractive(true);
      return;
    }

    setInteractive(isInPetHitbox(event));
  }

  function handleStageMouseLeave() {
    if (!dragRef.current.active) {
      setInteractive(false);
    }
  }

  return (
    <main
      className="pet-stage"
      onContextMenu={handleContextMenu}
      onMouseMove={handleStageMouseMove}
      onMouseLeave={handleStageMouseLeave}
    >
      <SpeechBubble text={renderState.speech} hidden={renderState.quietMode || renderState.boxHidden} />
      <Pet
        state={renderState.petState}
        frameSrc={renderState.frameSrc}
        direction={renderState.direction}
        gooseEffect={renderState.gooseEffect}
        hidden={renderState.boxHidden}
        catnipEffect={renderState.catnipEffect}
        onPointerDown={handlePetPointerDown}
        onPointerMove={handlePetPointerMove}
        onPointerUp={handlePetPointerUp}
        onPointerCancel={handlePetPointerCancel}
      />
      <HeartEffect hearts={renderState.hearts} />
    </main>
  );
}
