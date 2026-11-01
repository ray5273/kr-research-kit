#!/usr/bin/env node
// Generate missing site/covers art through the logged-in Gemini web app, or --check that none is missing.
// --sectors fills the shared site/covers/sectors library instead; existing files are skipped, so it can resume.
const { execFileSync } = require("child_process");
const fs = require("fs"),
  os = require("os"),
  path = require("path");
const { ART_DIR, artName, loadSectors, resolveArt } = require("./cover-art");
const root = path.join(__dirname, "../../..");
const GEMINI_URL = "https://gemini.google.com/app";
const AUTH = /accounts\.google|captcha|비정상적인 트래픽/i;

function missingArt(articles, artDir, sectors = loadSectors()) {
  return articles.filter(
    (article) => !resolveArt(article, { artDir, sectors }) && article.coverArt !== false,
  );
}
function coverPrompt(article) {
  const subject =
    article.coverSubject ||
    `a concrete visual metaphor, built from the physical products or industry involved, for this equity research topic: "${[article.company, article.headline || article.issue].filter(Boolean).join(": ")}"`;
  return `이미지를 생성해줘. Editorial isometric 3D illustration of ${subject}. Pure white background, soft shadows, matte light-gray and near-black objects with a single vivid orange (#EA5A0C) accent. Minimal, premium, Apple-like financial research magazine style. Subject centered with generous empty space. Wide 16:9 aspect ratio. Absolutely no text, letters, numbers, logos, or brand marks; no real car or product designs.`;
}

class GeminiBrowser {
  constructor() {
    const { resolveBrowseBinary } = require("../../kr-naver-browse/scripts/browse-naver.js");
    const home = path.join(os.homedir(), ".gstack", "kr-naver-blog-publish");
    this.bin = resolveBrowseBinary();
    this.env = {
      ...process.env,
      CHROMIUM_PROFILE: process.env.NAVER_GEMINI_PROFILE || path.join(home, "chromium-profile"),
      BROWSE_STATE_FILE: process.env.NAVER_PUBLISH_STATE_FILE || path.join(home, "browse.json"),
      BROWSE_PARENT_PID: process.env.BROWSE_PARENT_PID || "0",
    };
    this.prefix = ["--headed"];
  }
  run(args, timeout = 90_000) {
    const exec = () =>
      execFileSync(this.bin, [...this.prefix, ...args], {
        encoding: "utf8",
        env: this.env,
        timeout,
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    try {
      return exec();
    } catch (error) {
      // Newer gstack builds set headed mode at connect time and reject the flag.
      if (!this.prefix.length || !/Unknown command:\s*'?--headed/.test(String(error.stderr))) throw error;
      this.prefix = [];
      return exec();
    }
  }
  send(prompt) {
    this.run(["goto", GEMINI_URL], 60_000);
    this.run(["wait", "--load"], 20_000);
    return this.run(
      [
        "js",
        `new Promise(async res=>{
          const t=Date.now();let el;
          while(Date.now()-t<20000&&!(el=document.querySelector('rich-textarea div[contenteditable=true],div[contenteditable=true][role=textbox]')))await new Promise(r=>setTimeout(r,500));
          if(${AUTH}.test(location.href))return res('auth '+location.href);
          if(!el)return res('nobox '+document.body.innerText.slice(0,300));
          el.focus();document.execCommand('insertText',false,${JSON.stringify(prompt)});
          await new Promise(r=>setTimeout(r,800));
          const b=document.querySelector('button.send-button,button[aria-label*="보내기"],button[aria-label*="Send"]');
          if(!b)return res('nosend');b.click();res('sent');})`,
      ],
      40_000,
    );
  }
  waitForImage() {
    for (let i = 0; i < 16; i++) {
      const found = this.run(
        [
          "js",
          `new Promise(res=>{const t=Date.now();(function p(){
            const im=[...document.querySelectorAll('img')].reverse().find(i=>{const s=i.currentSrc||i.src||'';const r=i.getBoundingClientRect();return r.width>200&&r.height>100&&/googleusercontent|blob:|data:image/.test(s)&&i.complete&&i.naturalWidth>200});
            if(im){document.querySelectorAll('[data-g]').forEach(e=>e.removeAttribute('data-g'));im.setAttribute('data-g','1');return res('ok')}
            if(Date.now()-t>15000)return res('');setTimeout(p,1000)})()})`,
        ],
        30_000,
      );
      if (found) return true;
    }
    return false;
  }
  capture(prompt, file) {
    const sent = this.send(prompt);
    // Sending navigates to the new chat, which can drop the reply; waitForImage catches a real failure.
    if (sent && sent !== "sent") throw Error(`Gemini prompt not sent: ${sent.slice(0, 300)}`);
    if (!this.waitForImage()) throw Error("Gemini returned no image in time");
    // The first paint can be a blurred preview.
    this.run(["js", "new Promise(r=>setTimeout(()=>r(1),2500))"], 15_000);
    this.run(["screenshot", "img[data-g='1']", file], 60_000);
  }
}

// Remove Gemini's rounded corners and watermark, and flatten its off-white so art blends into covers.
async function cleanArt(source, target) {
  const { createCanvas, loadImage } = require("@napi-rs/canvas");
  const image = await loadImage(source),
    cropX = image.width * 0.04,
    cropY = image.height * 0.04,
    cropW = image.width - 3 * cropX,
    cropH = image.height - cropY - image.height * 0.1,
    W = 1200,
    H = Math.round((W * cropH) / cropW),
    canvas = createCanvas(W, H),
    ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(image, cropX, cropY, cropW, cropH, 0, 0, W, H);
  const pixels = ctx.getImageData(0, 0, W, H),
    data = pixels.data,
    lum = (x, y) => {
      const q = (y * W + x) * 4;
      return (data[q] + data[q + 1] + data[q + 2]) / 3;
    },
    edge = [];
  for (let x = 0; x < W; x += 7) edge.push(lum(x, 3), lum(x, H - 4));
  for (let y = 0; y < H; y += 7) edge.push(lum(3, y), lum(W - 4, y));
  edge.sort((a, b) => a - b);
  const background = Math.max(200, edge[Math.floor(edge.length * 0.25)]);
  const feather = 70;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const q = (y * W + x) * 4,
        t = Math.min(1, Math.min(x, y, W - 1 - x, H - 1 - y) / feather);
      for (let k = 0; k < 3; k++)
        data[q + k] = 255 - (255 - Math.min(255, (data[q + k] * 255) / background)) * t;
    }
  ctx.putImageData(pixels, 0, 0);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, canvas.toBuffer("image/jpeg", 86));
}

function parseArgs(argv) {
  const args = { check: false, force: false, sectors: false, sectorIds: [], slugs: [], out: ART_DIR };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--check") args.check = true;
    else if (argv[i] === "--force") args.force = true;
    else if (argv[i] === "--sectors") args.sectors = true;
    else if (argv[i] === "--sector") {
      args.sectors = true;
      args.sectorIds.push(argv[++i]);
    } else if (argv[i] === "--slug") args.slugs.push(argv[++i]);
    else if (argv[i] === "--out") args.out = path.resolve(argv[++i]);
    else throw Error(`Unknown argument: ${argv[i]}`);
  }
  return args;
}
function sectorJobs(args) {
  const sectors = loadSectors(),
    unknown = args.sectorIds.filter((id) => !sectors.some((sector) => sector.id === id));
  if (unknown.length) throw Error(`Not in site/cover-sectors.json: ${unknown.join(", ")}`);
  return sectors
    .filter((sector) => !args.sectorIds.length || args.sectorIds.includes(sector.id))
    .map((sector) => ({
      name: sector.id,
      prompt: coverPrompt({ coverSubject: sector.subject }),
      target: path.join(args.out, "sectors", `${sector.id}.jpg`),
    }))
    .filter((job) => args.force || !fs.existsSync(job.target));
}
function articleJobs(args, articles, missing) {
  const unknown = args.slugs.filter((slug) => !articles.some((a) => a.slug === slug));
  if (unknown.length) throw Error(`Not in site/published.json: ${unknown.join(", ")}`);
  const chosen = args.slugs.length
    ? articles.filter((a) => args.slugs.includes(a.slug) && (args.force || missing.includes(a)))
    : missing;
  return chosen.map((article) => ({
    name: article.slug,
    prompt: coverPrompt(article),
    target: path.join(args.out, artName(article.slug)),
  }));
}
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { articles } = JSON.parse(fs.readFileSync(path.join(root, "site/published.json"), "utf8"));
  const missing = missingArt(articles, args.out);
  if (args.check) {
    if (!missing.length) return;
    console.error(
      `Published articles without cover art:\n${missing.map((a) => `  ${a.slug}`).join("\n")}\nAdd a sectors entry from site/cover-sectors.json, or run: node skills/kr-research-site/scripts/generate-covers.js`,
    );
    process.exit(1);
  }
  const jobs = args.sectors ? sectorJobs(args) : articleJobs(args, articles, missing);
  if (!jobs.length) return console.log("Nothing to generate.");
  const browser = new GeminiBrowser(),
    temp = fs.mkdtempSync(path.join(os.tmpdir(), "research-covers-"));
  let failed = 0,
    streak = 0,
    done = 0;
  for (const job of jobs) {
    const raw = path.join(temp, `${job.name.replaceAll("/", "-")}.png`);
    try {
      browser.capture(job.prompt, raw);
      await cleanArt(raw, job.target);
      done++;
      streak = 0;
      console.log(`Review this image before committing: ${job.target}`);
    } catch (error) {
      failed++;
      streak++;
      console.error(`${job.name}: ${String(error.stderr || error.message).slice(0, 400)}`);
      // Two misses in a row means a usage limit or logout, not one bad image: stop spending chats.
      if (AUTH.test(String(error.message)) || streak >= 2) break;
    }
  }
  fs.rmSync(temp, { recursive: true, force: true });
  console.log(`Generated ${done} of ${jobs.length}; ${jobs.length - done} left.`);
  if (failed) process.exit(1);
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
module.exports = { artName, missingArt, coverPrompt };
