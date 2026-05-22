import houseSpriteUrl from "../../assets/house/house.svg";

export default function HouseSprite({
  dragging,
  petCount,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel
}) {
  return (
    <button
      type="button"
      className={`house-sprite ${dragging ? "house-sprite--dragging" : ""}`}
      aria-label={`애완동물 집, 등록된 고양이 ${petCount}마리`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <img className="house-sprite__image" src={houseSpriteUrl} alt="" draggable="false" />
      <span className="house-sprite__hint">HOME</span>
    </button>
  );
}
