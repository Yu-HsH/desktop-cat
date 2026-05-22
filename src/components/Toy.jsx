import yarnUrl from "../../assets/toys/yarn.svg";
import boxUrl from "../../assets/toys/box.svg";
import catnipUrl from "../../assets/toys/catnip.svg";

const TOY_SPRITES = {
  yarn: yarnUrl,
  box: boxUrl,
  catnip: catnipUrl
};

const TOY_TYPES = ["yarn", "box", "catnip"];
const TOY_PHASES = ["idle", "moving", "entering", "occupied", "exiting", "finished"];

export default function Toy({ type = "yarn", phase = "idle", meta = {}, knocked = false }) {
  const normalizedType = TOY_TYPES.includes(type) ? type : "yarn";
  const normalizedPhase = TOY_PHASES.includes(phase) ? phase : "idle";
  const className = [
    "toy-sprite",
    `toy-sprite--${normalizedType}`,
    `toy-sprite--${normalizedPhase}`,
    knocked ? "toy-sprite--knocked" : ""
  ].filter(Boolean).join(" ");

  return (
    <img
      className={className}
      src={TOY_SPRITES[normalizedType]}
      alt=""
      draggable="false"
      data-phase={normalizedPhase}
      data-knock-count={meta?.knockCount ?? 0}
      data-moving-from={meta?.from ? "true" : "false"}
    />
  );
}
