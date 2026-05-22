export default function HeartEffect({ hearts }) {
  return (
    <div className="heart-layer" aria-hidden="true">
      {hearts.map((heart) => (
        <span
          className="heart"
          key={heart.id}
          style={{
            left: `${heart.x}px`,
            top: `${heart.y}px`,
            animationDelay: `${heart.delayMs}ms`
          }}
        >
          ♥
        </span>
      ))}
    </div>
  );
}
