import Footprint from "./components/Footprint.jsx";

export default function FootprintApp() {
  const params = new URLSearchParams(window.location.search);
  const footprintId = params.get("footprintId") || "";
  const lifetimeMs = Number(params.get("lifetimeMs") || 3000);
  const direction = Number(params.get("direction") || 1);

  function clean() {
    window.footprint?.clean?.(footprintId);
  }

  function expire() {
    window.footprint?.expire?.(footprintId);
  }

  return (
    <main className="footprint-stage">
      <Footprint
        direction={direction}
        lifetimeMs={lifetimeMs}
        onClean={clean}
        onExpire={expire}
      />
    </main>
  );
}
