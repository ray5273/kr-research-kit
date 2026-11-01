const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");
const fs = require("fs"),
  path = require("path"),
  crypto = require("crypto");
const font = path.join(__dirname, "../assets/fonts/NotoSansKR.ttf");
let registered = false;
function wrap(ctx, text, width) {
  const lines = [];
  let line = "";
  for (const word of String(text).split(/(\s+)/)) {
    if (ctx.measureText(line + word).width <= width) {
      line += word;
      continue;
    }
    if (line.trim()) lines.push(line.trim());
    line = "";
    for (const char of word) {
      if (ctx.measureText(line + char).width > width && line) {
        lines.push(line.trim());
        line = "";
      }
      line += char;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}
function block(
  ctx,
  text,
  { x, y, width, size, maxLines, color, weight = 500 },
) {
  let lines;
  do {
    ctx.font = `${weight} ${size}px "Research Korean"`;
    lines = wrap(ctx, text, width);
    if (lines.length <= maxLines || size <= 12) break;
    size--;
  } while (true);
  ctx.fillStyle = color;
  ctx.textBaseline = "top";
  lines
    .slice(0, maxLines)
    .forEach((line, i) => ctx.fillText(line, x, y + i * size * 1.3));
  return { lines: Math.min(lines.length, maxLines), size };
}
function shareCard(article, config, outDir) {
  if (!registered) {
    if (!GlobalFonts.registerFromPath(font, "Research Korean"))
      throw Error("Korean share font unavailable");
    registered = true;
  }
  const data = [article.headline, config.siteName];
  // Hash bytes too: font or renderer changes must also invalidate cached images.
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(data))
    .update(fs.readFileSync(font))
    .update(fs.readFileSync(__filename))
    .digest("hex")
    .slice(0, 16);
  const relative = `/share/${article.slug.replaceAll("/", "-")}-${hash}.png`,
    file = path.join(outDir, relative);
  if (!fs.existsSync(file)) {
    const canvas = createCanvas(1200, 630),
      ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 1200, 630);
    ctx.fillStyle = "#ea5a0c";
    ctx.fillRect(0, 606, 1200, 24);
    // Kakao shows this card at phone width: only the title has to stay legible.
    block(ctx, config.siteName, {
      x: 72,
      y: 60,
      width: 1000,
      size: 38,
      maxLines: 1,
      color: "#1d1d1f",
      weight: 700,
    });
    // Same wordmark as the site header: ink name, orange period.
    block(ctx, ".", {
      x: 72 + ctx.measureText(config.siteName).width,
      y: 60,
      width: 60,
      size: 38,
      maxLines: 1,
      color: "#ea5a0c",
      weight: 700,
    });
    block(ctx, article.headline, {
      x: 72,
      y: 170,
      width: 1056,
      size: 88,
      maxLines: 3,
      color: "#1d1d1f",
      weight: 800,
    });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, canvas.toBuffer("image/png"));
  }
  return config.baseUrl + relative;
}
// List thumbnail: the card already prints the headline, so this only names the subject.
function coverCard(article, outDir) {
  if (!registered) {
    if (!GlobalFonts.registerFromPath(font, "Research Korean"))
      throw Error("Korean share font unavailable");
    registered = true;
  }
  const label = article.ticker || article.sectors?.[0] || "";
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify([article.company, label]))
    .update(fs.readFileSync(font))
    .update(fs.readFileSync(__filename))
    .digest("hex")
    .slice(0, 16);
  const relative = `/covers/${article.slug.replaceAll("/", "-")}-${hash}.png`,
    file = path.join(outDir, relative);
  if (!fs.existsSync(file)) {
    const canvas = createCanvas(800, 500),
      ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f5f5f7";
    ctx.fillRect(0, 0, 800, 500);
    // Measure first so one- and two-line names both sit centered with their label.
    const nameLines = (size) => {
      ctx.font = `800 ${size}px "Research Korean"`;
      return wrap(ctx, article.company, 688).length;
    };
    let size = 84;
    while (nameLines(size) > 2 && size > 12) size--;
    const nameHeight = nameLines(size) * size * 1.3,
      labelHeight = label && label !== article.company ? 56 : 0,
      top = (500 - (34 + nameHeight + labelHeight)) / 2;
    ctx.fillStyle = "#ea5a0c";
    ctx.fillRect(56, top, 56, 10);
    block(ctx, article.company, {
      x: 56,
      y: top + 34,
      width: 688,
      size,
      maxLines: 2,
      color: "#1d1d1f",
      weight: 800,
    });
    if (labelHeight) {
      block(ctx, label, {
        x: 58,
        y: top + 34 + nameHeight + 12,
        width: 688,
        size: 34,
        maxLines: 1,
        color: "#6e6e73",
      });
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, canvas.toBuffer("image/png"));
  }
  return relative;
}
module.exports = { shareCard, coverCard, wrap };
