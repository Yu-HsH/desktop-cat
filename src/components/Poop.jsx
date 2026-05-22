import poopSpriteUrl from "../../assets/poop/poop.svg";

export default function Poop({ onClean }) {
  return (
    <button type="button" className="poop" aria-label="똥 치우기" onClick={onClean}>
      <img className="poop__image" src={poopSpriteUrl} alt="" draggable="false" />
    </button>
  );
}
