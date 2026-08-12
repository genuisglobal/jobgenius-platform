/**
 * Icon Generator for the JobGenius extension toolbar icons.
 *
 * Produces brand-coloured PNGs (violet mark + orange sparkle) at the sizes
 * Chrome needs. The extension currently ships no toolbar icon, so run this
 * once and then wire the manifest (snippet at the bottom of this file).
 *
 *   npm install canvas
 *   node generate-icons.js
 */

const { createCanvas } = require("canvas");
const fs = require("fs");
const path = require("path");

const sizes = [16, 32, 48, 128];
const iconsDir = path.join(__dirname, "icons");

// Brand palette (matches the logo + popup).
const VIOLET = "#7c3aed";
const VIOLET_DARK = "#6d28d9";
const ORANGE = "#f97316";
const WHITE = "#ffffff";

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir);
}

function drawSparkle(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r * 0.32, cy - r * 0.32);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx + r * 0.32, cy + r * 0.32);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r * 0.32, cy + r * 0.32);
  ctx.lineTo(cx - r, cy);
  ctx.lineTo(cx - r * 0.32, cy - r * 0.32);
  ctx.closePath();
  ctx.fill();
}

sizes.forEach((size) => {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  const s = size / 48; // design grid is 48x48

  // Rounded violet background.
  const radius = size * 0.22;
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, VIOLET);
  grad.addColorStop(1, VIOLET_DARK);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.arcTo(size, 0, size, size, radius);
  ctx.arcTo(size, size, 0, size, radius);
  ctx.arcTo(0, size, 0, 0, radius);
  ctx.arcTo(0, 0, size, 0, radius);
  ctx.closePath();
  ctx.fill();

  // Orbit ring (subtle).
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = Math.max(1, 2 * s);
  ctx.save();
  ctx.translate(22 * s, 30 * s);
  ctx.rotate((-20 * Math.PI) / 180);
  ctx.beginPath();
  ctx.ellipse(0, 0, 17 * s, 8 * s, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Person (head + shoulders), white.
  ctx.fillStyle = WHITE;
  ctx.beginPath();
  ctx.arc(22 * s, 20 * s, 5 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(13 * s, 33 * s);
  ctx.arc(22 * s, 33 * s, 9 * s, Math.PI, 0, true);
  ctx.closePath();
  ctx.fill();

  // Orange sparkle (skip on the tiny 16px where it would muddy).
  if (size >= 32) {
    drawSparkle(ctx, 37 * s, 14 * s, 5 * s, ORANGE);
  }

  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), canvas.toBuffer("image/png"));
  console.log(`Created icon${size}.png`);
});

console.log("\nIcons generated. Add this to manifest.json:");
console.log(
  JSON.stringify(
    {
      icons: { 16: "icons/icon16.png", 48: "icons/icon48.png", 128: "icons/icon128.png" },
      action: { default_icon: { 16: "icons/icon16.png", 32: "icons/icon32.png" } },
    },
    null,
    2
  )
);
