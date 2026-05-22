const path = require("node:path");
const fs = require("node:fs");
const { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, screen, Tray } = require("electron");

function readJsonFileIfExists(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (error) {
    if (typeof logMainError === "function") {
      logMainError(error);
    } else {
      console.warn("Failed to load JSON file safely:", error);
    }
    return fallback;
  }
}

function readJsonFileFromCandidates(filePaths, fallback) {
  for (const filePath of filePaths) {
    const value = readJsonFileIfExists(filePath, null);
    if (value) {
      return value;
    }
  }

  return fallback;
}

function getProjectJsonCandidates(relativePath) {
  return [
    path.join(__dirname, "..", relativePath),
    path.join(__dirname, relativePath),
    path.join(process.resourcesPath || "", "app.asar", relativePath),
    path.join(process.resourcesPath || "", relativePath)
  ];
}

const petConfig = readJsonFileFromCandidates(getProjectJsonCandidates("src/data/petConfig.json"), {});
const houseConfig = readJsonFileFromCandidates(getProjectJsonCandidates("src/data/houseConfig.json"), {});
const mischiefConfig = readJsonFileFromCandidates(getProjectJsonCandidates("src/data/mischiefConfig.json"), {});

const petCredits = readJsonFileIfExists(
  path.join(__dirname, "../assets/pets/cat/pet-cats-pack/credits.json"),
  {
    assets: [],
    warning: "credits.json not found"
  }
);
const { createCursorPrankController } = require("./cursorPrankController.js");

const LABELS = {
  adoptCat: "새 고양이 입양하기",
  callCat: "집에 있는 고양이 부르기",
  callAllCats: "모든 고양이 부르기",
  sendAllHome: "모든 고양이 집으로 부르기",
  showHouse: "집 보이기",
  detailSettings: "상세 설정 열기",
  petPet: "쓰다듬기",
  returnHome: "집으로 돌아가기",
  sleep: "잠자기",
  wake: "깨우기",
  sleepAll: "모두 재우기",
  wakeAll: "모두 깨우기",
  skinMenu: "스킨 변경",
  mischiefOn: "장난모드 켜기",
  mischiefOff: "장난모드 끄기",
  quietOn: "조용모드 켜기",
  quietOff: "조용모드 끄기",
  gooseOn: "Goose 장난모드 켜기",
  gooseOff: "Goose 장난모드 끄기",
  gooseIntensity: "Goose 강도",
  gooseOnce: "커서 잡아끌기 장난 한번 하기",
  normalMischiefOnce: "일반 장난 한번 하기",
  emergencyStop: "긴급정지",
  clearPoops: "모든 똥 치우기",
  displaySettings: "표시 설정",
  footprintsOn: "발자국 표시 켜기",
  footprintsOff: "발자국 표시 끄기",
  clearFootprints: "모든 발자국 지우기",
  feedMenu: "먹이 주기",
  spawnTreat: "간식 꺼내기",
  spawnFish: "생선 꺼내기",
  spawnBowl: "밥그릇 놓기",
  clearFood: "모든 음식 치우기",
  gooseUnavailable: "커서 장난 사용 불가",
  quit: "종료"
};

const SKINS = ["cat-1", "cat-2", "cat-3", "cat-4", "cat-5", "cat-6"];
const petWindows = new Map();
const poopWindows = new Map();
const footprintWindows = new Map();
const foodWindows = new Map();
const toyWindows = new Map();

let tray;
let houseWindow;
let houseSpriteWindow;
let laserWindow = null;
let laserControlWindow = null;
let laserTimer = null;
let laserMoveTimer = null;
let manualLaserTimer = null;
let laserPosition = null;
let laserMode = null;
let settings = {};
let settingsSaveTimer;
let contextMenuOpen = false;
const deferredWindowOps = [];
let quietMode = petConfig.modes?.quietMode?.defaultEnabled ?? false;
let mischiefMode = petConfig.mischief?.enabled ?? false;
let cursorPrankEnabled = mischiefConfig.goose?.enabled ?? true;
let poopPrankEnabled = mischiefConfig.poop?.enabled ?? true;
let footprintsEnabled = petConfig.footprints?.enabled ?? true;
let foodEnabled = mischiefConfig.food?.enabled ?? true;
let mischiefIntensity = mischiefConfig.goose?.defaultIntensity ?? "normal";
let clickThroughEnabled = true;
let emergencyStopActive = false;
let gooseAutoTimer;
let lastPoopAt = 0;
let primaryPetId = null;
let isQuitting = false;
const petStates = new Map();
const lastGooseRunningMessageAt = new Map();
const forcedInteractiveReasons = new Map();
let cursorPrankController;
let mousePollingTimer;

function logMainError(error) {
  const message = `[${new Date().toISOString()}] ${error?.stack || error}\n`;
  fs.appendFileSync(path.join(__dirname, "../desktop-cat-error.log"), message);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function runWhenContextMenuClosed(callback) {
  if (!contextMenuOpen) {
    callback();
    return;
  }

  deferredWindowOps.push(callback);
}

function flushDeferredWindowOps() {
  const ops = deferredWindowOps.splice(0);
  for (const op of ops) {
    setTimeout(() => {
      try {
        op();
      } catch (error) {
        logMainError(error);
      }
    }, 25);
  }
}

function popupContextMenu(menu, targetWindow) {
  contextMenuOpen = true;
  let released = false;
  const release = () => {
    if (released) {
      return;
    }

    released = true;
    contextMenuOpen = false;
    flushDeferredWindowOps();
  };
  const fallbackTimer = setTimeout(release, 30000);

  menu.popup({
    window: targetWindow || undefined,
    callback: () => {
      clearTimeout(fallbackTimer);
      release();
    }
  });
}

function getGooseIntensityConfig(level = mischiefIntensity) {
  const intensity = mischiefConfig.goose.intensities[level] || mischiefConfig.goose.intensities.normal;

  return {
    ...intensity,
    stepMs: mischiefConfig.goose.stepMs,
    resistancePixels: mischiefConfig.goose.resistancePixels
  };
}

function getGooseMessage(type) {
  const messages = mischiefConfig.goose.messages[type] || [];
  return messages.length > 0 ? pickRandom(messages) : "";
}

function getCursorPrankStatus() {
  if (!cursorPrankController) {
    return {
      available: false,
      packageName: "",
      error: "native mouse control unavailable"
    };
  }

  return cursorPrankController.getStatus();
}

function applyWindowClickThrough(targetWindow, interactive) {
  if (!targetWindow || targetWindow.isDestroyed()) {
    return;
  }

  if (!clickThroughEnabled) {
    targetWindow.setIgnoreMouseEvents(false);
    return;
  }

  targetWindow.setIgnoreMouseEvents(!interactive, { forward: true });
}

function getPetInteractionKey(petId) {
  return `pet:${petId}`;
}

function setForcedInteractive(key, reason, enabled) {
  if (!key || !reason) {
    return;
  }

  const reasons = forcedInteractiveReasons.get(key) || new Set();

  if (enabled) {
    reasons.add(reason);
  } else {
    reasons.delete(reason);
  }

  if (reasons.size > 0) {
    forcedInteractiveReasons.set(key, reasons);
  } else {
    forcedInteractiveReasons.delete(key);
  }
}

function isForcedInteractive(key) {
  return Boolean(forcedInteractiveReasons.get(key)?.size);
}

function clearForcedInteractive(key) {
  forcedInteractiveReasons.delete(key);
}

function isCursorInWindowHitbox(cursor, targetWindow, hitbox) {
  if (!targetWindow || targetWindow.isDestroyed() || !hitbox) {
    return false;
  }

  const bounds = targetWindow.getBounds();
  const relativeX = cursor.x - bounds.x;
  const relativeY = cursor.y - bounds.y;

  return (
    relativeX >= hitbox.x &&
    relativeX <= hitbox.x + hitbox.width &&
    relativeY >= hitbox.y &&
    relativeY <= hitbox.y + hitbox.height
  );
}

function updateHitboxClickThrough(targetWindow, key, hitbox, cursor) {
  if (!targetWindow || targetWindow.isDestroyed()) {
    return;
  }

  if (!clickThroughEnabled || isForcedInteractive(key)) {
    applyWindowClickThrough(targetWindow, true);
    return;
  }

  applyWindowClickThrough(targetWindow, isCursorInWindowHitbox(cursor, targetWindow, hitbox));
}

function getDefaultSkin() {
  return petConfig.activeSkin?.skin || "cat-1";
}

function getDefaultPetName(index = getStoredPets().length) {
  return `고양이 ${index + 1}`;
}

function sanitizePetName(name) {
  const trimmed = String(name || "").trim();
  return trimmed.slice(0, 12);
}

function getPetDisplayName(petOrId) {
  const pet = typeof petOrId === "string" ? findStoredPet(petOrId) : petOrId;
  return sanitizePetName(pet?.name) || pet?.id || "고양이";
}

function getNextPetName() {
  const usedNames = new Set(getStoredPets().map((pet) => pet.name));
  let index = 1;

  while (usedNames.has(`고양이 ${index}`)) {
    index += 1;
  }

  return `고양이 ${index}`;
}

function getSettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function readSettings() {
  try {
    const settingsPath = getSettingsPath();

    if (!fs.existsSync(settingsPath)) {
      return {};
    }

    return JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch (error) {
    logMainError(error);
    return {};
  }
}

function isValidPosition(position) {
  return position && Number.isFinite(position.x) && Number.isFinite(position.y);
}

function getDisplayWorkAreaNear(position) {
  const display = screen.getDisplayNearestPoint(position);
  return display.workArea;
}

function clampToWorkAreaForSize(position, size, workArea) {
  const maxX = workArea.x + workArea.width - size.width;
  const maxY = workArea.y + workArea.height - size.height;

  return {
    x: clamp(Math.round(position.x), workArea.x, maxX),
    y: clamp(Math.round(position.y), workArea.y, maxY)
  };
}

function isPositionOnAnyDisplay(position, size) {
  const center = {
    x: position.x + size.width / 2,
    y: position.y + size.height / 2
  };

  return screen.getAllDisplays().some(({ workArea }) => (
    center.x >= workArea.x &&
    center.x <= workArea.x + workArea.width &&
    center.y >= workArea.y &&
    center.y <= workArea.y + workArea.height
  ));
}

function getPrimaryWorkArea() {
  return screen.getPrimaryDisplay().workArea;
}

function getDefaultHousePosition() {
  const workArea = getPrimaryWorkArea();
  const { width, height } = houseConfig.window;

  return {
    x: workArea.x + Math.round(workArea.width * 0.16),
    y: workArea.y + workArea.height - height - 44
  };
}

function getInitialPosition(savedPosition, size, fallbackPosition) {
  if (isValidPosition(savedPosition) && isPositionOnAnyDisplay(savedPosition, size)) {
    return clampToWorkAreaForSize(savedPosition, size, getDisplayWorkAreaNear(savedPosition));
  }

  return clampToWorkAreaForSize(fallbackPosition, size, getDisplayWorkAreaNear(fallbackPosition));
}

function getStoredPets() {
  if (!Array.isArray(settings.pets)) {
    return [];
  }

  return settings.pets.map((pet, index) => ({
    id: pet.id || `pet-${index + 1}`,
    name: sanitizePetName(pet.name) || getDefaultPetName(index),
    skin: SKINS.includes(pet.skin) ? pet.skin : getDefaultSkin(),
    position: isValidPosition(pet.position) ? pet.position : getPositionNearHouse(index),
    hidden: false,
    inHouse: Boolean(pet.inHouse)
  }));
}

function setStoredPets(pets) {
  settings.pets = pets.map((pet, index) => ({
    id: pet.id || `pet-${index + 1}`,
    name: sanitizePetName(pet.name) || getDefaultPetName(index),
    skin: SKINS.includes(pet.skin) ? pet.skin : getDefaultSkin(),
    position: isValidPosition(pet.position) ? pet.position : getPositionNearHouse(index),
    hidden: false,
    inHouse: Boolean(pet.inHouse)
  }));
}

function upsertStoredPet(nextPet) {
  const pets = getStoredPets();
  const index = pets.findIndex((pet) => pet.id === nextPet.id);
  const normalized = {
    ...nextPet,
    name: sanitizePetName(nextPet.name) || getDefaultPetName(pets.length),
    hidden: false,
    inHouse: Boolean(nextPet.inHouse)
  };

  if (index >= 0) {
    pets[index] = {
      ...pets[index],
      ...normalized
    };
  } else {
    pets.push(normalized);
  }

  setStoredPets(pets);
  return normalized;
}

function updateStoredPet(petId, updater) {
  const pets = getStoredPets();
  const index = pets.findIndex((pet) => pet.id === petId);

  if (index < 0) {
    return null;
  }

  pets[index] = {
    ...pets[index],
    ...updater(pets[index])
  };
  setStoredPets(pets);
  return pets[index];
}

function findStoredPet(petId) {
  return getStoredPets().find((pet) => pet.id === petId) || null;
}

function getPetSnapshot(id, record) {
  let position = record.position;

  if (record.window && !record.window.isDestroyed()) {
    const [x, y] = record.window.getPosition();
    position = { x, y };
  }

  return {
    id,
    name: getPetDisplayName(record),
    skin: record.skin,
    position,
    hidden: false,
    inHouse: false
  };
}

function getLivePetSettings() {
  const byId = new Map(getStoredPets().map((pet) => [pet.id, pet]));

  for (const [id, record] of petWindows.entries()) {
    byId.set(id, getPetSnapshot(id, record));
  }

  return [...byId.values()];
}

function getHousePosition() {
  if (houseSpriteWindow && !houseSpriteWindow.isDestroyed()) {
    const [x, y] = houseSpriteWindow.getPosition();
    return { x, y };
  }

  return settings.house?.position || getDefaultHousePosition();
}

function getHouseState() {
  return {
    house: {
      position: getHousePosition(),
      skin: settings.house?.skin || houseConfig.defaultSkin
    },
    pets: getLivePetSettings(),
    quietMode,
    mischiefMode,
    cursorPrankEnabled,
    poopPrankEnabled,
    footprintsEnabled,
    foodEnabled,
    laserToyEnabled: settings.laserToyEnabled ?? true,
    laserActive: Boolean(laserWindow && !laserWindow.isDestroyed()),
    footprintCount: footprintWindows.size,
    foodCount: foodWindows.size,
    toyCount: toyWindows.size,
    mischiefIntensity,
    clickThroughEnabled,
    goose: getCursorPrankStatus(),
    availableSkins: SKINS
  };
}

function sendHouseSpriteAction(action, payload = {}) {
  if (!houseSpriteWindow || houseSpriteWindow.isDestroyed()) {
    return;
  }

  houseSpriteWindow.webContents.send("house-sprite:action", { action, payload });
}

function showHouseMessage(message) {
  sendHouseSpriteAction("speak", { message });
}

function broadcastHouseState() {
  const state = getHouseState();

  if (houseWindow && !houseWindow.isDestroyed()) {
    houseWindow.webContents.send("pet-house:state-changed", state);
  }

  if (houseSpriteWindow && !houseSpriteWindow.isDestroyed()) {
    houseSpriteWindow.webContents.send("house-sprite:state-changed", state);
  }
}

function writeSettingsNow() {
  try {
    const settingsPath = getSettingsPath();
    const pets = getLivePetSettings();
    const nextSettings = {
      ...settings,
      quietMode,
      mischiefMode,
      cursorPrankEnabled,
      poopPrankEnabled,
      footprintsEnabled,
      foodEnabled,
      laserToyEnabled: settings.laserToyEnabled ?? true,
      laserDurationMs: settings.laserDurationMs ?? mischiefConfig.laserToy?.durationMs ?? 15000,
      manualLaserAutoTimeoutEnabled: settings.manualLaserAutoTimeoutEnabled ?? false,
      manualLaserDurationMs: settings.manualLaserDurationMs ?? mischiefConfig.laserToy?.manualDurationMs ?? 60000,
      foodSpawnMode: settings.foodSpawnMode || "random-near-house",
      footprintMaxCount: settings.footprintMaxCount ?? petConfig.footprints?.maxCount ?? 45,
      foodMaxCount: settings.foodMaxCount ?? mischiefConfig.food?.maxCount ?? 5,
      toyMaxCount: settings.toyMaxCount ?? mischiefConfig.toys?.maxCount ?? 5,
      mischiefIntensity,
      clickThroughEnabled,
      mischief: {
        ...(settings.mischief || {}),
        enabled: mischiefMode
      },
      house: {
        ...(settings.house || {}),
        position: getHousePosition(),
        skin: settings.house?.skin || houseConfig.defaultSkin
      },
      selectedSkin: pets.find((pet) => !pet.inHouse)?.skin || settings.selectedSkin || getDefaultSkin(),
      windowPosition: pets.find((pet) => !pet.inHouse)?.position || settings.windowPosition || null,
      pets
    };

    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(nextSettings, null, 2), "utf8");
    settings = nextSettings;
  } catch (error) {
    logMainError(error);
  }
}

function saveSettingsNow() {
  clearTimeout(settingsSaveTimer);
  writeSettingsNow();
}

function scheduleSettingsSave() {
  clearTimeout(settingsSaveTimer);
  settingsSaveTimer = setTimeout(writeSettingsNow, petConfig.settings.saveDebounceMs);
}

function flushSettings() {
  clearTimeout(settingsSaveTimer);
  writeSettingsNow();
}

function getRecordByWindow(window) {
  return [...petWindows.values()].find((record) => record.window === window);
}

function getRecordByWebContents(webContents) {
  const window = BrowserWindow.fromWebContents(webContents);
  return window ? getRecordByWindow(window) : null;
}

function getPrimaryRecord() {
  return petWindows.get(primaryPetId) || petWindows.values().next().value;
}

function refreshPrimaryPetId(closedPetId) {
  if (primaryPetId === closedPetId || !petWindows.has(primaryPetId)) {
    primaryPetId = petWindows.keys().next().value || null;
  }
}

function sendRendererAction(record, action, payload = {}) {
  if (!record?.window || record.window.isDestroyed()) {
    return;
  }

  if (action === "pet") {
    const key = getPetInteractionKey(record.id);
    setForcedInteractive(key, "petting", true);
    applyWindowClickThrough(record.window, true);
    setTimeout(() => {
      setForcedInteractive(key, "petting", false);
    }, petConfig.stateMachine.pettingDurationMs + 300);
  }

  record.window.webContents.send("pet-menu-action", { action, payload });
}

function sendPetActionById(petId, action, payload = {}) {
  sendRendererAction(petWindows.get(petId), action, payload);
}

function getPetBounds(petId) {
  const record = petWindows.get(petId);

  if (!record?.window || record.window.isDestroyed()) {
    return null;
  }

  return record.window.getBounds();
}

function createCursorController() {
  cursorPrankController = createCursorPrankController({ screen });
  cursorPrankController.preload().finally(() => {
    if (!cursorPrankController.isAvailable() && cursorPrankEnabled) {
      cursorPrankEnabled = false;
      saveSettingsNow();
      showHouseMessage("이 환경에서는 커서 장난을 사용할 수 없어요.");
    }

    console.info("[desktop-cat] cursor prank status", cursorPrankController.getStatus());
    updateTrayMenu();
    broadcastHouseState();
  });
}

function setWindowPosition(record, position) {
  if (!record?.window || record.window.isDestroyed()) {
    return null;
  }

  const nextPosition = clampToWorkAreaForSize(
    position,
    petConfig.window,
    getDisplayWorkAreaNear(position)
  );

  record.window.setPosition(nextPosition.x, nextPosition.y, false);
  record.position = nextPosition;
  updateStoredPet(record.id, () => ({ position: nextPosition, inHouse: false }));
  scheduleSettingsSave();

  return nextPosition;
}

function moveHouseSprite(position) {
  if (!houseSpriteWindow || houseSpriteWindow.isDestroyed()) {
    return null;
  }

  const nextPosition = clampToWorkAreaForSize(
    position,
    houseConfig.window,
    getDisplayWorkAreaNear(position)
  );

  houseSpriteWindow.setPosition(nextPosition.x, nextPosition.y, false);
  settings.house = {
    ...(settings.house || {}),
    position: nextPosition,
    skin: settings.house?.skin || houseConfig.defaultSkin
  };
  scheduleSettingsSave();
  broadcastHouseState();

  return nextPosition;
}

function setQuietMode(enabled) {
  quietMode = Boolean(enabled);

  if (quietMode) {
    cursorPrankController?.stopAll();
  }

  for (const record of petWindows.values()) {
    sendRendererAction(record, "toggle-quiet-mode", { enabled: quietMode });
  }

  updateTrayMenu();
  scheduleSettingsSave();
  broadcastHouseState();
}

function toggleQuietMode() {
  setQuietMode(!quietMode);
}

function setMischiefMode(enabled) {
  mischiefMode = Boolean(enabled);

  for (const record of petWindows.values()) {
    sendRendererAction(record, "toggle-mischief", { enabled: mischiefMode });
  }

  updateTrayMenu();
  saveSettingsNow();
  broadcastHouseState();
}

function toggleMischiefMode() {
  if (mischiefMode) {
    stopMischiefMode();
    return;
  }

  setMischiefMode(true);
}

function stopMischiefMode() {
  mischiefMode = false;

  for (const record of petWindows.values()) {
    sendRendererAction(record, "mischief-stop");
  }

  updateTrayMenu();
  saveSettingsNow();
  broadcastHouseState();
}

function setCursorPrankEnabled(enabled) {
  cursorPrankEnabled = Boolean(enabled);
  if (!cursorPrankEnabled) {
    cursorPrankController?.stopAll();
  }
  updateTrayMenu();
  saveSettingsNow();
  broadcastHouseState();
}

function toggleCursorPrank() {
  setCursorPrankEnabled(!cursorPrankEnabled);
}

function setPoopPrankEnabled(enabled) {
  poopPrankEnabled = Boolean(enabled);
  updateTrayMenu();
  saveSettingsNow();
  broadcastHouseState();
}

function togglePoopPrank() {
  setPoopPrankEnabled(!poopPrankEnabled);
}

function setFootprintsEnabled(enabled) {
  footprintsEnabled = Boolean(enabled);

  if (!footprintsEnabled) {
    clearAllFootprints();
  }

  updateTrayMenu();
  saveSettingsNow();
  broadcastHouseState();
}

function toggleFootprints() {
  setFootprintsEnabled(!footprintsEnabled);
}

function setFoodEnabled(enabled) {
  foodEnabled = Boolean(enabled);

  if (!foodEnabled) {
    clearAllFood();
  }

  updateTrayMenu();
  saveSettingsNow();
  broadcastHouseState();
}

function toggleFood() {
  setFoodEnabled(!foodEnabled);
}

function setMischiefIntensity(level) {
  if (!mischiefConfig.goose.intensities[level]) {
    return;
  }

  mischiefIntensity = level;
  for (const record of petWindows.values()) {
    sendRendererAction(record, "set-goose-intensity", { gooseIntensity: mischiefIntensity });
  }
  saveSettingsNow();
  broadcastHouseState();
}

function emergencyStopAllPranks() {
  emergencyStopActive = true;
  cursorPrankEnabled = false;
  mischiefMode = false;
  cursorPrankController?.stopAll();
  stopLaserToy({ silent: true });
  clearAllToys();

  for (const record of petWindows.values()) {
    sendRendererAction(record, "mischief-stop");
    sendRendererAction(record, "goose-prank", {
      phase: "stop",
      message: ""
    });
  }

  showHouseMessage("장난을 멈췄어요");
  updateTrayMenu();
  saveSettingsNow();
  broadcastHouseState();
}

function clearAllPoops() {
  const count = poopWindows.size;

  for (const record of poopWindows.values()) {
    if (record.window && !record.window.isDestroyed()) {
      record.window.close();
    }
  }

  poopWindows.clear();
  showHouseMessage(count > 0 ? "똥을 모두 치웠어요!" : "치울 똥이 없어요.");
}

function removePoop(poopId) {
  const record = poopWindows.get(poopId);

  if (!record) {
    return;
  }

  poopWindows.delete(poopId);

  if (record.window && !record.window.isDestroyed()) {
    record.window.close();
  }
}

function createPoopWindow({ x, y, sourcePetId, force = false }) {
  const config = mischiefConfig.poop;

  if (quietMode) {
    return { created: false, reason: "disabled" };
  }

  if (!force) {
    if (!mischiefMode || !poopPrankEnabled || !config.enabled) {
      return { created: false, reason: "disabled" };
    }

    if (poopWindows.size >= config.maxCount) {
      return { created: false, reason: "max-count" };
    }

    const now = Date.now();
    if (now - lastPoopAt < config.cooldownMs) {
      return { created: false, reason: "cooldown" };
    }
  }

  const size = config.window;
  const position = clampToWorkAreaForSize({ x, y }, size, getDisplayWorkAreaNear({ x, y }));
  const poopId = `poop-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const poopWindow = new BrowserWindow({
    width: size.width,
    height: size.height,
    x: position.x,
    y: position.y,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  poopWindows.set(poopId, {
    id: poopId,
    sourcePetId,
    position,
    window: poopWindow
  });
  lastPoopAt = Date.now();

  poopWindow.on("closed", () => {
    poopWindows.delete(poopId);
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    const url = new URL(process.env.VITE_DEV_SERVER_URL);
    url.searchParams.set("view", "poop");
    url.searchParams.set("poopId", poopId);
    poopWindow.loadURL(url.toString()).catch(logMainError);
  } else {
    poopWindow.loadFile(path.join(__dirname, "../dist/index.html"), {
      query: {
        view: "poop",
        poopId
      }
    }).catch(logMainError);
  }

  return { created: true, poopId };
}

function createPoopNearPet(petId, position, force = false) {
  const record = petWindows.get(petId);
  const petPosition = position || record?.position;

  if (!petPosition) {
    return { created: false, reason: "missing-pet" };
  }

  return createPoopWindow({
    x: petPosition.x + petConfig.window.width / 2 - mischiefConfig.poop.window.width / 2,
    y: petPosition.y + petConfig.window.height - 54,
    sourcePetId: petId,
    force
  });
}

function closeObjectWindows(objectWindows) {
  for (const record of objectWindows.values()) {
    if (record.window && !record.window.isDestroyed()) {
      record.window.close();
    }
  }

  objectWindows.clear();
}

function enforceMaxObjectCount(objectWindows, maxCount) {
  if (maxCount <= 0) {
    closeObjectWindows(objectWindows);
    return;
  }

  while (objectWindows.size >= maxCount) {
    const oldestId = objectWindows.keys().next().value;
    const oldest = objectWindows.get(oldestId);
    objectWindows.delete(oldestId);

    if (oldest?.window && !oldest.window.isDestroyed()) {
      oldest.window.close();
    }
  }
}

function clearAllFootprints() {
  const count = footprintWindows.size;
  closeObjectWindows(footprintWindows);
  showHouseMessage(count > 0 ? "발자국을 모두 지웠어요!" : "지울 발자국이 없어요.");
}

function removeFootprint(footprintId) {
  const record = footprintWindows.get(footprintId);

  if (!record) {
    return;
  }

  footprintWindows.delete(footprintId);

  if (record.window && !record.window.isDestroyed()) {
    record.window.close();
  }
}

function createFootprintWindow({ x, y, petId, direction = 1 }) {
  const config = petConfig.footprints || {};

  if (!footprintsEnabled || config.enabled === false || !Number.isFinite(x) || !Number.isFinite(y)) {
    return { created: false, reason: "disabled" };
  }

  const maxCount = settings.footprintMaxCount ?? config.maxCount ?? 45;
  if (maxCount <= 0) {
    return { created: false, reason: "max-count" };
  }
  enforceMaxObjectCount(footprintWindows, maxCount);

  const size = config.window || { width: 32, height: 32 };
  const position = clampToWorkAreaForSize({ x, y }, size, getDisplayWorkAreaNear({ x, y }));
  const footprintId = `footprint-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const footprintWindow = new BrowserWindow({
    width: size.width,
    height: size.height,
    x: position.x,
    y: position.y,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  footprintWindows.set(footprintId, {
    id: footprintId,
    petId,
    position,
    direction,
    window: footprintWindow
  });

  footprintWindow.on("closed", () => {
    footprintWindows.delete(footprintId);
  });

  const query = {
    view: "footprint",
    footprintId,
    lifetimeMs: String(config.lifetimeMs || 3000),
    direction: String(direction)
  };

  if (process.env.VITE_DEV_SERVER_URL) {
    const url = new URL(process.env.VITE_DEV_SERVER_URL);
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
    footprintWindow.loadURL(url.toString()).catch(logMainError);
  } else {
    footprintWindow.loadFile(path.join(__dirname, "../dist/index.html"), { query }).catch(logMainError);
  }

  return { created: true, footprintId };
}

function clearAllFood() {
  const foodIds = [...foodWindows.keys()];
  closeObjectWindows(foodWindows);

  for (const record of petWindows.values()) {
    sendRendererAction(record, "food-removed", { foodIds });
  }

  showHouseMessage(foodIds.length > 0 ? "음식을 모두 치웠어요!" : "치울 음식이 없어요.");
}

function removeFood(foodId, reason = "removed") {
  const record = foodWindows.get(foodId);

  if (!record) {
    return false;
  }

  foodWindows.delete(foodId);

  if (record.window && !record.window.isDestroyed()) {
    record.window.close();
  }

  if (record.targetPetId) {
    sendPetActionById(record.targetPetId, "food-removed", { foodId, reason });
  }

  return true;
}

function getWindowCenter(record) {
  if (!record?.window || record.window.isDestroyed()) {
    return null;
  }

  const bounds = record.window.getBounds();
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2
  };
}

function findNearestPetForFood(position) {
  const radius = mischiefConfig.food?.attractRadiusPx ?? 900;
  let nearest = null;

  for (const record of petWindows.values()) {
    const center = getWindowCenter(record);

    if (!center) {
      continue;
    }

    const distance = Math.hypot(center.x - position.x, center.y - position.y);

    if (distance <= radius && (!nearest || distance < nearest.distance)) {
      nearest = { record, distance };
    }
  }

  return nearest?.record || null;
}

function getObjectBounds(objectWindows) {
  return [...objectWindows.values()]
    .map((record) => record.window && !record.window.isDestroyed()
      ? record.window.getBounds()
      : record.position && record.size
        ? { ...record.position, ...record.size }
        : null)
    .filter(Boolean);
}

function getFoodFallbackPosition(houseBounds, foodSize) {
  const rawPosition = {
    x: houseBounds.x + houseBounds.width + 36,
    y: houseBounds.y + houseBounds.height + 24
  };

  return clampToWorkAreaForSize(rawPosition, foodSize, getDisplayWorkAreaNear(rawPosition));
}

function getRandomFoodPositionNearHouse() {
  const houseBounds = houseSpriteWindow && !houseSpriteWindow.isDestroyed()
    ? houseSpriteWindow.getBounds()
    : { ...getHousePosition(), ...houseConfig.window };
  const foodSize = mischiefConfig.food?.window || { width: 56, height: 56 };
  const houseCenter = {
    x: houseBounds.x + houseBounds.width / 2,
    y: houseBounds.y + houseBounds.height / 2
  };
  const blockingBounds = [
    houseBounds,
    ...getObjectBounds(foodWindows),
    ...getObjectBounds(poopWindows)
  ];

  for (let attempt = 0; attempt < 18; attempt += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = randomBetween(200, 600);
    const rawPosition = {
      x: houseCenter.x + Math.cos(angle) * distance - foodSize.width / 2,
      y: houseCenter.y + Math.sin(angle) * distance - foodSize.height / 2
    };
    const position = clampToWorkAreaForSize(rawPosition, foodSize, getDisplayWorkAreaNear(rawPosition));
    const foodCenter = {
      x: position.x + foodSize.width / 2,
      y: position.y + foodSize.height / 2
    };
    const distanceFromHouse = Math.hypot(foodCenter.x - houseCenter.x, foodCenter.y - houseCenter.y);
    const candidateBounds = { ...position, ...foodSize };
    const overlapsExisting = blockingBounds.some((bounds) => rectanglesOverlap(candidateBounds, bounds));

    if (distanceFromHouse >= 160 && !overlapsExisting) {
      return position;
    }
  }

  return getFoodFallbackPosition(houseBounds, foodSize);
}

function createFoodWindow(type = "treat") {
  const config = mischiefConfig.food || {};

  if (!foodEnabled || config.enabled === false) {
    showHouseMessage("지금은 음식을 꺼낼 수 없어요.");
    return { created: false, reason: "disabled" };
  }

  const maxCount = settings.foodMaxCount ?? config.maxCount ?? 5;
  if (maxCount <= 0) {
    showHouseMessage("음식을 더 놓을 수 없어요.");
    return { created: false, reason: "max-count" };
  }
  enforceMaxObjectCount(foodWindows, maxCount);

  const size = config.window || { width: 56, height: 56 };
  const position = getRandomFoodPositionNearHouse();
  const foodId = `food-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const targetPet = findNearestPetForFood({
    x: position.x + size.width / 2,
    y: position.y + size.height / 2
  });
  const foodWindow = new BrowserWindow({
    width: size.width,
    height: size.height,
    x: position.x,
    y: position.y,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const record = {
    id: foodId,
    type,
    position,
    size,
    targetPetId: targetPet?.id || null,
    window: foodWindow
  };

  foodWindows.set(foodId, record);

  foodWindow.on("closed", () => {
    foodWindows.delete(foodId);
  });

  const query = {
    view: "food",
    foodId,
    type,
    lifetimeMs: String(config.lifetimeMs || 30000)
  };

  if (process.env.VITE_DEV_SERVER_URL) {
    const url = new URL(process.env.VITE_DEV_SERVER_URL);
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
    foodWindow.loadURL(url.toString()).catch(logMainError);
  } else {
    foodWindow.loadFile(path.join(__dirname, "../dist/index.html"), { query }).catch(logMainError);
  }

  if (targetPet) {
    sendRendererAction(targetPet, "food-spawned", {
      foodId,
      type,
      position,
      size
    });
  }

  showHouseMessage(targetPet ? "간식을 꺼냈어요!" : "음식을 놓았어요.");
  return { created: true, foodId };
}

function normalizeToyType(type = "yarn") {
  return ["yarn", "box", "catnip"].includes(type) ? type : "yarn";
}

function getToyConfig(type = "yarn") {
  const normalizedType = normalizeToyType(type);
  const config = mischiefConfig.toys || {};
  const typeConfig = config[normalizedType] || {};
  const boxMinStayMs = typeConfig.boxMinStayMs ?? 20000;
  const boxMaxStayMs = typeConfig.boxMaxStayMs ?? 45000;
  const boxAutoExitFallbackMs = typeConfig.boxAutoExitFallbackMs ?? 60000;

  return {
    maxCount: settings.toyMaxCount ?? config.maxCount ?? 5,
    lifetimeMs: typeConfig.lifetimeMs ?? (normalizedType === "box" ? 70000 : normalizedType === "catnip" ? 22000 : 30000),
    maxHits: typeConfig.maxHits ?? (normalizedType === "yarn" ? 3 : 1),
    moveDistanceMinPx: typeConfig.moveDistanceMinPx ?? (normalizedType === "yarn" ? 70 : 60),
    moveDistanceMaxPx: typeConfig.moveDistanceMaxPx ?? (normalizedType === "yarn" ? 150 : 150),
    moveDurationMs: typeConfig.moveDurationMs
      ?? (normalizedType === "yarn"
        ? Math.round(randomBetween(typeConfig.moveDurationMinMs ?? 800, typeConfig.moveDurationMaxMs ?? 1200))
        : 0),
    hitCooldownMs: typeConfig.hitCooldownMs ?? (normalizedType === "yarn" ? 850 : 750),
    catnipDurationMs: typeConfig.effectDurationMs ?? Math.round(randomBetween(10000, 18000)),
    boxDurationMs: Math.round(randomBetween(boxMinStayMs, boxMaxStayMs)),
    boxMinStayMs,
    boxMaxStayMs,
    boxKnocksToExit: typeConfig.boxKnocksToExit ?? 3,
    boxKnockCooldownMs: typeConfig.boxKnockCooldownMs ?? 350,
    boxAutoExitFallbackMs,
    boxPostExitRemoveMs: typeConfig.boxPostExitRemoveMs ?? 2400,
    window: typeConfig.window || config.window || { width: 48, height: 48 }
  };
}

function getToyPositionNearHouse(size) {
  const houseBounds = getHouseBounds();
  const houseCenter = {
    x: houseBounds.x + houseBounds.width / 2,
    y: houseBounds.y + houseBounds.height / 2
  };

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = randomBetween(180, 520);
    const rawPosition = {
      x: houseCenter.x + Math.cos(angle) * distance - size.width / 2,
      y: houseCenter.y + Math.sin(angle) * distance - size.height / 2
    };
    const position = clampToWorkAreaForSize(rawPosition, size, getDisplayWorkAreaNear(rawPosition));
    const center = {
      x: position.x + size.width / 2,
      y: position.y + size.height / 2
    };

    if (Math.hypot(center.x - houseCenter.x, center.y - houseCenter.y) >= 150) {
      return position;
    }
  }

  return clampToWorkAreaForSize(
    { x: houseBounds.x + houseBounds.width + 72, y: houseBounds.y + houseBounds.height + 30 },
    size,
    getDisplayWorkAreaNear(houseBounds)
  );
}

function getToyPayload(record) {
  return {
    toyId: record.id,
    type: record.type,
    position: record.position,
    size: record.size,
    hitCount: record.hitCount,
    phase: record.phase || "idle"
  };
}

function getToyLabel(type) {
  if (type === "box") {
    return "박스";
  }

  if (type === "catnip") {
    return "캣닢";
  }

  return "실뭉치";
}

function updateToyWindowMouseMode(record) {
  if (!record?.window || record.window.isDestroyed()) {
    return;
  }

  try {
    const shouldReceiveClicks = record.type === "box" && record.phase === "occupied";
    record.window.setIgnoreMouseEvents(!shouldReceiveClicks, { forward: true });
  } catch (error) {
    logMainError(error);
  }
}

function sendToyWindowState(record, phase = record.phase || "idle", meta = {}) {
  if (!record?.window || record.window.isDestroyed()) {
    return;
  }

  record.phase = phase;
  record.window.webContents.send("toy-window:set-state", {
    toyId: record.id,
    type: record.type,
    phase,
    meta
  });
  updateToyWindowMouseMode(record);
}

function clearBoxTimers(record) {
  clearTimeout(record?.boxExitTimer);
  clearTimeout(record?.autoExitTimer);
  clearTimeout(record?.knockTimer);
}

function sendBoxKnockState(record, meta = {}) {
  if (!record || record.type !== "box") {
    return;
  }

  sendToyWindowState(record, record.phase || "idle", {
    knocked: true,
    knockNonce: Date.now(),
    knockCount: record.knockCount || 0,
    knocksToExit: record.knocksToExit || 3,
    ...meta
  });
}

function findNearestPetForToy(record) {
  const toyCenter = {
    x: record.position.x + record.size.width / 2,
    y: record.position.y + record.size.height / 2
  };
  let nearest = null;

  for (const petRecord of petWindows.values()) {
    const center = getWindowCenter(petRecord);
    if (!center) {
      continue;
    }

    const distance = Math.hypot(center.x - toyCenter.x, center.y - toyCenter.y);
    if (!nearest || distance < nearest.distance) {
      nearest = { record: petRecord, distance };
    }
  }

  return nearest?.record || null;
}

function notifyPetToySpawned(record) {
  const targetPet = findNearestPetForToy(record);
  record.targetPetId = targetPet?.id || null;

  if (targetPet) {
    sendRendererAction(targetPet, "toy-spawned", getToyPayload(record));
    showHouseMessage(`${getPetDisplayName(targetPet)}가 ${getToyLabel(record.type)}에 관심을 보여요!`);
  }
}

function notifyPetToyMoved(record) {
  const targetPet = findNearestPetForToy(record);
  record.targetPetId = targetPet?.id || record.targetPetId || null;

  if (targetPet) {
    sendRendererAction(targetPet, "toy-moved", getToyPayload(record));
  }
}

function removeToy(toyId, reason = "removed") {
  const record = toyWindows.get(toyId);

  if (!record) {
    return false;
  }

  clearTimeout(record.expireTimer);
  clearTimeout(record.moveTimer);
  clearTimeout(record.removeTimer);
  clearBoxTimers(record);
  record.isMoving = false;

  if (record.type === "box" && record.occupiedPetId) {
    restorePetFromBox(record, reason);
  }

  toyWindows.delete(toyId);

  if (record.window && !record.window.isDestroyed()) {
    record.window.close();
  }

  for (const petRecord of petWindows.values()) {
    sendRendererAction(petRecord, "toy-removed", { toyId, reason });
  }

  updateTrayMenu();
  broadcastHouseState();
  return true;
}

function clearAllToys() {
  const toyIds = [...toyWindows.keys()];
  toyIds.forEach((toyId) => removeToy(toyId, "cleared"));
  showHouseMessage(toyIds.length > 0 ? "장난감을 모두 치웠어요!" : "치울 장난감이 없어요.");
}

function enforceToyMaxCount(maxCount) {
  while (toyWindows.size >= maxCount) {
    removeToy(toyWindows.keys().next().value, "max-count");
  }
}

function getToyCenter(record, position = record.position) {
  return {
    x: position.x + record.size.width / 2,
    y: position.y + record.size.height / 2
  };
}

function getPetCenterFromToyHitPayload(petId, payload = {}) {
  if (isValidPosition(payload.petCenter)) {
    return {
      x: payload.petCenter.x,
      y: payload.petCenter.y
    };
  }

  if (isValidPosition(payload.petPosition)) {
    return {
      x: payload.petPosition.x + petConfig.window.width / 2,
      y: payload.petPosition.y + petConfig.window.height / 2
    };
  }

  const petRecord = petWindows.get(petId);
  return getWindowCenter(petRecord);
}

function getBoxExitPosition(record) {
  const rawPosition = {
    x: record.position.x + record.size.width / 2 - petConfig.window.width / 2 + randomBetween(-28, 28),
    y: record.position.y + record.size.height / 2 - petConfig.window.height * 0.68 + randomBetween(-18, 22)
  };

  return clampToWorkAreaForSize(rawPosition, petConfig.window, getDisplayWorkAreaNear(record.position));
}

function restorePetFromBox(record, reason = "removed") {
  if (!record || record.type !== "box" || !record.occupiedPetId) {
    return false;
  }

  const petId = record.occupiedPetId;
  const exitPosition = getBoxExitPosition(record);
  sendPetActionById(petId, "box-exit", {
    toyId: record.id,
    position: record.position,
    exitPosition,
    reason
  });
  record.occupiedPetId = null;
  record.enteredAt = 0;
  return true;
}

function releaseCatFromBox(toyId, reason = "auto") {
  const record = toyWindows.get(toyId);

  if (!record || record.type !== "box") {
    return false;
  }

  if (!record.occupiedPetId) {
    sendBoxKnockState(record, { reason: "empty" });
    return false;
  }

  const config = getToyConfig("box");
  clearBoxTimers(record);
  restorePetFromBox(record, reason);
  sendToyWindowState(record, "exiting", {
    reason,
    exitPosition: getBoxExitPosition(record)
  });
  showHouseMessage(reason === "knock" ? "박스에서 고양이가 튀어나왔어요!" : "고양이가 박스 밖으로 나왔어요!");

  record.removeTimer = setTimeout(() => {
    if (!toyWindows.has(record.id)) {
      return;
    }
    sendToyWindowState(record, "finished", { reason });
    record.removeTimer = setTimeout(() => removeToy(record.id, "box-finished"), 700);
  }, Math.round(randomBetween(800, Math.max(900, config.boxPostExitRemoveMs))));

  return true;
}

function finishYarnToy(record, reason = "played-out") {
  clearTimeout(record.removeTimer);
  record.isMoving = false;
  sendToyWindowState(record, "finished", { reason });
  record.removeTimer = setTimeout(() => {
    removeToy(record.id, reason);
  }, Math.round(randomBetween(800, 1200)));
}

function animateToyMove(record, from, to, durationMs, meta = {}) {
  if (!record?.window || record.window.isDestroyed()) {
    return;
  }

  clearTimeout(record.moveTimer);
  record.isMoving = true;
  sendToyWindowState(record, "moving", { ...meta, from, to, durationMs });

  const startedAt = Date.now();

  function step() {
    if (!toyWindows.has(record.id) || !record.window || record.window.isDestroyed() || !record.isMoving) {
      return;
    }

    const t = Math.min((Date.now() - startedAt) / durationMs, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    const x = Math.round(from.x + (to.x - from.x) * eased);
    const y = Math.round(from.y + (to.y - from.y) * eased);

    record.position = { x, y };
    record.window.setPosition(x, y, false);

    if (t < 1) {
      record.moveTimer = setTimeout(step, 16);
      return;
    }

    record.position = to;
    record.isMoving = false;
    sendToyWindowState(record, "idle");
    notifyPetToyMoved(record);
  }

  step();
}

function moveToyAfterHit(record, payload = {}) {
  const config = getToyConfig(record.type);
  const petCenter = getPetCenterFromToyHitPayload(payload.petId, payload);
  const toyCenter = getToyCenter(record);
  let directionX = 0;
  let directionY = 0;

  if (petCenter) {
    directionX = toyCenter.x - petCenter.x;
    directionY = toyCenter.y - petCenter.y;
  }

  const magnitude = Math.hypot(directionX, directionY);
  if (magnitude < 0.001) {
    const angle = Math.random() * Math.PI * 2;
    directionX = Math.cos(angle);
    directionY = Math.sin(angle) * 0.65;
  } else {
    directionX /= magnitude;
    directionY /= magnitude;
  }

  const distance = randomBetween(config.moveDistanceMinPx, config.moveDistanceMaxPx);
  const rawPosition = {
    x: record.position.x + directionX * distance,
    y: record.position.y + directionY * distance
  };
  const nextPosition = clampToWorkAreaForSize(rawPosition, record.size, getDisplayWorkAreaNear(rawPosition));

  animateToyMove(record, { ...record.position }, nextPosition, config.moveDurationMs, {
    hitCount: record.hitCount,
    pushedByPetId: payload.petId
  });
}

function handleToyHit(petId, toyId, payload = {}) {
  const record = toyWindows.get(toyId);
  const now = Date.now();

  if (!record || record.isMoving || record.phase === "occupied" || now - record.lastHitAt < getToyConfig(record.type).hitCooldownMs) {
    return false;
  }

  record.lastHitAt = now;
  record.hitCount += 1;
  const config = getToyConfig(record.type);

  if (record.type === "catnip") {
    removeToy(toyId, "used");
    if (quietMode) {
      sendPetActionById(petId, "catnip-quiet");
      showHouseMessage(`${getPetDisplayName(petId)}는 지금 조용히 있고 싶대요.`);
    } else {
      sendPetActionById(petId, "catnip-start", { durationMs: config.catnipDurationMs });
      showHouseMessage(`${getPetDisplayName(petId)}가 캣닢 향을 맡았어요!`);
    }
    return true;
  }

  if (record.type === "box") {
    if (record.occupiedPetId) {
      return false;
    }

    clearBoxTimers(record);
    record.occupiedPetId = petId;
    record.knockCount = 0;
    record.knocksToExit = config.boxKnocksToExit;
    record.enteredAt = now;
    record.lastKnockAt = 0;
    sendToyWindowState(record, "entering", { petId });
    sendPetActionById(petId, "box-enter", {
      toyId,
      position: record.position,
      durationMs: config.boxDurationMs,
      message: pickRandom(["나 안 보이지?", "여기 좋다냥", "숨어야지"])
    });
    showHouseMessage(`${getPetDisplayName(petId)}가 박스 안으로 쏙 들어갔어요!`);

    record.knockTimer = setTimeout(() => {
      if (toyWindows.has(toyId) && record.occupiedPetId) {
        sendToyWindowState(record, "occupied", {
          petId,
          knockCount: record.knockCount,
          knocksToExit: record.knocksToExit
        });
      }
    }, 260);

    record.boxExitTimer = setTimeout(() => releaseCatFromBox(toyId, "auto"), config.boxDurationMs);
    record.autoExitTimer = setTimeout(() => releaseCatFromBox(toyId, "fallback"), config.boxAutoExitFallbackMs);
    return true;
  }

  showHouseMessage(`${getPetDisplayName(petId)}가 실뭉치를 톡톡 건드렸어요!`);

  if (record.hitCount >= record.maxHits) {
    const message = pickRandom(["엉켰다냥", "이거 내 거야", "실뭉치 놀이 끝!"]);
    sendPetActionById(petId, "toy-message", { toyId, message });
    showHouseMessage(message);
    finishYarnToy(record, "played-out");
    return true;
  }

  moveToyAfterHit(record, { ...payload, petId });
  return true;
}

function handleToyKnock(toyId) {
  const record = toyWindows.get(toyId);

  if (!record || record.type !== "box") {
    return false;
  }

  if (record.phase !== "occupied" || !record.occupiedPetId) {
    sendBoxKnockState(record, { ignored: true, reason: "not-occupied" });
    return false;
  }

  const config = getToyConfig("box");
  const now = Date.now();
  if (now - (record.lastKnockAt || 0) < config.boxKnockCooldownMs) {
    sendBoxKnockState(record, { ignored: true, reason: "cooldown" });
    return false;
  }

  record.lastKnockAt = now;
  record.knockCount = (record.knockCount || 0) + 1;
  record.knocksToExit = record.knocksToExit || config.boxKnocksToExit;

  sendBoxKnockState(record, {
    reason: "knock",
    remainingKnocks: Math.max(0, record.knocksToExit - record.knockCount)
  });

  if (record.knockCount < record.knocksToExit) {
    const message = pickRandom(["...", "누구냥?", "조금만 더 있을래"]);
    sendPetActionById(record.occupiedPetId, "toy-message", {
      toyId: record.id,
      message
    });
    showHouseMessage(message);
    return true;
  }

  sendPetActionById(record.occupiedPetId, "toy-message", {
    toyId: record.id,
    message: pickRandom(["알았어 나갈게!", "깜짝이야!", "들켰다냥!"])
  });
  releaseCatFromBox(toyId, "knock");
  return true;
}

function createToyWindow(type = "yarn") {
  const normalizedType = normalizeToyType(type);
  const config = getToyConfig(normalizedType);

  if (config.maxCount <= 0) {
    showHouseMessage("장난감을 꺼낼 수 없어요.");
    return { created: false, reason: "max-count" };
  }

  enforceToyMaxCount(config.maxCount);

  const size = config.window;
  const position = getToyPositionNearHouse(size);
  const toyId = `toy-${normalizedType}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const toyWindow = new BrowserWindow({
    width: size.width,
    height: size.height,
    x: position.x,
    y: position.y,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  const record = {
    id: toyId,
    type: normalizedType,
    position,
    size,
    hitCount: 0,
    maxHits: config.maxHits,
    isMoving: false,
    phase: "idle",
    lastHitAt: 0,
    occupiedPetId: null,
    knockCount: 0,
    knocksToExit: config.boxKnocksToExit || 3,
    enteredAt: 0,
    lastKnockAt: 0,
    targetPetId: null,
    window: toyWindow,
    expireTimer: null,
    moveTimer: null,
    removeTimer: null,
    boxExitTimer: null,
    autoExitTimer: null,
    knockTimer: null
  };

  toyWindows.set(toyId, record);
  toyWindow.on("closed", () => {
    clearTimeout(record.expireTimer);
    clearTimeout(record.moveTimer);
    clearTimeout(record.removeTimer);
    clearBoxTimers(record);
    toyWindows.delete(toyId);
  });
  toyWindow.webContents.on("did-finish-load", () => {
    toyWindow.setIgnoreMouseEvents(true, { forward: true });
    sendToyWindowState(record, record.phase);
  });

  try {
    toyWindow.setAlwaysOnTop(true, "screen-saver");
    toyWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    toyWindow.setIgnoreMouseEvents(true, { forward: true });
  } catch (error) {
    logMainError(error);
    toyWindow.setAlwaysOnTop(true);
  }

  const query = { view: "toy", toyId, type: normalizedType };
  if (process.env.VITE_DEV_SERVER_URL) {
    const url = new URL(process.env.VITE_DEV_SERVER_URL);
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
    toyWindow.loadURL(url.toString()).catch(logMainError);
  } else {
    toyWindow.loadFile(path.join(__dirname, "../dist/index.html"), { query }).catch(logMainError);
  }

  record.expireTimer = setTimeout(() => removeToy(toyId, "expired"), config.lifetimeMs);
  notifyPetToySpawned(record);
  updateTrayMenu();
  broadcastHouseState();
  return { created: true, toyId };
}

async function runGooseCarryPrankForPet(petId, options = {}) {
  const record = petWindows.get(petId);

  if (!record || record.window.isDestroyed()) {
    return { ok: false, reason: "missing-pet" };
  }

  if (quietMode) {
    sendRendererAction(record, "goose-prank", {
      phase: "quiet",
      message: getGooseMessage("quiet")
    });
    return { ok: false, reason: "quiet-mode" };
  }

  if (emergencyStopActive && !options.manual) {
    return { ok: false, reason: "emergency-stop" };
  }

  if (petStates.get(petId) === "sleep") {
    return { ok: false, reason: "sleeping" };
  }

  if (!cursorPrankController || !cursorPrankController.isAvailable()) {
    sendRendererAction(record, "goose-prank", {
      phase: "unavailable",
      message: "커서 장난 사용 불가 - native 모듈 로드 실패"
    });
    return { ok: false, reason: "unavailable" };
  }

  // Cooldown & Chance
  const now = Date.now();
  if (!options.manual) {
    const config = getGooseIntensityConfig(mischiefIntensity);
    if (Math.random() > config.chance) {
      return { ok: false, reason: "chance" };
    }
  }

  // Phase 1: Chase
  const startCursor = await cursorPrankController.getCursorPosition();
  sendRendererAction(record, "goose-prank", {
    phase: "start",
    cursor: startCursor,
    message: getGooseMessage("start")
  });

  // Wait for pet to reach cursor
  let reached = false;
  const chaseStart = Date.now();
  while (Date.now() - chaseStart < 3500) {
    await new Promise(resolve => setTimeout(resolve, 50));
    if (emergencyStopActive || (!cursorPrankEnabled && !options.manual)) return { ok: false, reason: "stopped" };

    const b = record.window.getBounds();
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    if (Math.hypot(cx - startCursor.x, cy - startCursor.y) < 60) {
      reached = true;
      break;
    }
  }

  if (!reached) {
    return { ok: false, reason: "timeout" };
  }

  // Phase 2: Carry
  const workArea = getDisplayWorkAreaNear(startCursor);
  const escapeTarget = {
    x: workArea.x + Math.random() * (workArea.width - 200) + 100,
    y: workArea.y + Math.random() * (workArea.height - 200) + 100
  };

  sendRendererAction(record, "goose-prank", {
    phase: "carry",
    target: escapeTarget,
    message: getGooseMessage("running")
  });

  const carryStart = Date.now();
  while (Date.now() - carryStart < 4500 && !emergencyStopActive) {
    const b = record.window.getBounds();
    const anchor = {
      x: b.x + b.width * 0.55,
      y: b.y + b.height * 0.45
    };

    const currentCursor = await cursorPrankController.getCursorPosition();
    // Resistance detection (200ms grace period)
    if (Date.now() - carryStart > 200) {
      if (Math.hypot(currentCursor.x - anchor.x, currentCursor.y - anchor.y) > 140) {
        sendRendererAction(record, "goose-prank", { phase: "resisted", message: "알았어 안 할게!" });
        return { ok: false, reason: "resisted" };
      }
    }

    await cursorPrankController.moveCursorTo(anchor);
    
    // Check if pet reached the escape target
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    if (Math.hypot(cx - escapeTarget.x, cy - escapeTarget.y) < 40) {
      break;
    }

    await new Promise(resolve => setTimeout(resolve, 16));
  }

  sendRendererAction(record, "goose-prank", { phase: "success", message: getGooseMessage("success") });
  return { ok: true, reason: "success" };
}

function runNormalMischiefOnce(record) {
  if (!record || record.window.isDestroyed()) {
    return;
  }

  sendRendererAction(record, "manual-mischief", { type: "dash" });
}

function maybeRunAutomaticGoosePrank() {
  if (!mischiefMode || !cursorPrankEnabled || quietMode || emergencyStopActive) {
    return;
  }

  const candidates = [...petWindows.values()].filter((record) => {
    return record?.id && petStates.get(record.id) !== "sleep";
  });

  if (candidates.length === 0) {
    return;
  }

  const record = pickRandom(candidates);
  runGooseCarryPrankForPet(record.id).catch(logMainError);
}

function startGooseAutoLoop() {
  clearInterval(gooseAutoTimer);
  gooseAutoTimer = setInterval(maybeRunAutomaticGoosePrank, 2500);
}

function setPetSkin(record, skin) {
  if (!record || !SKINS.includes(skin)) {
    return false;
  }

  record.skin = skin;
  updateStoredPet(record.id, () => ({ skin }));
  sendRendererAction(record, "set-skin", {
    activeSkin: {
      pack: petConfig.activeSkin?.pack || "pet-cats-pack",
      skin
    }
  });
  scheduleSettingsSave();
  broadcastHouseState();
  return true;
}

function setPetSkinById(petId, skin) {
  const record = petWindows.get(petId);

  if (record) {
    return setPetSkin(record, skin);
  }

  const changed = updateStoredPet(petId, () => ({ skin: SKINS.includes(skin) ? skin : getDefaultSkin() }));
  scheduleSettingsSave();
  broadcastHouseState();
  return Boolean(changed);
}

function createNameEditWindow(petId) {
  const pet = findStoredPet(petId) || petWindows.get(petId);

  if (!pet) {
    return null;
  }

  const nameWindow = new BrowserWindow({
    width: 320,
    height: 190,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    title: "고양이 이름 바꾸기",
    backgroundColor: "#fff8e8",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    const url = new URL(process.env.VITE_DEV_SERVER_URL);
    url.searchParams.set("view", "name-edit");
    url.searchParams.set("petId", petId);
    url.searchParams.set("name", getPetDisplayName(pet));
    nameWindow.loadURL(url.toString()).catch(logMainError);
  } else {
    nameWindow.loadFile(path.join(__dirname, "../dist/index.html"), {
      query: {
        view: "name-edit",
        petId,
        name: getPetDisplayName(pet)
      }
    }).catch(logMainError);
  }

  return nameWindow;
}

function renamePet(petId, rawName) {
  const name = sanitizePetName(rawName);

  if (!petId || !name) {
    return false;
  }

  const record = petWindows.get(petId);
  if (record) {
    record.name = name;
  }

  const changed = updateStoredPet(petId, () => ({ name }));

  if (!changed && record) {
    upsertStoredPet({
      id: record.id,
      name,
      skin: record.skin,
      position: record.position,
      hidden: false,
      inHouse: false
    });
  }

  saveSettingsNow();
  updateTrayMenu();
  broadcastHouseState();
  return true;
}

function showPetWindow(record = getPrimaryRecord()) {
  if (!record) {
    return;
  }

  record.window.show();
  if (!contextMenuOpen) {
    record.window.focus();
  }
  updateStoredPet(record.id, () => ({ inHouse: false, hidden: false }));
  scheduleSettingsSave();
  broadcastHouseState();
}

function showPetById(petId) {
  const record = petWindows.get(petId);

  if (record) {
    showPetWindow(record);
    return true;
  }

  const pet = findStoredPet(petId);

  if (!pet) {
    return false;
  }

  callPetFromHouse(petId);
  return true;
}

function sleepAllPets() {
  for (const record of petWindows.values()) {
    sendRendererAction(record, "sleep");
  }
}

function wakeAllPets() {
  for (const record of petWindows.values()) {
    sendRendererAction(record, "wake");
  }
}

function getNextSkin() {
  const index = getStoredPets().length % SKINS.length;
  return SKINS[index];
}

function getNextPetId() {
  const usedIds = new Set([...getStoredPets().map((pet) => pet.id), ...petWindows.keys()]);
  let index = 1;

  while (usedIds.has(`pet-${index}`)) {
    index += 1;
  }

  return `pet-${index}`;
}

function getHouseBounds() {
  if (houseSpriteWindow && !houseSpriteWindow.isDestroyed()) {
    return houseSpriteWindow.getBounds();
  }

  const position = getHousePosition();
  return {
    x: position.x,
    y: position.y,
    width: houseConfig.window.width,
    height: houseConfig.window.height
  };
}

function getPositionNearHouse(offsetIndex = 0) {
  const houseBounds = getHouseBounds();
  const position = {
    x: houseBounds.x + houseBounds.width + 20 + offsetIndex * 34,
    y: houseBounds.y + houseBounds.height - petConfig.window.height + offsetIndex * 8
  };

  return clampToWorkAreaForSize(position, petConfig.window, getDisplayWorkAreaNear(position));
}

function createPetDescriptor(pet, index = 0) {
  return {
    id: pet?.id || getNextPetId(),
    name: sanitizePetName(pet?.name) || getNextPetName(),
    skin: SKINS.includes(pet?.skin) ? pet.skin : getNextSkin(),
    position: getInitialPosition(
      pet?.position,
      petConfig.window,
      getPositionNearHouse(index)
    )
  };
}

function createPetWindow(pet, index = petWindows.size) {
  const descriptor = createPetDescriptor(pet, index);

  if (petWindows.has(descriptor.id)) {
    const record = petWindows.get(descriptor.id);
    showPetWindow(record);
    return record;
  }

  const petWindow = new BrowserWindow({
    width: petConfig.window.width,
    height: petConfig.window.height,
    x: descriptor.position.x,
    y: descriptor.position.y,
    transparent: true,
    frame: false,
    resizable: false,
    movable: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const record = {
    id: descriptor.id,
    name: descriptor.name,
    skin: descriptor.skin,
    position: descriptor.position,
    inHouse: false,
    enteringHouse: false,
    window: petWindow
  };

  petWindows.set(record.id, record);
  upsertStoredPet({
    id: record.id,
    name: record.name,
    skin: record.skin,
    position: record.position,
    hidden: false,
    inHouse: false
  });

  if (!primaryPetId || !petWindows.has(primaryPetId)) {
    primaryPetId = record.id;
  }

  petWindow.on("close", () => {
    if (!record.enteringHouse) {
      flushSettings();
    }
  });
  petWindow.on("closed", () => {
    petWindows.delete(record.id);
    petStates.delete(record.id);
    lastGooseRunningMessageAt.delete(record.id);
    clearForcedInteractive(getPetInteractionKey(record.id));
    refreshPrimaryPetId(record.id);
    updateTrayMenu();
    broadcastHouseState();

    if (!isQuitting && !record.enteringHouse) {
      scheduleSettingsSave();
    }
  });
  petWindow.webContents.on("render-process-gone", (_event, details) => {
    logMainError(`Renderer process gone: ${JSON.stringify(details)}`);
  });
  petWindow.webContents.on("did-fail-load", (_event, code, description) => {
    logMainError(`Window failed to load: ${code} ${description}`);
  });
  petWindow.webContents.on("did-finish-load", () => {
    applyWindowClickThrough(petWindow, false);
  });

  try {
    petWindow.setAlwaysOnTop(true, "screen-saver");
    petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch (error) {
    logMainError(error);
    petWindow.setAlwaysOnTop(true);
  }

  if (process.env.VITE_DEV_SERVER_URL) {
    const url = new URL(process.env.VITE_DEV_SERVER_URL);
    url.searchParams.set("view", "pet");
    url.searchParams.set("petId", record.id);
    url.searchParams.set("skin", record.skin);
    petWindow.loadURL(url.toString()).catch(logMainError);
  } else {
    petWindow.loadFile(path.join(__dirname, "../dist/index.html"), {
      query: {
        view: "pet",
        petId: record.id,
        skin: record.skin
      }
    }).catch(logMainError);
  }

  scheduleSettingsSave();
  updateTrayMenu();
  broadcastHouseState();

  return record;
}

function adoptNewCat() {
  const record = createPetWindow({
    id: getNextPetId(),
    name: getNextPetName(),
    skin: getNextSkin(),
    position: getPositionNearHouse(petWindows.size)
  });

  showPetWindow(record);
  showHouseMessage("새 친구가 왔어요!");
  return record;
}

function callPetFromHouse(petId, offsetIndex = 0) {
  const storedPet = findStoredPet(petId);

  if (!storedPet) {
    return false;
  }

  const record = createPetWindow({
    ...storedPet,
    position: getPositionNearHouse(offsetIndex),
    inHouse: false
  }, offsetIndex);

  showPetWindow(record);
  updateStoredPet(petId, () => ({
    position: record.position,
    inHouse: false,
    hidden: false
  }));
  saveSettingsNow();
  broadcastHouseState();
  return true;
}

function callAllCatsFromHouse() {
  const inHousePets = getStoredPets().filter((pet) => pet.inHouse);

  inHousePets.forEach((pet, index) => callPetFromHouse(pet.id, index));
  showHouseMessage(inHousePets.length > 0 ? "얘들아 나와!" : "이미 모두 밖에 있어요.");
  return inHousePets.length;
}

function sendPetToHouse(petId, options = {}) {
  const record = petWindows.get(petId);
  const storedPet = findStoredPet(petId);

  if (!record && !storedPet) {
    return false;
  }

  const nextPet = {
    ...(storedPet || {}),
    id: petId,
    name: record?.name || storedPet?.name || getNextPetName(),
    skin: record?.skin || storedPet?.skin || getDefaultSkin(),
    position: record?.position || storedPet?.position || getPositionNearHouse(0),
    hidden: false,
    inHouse: true
  };

  if (record?.window && !record.window.isDestroyed()) {
    const [x, y] = record.window.getPosition();
    nextPet.position = { x, y };
  }

  upsertStoredPet(nextPet);

  if (record) {
    record.enteringHouse = true;
    petWindows.delete(petId);
    petStates.delete(petId);
    lastGooseRunningMessageAt.delete(petId);
    clearForcedInteractive(getPetInteractionKey(petId));
    refreshPrimaryPetId(petId);

    if (record.window && !record.window.isDestroyed()) {
      record.window.close();
    }
  }

  saveSettingsNow();
  updateTrayMenu();
  broadcastHouseState();

  if (!options.silent) {
    showHouseMessage("푹 쉬고 올게요!");
  }

  return true;
}

function sendAllPetsToHouse() {
  const outsideIds = [...petWindows.keys()];

  outsideIds.forEach((petId) => sendPetToHouse(petId, { silent: true }));
  showHouseMessage(outsideIds.length > 0 ? "다들 집으로 돌아와!" : "모두 집에서 쉬고 있어요.");
  return outsideIds.length;
}

function callAllPetsHome() {
  if (!houseSpriteWindow || houseSpriteWindow.isDestroyed()) {
    showHouseMessage("집을 찾을 수 없어요.");
    return 0;
  }

  const houseBounds = houseSpriteWindow.getBounds();
  const housePosition = {
    x: houseBounds.x + houseBounds.width / 2,
    y: houseBounds.y + houseBounds.height / 2
  };
  const outsideRecords = [...petWindows.values()].filter((record) => record?.window && !record.window.isDestroyed());

  outsideRecords.forEach((record, index) => {
    record.enteringHouse = true;
    sendRendererAction(record, "go-home", {
      housePosition,
      removeOnArrive: true,
      message: pickRandom(["집에 갈게!", "쉬러 간다냥"]),
      offsetIndex: index
    });
  });

  showHouseMessage(outsideRecords.length > 0 ? "얘들아 집으로 들어와~" : "모두 집에서 쉬고 있어요.");
  return outsideRecords.length;
}

function completePetArrivedHome(petId, position = null) {
  const record = petWindows.get(petId);
  const storedPet = findStoredPet(petId);

  if (!record && !storedPet) {
    return false;
  }

  upsertStoredPet({
    ...(storedPet || {}),
    id: petId,
    name: record?.name || storedPet?.name || getNextPetName(),
    skin: record?.skin || storedPet?.skin || getDefaultSkin(),
    position: isValidPosition(position)
      ? position
      : record?.position || storedPet?.position || getPositionNearHouse(0),
    hidden: false,
    inHouse: true
  });

  if (record) {
    record.enteringHouse = true;
    petWindows.delete(petId);
    petStates.delete(petId);
    lastGooseRunningMessageAt.delete(petId);
    clearForcedInteractive(getPetInteractionKey(petId));
    refreshPrimaryPetId(petId);

    if (record.window && !record.window.isDestroyed()) {
      record.window.close();
    }
  }

  saveSettingsNow();
  updateTrayMenu();
  broadcastHouseState();
  return true;
}

function buildMischiefMenu() {
  return {
    label: "전체 장난모드",
    submenu: [
      {
        label: mischiefMode ? "장난모드 끄기 (현재: ON)" : "장난모드 켜기 (현재: OFF)",
        click: toggleMischiefMode
      },
      { type: "separator" },
      {
        label: "커서 장난 허용",
        type: "checkbox",
        checked: cursorPrankEnabled,
        enabled: mischiefMode,
        click: toggleCursorPrank
      },
      {
        label: "똥 장난 허용",
        type: "checkbox",
        checked: poopPrankEnabled,
        enabled: mischiefMode,
        click: togglePoopPrank
      },
      {
        label: "장난 강도",
        submenu: buildGooseIntensitySubmenu(),
        enabled: mischiefMode
      }
    ]
  };
}

function buildDisplayMenu() {
  return {
    label: LABELS.displaySettings,
    submenu: [
      {
        label: footprintsEnabled ? LABELS.footprintsOff : LABELS.footprintsOn,
        click: toggleFootprints
      },
      {
        label: LABELS.clearFootprints,
        click: clearAllFootprints
      }
    ]
  };
}

function buildFeedMenu() {
  return {
    label: LABELS.feedMenu,
    submenu: [
      {
        label: LABELS.spawnTreat,
        enabled: foodEnabled,
        click: () => createFoodWindow("treat")
      },
      {
        label: LABELS.spawnFish,
        enabled: foodEnabled,
        click: () => createFoodWindow("fish")
      },
      {
        label: LABELS.spawnBowl,
        enabled: foodEnabled,
        click: () => createFoodWindow("bowl")
      },
      { type: "separator" },
      {
        label: foodEnabled ? "음식 기능 끄기" : "음식 기능 켜기",
        click: toggleFood
      },
      {
        label: LABELS.clearFood,
        click: clearAllFood
      }
    ]
  };
}

function getLaserConfig() {
  return {
    enabled: settings.laserToyEnabled ?? mischiefConfig.laserToy?.enabled ?? true,
    durationMs: settings.laserDurationMs ?? mischiefConfig.laserToy?.durationMs ?? 15000,
    manualAutoTimeoutEnabled: settings.manualLaserAutoTimeoutEnabled ?? false,
    manualDurationMs: settings.manualLaserDurationMs ?? mischiefConfig.laserToy?.manualDurationMs ?? 60000,
    moveIntervalMinMs: mischiefConfig.laserToy?.moveIntervalMinMs ?? 500,
    moveIntervalMaxMs: mischiefConfig.laserToy?.moveIntervalMaxMs ?? 1200,
    moveDistanceMinPx: mischiefConfig.laserToy?.moveDistanceMinPx ?? 120,
    moveDistanceMaxPx: mischiefConfig.laserToy?.moveDistanceMaxPx ?? 360,
    attractRadiusPx: mischiefConfig.laserToy?.attractRadiusPx ?? 1000,
    window: mischiefConfig.laserToy?.window || { width: 40, height: 40 }
  };
}

function getLaserWorkArea(position = laserPosition || getHousePosition()) {
  return getDisplayWorkAreaNear(position);
}

function clearLaserTimers() {
  clearTimeout(laserTimer);
  clearTimeout(laserMoveTimer);
  clearTimeout(manualLaserTimer);
  laserTimer = null;
  laserMoveTimer = null;
  manualLaserTimer = null;
}

function createLaserWindow(position = null) {
  const config = getLaserConfig();

  if (laserWindow && !laserWindow.isDestroyed()) {
    if (isValidPosition(position)) {
      laserPosition = clampToWorkAreaForSize(
        {
          x: position.x - config.window.width / 2,
          y: position.y - config.window.height / 2
        },
        config.window,
        getDisplayWorkAreaNear(position)
      );
      laserWindow.setPosition(laserPosition.x, laserPosition.y, false);
    }
    return laserWindow;
  }

  const houseBounds = getHouseBounds();
  const rawPosition = isValidPosition(position)
    ? {
      x: position.x - config.window.width / 2,
      y: position.y - config.window.height / 2
    }
    : {
      x: houseBounds.x + houseBounds.width + 90,
      y: houseBounds.y + Math.round(houseBounds.height / 2)
    };
  laserPosition = clampToWorkAreaForSize(rawPosition, config.window, getDisplayWorkAreaNear(rawPosition));
  laserWindow = new BrowserWindow({
    width: config.window.width,
    height: config.window.height,
    x: laserPosition.x,
    y: laserPosition.y,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  laserWindow.on("closed", () => {
    laserWindow = null;
  });
  laserWindow.webContents.on("did-finish-load", () => {
    laserWindow?.setIgnoreMouseEvents(true, { forward: true });
  });

  try {
    laserWindow.setAlwaysOnTop(true, "screen-saver");
    laserWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    laserWindow.setIgnoreMouseEvents(true, { forward: true });
  } catch (error) {
    logMainError(error);
    laserWindow.setAlwaysOnTop(true);
  }

  if (process.env.VITE_DEV_SERVER_URL) {
    const url = new URL(process.env.VITE_DEV_SERVER_URL);
    url.searchParams.set("view", "laser");
    laserWindow.loadURL(url.toString()).catch(logMainError);
  } else {
    laserWindow.loadFile(path.join(__dirname, "../dist/index.html"), {
      query: { view: "laser" }
    }).catch(logMainError);
  }

  return laserWindow;
}

function notifyPetsLaserMoved(source = laserMode || "random") {
  const config = getLaserConfig();
  if (!laserPosition) {
    return;
  }

  const position = {
    x: laserPosition.x + config.window.width / 2,
    y: laserPosition.y + config.window.height / 2
  };

  for (const record of petWindows.values()) {
    const center = getWindowCenter(record);

    if (!center || Math.hypot(center.x - position.x, center.y - position.y) > config.attractRadiusPx) {
      continue;
    }

    sendRendererAction(record, "laser-moved", { position, source });
  }
}

function scheduleNextLaserMove() {
  const config = getLaserConfig();
  clearTimeout(laserMoveTimer);
  laserMoveTimer = setTimeout(() => {
    moveLaserToRandomPosition();
    if (laserWindow && !laserWindow.isDestroyed()) {
      scheduleNextLaserMove();
    }
  }, Math.round(randomBetween(config.moveIntervalMinMs, config.moveIntervalMaxMs)));
}

function moveLaserToRandomPosition() {
  const config = getLaserConfig();

  if (!laserWindow || laserWindow.isDestroyed()) {
    return;
  }

  const basePosition = laserPosition || laserWindow.getBounds();
  const angle = Math.random() * Math.PI * 2;
  const distance = randomBetween(config.moveDistanceMinPx, config.moveDistanceMaxPx);
  const rawPosition = {
    x: basePosition.x + Math.cos(angle) * distance,
    y: basePosition.y + Math.sin(angle) * distance
  };
  laserPosition = clampToWorkAreaForSize(rawPosition, config.window, getLaserWorkArea(rawPosition));
  laserWindow.setPosition(laserPosition.x, laserPosition.y, false);
  notifyPetsLaserMoved("random");
}

function stopLaserToy(options = {}) {
  clearLaserTimers();

  if (laserControlWindow && !laserControlWindow.isDestroyed()) {
    laserControlWindow.close();
  }
  laserControlWindow = null;

  if (laserWindow && !laserWindow.isDestroyed()) {
    laserWindow.close();
  }
  laserWindow = null;
  laserPosition = null;
  laserMode = null;

  for (const record of petWindows.values()) {
    sendRendererAction(record, "laser-stopped");
  }

  if (!options.silent) {
    showHouseMessage("레이저 놀이 끝!");
  }

  updateTrayMenu();
  broadcastHouseState();
}

function startLaserToy() {
  const config = getLaserConfig();

  if (!config.enabled) {
    showHouseMessage("레이저 포인터가 꺼져 있어요.");
    return false;
  }

  stopLaserToy({ silent: true });
  laserMode = "random";
  createLaserWindow();
  notifyPetsLaserMoved("random");
  scheduleNextLaserMove();
  laserTimer = setTimeout(() => stopLaserToy(), config.durationMs);
  showHouseMessage("레이저 포인터 켰어요!");
  updateTrayMenu();
  broadcastHouseState();
  return true;
}

function legacyToggleLaserToy() {
  if (laserWindow && !laserWindow.isDestroyed()) {
    stopLaserToy();
    return;
  }

  startLaserToy();
}

function buildLegacyToyMenu() {
  const active = Boolean(laserWindow && !laserWindow.isDestroyed());

  return {
    label: "놀아주기",
    submenu: [
      {
        label: active ? "레이저 포인터 끄기" : "레이저 포인터 켜기",
        click: toggleLaserToy
      }
    ]
  };
}

function createLaserControlWindow() {
  if (laserControlWindow && !laserControlWindow.isDestroyed()) {
    laserControlWindow.show();
    if (!contextMenuOpen) {
      laserControlWindow.focus();
    }
    return laserControlWindow;
  }

  const bounds = screen.getPrimaryDisplay().bounds;
  laserControlWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  laserControlWindow.on("closed", () => {
    laserControlWindow = null;
  });
  laserControlWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "Escape") {
      event.preventDefault();
      stopLaserToy();
    }
  });

  try {
    laserControlWindow.setAlwaysOnTop(true);
    laserControlWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch (error) {
    logMainError(error);
    laserControlWindow.setAlwaysOnTop(true);
  }

  if (process.env.VITE_DEV_SERVER_URL) {
    const url = new URL(process.env.VITE_DEV_SERVER_URL);
    url.searchParams.set("view", "laser-control");
    laserControlWindow.loadURL(url.toString()).catch(logMainError);
  } else {
    laserControlWindow.loadFile(path.join(__dirname, "../dist/index.html"), {
      query: { view: "laser-control" }
    }).catch(logMainError);
  }

  return laserControlWindow;
}

function keepLaserTargetsVisible() {
  if (contextMenuOpen) {
    return;
  }

  const windows = [
    houseSpriteWindow,
    ...[...petWindows.values()].map((record) => record.window),
    laserWindow
  ];

  for (const targetWindow of windows) {
    if (!targetWindow || targetWindow.isDestroyed()) {
      continue;
    }

    try {
      targetWindow.setAlwaysOnTop(true, "screen-saver");
      targetWindow.moveTop();
    } catch (error) {
      logMainError(error);
    }
  }
}

function placeManualLaser(position) {
  if (laserMode !== "manual" || !isValidPosition(position)) {
    return false;
  }

  createLaserWindow(position);
  keepLaserTargetsVisible();
  notifyPetsLaserMoved("manual");
  return true;
}

function startManualLaserControl() {
  const config = getLaserConfig();

  if (!config.enabled) {
    showHouseMessage("레이저 포인터가 꺼져 있어요.");
    return false;
  }

  stopLaserToy({ silent: true });
  laserMode = "manual";
  createLaserControlWindow();
  setTimeout(keepLaserTargetsVisible, 50);

  if (config.manualAutoTimeoutEnabled) {
    manualLaserTimer = setTimeout(() => stopLaserToy(), config.manualDurationMs);
  }

  showHouseMessage("직접 레이저 포인터!");
  updateTrayMenu();
  broadcastHouseState();
  return true;
}

function buildToyMenu() {
  return {
    label: "놀아주기",
    submenu: [
      {
        label: "랜덤 레이저 놀이",
        type: "radio",
        checked: laserMode === "random",
        click: () => runWhenContextMenuClosed(startLaserToy)
      },
      {
        label: "직접 레이저 포인터",
        type: "radio",
        checked: laserMode === "manual",
        click: () => runWhenContextMenuClosed(startManualLaserControl)
      },
      { type: "separator" },
      {
        label: "레이저 끄기",
        enabled: Boolean(laserMode || laserWindow || laserControlWindow),
        click: stopLaserToy
      }
    ]
  };
}

function buildPlayMenu() {
  return {
    label: "놀아주기",
    submenu: [
      {
        label: "랜덤 레이저 놀이",
        type: "radio",
        checked: laserMode === "random",
        click: () => runWhenContextMenuClosed(startLaserToy)
      },
      {
        label: "직접 레이저 포인터",
        type: "radio",
        checked: laserMode === "manual",
        click: () => runWhenContextMenuClosed(startManualLaserControl)
      },
      { type: "separator" },
      {
        label: "실뭉치 꺼내기",
        click: () => runWhenContextMenuClosed(() => createToyWindow("yarn"))
      },
      {
        label: "박스 꺼내기",
        click: () => runWhenContextMenuClosed(() => createToyWindow("box"))
      },
      {
        label: "캣닢 꺼내기",
        click: () => runWhenContextMenuClosed(() => createToyWindow("catnip"))
      },
      { type: "separator" },
      {
        label: "레이저 끄기",
        enabled: Boolean(laserMode || laserWindow || laserControlWindow),
        click: stopLaserToy
      },
      {
        label: "모든 장난감 치우기",
        enabled: toyWindows.size > 0,
        click: clearAllToys
      }
    ]
  };
}

function buildGooseIntensitySubmenu() {
  return Object.entries(mischiefConfig.goose.intensities).map(([level, config]) => ({
    label: config.label,
    type: "radio",
    checked: mischiefIntensity === level,
    click: () => setMischiefIntensity(level)
  }));
}

function buildSkinSubmenu(record) {
  return SKINS.map((skin, index) => ({
    label: `Cat ${index + 1}`,
    type: "radio",
    checked: record?.skin === skin,
    click: () => setPetSkin(record, skin)
  }));
}

function buildInHousePetSubmenu() {
  const inHousePets = getStoredPets().filter((pet) => pet.inHouse);

  if (inHousePets.length === 0) {
    return [
      {
        label: "집에 쉬는 고양이가 없어요",
        enabled: false
      }
    ];
  }

  return inHousePets.map((pet, index) => ({
    label: getPetDisplayName(pet),
    click: () => {
      callPetFromHouse(pet.id, index);
      showHouseMessage(`${pet.id} 나와!`);
    }
  }));
}

function showPetMenu(record) {
  const key = record?.id ? getPetInteractionKey(record.id) : "";
  setForcedInteractive(key, "menu", true);
  applyWindowClickThrough(record?.window, true);
  let menuReleased = false;
  const releaseMenuLock = () => {
    if (menuReleased) {
      return;
    }

    menuReleased = true;
    setForcedInteractive(key, "menu", false);
    contextMenuOpen = false;
    flushDeferredWindowOps();
  };
  const menuFallbackTimer = setTimeout(releaseMenuLock, 30000);
  const menu = Menu.buildFromTemplate([
    {
      label: `🐱 ${getPetDisplayName(record)}`,
      enabled: false
    },
    { type: "separator" },
    {
      label: LABELS.gooseOnce,
      click: () => runGooseCarryPrankForPet(record?.id, { manual: true }).catch(logMainError)
    },
    {
      label: LABELS.normalMischiefOnce,
      click: () => runNormalMischiefOnce(record)
    },
    {
      label: "사고치기: 똥 싸기",
      click: () => {
        if (quietMode) {
          showHouseMessage("조용모드에서는 사고칠 수 없어요.");
          return;
        }
        createPoopNearPet(record?.id, null, true);
      }
    },
    { type: "separator" },
    {
      label: LABELS.petPet,
      click: () => sendRendererAction(record, "pet")
    },
    {
      label: LABELS.sleep,
      click: () => sendRendererAction(record, "sleep")
    },
    {
      label: LABELS.wake,
      click: () => sendRendererAction(record, "wake")
    },
    {
      label: LABELS.returnHome,
      click: () => sendPetToHouse(record?.id)
    },
    {
      label: "이름 바꾸기",
      click: () => runWhenContextMenuClosed(() => createNameEditWindow(record?.id))
    },
    {
      label: LABELS.skinMenu,
      submenu: buildSkinSubmenu(record)
    },
    { type: "separator" },
    buildMischiefMenu(),
    {
      label: quietMode ? LABELS.quietOff : LABELS.quietOn,
      click: toggleQuietMode
    }
  ]);

  contextMenuOpen = true;
  menu.popup({
    window: record?.window,
    callback: () => {
      clearTimeout(menuFallbackTimer);
      releaseMenuLock();
      contextMenuOpen = false;
      flushDeferredWindowOps();
    }
  });
}

function showHouseMenu() {
  setForcedInteractive("house", "menu", true);
  applyWindowClickThrough(houseSpriteWindow, true);
  let menuReleased = false;
  const releaseMenuLock = () => {
    if (menuReleased) {
      return;
    }

    menuReleased = true;
    setForcedInteractive("house", "menu", false);
    contextMenuOpen = false;
    flushDeferredWindowOps();
  };
  const menuFallbackTimer = setTimeout(releaseMenuLock, 30000);
  const menu = Menu.buildFromTemplate([
    {
      label: LABELS.adoptCat,
      click: adoptNewCat
    },
    {
      label: LABELS.callCat,
      submenu: buildInHousePetSubmenu()
    },
    {
      label: LABELS.callAllCats,
      click: callAllCatsFromHouse
    },
    buildFeedMenu(),
    buildPlayMenu(),
    buildDisplayMenu(),
    {
      label: "사고치기: 똥 싸기",
      click: () => {
        if (quietMode) {
          showHouseMessage("조용모드에서는 사고칠 수 없어요.");
          return;
        }
        const record = getPrimaryRecord();
        if (record) {
          createPoopNearPet(record.id, null, true);
        } else {
          showHouseMessage("똥을 쌀 고양이가 없어요!");
        }
      }
    },
    { type: "separator" },
    buildMischiefMenu(),
    {
      label: quietMode ? LABELS.quietOff : LABELS.quietOn,
      click: toggleQuietMode
    },
    {
      label: LABELS.sleepAll,
      click: sleepAllPets
    },
    {
      label: LABELS.wakeAll,
      click: wakeAllPets
    },
    {
      label: LABELS.sendAllHome,
      click: callAllPetsHome
    },
    {
      label: LABELS.clearPoops,
      click: clearAllPoops
    },
    {
      label: LABELS.emergencyStop,
      click: emergencyStopAllPranks
    },
    { type: "separator" },
    {
      label: LABELS.detailSettings,
      click: createHouseWindow
    },
    {
      label: LABELS.quit,
      click: () => app.quit()
    }
  ]);

  contextMenuOpen = true;
  menu.popup({
    window: houseSpriteWindow || undefined,
    callback: () => {
      clearTimeout(menuFallbackTimer);
      releaseMenuLock();
      contextMenuOpen = false;
      flushDeferredWindowOps();
    }
  });
}

function updateTrayMenu() {
  if (!tray) {
    return;
  }

  const menu = Menu.buildFromTemplate([
    {
      label: LABELS.showHouse,
      click: createHouseSpriteWindow
    },
    {
      label: LABELS.adoptCat,
      click: adoptNewCat
    },
    {
      label: LABELS.callAllCats,
      click: callAllCatsFromHouse
    },
    {
      label: LABELS.sendAllHome,
      click: callAllPetsHome
    },
    {
      label: LABELS.clearFootprints,
      click: clearAllFootprints
    },
    {
      label: LABELS.clearFood,
      click: clearAllFood
    },
    buildPlayMenu(),
    buildMischiefMenu(),
    {
      label: quietMode ? LABELS.quietOff : LABELS.quietOn,
      click: toggleQuietMode
    },
    {
      label: LABELS.emergencyStop,
      click: emergencyStopAllPranks
    },
    { type: "separator" },
    {
      label: LABELS.quit,
      click: () => app.quit()
    }
  ]);

  tray.setContextMenu(menu);
}

function createTray() {
  const iconPath = path.join(__dirname, "../assets/pets/cat/pet-cats-pack/icon.png");
  const icon = nativeImage.createFromPath(iconPath);
  const trayIcon = icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16, height: 16 });

  tray = new Tray(trayIcon);
  tray.setToolTip("Desktop Cat");
  tray.on("click", createHouseSpriteWindow);
  tray.on("double-click", createHouseSpriteWindow);
  updateTrayMenu();
}

function createHouseSpriteWindow() {
  if (houseSpriteWindow && !houseSpriteWindow.isDestroyed()) {
    houseSpriteWindow.show();
    houseSpriteWindow.focus();
    return houseSpriteWindow;
  }

  const position = getInitialPosition(
    settings.house?.position,
    houseConfig.window,
    getDefaultHousePosition()
  );

  houseSpriteWindow = new BrowserWindow({
    width: houseConfig.window.width,
    height: houseConfig.window.height,
    x: position.x,
    y: position.y,
    transparent: true,
    frame: false,
    resizable: false,
    movable: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settings.house = {
    ...(settings.house || {}),
    position,
    skin: settings.house?.skin || houseConfig.defaultSkin
  };

  houseSpriteWindow.on("closed", () => {
    houseSpriteWindow = null;
    clearForcedInteractive("house");
  });
  houseSpriteWindow.webContents.on("did-finish-load", broadcastHouseState);
  houseSpriteWindow.webContents.on("did-finish-load", () => {
    applyWindowClickThrough(houseSpriteWindow, false);
  });
  houseSpriteWindow.webContents.on("render-process-gone", (_event, details) => {
    logMainError(`House sprite renderer process gone: ${JSON.stringify(details)}`);
  });
  houseSpriteWindow.webContents.on("did-fail-load", (_event, code, description) => {
    logMainError(`House sprite window failed to load: ${code} ${description}`);
  });

  try {
    houseSpriteWindow.setAlwaysOnTop(true, "screen-saver");
    houseSpriteWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch (error) {
    logMainError(error);
    houseSpriteWindow.setAlwaysOnTop(true);
  }

  if (process.env.VITE_DEV_SERVER_URL) {
    const url = new URL(process.env.VITE_DEV_SERVER_URL);
    url.searchParams.set("view", "house-sprite");
    houseSpriteWindow.loadURL(url.toString()).catch(logMainError);
  } else {
    houseSpriteWindow.loadFile(path.join(__dirname, "../dist/index.html"), {
      query: { view: "house-sprite" }
    }).catch(logMainError);
  }

  scheduleSettingsSave();
  return houseSpriteWindow;
}

function createHouseWindow() {
  if (houseWindow && !houseWindow.isDestroyed()) {
    if (houseWindow.isMinimized()) {
      houseWindow.restore();
    }

    houseWindow.focus();
    return houseWindow;
  }

  houseWindow = new BrowserWindow({
    width: 420,
    height: 560,
    minWidth: 390,
    minHeight: 500,
    title: "애완동물 집 상세 설정",
    backgroundColor: "#f4dfbd",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  houseWindow.on("closed", () => {
    houseWindow = null;
  });
  houseWindow.webContents.on("did-finish-load", broadcastHouseState);
  houseWindow.webContents.on("render-process-gone", (_event, details) => {
    logMainError(`House renderer process gone: ${JSON.stringify(details)}`);
  });
  houseWindow.webContents.on("did-fail-load", (_event, code, description) => {
    logMainError(`House window failed to load: ${code} ${description}`);
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    const url = new URL(process.env.VITE_DEV_SERVER_URL);
    url.searchParams.set("view", "house");
    houseWindow.loadURL(url.toString()).catch(logMainError);
  } else {
    houseWindow.loadFile(path.join(__dirname, "../dist/index.html"), {
      query: { view: "house" }
    }).catch(logMainError);
  }

  return houseWindow;
}

function startMousePolling() {
  clearInterval(mousePollingTimer);
  mousePollingTimer = setInterval(() => {
    const cursor = screen.getCursorScreenPoint();

    updateHitboxClickThrough(houseSpriteWindow, "house", houseConfig.hitbox, cursor);

    for (const record of petWindows.values()) {
      if (!record.window || record.window.isDestroyed()) {
        continue;
      }

      updateHitboxClickThrough(
        record.window,
        getPetInteractionKey(record.id),
        petConfig.hitbox,
        cursor
      );
    }
  }, 50);
}

function rectanglesOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function getDroppedPetBounds(record, payload = {}) {
  if (isValidPosition(payload.position)) {
    const size = payload.size || petConfig.window;
    return {
      x: Math.round(payload.position.x),
      y: Math.round(payload.position.y),
      width: size.width || petConfig.window.width,
      height: size.height || petConfig.window.height
    };
  }

  return record.window.getBounds();
}

function handlePetDrop(record, payload = {}) {
  if (!record || !houseSpriteWindow || houseSpriteWindow.isDestroyed()) {
    return { enteredHouse: false, reason: "house-missing", state: getHouseState() };
  }

  const petBounds = getDroppedPetBounds(record, payload);
  const houseBounds = houseSpriteWindow.getBounds();

  if (!rectanglesOverlap(petBounds, houseBounds)) {
    return { enteredHouse: false, reason: "outside-house", state: getHouseState() };
  }

  const enteredHouse = sendPetToHouse(record.id);
  return {
    enteredHouse,
    reason: enteredHouse ? "entered-house" : "blocked",
    state: getHouseState()
  };
}

function getInitialOutsidePetsFromSettings() {
  return getStoredPets().filter((pet) => !pet.inHouse);
}

process.on("uncaughtException", (error) => {
  logMainError(error);
  app.quit();
});

app.whenReady().then(() => {
  settings = readSettings();
  quietMode = settings.quietMode ?? petConfig.modes?.quietMode?.defaultEnabled ?? false;
  mischiefMode = settings.mischiefMode ?? settings.mischief?.enabled ?? petConfig.mischief?.enabled ?? false;
  cursorPrankEnabled = settings.cursorPrankEnabled ?? settings.gooseMode ?? mischiefConfig.goose?.enabled ?? true;
  poopPrankEnabled = settings.poopPrankEnabled ?? mischiefConfig.poop?.enabled ?? true;
  footprintsEnabled = settings.footprintsEnabled ?? petConfig.footprints?.enabled ?? true;
  foodEnabled = settings.foodEnabled ?? mischiefConfig.food?.enabled ?? true;
  settings.laserToyEnabled = settings.laserToyEnabled ?? mischiefConfig.laserToy?.enabled ?? true;
  settings.laserDurationMs = settings.laserDurationMs ?? mischiefConfig.laserToy?.durationMs ?? 15000;
  settings.manualLaserAutoTimeoutEnabled = settings.manualLaserAutoTimeoutEnabled ?? false;
  settings.manualLaserDurationMs = settings.manualLaserDurationMs ?? mischiefConfig.laserToy?.manualDurationMs ?? 60000;
  settings.foodSpawnMode = settings.foodSpawnMode || "random-near-house";
  settings.toyMaxCount = settings.toyMaxCount ?? mischiefConfig.toys?.maxCount ?? 5;
  mischiefIntensity = settings.mischiefIntensity ?? settings.gooseIntensity ?? mischiefConfig.goose?.defaultIntensity ?? "normal";
  clickThroughEnabled = settings.clickThroughEnabled ?? true;

  try {
    createCursorController();
    createHouseSpriteWindow();
    getInitialOutsidePetsFromSettings().forEach((pet, index) => createPetWindow(pet, index));
    createTray();
    globalShortcut.register("CommandOrControl+Alt+C", emergencyStopAllPranks);
    globalShortcut.register("Esc", () => {
      if (laserMode === "manual") {
        stopLaserToy();
        return;
      }

      emergencyStopAllPranks();
    });
    startGooseAutoLoop();
    startMousePolling();
  } catch (error) {
    logMainError(error);
    app.quit();
  }

  app.on("activate", () => {
    createHouseSpriteWindow();
  });
});

app.on("before-quit", () => {
  isQuitting = true;
  clearInterval(gooseAutoTimer);
  clearInterval(mousePollingTimer);
  stopLaserToy({ silent: true });
  cursorPrankController?.stopAll();
  clearAllPoops();
  closeObjectWindows(footprintWindows);
  closeObjectWindows(foodWindows);
  clearAllToys();
  globalShortcut.unregisterAll();
  flushSettings();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("pet-window:get-environment", (event) => {
  const record = getRecordByWebContents(event.sender);
  const targetWindow = record?.window || BrowserWindow.fromWebContents(event.sender);
  const [x, y] = targetWindow.getPosition();
  const workArea = getDisplayWorkAreaNear({ x, y });

  return {
    petId: record?.id || "pet-1",
    workArea,
    position: { x, y },
    windowSize: {
      width: petConfig.window.width,
      height: petConfig.window.height
    },
    quietMode,
    mischiefMode,
    gooseIntensity: mischiefIntensity,
    selectedSkin: record?.skin || getDefaultSkin()
  };
});

ipcMain.handle("pet-window:get-position", (event) => {
  const record = getRecordByWebContents(event.sender);
  const targetWindow = record?.window || BrowserWindow.fromWebContents(event.sender);
  const [x, y] = targetWindow.getPosition();
  return { x, y };
});

ipcMain.handle("pet-assets:get-credits", () => petCredits);

ipcMain.handle("pet-window:get-cursor-position", () => screen.getCursorScreenPoint());

ipcMain.handle("pet-window:notify-drop", (event, payload = {}) => {
  const record = getRecordByWebContents(event.sender);
  return handlePetDrop(record, payload);
});

ipcMain.handle("pet-window:create-poop", (event, payload = {}) => {
  const record = getRecordByWebContents(event.sender);

  if (!record) {
    return { created: false, reason: "missing-pet" };
  }

  return createPoopNearPet(record.id, payload.position);
});

ipcMain.handle("pet-window:create-footprint", (event, payload = {}) => {
  const record = getRecordByWebContents(event.sender);

  if (!record) {
    return { created: false, reason: "missing-pet" };
  }

  return createFootprintWindow({
    x: payload.x,
    y: payload.y,
    petId: record.id,
    direction: payload.direction || 1
  });
});

ipcMain.on("pet-window:food-eaten", (event, payload = {}) => {
  const record = getRecordByWebContents(event.sender);
  const food = foodWindows.get(payload.foodId);

  if (!record || !food || (food.targetPetId && food.targetPetId !== record.id)) {
    return;
  }

  removeFood(payload.foodId, "eaten");
  showHouseMessage("잘 먹었어요!");
});

ipcMain.on("pet-window:arrived-home", (event, payload = {}) => {
  const record = getRecordByWebContents(event.sender);
  const petId = payload.petId || record?.id;

  if (!petId) {
    return;
  }

  completePetArrivedHome(petId, payload.position || null);
});

ipcMain.handle("pet-house:get-state", () => getHouseState());

ipcMain.handle("pet-house:open", () => {
  createHouseWindow();
  return getHouseState();
});

ipcMain.handle("pet-house:add-cat", () => {
  adoptNewCat();
  return getHouseState();
});

ipcMain.handle("pet-house:remove-pet", (_event, petId) => {
  return {
    removed: sendPetToHouse(petId),
    state: getHouseState()
  };
});

ipcMain.handle("pet-house:set-pet-skin", (_event, petId, skin) => {
  return {
    changed: setPetSkinById(petId, skin),
    state: getHouseState()
  };
});

ipcMain.handle("pet-house:set-quiet-mode", (_event, enabled) => {
  setQuietMode(enabled);
  return getHouseState();
});

ipcMain.handle("pet-house:set-mischief-mode", (_event, enabled) => {
  setMischiefMode(enabled);
  return getHouseState();
});

ipcMain.handle("pet-house:sleep-all", () => {
  sleepAllPets();
  return getHouseState();
});

ipcMain.handle("pet-house:wake-all", () => {
  wakeAllPets();
  return getHouseState();
});

ipcMain.handle("pet-house:show-pet", (_event, petId) => {
  showPetById(petId);
  return getHouseState();
});

ipcMain.handle("house-sprite:get-state", () => getHouseState());

ipcMain.handle("house-sprite:open-detail-settings", () => {
  createHouseWindow();
  return getHouseState();
});

ipcMain.on("house-sprite:show-menu", () => {
  showHouseMenu();
});

ipcMain.on("house-sprite:move-to", (_event, position) => {
  moveHouseSprite(position);
});

ipcMain.on("house-sprite:set-interactive", (_event, enabled) => {
  applyWindowClickThrough(houseSpriteWindow, Boolean(enabled));
});

ipcMain.on("house-sprite:drag-start", () => {
  setForcedInteractive("house", "drag", true);
  applyWindowClickThrough(houseSpriteWindow, true);
  sendHouseSpriteAction("drag-start");
});

ipcMain.on("house-sprite:drag-end", () => {
  setForcedInteractive("house", "drag", false);
  saveSettingsNow();
  sendHouseSpriteAction("drag-end");
});

ipcMain.on("pet-window:move-to", (event, position) => {
  const record = getRecordByWebContents(event.sender);

  if (!record) {
    return;
  }

  setWindowPosition(record, position);
});

ipcMain.on("pet-window:set-interactive", (event, enabled) => {
  const record = getRecordByWebContents(event.sender);

  if (!record) {
    return;
  }

  applyWindowClickThrough(record.window, Boolean(enabled));
});

ipcMain.on("pet-window:drag-start", (event) => {
  const record = getRecordByWebContents(event.sender);

  if (!record) {
    return;
  }

  setForcedInteractive(getPetInteractionKey(record.id), "drag", true);
  applyWindowClickThrough(record.window, true);
});

ipcMain.on("pet-window:drag-end", (event) => {
  const record = getRecordByWebContents(event.sender);

  if (!record) {
    return;
  }

  setForcedInteractive(getPetInteractionKey(record.id), "drag", false);
});

ipcMain.on("pet-window:state-changed", (event, payload = {}) => {
  const record = getRecordByWebContents(event.sender);

  if (!record) {
    return;
  }

  petStates.set(record.id, payload.state || "idle");
  setForcedInteractive(getPetInteractionKey(record.id), "dragged-state", payload.state === "dragged");
  setForcedInteractive(getPetInteractionKey(record.id), "petting-state", payload.state === "petting");
});

ipcMain.on("pet-window:show-menu", (event) => {
  const record = getRecordByWebContents(event.sender);
  showPetMenu(record);
});

ipcMain.on("poop:clean", (_event, poopId) => {
  removePoop(poopId);
});

ipcMain.on("footprint:clean", (_event, footprintId) => {
  removeFootprint(footprintId);
});

ipcMain.on("footprint:expire", (_event, footprintId) => {
  removeFootprint(footprintId);
});

ipcMain.on("food:clean", (_event, foodId) => {
  removeFood(foodId, "cleaned");
});

ipcMain.on("food:expire", (_event, foodId) => {
  removeFood(foodId, "expired");
});

ipcMain.on("laser:stop", () => {
  stopLaserToy();
});

ipcMain.on("laser-control:place", (_event, position = {}) => {
  placeManualLaser(position);
});

ipcMain.on("laser-control:stop", () => {
  stopLaserToy();
});

ipcMain.on("pet-name:save", (event, payload = {}) => {
  const saved = renamePet(payload.petId, payload.name);
  const sourceWindow = BrowserWindow.fromWebContents(event.sender);

  if (saved && sourceWindow && !sourceWindow.isDestroyed()) {
    sourceWindow.close();
  }
});

ipcMain.on("pet-name:cancel", (event) => {
  const sourceWindow = BrowserWindow.fromWebContents(event.sender);

  if (sourceWindow && !sourceWindow.isDestroyed()) {
    sourceWindow.close();
  }
});

ipcMain.on("pet-window:toy-hit", (event, payload = {}) => {
  const record = getRecordByWebContents(event.sender);

  if (!record) {
    return;
  }

  handleToyHit(record.id, payload.toyId, payload);
});

ipcMain.on("toy:knock", (event, payload = {}) => {
  const toyId = typeof payload === "string" ? payload : payload.toyId;
  const record = toyWindows.get(toyId);
  const sourceWindow = BrowserWindow.fromWebContents(event.sender);

  if (!record || sourceWindow !== record.window) {
    return;
  }

  handleToyKnock(toyId);
});
