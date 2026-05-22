import Poop from "./components/Poop.jsx";

export default function PoopApp() {
  const params = new URLSearchParams(window.location.search);
  const poopId = params.get("poopId") || "";

  function handleClean() {
    window.poop?.clean?.(poopId);
  }

  return (
    <main className="poop-stage">
      <Poop onClean={handleClean} />
    </main>
  );
}
