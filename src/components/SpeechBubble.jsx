export default function SpeechBubble({ text, hidden }) {
  if (!text || hidden) {
    return null;
  }

  return (
    <div className="speech-bubble" aria-live="polite">
      {text}
    </div>
  );
}
