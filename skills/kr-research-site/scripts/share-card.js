const { createCanvas, GlobalFonts, loadImage } = require("@napi-rs/canvas");
const { execFileSync } = require("child_process");
const fs = require("fs"),
  path = require("path"),
  crypto = require("crypto");
const { resolveArt } = require("./cover-art");
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
function artFor(article) {
  const name = article.slug.replaceAll("/", "-"),
    artPath = resolveArt(article);
  return { name, artPath, art: artPath ? fs.readFileSync(artPath) : null };
}
function subjectOf(article, label) {
  return [article.company, label !== article.company ? label : ""]
    .filter(Boolean)
    .join(" · ");
}
// Image decoding is async but the site build is sync, so render out of process.
function renderArt(job) {
  execFileSync(process.execPath, [__filename, JSON.stringify(job)]);
}
function shareCard(article, config, outDir) {
  if (!registered) {
    if (!GlobalFonts.registerFromPath(font, "Research Korean"))
      throw Error("Korean share font unavailable");
    registered = true;
  }
  const label = article.ticker || article.sectors?.[0] || "";
  const { name, artPath, art } = artFor(article);
  const data = [article.company, label, article.headline, article.asOfDate, config.siteName];
  // Hash bytes too: font or renderer changes must also invalidate cached images.
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(data))
    .update(fs.readFileSync(font))
    .update(fs.readFileSync(__filename))
    .update(art || "")
    .digest("hex")
    .slice(0, 16);
  const relative = `/share/${name}-${hash}.${art ? "jpg" : "png"}`,
    file = path.join(outDir, relative);
  if (art && !fs.existsSync(file)) {
    renderArt({
      kind: "share",
      artPath,
      file,
      subject: subjectOf(article, label),
      headline: article.headline,
      asOfDate: article.asOfDate,
      siteName: config.siteName,
    });
  } else if (!fs.existsSync(file)) {
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
  const { name, artPath, art } = artFor(article);
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify([article.company, label, article.headline, article.asOfDate]))
    .update(fs.readFileSync(font))
    .update(fs.readFileSync(__filename))
    .update(art || "")
    .digest("hex")
    .slice(0, 16);
  const relative = `/covers/${name}-${hash}.${art ? "jpg" : "png"}`,
    file = path.join(outDir, relative);
  if (art && !fs.existsSync(file)) {
    renderArt({ artPath, file });
  } else if (!fs.existsSync(file)) {
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
// The list card prints the title in HTML, so its cover is art only; shareCard keeps the text.
async function renderArtCover({ artPath, file }) {
  const canvas = createCanvas(960, 600),
    ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 960, 600);
  // Art is white-backed, so it can be fitted to the card without a visible edge.
  const image = await loadImage(artPath),
    scale = Math.min(960 / image.width, 600 / image.height),
    width = image.width * scale,
    height = image.height * scale;
  ctx.drawImage(image, (960 - width) / 2, (600 - height) / 2, width, height);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, canvas.toBuffer("image/jpeg", 88));
}
async function renderArtShare({ artPath, file, subject, headline, asOfDate, siteName }) {
  if (!GlobalFonts.registerFromPath(font, "Research Korean"))
    throw Error("Korean share font unavailable");
  const canvas = createCanvas(1200, 630),
    ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 1200, 630);
  const image = await loadImage(artPath),
    width = 620,
    height = (width * image.height) / image.width;
  ctx.drawImage(image, 1200 - width - 16, 606 - height, width, height);
  ctx.fillStyle = "#ea5a0c";
  ctx.fillRect(0, 606, 1200, 24);
  block(ctx, subject, {
    x: 64,
    y: 44,
    width: 1072,
    size: 36,
    maxLines: 1,
    color: "#ea5a0c",
    weight: 700,
  });
  // Kakao shows this card at phone width: the title has to stay legible.
  block(ctx, headline, {
    x: 64,
    y: 96,
    width: 1072,
    size: 68,
    maxLines: 2,
    color: "#1d1d1f",
    weight: 800,
  });
  block(ctx, siteName, {
    x: 64,
    y: 490,
    width: 480,
    size: 34,
    maxLines: 1,
    color: "#1d1d1f",
    weight: 700,
  });
  block(ctx, ".", {
    x: 64 + ctx.measureText(siteName).width,
    y: 490,
    width: 60,
    size: 34,
    maxLines: 1,
    color: "#ea5a0c",
    weight: 700,
  });
  block(ctx, `기준일 ${asOfDate}`, {
    x: 64,
    y: 540,
    width: 480,
    size: 28,
    maxLines: 1,
    color: "#6e6e73",
    weight: 500,
  });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, canvas.toBuffer("image/jpeg", 88));
}
if (require.main === module) {
  const job = JSON.parse(process.argv[2]);
  (job.kind === "share" ? renderArtShare(job) : renderArtCover(job)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
module.exports = { shareCard, coverCard, wrap };
