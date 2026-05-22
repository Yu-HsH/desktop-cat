function getSkinLabel(skin) {
  return skin.replace("cat-", "Cat ");
}

export default function HousePetList({ pets, availableSkins, onShowPet, onSetPetSkin, onRemovePet }) {
  if (pets.length === 0) {
    return (
      <section className="house-pet-list house-pet-list--empty">
        <p>아직 집에 등록된 고양이가 없어요.</p>
      </section>
    );
  }

  return (
    <section className="house-pet-list" aria-label="고양이 목록">
      {pets.map((pet) => (
        <article className="house-pet-row" key={pet.id}>
          <div className="house-pet-row__meta">
            <strong>{pet.name || pet.id}</strong>
            <span>{getSkinLabel(pet.skin)}</span>
          </div>

          <label className="house-skin-select">
            <span>스킨</span>
            <select
              value={pet.skin}
              onChange={(event) => onSetPetSkin(pet.id, event.target.value)}
            >
              {availableSkins.map((skin) => (
                <option value={skin} key={skin}>
                  {getSkinLabel(skin)}
                </option>
              ))}
            </select>
          </label>

          <div className="house-pet-row__buttons">
            <button type="button" className="house-small-button" onClick={() => onShowPet(pet.id)}>
              보기
            </button>
            <button
              type="button"
              className="house-small-button house-small-button--danger"
              onClick={() => onRemovePet(pet.id)}
            >
              집으로
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}
