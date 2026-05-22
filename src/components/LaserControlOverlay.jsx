export default function LaserControlOverlay({ onPlaceLaser, onStop }) {
  function handlePointerDown(event) {
    event.preventDefault();

    if (event.button === 2) {
      onStop();
      return;
    }

    if (event.button !== 0) {
      return;
    }

    onPlaceLaser({
      x: event.screenX,
      y: event.screenY
    });
  }

  function handleContextMenu(event) {
    event.preventDefault();
    onStop();
  }

  return (
    <main
      className="laser-control-overlay"
      onPointerDown={handlePointerDown}
      onContextMenu={handleContextMenu}
    >
      <div className="laser-control-hint">
        클릭해서 레이저 위치 지정 · 우클릭/ESC로 종료
      </div>
    </main>
  );
}
