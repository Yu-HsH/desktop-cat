import Food from "./components/Food.jsx";

export default function FoodApp() {
  const params = new URLSearchParams(window.location.search);
  const foodId = params.get("foodId") || "";
  const type = params.get("type") || "treat";
  const lifetimeMs = Number(params.get("lifetimeMs") || 30000);

  function clean() {
    window.food?.clean?.(foodId);
  }

  function expire() {
    window.food?.expire?.(foodId);
  }

  return (
    <main className="food-stage">
      <Food type={type} lifetimeMs={lifetimeMs} onClean={clean} onExpire={expire} />
    </main>
  );
}
