export default function HouseSpeechBubble({ text }) {
  if (!text) {
    return null;
  }

  return (
    <div className="house-speech-bubble" role="status">
      {text}
    </div>
  );
}
