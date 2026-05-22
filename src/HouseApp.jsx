import { useEffect, useState } from "react";
import PetHouse from "./components/PetHouse.jsx";

const EMPTY_HOUSE_STATE = {
  pets: [],
  quietMode: false,
  mischiefMode: false,
  availableSkins: []
};

function pickState(result) {
  if (!result) {
    return null;
  }

  return result.state || result;
}

export default function HouseApp() {
  const [houseState, setHouseState] = useState(EMPTY_HOUSE_STATE);
  const [statusMessage, setStatusMessage] = useState("");

  function applyHouseResult(result) {
    const nextState = pickState(result);

    if (nextState?.pets) {
      setHouseState(nextState);
    }

    return result;
  }

  async function runHouseAction(action, message) {
    try {
      const result = await action();
      applyHouseResult(result);

      if (message) {
        setStatusMessage(message);
      }

      return result;
    } catch (error) {
      setStatusMessage("잠깐, 집사가 문을 못 열었어요.");
      return null;
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadHouseState() {
      const state = await window.petHouse?.getHouseState?.();

      if (!cancelled && state) {
        setHouseState(state);
      }
    }

    const unsubscribe = window.petHouse?.onHouseStateChanged?.((state) => {
      setHouseState(state);
    });

    loadHouseState();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const actions = {
    addCat: () => runHouseAction(
      () => window.petHouse?.addCat?.(),
      "새 고양이가 집 근처로 왔어요."
    ),
    setQuietMode: (enabled) => runHouseAction(
      () => window.petHouse?.setQuietMode?.(enabled),
      enabled ? "조용모드를 켰어요." : "조용모드를 껐어요."
    ),
    setMischiefMode: (enabled) => runHouseAction(
      () => window.petHouse?.setMischiefMode?.(enabled),
      enabled ? "장난모드를 켰어요." : "장난모드를 껐어요."
    ),
    sleepAll: () => runHouseAction(
      () => window.petHouse?.sleepAll?.(),
      "모두 잠잘 준비를 해요."
    ),
    wakeAll: () => runHouseAction(
      () => window.petHouse?.wakeAll?.(),
      "모두 일어났어요."
    ),
    showPet: (petId) => runHouseAction(
      () => window.petHouse?.showPet?.(petId),
      `${petId}를 불렀어요.`
    ),
    setPetSkin: (petId, skin) => runHouseAction(
      () => window.petHouse?.setPetSkin?.(petId, skin),
      `${petId}의 스킨을 바꿨어요.`
    ),
    removePet: async (petId) => {
      const result = await runHouseAction(
        () => window.petHouse?.removePet?.(petId),
        ""
      );

      setStatusMessage(result?.removed ? `${petId}가 집으로 돌아갔어요.` : "집으로 보내지 못했어요.");
    }
  };

  return (
    <PetHouse
      state={houseState}
      statusMessage={statusMessage}
      actions={actions}
    />
  );
}
