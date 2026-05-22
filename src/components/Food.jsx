import { useEffect } from "react";
import bowlSpriteUrl from "../../assets/food/bowl.svg";
import fishSpriteUrl from "../../assets/food/fish.svg";
import treatSpriteUrl from "../../assets/food/treat.svg";

const FOOD_SPRITES = {
  bowl: bowlSpriteUrl,
  fish: fishSpriteUrl,
  treat: treatSpriteUrl
};

export default function Food({ type, lifetimeMs, onClean, onExpire }) {
  useEffect(() => {
    const timer = window.setTimeout(onExpire, lifetimeMs);
    return () => window.clearTimeout(timer);
  }, [lifetimeMs, onExpire]);

  return (
    <button
      type="button"
      className={`food food--${type}`}
      aria-label="음식 치우기"
      onClick={onClean}
    >
      <img className="food__image" src={FOOD_SPRITES[type] || FOOD_SPRITES.treat} alt="" draggable="false" />
    </button>
  );
}
