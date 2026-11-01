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
    .forEach((line, i) => ctx.fillText(line, x, y + i * size * 1.4));
}
function shareCard(article, config, outDir) {
  if (!registered) {
    if (!GlobalFonts.registerFromPath(font, "Research Korean"))
      throw Error("Korean share font unavailable");
    registered = true;
  }
  const data = [
    article.headline,
    article.summary,
    article.company,
    article.ticker,
    article.sectors,
    article.asOfDate,
    config.siteName,
  ];
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
    ctx.fillRect(0, 0, 16, 630);
    block(ctx, config.siteName, {
      x: 66,
      y: 42,
      width: 1068,
      size: 25,
      maxLines: 1,
      color: "#ea5a0c",
      weight: 700,
    });
    block(
      ctx,
      [article.company, article.ticker, ...article.sectors]
        .filter(Boolean)
        .join(" · "),
      { x: 66, y: 98, width: 1068, size: 23, maxLines: 1, color: "#626267" },
    );
    block(ctx, article.headline, {
      x: 66,
      y: 165,
      width: 1068,
      size: 52,
      maxLines: 3,
      color: "#1d1d1f",
      weight: 800,
    });
    block(ctx, article.summary, {
      x: 66,
      y: 402,
      width: 1068,
      size: 25,
      maxLines: 3,
      color: "#424245",
    });
    ctx.fillStyle = "#e8e8ed";
    ctx.fillRect(66, 555, 1068, 1);
    block(ctx, `자료 기준일 ${article.asOfDate}`, {
      x: 66,
      y: 574,
      width: 1068,
      size: 21,
      maxLines: 1,
      color: "#626267",
    });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, canvas.toBuffer("image/png"));
  }
  return config.baseUrl + relative;
}
module.exports = { shareCard, wrap };
