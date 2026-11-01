// Which image an article's cover uses: its own art, then a shared sector picture, else the text cover.
const fs = require("fs"),
  path = require("path");
const root = path.join(__dirname, "../../..");
const ART_DIR = path.join(root, "site/covers"),
  SECTOR_FILE = path.join(root, "site/cover-sectors.json");

function artName(slug) {
  return `${slug.replaceAll("/", "-")}.jpg`;
}
function normalize(text) {
  return String(text).toLowerCase().replace(/[\s·]/g, "");
}
function loadSectors(file = SECTOR_FILE) {
  const { sectors } = JSON.parse(fs.readFileSync(file, "utf8")),
    seen = new Map();
  for (const sector of sectors) {
    if (!/^[a-z0-9-]+$/.test(sector.id || "") || !sector.label || !sector.subject)
      throw Error(`Bad cover sector entry: ${JSON.stringify(sector).slice(0, 200)}`);
    // An alias shared by two sectors would make the picture depend on list order.
    for (const key of [sector.id, sector.label, ...(sector.aliases || [])].map(normalize)) {
      if (seen.has(key) && seen.get(key) !== sector.id)
        throw Error(`Cover sector name "${key}" is in both ${seen.get(key)} and ${sector.id}`);
      seen.set(key, sector.id);
    }
  }
  return sectors;
}
function sectorFor(article, sectors) {
  if (article.coverSector) {
    const chosen = sectors.find((sector) => sector.id === article.coverSector);
    if (!chosen) throw Error(`${article.slug}: unknown coverSector "${article.coverSector}" (see site/cover-sectors.json)`);
    return chosen;
  }
  for (const name of article.sectors || []) {
    const match = sectors.find((sector) =>
      [sector.label, ...(sector.aliases || [])].some((alias) => normalize(alias) === normalize(name)),
    );
    if (match) return match;
  }
  return null;
}
// Sector lookup runs first so a coverSector typo fails even on an article with its own art.
function resolveArt(article, { artDir = ART_DIR, sectors = loadSectors() } = {}) {
  const sector = sectorFor(article, sectors),
    own = path.join(artDir, artName(article.slug));
  if (fs.existsSync(own)) return own;
  // coverArt: false asks for the text cover, so it must not pick up a sector picture.
  if (!sector || article.coverArt === false) return null;
  const shared = path.join(artDir, "sectors", `${sector.id}.jpg`);
  return fs.existsSync(shared) ? shared : null;
}
module.exports = { ART_DIR, artName, loadSectors, sectorFor, resolveArt };
