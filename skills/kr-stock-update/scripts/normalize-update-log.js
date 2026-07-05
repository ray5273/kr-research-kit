#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const result = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") {
      result.input = argv[i + 1];
      i += 1;
    } else if (arg === "--report") {
      result.report = argv[i + 1];
      i += 1;
    } else if (arg === "--output") {
      result.output = argv[i + 1];
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return result;
}

function usage() {
  return [
    "Usage:",
    "  node normalize-update-log.js --input update.json [--report analysis-example/kr/<company>/memo.md] [--output updated.md]",
    "",
    "Notes:",
    "  - Without --report, prints a normalized markdown update block.",
    "  - With --report, updates the memo in place unless --output is provided.",
    "  - Replaces the same-date update block if it already exists.",
  ].join("\n");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function toList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (value === null || value === undefined) {
    return [];
  }
  const normalized = String(value).trim();
  return normalized ? [normalized] : [];
}

function normalizeSource(source) {
  if (typeof source === "string") {
    return {
      label: source,
      url: null,
      date: null,
    };
  }

  if (!source || typeof source !== "object") {
    return null;
  }

  const label = source.label ? String(source.label).trim() : null;
  const url = source.url ? String(source.url).trim() : null;
  const date = source.date ? String(source.date).trim() : null;
  const role = source.role ? String(source.role).trim() : null;

  if (!label && !url) {
    return null;
  }

  return {
    label,
    url,
    date,
    role,
  };
}

function renderBulletSection(title, items, fallback) {
  const lines = [`#### ${title}`, ""];
  const normalizedItems = toList(items);

  if (normalizedItems.length === 0) {
    lines.push(`- ${fallback}`, "");
    return lines;
  }

  for (const item of normalizedItems) {
    lines.push(`- ${item}`);
  }
  lines.push("");
  return lines;
}

function renderSources(sources) {
  const lines = ["#### Sources", ""];
  const normalized = (sources || []).map(normalizeSource).filter(Boolean);

  if (normalized.length === 0) {
    lines.push("- No new source recorded.", "");
    return lines;
  }

  for (const source of normalized) {
    let line = "- ";
    if (source.url && source.label) {
      line += `[${source.label}](${source.url})`;
    } else if (source.url) {
      line += source.url;
    } else {
      line += source.label;
    }

    if (source.date) {
      line += ` (${source.date})`;
    }
    if (source.role) {
      line += ` — Source role: ${source.role}`;
    }
    lines.push(line);
  }
  lines.push("");
  return lines;
}

function renderMetadata(payload) {
  const lines = [];
  const metadata = [
    ["Mode", payload.mode],
    ["Classification", payload.classification],
    ["Thesis delta", payload.thesisDelta],
  ].filter(([, value]) => value);

  if (metadata.length === 0 && toList(payload.events).length === 0) {
    return lines;
  }

  lines.push("#### Update packet", "");
  for (const [label, value] of metadata) {
    lines.push(`- ${label}: ${value}`);
  }
  for (const event of normalizeEvents(payload.events)) {
    const details = [
      event.key ? `eventKey: ${event.key}` : null,
      event.date ? `date: ${event.date}` : null,
      event.materiality ? `materiality: ${event.materiality}` : null,
    ].filter(Boolean).join("; ");
    lines.push(`- Event: ${event.label}${details ? ` (${details})` : ""}`);
  }
  lines.push("");
  return lines;
}

function normalizeEvents(events) {
  const normalized = Array.isArray(events)
    ? events
    : events === null || events === undefined
      ? []
      : [events];
  return normalized.map((event) => {
    if (typeof event === "string") {
      return { label: event };
    }
    return {
      key: event.key ? String(event.key).trim() : event.eventKey ? String(event.eventKey).trim() : null,
      label: event.label ? String(event.label).trim() : event.title ? String(event.title).trim() : "Unnamed event",
      date: event.date ? String(event.date).trim() : null,
      materiality: event.materiality ? String(event.materiality).trim() : null,
    };
  });
}

function renderStructuredSection(title, items, fallback, formatter) {
  const lines = [`#### ${title}`, ""];
  const normalizedItems = Array.isArray(items)
    ? items
    : items === null || items === undefined
      ? []
      : [items];
  if (normalizedItems.length === 0) {
    lines.push(`- ${fallback}`, "");
    return lines;
  }
  for (const item of normalizedItems) {
    lines.push(`- ${formatter ? formatter(item) : item}`);
  }
  lines.push("");
  return lines;
}

function renderFollowUpResolutions(items) {
  return renderStructuredSection(
    "Follow-up prompt resolutions",
    items,
    "No follow-up research prompt was resolved in this update.",
    (item) => {
      if (typeof item === "string") {
        return item;
      }
      const question = item.question || item.prompt || "Unspecified prompt";
      const status = item.status || "updated";
      const evidence = item.evidence ? ` — ${item.evidence}` : "";
      return `${question}: ${status}${evidence}`;
    },
  );
}

function renderDartRecheck(items) {
  return renderStructuredSection(
    "DART recheck",
    items,
    "No DART recheck was required for this update.",
    (item) => {
      if (typeof item === "string") {
        return item;
      }
      const claim = item.claim || item.topic || "Unspecified claim";
      const status = item.status || "checked";
      const note = item.note || item.evidence || "";
      return `${claim}: ${status}${note ? ` — ${note}` : ""}`;
    },
  );
}

function renderUpdateBlock(payload) {
  if (!payload.date) {
    throw new Error("Update JSON must include a date field.");
  }

  const lines = [`### ${payload.date} Update`, ""];
  const noMaterialUpdate = payload.noMaterialUpdate === true || payload.classification === "wait-for-event";
  const whatHappenedFallback = noMaterialUpdate
    ? "No material company-specific update found after the memo date."
    : "No material company-specific update found after the memo date.";

  lines.push(...renderMetadata(payload));
  lines.push(
    ...renderBulletSection("What happened", payload.whatHappened, whatHappenedFallback),
  );
  lines.push(
    ...renderBulletSection("Why it matters", payload.whyItMatters, "No thesis-relevant implication identified."),
  );
  lines.push(
    ...renderBulletSection("What changed in the thesis", payload.whatChangedInThesis, "No material thesis change."),
  );
  lines.push(
    ...renderBulletSection("What did not change", payload.whatDidNotChange, "The base memo still describes the core business and setup adequately."),
  );
  lines.push(
    ...renderBulletSection("Signals to watch next", payload.signalsToWatchNext, "Watch the next company disclosure, earnings release, or capital-allocation update."),
  );
  if (payload.followUpResolutions) {
    lines.push(...renderFollowUpResolutions(payload.followUpResolutions));
  }
  if (payload.dartRecheck) {
    lines.push(...renderDartRecheck(payload.dartRecheck));
  }
  lines.push(...renderSources(payload.sources));

  return `${lines.join("\n").trimEnd()}\n`;
}

function upsertRecentUpdateLine(reportText, date) {
  if (!date) {
    return reportText;
  }

  if (/^최근 업데이트일:\s*.+$/m.test(reportText)) {
    return reportText.replace(/^최근 업데이트일:\s*.+$/m, `최근 업데이트일: ${date}`);
  }

  if (/^기준일:\s*.+$/m.test(reportText)) {
    return reportText.replace(/^기준일:\s*.+$/m, (match) => `${match}\n최근 업데이트일: ${date}`);
  }

  const titleMatch = reportText.match(/^#\s+.+$/m);
  if (!titleMatch) {
    return `최근 업데이트일: ${date}\n\n${reportText}`;
  }

  return reportText.replace(titleMatch[0], `${titleMatch[0]}\n\n최근 업데이트일: ${date}`);
}

function replaceOrAppendDatedBlock(reportText, date, block) {
  const escapedDate = date.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingPattern = new RegExp(`^###\\s+(?:(?:\\d+[.)]\\s+)|[-*]\\s*)?\`?${escapedDate}\`?(?:\\s+Update)?\\s*$`, "m");
  const headingMatch = headingPattern.exec(reportText);

  if (headingMatch) {
    const startIndex = headingMatch.index;
    const afterHeading = reportText.slice(startIndex + headingMatch[0].length);
    const nextHeadingMatch = /\n###\s+(?:(?:\d+[.)]\s+)|[-*]\s*)?`?\d{4}-\d{2}-\d{2}`?(?:\s+Update)?\s*$/m.exec(afterHeading);
    const endIndex = nextHeadingMatch
      ? startIndex + headingMatch[0].length + nextHeadingMatch.index
      : reportText.length;

    return `${reportText.slice(0, startIndex)}${block.trimEnd()}${reportText.slice(endIndex)}`;
  }

  if (/^##\s+Update Log\s*$/m.test(reportText)) {
    return `${reportText.trimEnd()}\n\n${block.trimEnd()}\n`;
  }

  return `${reportText.trimEnd()}\n\n## Update Log\n\n${block.trimEnd()}\n`;
}

function updateReport(reportText, payload) {
  const block = renderUpdateBlock(payload);
  let next = upsertRecentUpdateLine(reportText, payload.date);
  next = replaceOrAppendDatedBlock(next, payload.date, block);
  return next.endsWith("\n") ? next : `${next}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.input) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }

  const payload = readJson(args.input);
  const block = renderUpdateBlock(payload);

  if (!args.report) {
    process.stdout.write(block);
    return;
  }

  const reportPath = path.resolve(args.report);
  const reportText = fs.readFileSync(reportPath, "utf8");
  const updated = updateReport(reportText, payload);
  const target = path.resolve(args.output || args.report);
  fs.writeFileSync(target, updated, "utf8");

  console.log(`Updated ${target}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  renderUpdateBlock,
  updateReport,
};
