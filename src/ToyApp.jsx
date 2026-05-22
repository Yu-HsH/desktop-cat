import { useEffect, useMemo, useState } from "react";
import Toy from "./components/Toy.jsx";

const params = new URLSearchParams(window.location.search);

export default function ToyApp() {
  const type = params.get("type") || "yarn";
  const toyId = params.get("toyId") || "";
  const [toyState, setToyState] = useState({ phase: "idle", meta: {} });
  const [knockPulse, setKnockPulse] = useState(0);
  const isBox = type === "box";

  useEffect(() => {
    return window.toy?.onStateChanged?.((payload) => {
      if (!payload?.phase) {
        return;
      }

      setToyState({
        phase: payload.phase,
        meta: payload.meta || {}
      });

      if (payload.type === "box" && payload.meta?.knocked) {
        setKnockPulse(Date.now());
      }
    });
  }, []);

  useEffect(() => {
    if (!knockPulse) {
      return undefined;
    }

    const timer = window.setTimeout(() => setKnockPulse(0), 360);
    return () => window.clearTimeout(timer);
  }, [knockPulse]);

  const canKnock = isBox && toyState.phase === "occupied";
  const appClassName = useMemo(
    () => `toy-app ${canKnock ? "toy-app--clickable" : ""}`,
    [canKnock]
  );

  function handleBoxClick() {
    if (!canKnock) {
      return;
    }

    setKnockPulse(Date.now());
    window.toy?.knock?.(toyId);
  }

  return (
    <main className={appClassName} aria-hidden="true" onClick={handleBoxClick}>
      <Toy
        type={type}
        phase={toyState.phase}
        meta={toyState.meta}
        knocked={Boolean(knockPulse)}
      />
    </main>
  );
}
