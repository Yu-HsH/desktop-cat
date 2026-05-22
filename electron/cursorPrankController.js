async function importNativeMouseLibrary() {
  const candidates = ["@nut-tree/nut-js", "@nut-tree-fork/nut-js"];
  let lastError = null;

  for (const packageName of candidates) {
    try {
      const api = await import(packageName);

      if (api?.mouse) {
        return { api, packageName };
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("No native mouse library is available.");
}

function createNativePoint(api, x, y) {
  if (typeof api.Point === "function") {
    return new api.Point(Math.round(x), Math.round(y));
  }

  return { x: Math.round(x), y: Math.round(y) };
}

function createCursorPrankController({ screen }) {
  let nativeMouse = null;
  let nativeApi = null;
  let nativePackageName = "";
  let nativeError = null;
  let nativeLoadPromise = null;
  let stopToken = 0;

  async function loadNative() {
    if (nativeMouse) {
      return true;
    }

    if (!nativeLoadPromise) {
      nativeLoadPromise = importNativeMouseLibrary()
        .then(({ api, packageName }) => {
          nativeApi = api;
          nativeMouse = api.mouse;
          nativePackageName = packageName;
          nativeError = null;
          return true;
        })
        .catch((error) => {
          nativeApi = null;
          nativeMouse = null;
          nativePackageName = "";
          nativeError = error;
          return false;
        });
    }

    return nativeLoadPromise;
  }

  async function getCursorPosition() {
    if (nativeMouse?.getPosition) {
      const point = await nativeMouse.getPosition();
      return { x: point.x, y: point.y };
    }

    return screen.getCursorScreenPoint();
  }

  async function moveCursorTo(position) {
    if (!nativeMouse) {
      return false;
    }

    const point = createNativePoint(nativeApi, position.x, position.y);

    if (typeof nativeMouse.setPosition === "function") {
      await nativeMouse.setPosition(point);
      return true;
    }

    if (typeof nativeMouse.move === "function" && typeof nativeApi?.straightTo === "function") {
      await nativeMouse.move(nativeApi.straightTo(point));
      return true;
    }

    return false;
  }

  function canMoveCursor() {
    return Boolean(
      nativeMouse &&
      (
        typeof nativeMouse.setPosition === "function" ||
        (typeof nativeMouse.move === "function" && typeof nativeApi?.straightTo === "function")
      )
    );
  }

  function getStatus() {
    return {
      available: canMoveCursor(),
      packageName: nativePackageName,
      error: nativeError ? nativeError.message : ""
    };
  }

  return {
    preload: loadNative,
    isAvailable: canMoveCursor,
    getStatus,
    getCursorPosition,
    moveCursorTo,
    stopAll() {
      stopToken += 1;
    }
  };
}

module.exports = {
  createCursorPrankController
};
