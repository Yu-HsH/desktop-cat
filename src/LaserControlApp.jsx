import { useEffect } from "react";
import LaserControlOverlay from "./components/LaserControlOverlay.jsx";

export default function LaserControlApp() {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        window.laserControl?.stop?.();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <LaserControlOverlay
      onPlaceLaser={(position) => window.laserControl?.placeLaser?.(position)}
      onStop={() => window.laserControl?.stop?.()}
    />
  );
}
