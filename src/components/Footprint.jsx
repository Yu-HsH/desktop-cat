import { useEffect } from "react";
import footprintSpriteUrl from "../../assets/effects/footprint.svg";

export default function Footprint({ direction, lifetimeMs, onClean, onExpire }) {
  useEffect(() => {
    const timer = window.setTimeout(onExpire, lifetimeMs);
    return () => window.clearTimeout(timer);
  }, [lifetimeMs, onExpire]);

  return (
    <button
      type="button"
      className="footprint"
      aria-label="발자국 지우기"
      onClick={onClean}
      style={{
        "--lifetime-ms": `${lifetimeMs}ms`,
        "--footprint-direction": direction < 0 ? "-1" : "1"
      }}
    >
      <img className="footprint__image" src={footprintSpriteUrl} alt="" draggable="false" />
    </button>
  );
}
