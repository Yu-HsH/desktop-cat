import { useState } from "react";

export default function NameEditForm({ petId, initialName }) {
  const [name, setName] = useState(initialName);
  const trimmedName = name.trim().slice(0, 12);
  const canSave = trimmedName.length > 0;

  function handleSubmit(event) {
    event.preventDefault();

    if (!canSave) {
      return;
    }

    window.petName?.save?.({ petId, name: trimmedName });
  }

  return (
    <main className="name-edit-shell">
      <form className="name-edit-form" onSubmit={handleSubmit}>
        <label className="name-edit-label">
          <span>고양이 이름</span>
          <input
            autoFocus
            maxLength={12}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <div className="name-edit-actions">
          <button type="button" onClick={() => window.petName?.cancel?.()}>
            취소
          </button>
          <button type="submit" disabled={!canSave}>
            저장
          </button>
        </div>
      </form>
    </main>
  );
}
