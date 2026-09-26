import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";
import { createRandom } from "../../lib/seededRandom.js";

/**
 * Every surface pattern and every sign in the room is painted onto a 2D canvas here, so
 * the scene loads no image files and makes no network requests.
 */

function canvasTexture(width: number, height: number, paint: (context: CanvasRenderingContext2D) => void): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context) paint(context);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Signs use the page fonts; repaint once they have loaded so the first frame is not a fallback face. */
function withFonts(texture: CanvasTexture, repaint: (context: CanvasRenderingContext2D) => void): CanvasTexture {
  if (typeof document !== "undefined" && document.fonts) {
    void document.fonts.ready.then(() => {
      const canvas = texture.image as HTMLCanvasElement;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      repaint(context);
      texture.needsUpdate = true;
    });
  }
  return texture;
}

const cache = new Map<string, CanvasTexture>();
function cached(key: string, build: () => CanvasTexture): CanvasTexture {
  let texture = cache.get(key);
  if (!texture) {
    texture = build();
    cache.set(key, texture);
  }
  return texture;
}

/** Classic cafeteria vinyl: cream tiles with a scatter of sage accent tiles and fine speckle. */
export function floorTexture(): CanvasTexture {
  return cached("floor", () => {
    const tiles = 8;
    const size = 64;
    const texture = canvasTexture(tiles * size, tiles * size, (context) => {
      const random = createRandom(12);
      for (let row = 0; row < tiles; row++) {
        for (let column = 0; column < tiles; column++) {
          const accent = (row + column) % 2 === 0 ? "#e9e2cf" : random.chance(0.22) ? "#a9c7b6" : "#f3eee2";
          context.fillStyle = accent;
          context.fillRect(column * size, row * size, size, size);
          for (let speck = 0; speck < 26; speck++) {
            context.fillStyle = random.chance(0.5) ? "rgba(90,100,90,0.10)" : "rgba(255,255,255,0.5)";
            context.fillRect(column * size + random.range(0, size), row * size + random.range(0, size), 2, 2);
          }
          context.strokeStyle = "rgba(120,110,90,0.18)";
          context.lineWidth = 1.5;
          context.strokeRect(column * size + 0.75, row * size + 0.75, size - 1.5, size - 1.5);
        }
      }
    });
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    return texture;
  });
}

/** Painted cinder block. */
export function blockWallTexture(): CanvasTexture {
  return cached("block", () => {
    const texture = canvasTexture(256, 256, (context) => {
      context.fillStyle = "#f4efe1";
      context.fillRect(0, 0, 256, 256);
      context.strokeStyle = "rgba(150,135,105,0.28)";
      context.lineWidth = 3;
      const rows = 4;
      const blockHeight = 256 / rows;
      for (let row = 0; row < rows; row++) {
        const y = row * blockHeight;
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(256, y);
        context.stroke();
        const offset = row % 2 === 0 ? 0 : 64;
        for (let x = offset; x <= 256; x += 128) {
          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(x, y + blockHeight);
          context.stroke();
        }
      }
    });
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    return texture;
  });
}

export interface SignOptions {
  lines: string[];
  background: string;
  color: string;
  width?: number;
  height?: number;
  /** Relative size of the first line; later lines are drawn at 55% of it. */
  fontSize?: number;
  border?: string;
  radius?: number;
}

/** A painted sign, banner, or poster with centered lines of text. */
export function signTexture(key: string, options: SignOptions): CanvasTexture {
  return cached(`sign:${key}`, () => {
    const width = options.width ?? 512;
    const height = options.height ?? 256;
    const paint = (context: CanvasRenderingContext2D) => {
      const radius = options.radius ?? 24;
      context.fillStyle = options.background;
      context.beginPath();
      context.roundRect(0, 0, width, height, radius);
      context.fill();
      if (options.border) {
        context.strokeStyle = options.border;
        context.lineWidth = 14;
        context.beginPath();
        context.roundRect(10, 10, width - 20, height - 20, Math.max(4, radius - 8));
        context.stroke();
      }
      context.fillStyle = options.color;
      context.textAlign = "center";
      context.textBaseline = "middle";
      const firstSize = options.fontSize ?? height * 0.34;
      const sizes = options.lines.map((_, index) => (index === 0 ? firstSize : firstSize * 0.55));
      const total = sizes.reduce((sum, size) => sum + size * 1.15, 0);
      let y = height / 2 - total / 2;
      options.lines.forEach((line, index) => {
        const size = sizes[index]!;
        context.font = `${index === 0 ? 800 : 700} ${size}px Outfit, system-ui, sans-serif`;
        y += (size * 1.15) / 2;
        context.fillText(line, width / 2, y);
        y += (size * 1.15) / 2;
      });
    };
    return withFonts(canvasTexture(width, height, paint), paint);
  });
}

/** A child's crayon drawing for the art wall: a sun, a house, or a smiling face. */
export function drawingTexture(seed: number): CanvasTexture {
  return cached(`drawing:${seed}`, () =>
    canvasTexture(128, 160, (context) => {
      const random = createRandom(seed);
      context.fillStyle = "#fffdf6";
      context.fillRect(0, 0, 128, 160);
      context.lineWidth = 5;
      context.lineCap = "round";
      const crayons = ["#e2703a", "#4a7fa5", "#5f9e4a", "#e8c04d", "#c9543f", "#7d5ba6"];
      const subject = seed % 3;
      if (subject === 0) {
        context.strokeStyle = "#e8c04d";
        context.beginPath();
        context.arc(64, 70, 26, 0, Math.PI * 2);
        context.stroke();
        for (let ray = 0; ray < 10; ray++) {
          const angle = (ray / 10) * Math.PI * 2;
          context.beginPath();
          context.moveTo(64 + Math.cos(angle) * 34, 70 + Math.sin(angle) * 34);
          context.lineTo(64 + Math.cos(angle) * 48, 70 + Math.sin(angle) * 48);
          context.stroke();
        }
      } else if (subject === 1) {
        context.strokeStyle = random.pick(crayons);
        context.strokeRect(30, 70, 68, 56);
        context.strokeStyle = random.pick(crayons);
        context.beginPath();
        context.moveTo(24, 72);
        context.lineTo(64, 34);
        context.lineTo(104, 72);
        context.stroke();
        context.strokeStyle = "#5f9e4a";
        context.beginPath();
        context.moveTo(8, 140);
        context.lineTo(120, 140);
        context.stroke();
      } else {
        context.strokeStyle = random.pick(crayons);
        context.beginPath();
        context.arc(64, 76, 40, 0, Math.PI * 2);
        context.stroke();
        context.fillStyle = "#2a2522";
        context.fillRect(48, 64, 6, 8);
        context.fillRect(74, 64, 6, 8);
        context.beginPath();
        context.arc(64, 84, 18, 0.2, Math.PI - 0.2);
        context.stroke();
      }
    }),
  );
}

/** The view out of the windows: sky, a line of trees, and the playground fence. */
export function outsideTexture(): CanvasTexture {
  return cached("outside", () =>
    canvasTexture(1024, 256, (context) => {
      const sky = context.createLinearGradient(0, 0, 0, 256);
      sky.addColorStop(0, "#8fc4e8");
      sky.addColorStop(0.7, "#d6ecf5");
      context.fillStyle = sky;
      context.fillRect(0, 0, 1024, 256);
      const random = createRandom(4);
      context.fillStyle = "rgba(255,255,255,0.85)";
      for (let cloud = 0; cloud < 6; cloud++) {
        const x = random.range(0, 1024);
        const y = random.range(20, 90);
        for (let puff = 0; puff < 4; puff++) {
          context.beginPath();
          context.arc(x + puff * 22, y + (puff % 2) * 6, 18 + (puff % 2) * 6, 0, Math.PI * 2);
          context.fill();
        }
      }
      context.fillStyle = "#7fae6b";
      context.fillRect(0, 200, 1024, 56);
      for (let tree = 0; tree < 18; tree++) {
        const x = tree * 60 + random.range(-15, 15);
        const radius = random.range(26, 42);
        context.fillStyle = "#8a6a4a";
        context.fillRect(x - 5, 170, 10, 40);
        context.fillStyle = random.chance(0.5) ? "#5f9e4a" : "#6fae5a";
        context.beginPath();
        context.arc(x, 170 - radius * 0.6, radius, 0, Math.PI * 2);
        context.fill();
      }
      context.strokeStyle = "rgba(90,90,90,0.5)";
      context.lineWidth = 2;
      for (let post = 0; post < 1024; post += 16) {
        context.beginPath();
        context.moveTo(post, 205);
        context.lineTo(post, 240);
        context.stroke();
      }
    }),
  );
}
