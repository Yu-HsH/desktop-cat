const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("petWindow", {
  getEnvironment: () => ipcRenderer.invoke("pet-window:get-environment"),
  getPosition: () => ipcRenderer.invoke("pet-window:get-position"),
  getCursorPosition: () => ipcRenderer.invoke("pet-window:get-cursor-position"),
  getCredits: () => ipcRenderer.invoke("pet-assets:get-credits"),
  moveTo: (position, options = {}) => ipcRenderer.send("pet-window:move-to", position, options),
  notifyDrop: (payload) => ipcRenderer.invoke("pet-window:notify-drop", payload),
  createPoop: (payload) => ipcRenderer.invoke("pet-window:create-poop", payload),
  createFootprint: (payload) => ipcRenderer.invoke("pet-window:create-footprint", payload),
  foodEaten: (payload) => ipcRenderer.send("pet-window:food-eaten", payload),
  toyHit: (payload) => ipcRenderer.send("pet-window:toy-hit", payload),
  arrivedHome: (payload) => ipcRenderer.send("pet-window:arrived-home", payload),
  setInteractive: (enabled) => ipcRenderer.send("pet-window:set-interactive", enabled),
  notifyDragStart: () => ipcRenderer.send("pet-window:drag-start"),
  notifyDragEnd: () => ipcRenderer.send("pet-window:drag-end"),
  reportState: (payload) => ipcRenderer.send("pet-window:state-changed", payload),
  showContextMenu: () => ipcRenderer.send("pet-window:show-menu"),
  onMenuAction: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("pet-menu-action", listener);

    return () => ipcRenderer.removeListener("pet-menu-action", listener);
  }
});

contextBridge.exposeInMainWorld("petHouse", {
  getHouseState: () => ipcRenderer.invoke("pet-house:get-state"),
  openHouse: () => ipcRenderer.invoke("pet-house:open"),
  addCat: () => ipcRenderer.invoke("pet-house:add-cat"),
  removePet: (petId) => ipcRenderer.invoke("pet-house:remove-pet", petId),
  setPetSkin: (petId, skin) => ipcRenderer.invoke("pet-house:set-pet-skin", petId, skin),
  setQuietMode: (enabled) => ipcRenderer.invoke("pet-house:set-quiet-mode", enabled),
  setMischiefMode: (enabled) => ipcRenderer.invoke("pet-house:set-mischief-mode", enabled),
  sleepAll: () => ipcRenderer.invoke("pet-house:sleep-all"),
  wakeAll: () => ipcRenderer.invoke("pet-house:wake-all"),
  showPet: (petId) => ipcRenderer.invoke("pet-house:show-pet", petId),
  focusPet: (petId) => ipcRenderer.invoke("pet-house:show-pet", petId),
  onHouseStateChanged: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("pet-house:state-changed", listener);

    return () => ipcRenderer.removeListener("pet-house:state-changed", listener);
  }
});

contextBridge.exposeInMainWorld("houseSprite", {
  requestHouseMenu: () => ipcRenderer.send("house-sprite:show-menu"),
  sendHouseMove: (position) => ipcRenderer.send("house-sprite:move-to", position),
  setInteractive: (enabled) => ipcRenderer.send("house-sprite:set-interactive", enabled),
  getHouseState: () => ipcRenderer.invoke("house-sprite:get-state"),
  openDetailSettings: () => ipcRenderer.invoke("house-sprite:open-detail-settings"),
  notifyHouseDragStart: () => ipcRenderer.send("house-sprite:drag-start"),
  notifyHouseDragEnd: () => ipcRenderer.send("house-sprite:drag-end"),
  onHouseAction: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("house-sprite:action", listener);

    return () => ipcRenderer.removeListener("house-sprite:action", listener);
  },
  onHouseStateChanged: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("house-sprite:state-changed", listener);

    return () => ipcRenderer.removeListener("house-sprite:state-changed", listener);
  }
});

contextBridge.exposeInMainWorld("poop", {
  clean: (poopId) => ipcRenderer.send("poop:clean", poopId)
});

contextBridge.exposeInMainWorld("footprint", {
  clean: (footprintId) => ipcRenderer.send("footprint:clean", footprintId),
  expire: (footprintId) => ipcRenderer.send("footprint:expire", footprintId)
});

contextBridge.exposeInMainWorld("food", {
  clean: (foodId) => ipcRenderer.send("food:clean", foodId),
  expire: (foodId) => ipcRenderer.send("food:expire", foodId)
});

contextBridge.exposeInMainWorld("laser", {
  stop: () => ipcRenderer.send("laser:stop")
});

contextBridge.exposeInMainWorld("laserControl", {
  placeLaser: (position) => ipcRenderer.send("laser-control:place", position),
  stop: () => ipcRenderer.send("laser-control:stop")
});

contextBridge.exposeInMainWorld("petName", {
  save: (payload) => ipcRenderer.send("pet-name:save", payload),
  cancel: () => ipcRenderer.send("pet-name:cancel")
});

contextBridge.exposeInMainWorld("toy", {
  knock: (toyId) => ipcRenderer.send("toy:knock", { toyId }),
  onStateChanged: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("toy-window:set-state", listener);

    return () => ipcRenderer.removeListener("toy-window:set-state", listener);
  }
});
