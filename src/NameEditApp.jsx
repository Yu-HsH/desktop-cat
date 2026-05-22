import NameEditForm from "./components/NameEditForm.jsx";

const params = new URLSearchParams(window.location.search);

export default function NameEditApp() {
  return (
    <NameEditForm
      petId={params.get("petId") || ""}
      initialName={params.get("name") || ""}
    />
  );
}
