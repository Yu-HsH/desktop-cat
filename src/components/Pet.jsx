export default function Pet({
  state,
  frameSrc,
  direction,
  gooseEffect,
  hidden,
  catnipEffect,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel
}) {
  const transform = direction < 0 ? "scaleX(-1)" : "scaleX(1)";
  const frame = typeof frameSrc === "string" ? { type: "image", src: frameSrc } : frameSrc;

  return (
    <button
      className={`pet pet--${state} ${hidden ? "pet--hidden" : ""} ${catnipEffect ? "pet--catnip" : ""}`}
      type="button"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      aria-label="Pet the cat"
      style={{ transform }}
    >
      {frame?.type === "spritesheet" ? (
        <span
          className="pet__spritesheet"
          aria-hidden="true"
          style={{
            width: `${frame.displayWidth}px`,
            height: `${frame.displayHeight}px`,
            backgroundImage: `url("${frame.src}")`,
            backgroundSize: `${frame.frameCount * frame.displayWidth}px ${frame.displayHeight}px`,
            backgroundPosition: `-${frame.frameIndex * frame.displayWidth}px 0`,
            imageRendering: frame.pixelated ? "pixelated" : "auto"
          }}
        />
      ) : frame?.src ? (
        <img className="pet__sprite" src={frame.src} alt="" draggable="false" />
      ) : (
        <span className="pet__placeholder" aria-hidden="true" />
      )}
      {catnipEffect ? (
        <span className="pet__catnip-aura" aria-hidden="true">
          <span>✦</span>
          <span>♡</span>
          <span>✧</span>
        </span>
      ) : null}
      {gooseEffect ? (
        <span className="pet__goose-effect" aria-hidden="true">
          !
        </span>
      ) : null}
    </button>
  );
}
