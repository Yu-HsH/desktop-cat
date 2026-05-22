import { useEffect, useRef, useState } from "react";
import HouseSprite from "./components/HouseSprite.jsx";
import HouseSpeechBubble from "./components/HouseSpeechBubble.jsx";
import houseConfig from "./data/houseConfig.json";

const DEFAULT_STATE = {
  house: {
    position: { x: 0, y: 0 },
    skin: "default"
  },
  pets: [],
  quietMode: false,
  mischiefMode: false,
  availableSkins: []
};

export default function HouseSpriteApp() {
  const [houseState, setHouseState] = useState(DEFAULT_STATE);
  const [message, setMessage] = useState("");
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({
    active: false,
    pointerId: null,
    startPointer: { x: 0, y: 0 },
    startPosition: { x: 0, y: 0 }
  });
  const messageTimerRef = useRef(0);
  const positionRef = useRef(DEFAULT_STATE.house.position);
  const interactiveRef = useRef(null);

  function setInteractive(enabled) {
    if (interactiveRef.current === enabled) {
      return;
    }

    interactiveRef.current = enabled;
    window.houseSprite?.setInteractive?.(enabled);
  }

  function isInHouseHitbox(event) {
    const hitbox = houseConfig.hitbox;
    return (
      event.clientX >= hitbox.x &&
      event.clientX <= hitbox.x + hitbox.width &&
      event.clientY >= hitbox.y &&
      event.clientY <= hitbox.y + hitbox.height
    );
  }

  function showMessage(nextMessage) {
    window.clearTimeout(messageTimerRef.current);
    setMessage(nextMessage);
    messageTimerRef.current = window.setTimeout(() => {
      setMessage("");
    }, houseConfig.speech.durationMs);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadState() {
      const state = await window.houseSprite?.getHouseState?.();

      if (!cancelled && state) {
        setHouseState(state);
        positionRef.current = state.house?.position || positionRef.current;
      }
    }

    const unsubscribeAction = window.houseSprite?.onHouseAction?.(({ action, payload }) => {
      if (action === "speak" && payload?.message) {
        showMessage(payload.message);
      }
    });
    const unsubscribeState = window.houseSprite?.onHouseStateChanged?.((state) => {
      setHouseState(state);
      positionRef.current = state.house?.position || positionRef.current;
    });

    loadState();
    setInteractive(false);

    return () => {
      cancelled = true;
      window.clearTimeout(messageTimerRef.current);
      unsubscribeAction?.();
      unsubscribeState?.();
    };
  }, []);

  function handlePointerDown(event) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    setInteractive(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startPointer: { x: event.screenX, y: event.screenY },
      startPosition: positionRef.current
    };
    setDragging(true);
    window.houseSprite?.notifyHouseDragStart?.();
  }

  function handlePointerMove(event) {
    const drag = dragRef.current;

    if (!drag.active || drag.pointerId !== event.pointerId) {
      return;
    }

    const nextPosition = {
      x: drag.startPosition.x + event.screenX - drag.startPointer.x,
      y: drag.startPosition.y + event.screenY - drag.startPointer.y
    };

    positionRef.current = nextPosition;
    window.houseSprite?.sendHouseMove?.(nextPosition);
  }

  function finishDrag(event) {
    const drag = dragRef.current;

    if (!drag.active || drag.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setInteractive(isInHouseHitbox(event));
    dragRef.current = {
      ...drag,
      active: false
    };
    setDragging(false);
    window.houseSprite?.notifyHouseDragEnd?.();
  }

  function handleContextMenu(event) {
    event.preventDefault();
    setInteractive(true);
    window.houseSprite?.requestHouseMenu?.();
  }

  function handleMouseMove(event) {
    if (dragRef.current.active) {
      setInteractive(true);
      return;
    }

    setInteractive(isInHouseHitbox(event));
  }

  function handleMouseLeave() {
    if (!dragRef.current.active) {
      setInteractive(false);
    }
  }

  return (
    <main
      className="house-sprite-stage"
      onContextMenu={handleContextMenu}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <HouseSpeechBubble text={message} />
      <HouseSprite
        dragging={dragging}
        petCount={houseState.pets.length}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      />
    </main>
  );
}
