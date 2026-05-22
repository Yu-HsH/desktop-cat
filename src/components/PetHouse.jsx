import HouseDropZone from "./HouseDropZone.jsx";
import HousePetList from "./HousePetList.jsx";

export default function PetHouse({ state, statusMessage, actions }) {
  const petCount = state.pets.length;

  return (
    <main className="house-shell">
      <header className="house-header">
        <div>
          <p className="house-kicker">Desktop Cat</p>
          <h1>애완동물 집</h1>
        </div>
        <div className="house-count" aria-label={`현재 고양이 ${petCount}마리`}>
          <strong>{petCount}</strong>
          <span>마리</span>
        </div>
      </header>

      <section className="house-actions" aria-label="전체 고양이 관리">
        <button type="button" className="house-button house-button--primary" onClick={actions.addCat}>
          고양이 추가
        </button>
        <button
          type="button"
          className={`house-button ${state.mischiefMode ? "is-active" : ""}`}
          onClick={() => actions.setMischiefMode(!state.mischiefMode)}
        >
          장난모드 {state.mischiefMode ? "OFF" : "ON"}
        </button>
        <button
          type="button"
          className={`house-button ${state.quietMode ? "is-active" : ""}`}
          onClick={() => actions.setQuietMode(!state.quietMode)}
        >
          조용모드 {state.quietMode ? "OFF" : "ON"}
        </button>
        <button type="button" className="house-button" onClick={actions.sleepAll}>
          모두 재우기
        </button>
        <button type="button" className="house-button" onClick={actions.wakeAll}>
          모두 깨우기
        </button>
      </section>

      <HouseDropZone />

      <HousePetList
        pets={state.pets}
        availableSkins={state.availableSkins}
        onShowPet={actions.showPet}
        onSetPetSkin={actions.setPetSkin}
        onRemovePet={actions.removePet}
      />

      <p className="house-status" aria-live="polite">
        {statusMessage || "고양이들이 각자 산책 중이에요."}
      </p>
    </main>
  );
}
