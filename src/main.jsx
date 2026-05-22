import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import HouseApp from "./HouseApp.jsx";
import HouseSpriteApp from "./HouseSpriteApp.jsx";
import PoopApp from "./PoopApp.jsx";
import FootprintApp from "./FootprintApp.jsx";
import FoodApp from "./FoodApp.jsx";
import LaserApp from "./LaserApp.jsx";
import LaserControlApp from "./LaserControlApp.jsx";
import ToyApp from "./ToyApp.jsx";
import NameEditApp from "./NameEditApp.jsx";
import "./styles.css";

const params = new URLSearchParams(window.location.search);
const view = params.get("view");
const RootApp =
  view === "poop"
    ? PoopApp
    : view === "footprint"
      ? FootprintApp
      : view === "food"
        ? FoodApp
        : view === "laser"
          ? LaserApp
          : view === "laser-control"
            ? LaserControlApp
            : view === "toy"
              ? ToyApp
              : view === "name-edit"
                ? NameEditApp
                : view === "house-sprite"
                  ? HouseSpriteApp
                  : view === "house"
                    ? HouseApp
                    : App;

document.documentElement.dataset.view = view || "pet";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RootApp />
  </React.StrictMode>
);
