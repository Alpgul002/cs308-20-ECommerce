import {
  AudioLines, Camera, Headphones, Keyboard, Laptop, Mouse, Radio, Tablet, Watch
} from "lucide-react";

const icons = {
  headphones: Headphones,
  speaker: Radio,
  earbuds: AudioLines,
  laptop: Laptop,
  keyboard: Keyboard,
  mouse: Mouse,
  watch: Watch,
  tablet: Tablet,
  camera: Camera
};

export default function ProductArt({ product, variant = "card" }) {
  const Illustration = icons[product?.imageKey] ?? Headphones;
  const color = product?.accent || "violet";
  return (
    <div className={`product-art product-art--${variant} art--${color}`} aria-hidden="true">
      <div className="art-orbit art-orbit--outer" />
      <div className="art-orbit art-orbit--inner" />
      <div className="art-glow" />
      <Illustration className="art-device" strokeWidth={1.15} />
      <span className="art-dot art-dot--one" />
      <span className="art-dot art-dot--two" />
    </div>
  );
}
