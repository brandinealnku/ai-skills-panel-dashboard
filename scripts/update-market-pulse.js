/**
 * Update Market Pulse fields in data.json
 * - marketLenses.usajobsPulse (USAJOBS Search API)
 * - marketLenses.onetHotTechnologies (O*NET Hot Technologies CSV export)
 *
 * Run locally:
 *   USAJOBS_API_KEY=... USAJOBS_USER_AGENT=you@domain.edu node scripts/update-market-pulse.js
 */

import fs from "node:fs/promises";

const DATA_PATH = "./data.json";

/** Keep this list short + executive */
const AI_TERMS = [
  "ai",
  "artificial intelligence",
  "generative ai",
  "chatgpt",
  "llm",
  "machine learning",
  "prompt"
];

function normalize(s) {
  return String(s ?? "").toLowerCase();
}

function titleHasAI(title = "") {
  const t = normalize(title);
  // Special-case "ai" so we don't overcount "said"/"chair" etc.
  // We'll require " ai " boundaries OR any multi-word term.
  const hasWordAI = /\bai\b/.test(t);
  const hasOther = AI_TERMS.some((term) => term !== "ai" && t.includes(term));
  return hasWordAI || hasOther;
}

function topCounts(items, getKey, limit = 5) {
  const map = new Map();
  for (const it of items) {
    const k = getKey(it);
    if (!k) continue;
    map.set(k, (map.get(k) || 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function topTermCounts(titles, limit = 6) {
  const map = new Map();
  for (const title of titles) {
    const t = normalize(title);
    for (const term of AI_TERMS) {
      if (term === "ai") {
        if (/\bai\b/.test(t)) map.set("ai", (map.get("ai") || 0) + 1);
      } else if (t.includes(term)) {
        map.set(term, (map.get(term) || 0) + 1);
      }
    }
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }));
}

/* ---------------------------
   USAJOBS Pulse (requires key)
---------------------------- */
async function fetchUsajobsPulse({ windowDays = 30, maxResults = 500 } = {}) {
  const key = process.env.USAJOBS_API_KEY;
  const ua = process.env.USAJOBS_USER_AGENT; // typically your email

  if (!key || !ua) {
    return {
      enabled: false,
      windowDays,
      sampledResults: 0,
      aiFlaggedResults: 0,
      aiShareInSamplePct: 0,
      topOrganizations: [],
      topAITermsInTitles: [],
      note: "Missing USAJOBS_API_KEY / USAJOBS_USER_AGENT. Add as GitHub Secrets to enable this lens."
    };
  }

  // Broad query that tends to return relevant postings; still safe for exec signal.
  // You can tune later.
  const keyword =
    'AI OR "artificial intelligence" OR "machine learning" OR LLM OR ChatGPT OR "generative AI" OR "prompt engineering"';

  const url = new URL("https://data.usajobs.gov/api/search");
  url.searchParams.set("ResultsPerPage", String(Math.min(maxResults, 500)));
  url.searchParams.set("Page", "1");
  url.searchParams.set("Keyword", keyword);

  const res = await fetch(url, {
    headers: {
      Host: "data.usajobs.gov",
      "User-Agent": ua,
      "Authorization-Key": key
    }
  });

  if (!res.ok) {
    return {
      enabled: false,
      windowDays,
      sampledResults: 0,
      aiFlaggedResults: 0,
      aiShareInSamplePct: 0,
      topOrganizations: [],
      topAITermsInTitles: [],
      note: `USAJOBS Search API error ${res.status}. Check key/user-agent headers.`
    };
  }

  const json = await res.json();
  const items = json?.SearchResult?.SearchResultItems ?? [];
  const postings = items.map((x) => x?.MatchedObjectDescriptor ?? {}).slice(0, maxResults);

  const titles = postings.map((p) => p.PositionTitle || "");
  const orgs = postings.map((p) => p.OrganizationName || p.DepartmentName || "").filter(Boolean);

  const aiFlagged = titles.filter(titleHasAI).length;

  return {
    enabled: true,
    windowDays,
    sampledResults: postings.length,
    aiFlaggedResults: aiFlagged,
    aiShareInSamplePct: postings.length ? (aiFlagged / postings.length) * 100 : 0,
    topOrganizations: topCounts(orgs, (v) => v, 5),
    topAITermsInTitles: topTermCounts(titles, 6),
    note: "Computed from USAJOBS Search API (open federal postings)."
  };
}

/* ---------------------------
   O*NET Hot Technologies (public CSV)
---------------------------- */
async function fetchOnetHotTechnologies() {
  // O*NET provides a “Hot Technologies” export. URL can vary; try a small set.
  const candidates = [
    "https://www.onetonline.org/dl_files/hot_tech.csv",
    "https://www.onetonline.org/dl_files/hot_tech.xls",
    "https://www.onetonline.org/dl_files/hot_tech.xlsx"
  ];

  let csvText = null;
  let usedUrl = null;

  for (const u of candidates) {
    try {
      const r = await fetch(u);
      if (!r.ok) continue;

      // Only handle CSV directly here.
      if (u.endsWith(".csv")) {
        csvText = await r.text();
        usedUrl = u;
        break;
      }
    } catch {
      // continue
    }
  }

  if (!csvText) {
    return {
      enabled: false,
      asOf: new Date().toISOString().slice(0, 10),
      topHotTechnologies: [],
      note:
        "Could not fetch O*NET Hot Technologies CSV from the standard export URL. If this persists, we’ll switch to pulling from O*NET Web Services or pinning a downloaded CSV in-repo."
    };
  }

  // Parse CSV (simple approach works for this export in practice)
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    return {
      enabled: false,
      asOf: new Date().toISOString().slice(0, 10),
      topHotTechnologies: [],
      note: "O*NET CSV returned, but did not contain expected rows."
    };
  }

  // Expect columns like: Job Postings, Hot Technology (header can vary)
  const rows = lines.slice(1).map((line) => {
    // naive split; ok for two-column export. If commas exist inside quotes, we still handle by joining.
    const parts = line.split(",");
    const postingsRaw = String(parts[0] ?? "").replace(/"/g, "").replace(/,/g, "");
    const postings = Number(postingsRaw);
    const tech = parts.slice(1).join(",").replace(/"/g, "").trim();
    return { postings: Number.isFinite(postings) ? postings : 0, tech };
  });

  const top = rows
    .filter((r) => r.tech)
    .sort((a, b) => b.postings - a.postings)
    .slice(0, 12)
    .map((r) => ({ name: r.tech, postings: r.postings }));

  return {
    enabled: true,
    asOf: new Date().toISOString().slice(0, 10),
    topHotTechnologies: top,
    note: `From O*NET OnLine Hot Technologies export (${usedUrl}).`
  };
}

/* ---------------------------
   Main
---------------------------- */
async function main() {
  const raw = await fs.readFile(DATA_PATH, "utf-8");
  const data = JSON.parse(raw);

  data.marketLenses = data.marketLenses || {};

  data.marketLenses.usajobsPulse = await fetchUsajobsPulse({ windowDays: 30, maxResults: 500 });
  data.marketLenses.onetHotTechnologies = await fetchOnetHotTechnologies();

  // Keep lastUpdated current
  data.lastUpdated = new Date().toISOString().slice(0, 10);

  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2));
  console.log("✅ Updated data.json marketLenses + lastUpdated");
}

main().catch((e) => {
  console.error("❌ Update failed:", e);
  process.exit(1);
});
