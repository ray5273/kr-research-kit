#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function usage() {
  return "Usage: node score-trade-inference.js --input thesis.json [--output score.json]";
}

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function between(value, min, max) {
  return value != null && value >= min && value <= max;
}

function scorePacket(packet) {
  const evidence = packet.evidence || {};
  const tradeChangePct = asNumber(evidence.tradeChangePct);
  const quantityChangePct = asNumber(evidence.quantityChangePct);
  const companyRevenueChangePct = asNumber(evidence.companyRevenueChangePct);
  const peerRevenueChangePct = asNumber(evidence.peerRevenueChangePct);
  const contractCoverageRatio = asNumber(evidence.contractCoverageRatio);
  const companyDisclosureContradiction = Boolean(evidence.companyDisclosureContradiction);
  const explicitDisclosure = Boolean(evidence.explicitDisclosure);
  const broadSectorOnly = Boolean(evidence.broadSectorOnly);

  const supportingFactors = [];
  const contradictions = [];
  const attributionWeaknesses = [];
  let score = 0;

  if (explicitDisclosure) {
    supportingFactors.push("Company filing or IR explicitly confirms the claim.");
    score += 100;
  }

  if (tradeChangePct != null && tradeChangePct >= 30) {
    supportingFactors.push(`Trade value increased materially (${tradeChangePct}%).`);
    score += 25;
  } else if (tradeChangePct != null && tradeChangePct > 0) {
    supportingFactors.push(`Trade value increased (${tradeChangePct}%).`);
    score += 12;
  }

  if (quantityChangePct != null && quantityChangePct >= 20) {
    supportingFactors.push(`Physical quantity increased (${quantityChangePct}%).`);
    score += 15;
  }

  if (companyRevenueChangePct != null && companyRevenueChangePct >= 15) {
    supportingFactors.push(`Company revenue increased (${companyRevenueChangePct}%).`);
    score += 20;
  }

  if (companyRevenueChangePct != null && tradeChangePct != null && tradeChangePct >= 20 && companyRevenueChangePct <= -5) {
    contradictions.push(`Trade rose (${tradeChangePct}%) while company revenue fell (${companyRevenueChangePct}%).`);
  }

  if (peerRevenueChangePct != null && companyRevenueChangePct != null && companyRevenueChangePct - peerRevenueChangePct >= 10) {
    supportingFactors.push(`Company growth exceeded peer growth by ${companyRevenueChangePct - peerRevenueChangePct}pp.`);
    score += 15;
  }

  if (between(contractCoverageRatio, 0.5, 1.5)) {
    supportingFactors.push(`Disclosed contract scale fits inferred trade value (${contractCoverageRatio}x).`);
    score += 20;
  } else if (contractCoverageRatio != null) {
    contradictions.push(`Contract scale does not fit inferred trade value (${contractCoverageRatio}x).`);
  }

  if (companyDisclosureContradiction) {
    contradictions.push("Company disclosure or management commentary contradicts the trade-flow thesis.");
  }

  if (broadSectorOnly) {
    attributionWeaknesses.push("Signal is sector-wide; company attribution is not isolated.");
    score -= 15;
  }

  const hardContradiction = contradictions.length > 0;
  let grade = "weak proxy";
  if (explicitDisclosure) {
    grade = "confirmed disclosure";
  } else if (hardContradiction && (companyDisclosureContradiction || (tradeChangePct || 0) >= 20)) {
    grade = "contradicted";
  } else if (score >= 75) {
    grade = "high-confidence inference";
  } else if (score >= 35) {
    grade = "medium-confidence proxy";
  }

  return {
    schemaVersion: "kr-trade-flow-score.v1",
    company: packet.company || "",
    thesis: packet.thesis || "",
    grade,
    score: Math.max(0, Math.min(100, score)),
    labelsRequired: grade === "confirmed disclosure" ? ["confirmed disclosure"] : ["Trade Flow Inference", grade],
    supportingFactors,
    contradictions: contradictions.concat(attributionWeaknesses),
    unresolvedChecks: packet.unresolvedChecks || [],
    sourceDates: packet.sourceDates || {},
  };
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.input) {
    console.error(`Missing --input.\n${usage()}`);
    process.exit(1);
  }

  const packet = JSON.parse(fs.readFileSync(args.input, "utf8"));
  const result = scorePacket(packet);
  const text = `${JSON.stringify(result, null, 2)}\n`;
  if (args.output) {
    fs.mkdirSync(path.dirname(args.output), { recursive: true });
    fs.writeFileSync(args.output, text);
  } else {
    process.stdout.write(text);
  }
}

if (require.main === module) {
  main();
}

module.exports = { scorePacket };
