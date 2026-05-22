function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomDirection() {
  const angle = Math.random() * Math.PI * 2;
  return {
    x: Math.cos(angle),
    y: Math.sin(angle) * 0.45
  };
}

export function createMovementEngine(config) {
  const movingStates = new Set(config.movingStates || ["walk", "run"]);
  let workArea = { x: 0, y: 0, width: 800, height: 600 };
  let windowSize = { width: 220, height: 220 };
  let position = { x: 0, y: 0 };
  let velocity = randomDirection();
  let direction = 1;
  let changeDirectionInMs = config.directionChangeEveryMs.min;
  let targetPosition = null;
  let gooseIntensity = "normal";
  let speedMultiplier = 1;

  function getBounds() {
    return {
      minX: workArea.x,
      minY: workArea.y,
      maxX: workArea.x + workArea.width - windowSize.width,
      maxY: workArea.y + workArea.height - windowSize.height
    };
  }

  function bounceIfNeeded() {
    const bounds = getBounds();
    const clampedX = clamp(position.x, bounds.minX, bounds.maxX);
    const clampedY = clamp(position.y, bounds.minY, bounds.maxY);

    if (clampedX !== position.x) {
      velocity.x *= -1;
      position.x = clampedX;
    }

    if (clampedY !== position.y) {
      velocity.y *= -1;
      position.y = clampedY;
    }
  }

  function chooseNewDirection() {
    velocity = randomDirection();
    changeDirectionInMs =
      config.directionChangeEveryMs.min +
      Math.random() * (config.directionChangeEveryMs.max - config.directionChangeEveryMs.min);
  }

  function getSpeedForState(petState) {
    if (petState === "run") {
      const baseSpeed = config.mischief?.runSpeedPixelsPerSecond || config.runSpeedPixelsPerSecond || 90;
      const multiplier = gooseIntensity === "strong" ? 1.35 : gooseIntensity === "weak" ? 0.9 : 1;
      return baseSpeed * multiplier * speedMultiplier;
    }

    return config.speedPixelsPerSecond * speedMultiplier;
  }

  function moveTowardTarget(deltaMs, petState) {
    const previous = { ...position };
    const dx = targetPosition.x - position.x;
    const dy = targetPosition.y - position.y;
    const distanceToTarget = Math.hypot(dx, dy);
    const speed = getSpeedForState(petState) * (deltaMs / 1000);

    if (distanceToTarget <= speed || distanceToTarget === 0) {
      position = { ...targetPosition };
      targetPosition = null;
    } else {
      position = {
        x: position.x + (dx / distanceToTarget) * speed,
        y: position.y + (dy / distanceToTarget) * speed
      };
    }

    bounceIfNeeded();
    direction = dx >= 0 ? 1 : -1;

    return {
      moved: Math.hypot(position.x - previous.x, position.y - previous.y) > 0,
      position,
      direction,
      reachedTarget: !targetPosition
    };
  }

  return {
    setEnvironment(environment) {
      workArea = environment.workArea;
      windowSize = environment.windowSize;
      position = environment.position;
      bounceIfNeeded();
    },

    setPosition(nextPosition) {
      position = {
        x: nextPosition.x,
        y: nextPosition.y
      };
      bounceIfNeeded();
      return position;
    },

    setTargetPosition(nextPosition) {
      targetPosition = {
        x: nextPosition.x,
        y: nextPosition.y
      };
      return targetPosition;
    },

    clearTargetPosition() {
      targetPosition = null;
    },

    setGooseIntensity(level) {
      gooseIntensity = level || "normal";
    },

    setSpeedMultiplier(multiplier = 1) {
      speedMultiplier = clamp(Number(multiplier) || 1, 0.55, 2.1);
    },

    update(deltaMs, petState) {
      const previous = { ...position };

      if (!movingStates.has(petState)) {
        return {
          moved: false,
          position,
          direction
        };
      }

      if (targetPosition) {
        return moveTowardTarget(deltaMs, petState);
      }

      changeDirectionInMs -= deltaMs;

      if (changeDirectionInMs <= 0) {
        chooseNewDirection();
      }

      const speed = getSpeedForState(petState) * (deltaMs / 1000);
      position = {
        x: position.x + velocity.x * speed,
        y: position.y + velocity.y * speed
      };

      bounceIfNeeded();
      direction = velocity.x >= 0 ? 1 : -1;
      const distance = Math.hypot(position.x - previous.x, position.y - previous.y);

      return {
        moved: distance > 0,
        position,
        direction
      };
    }
  };
}
