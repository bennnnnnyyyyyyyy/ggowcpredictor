import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const GROUPS_URL = "https://worldcup26.ir/get/groups";
const TEAMS_URL = "https://worldcup26.ir/get/teams";
const DEFAULT_SUPABASE_URL = "https://nthnysznieivbkncpqrk.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_q4iEOMH_S09dgmg3mHtK-w_08jFDVUo";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf8");
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/i);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

function readConfig() {
  const root = path.resolve(process.cwd());
  const envFromFile = loadEnvFile(path.join(root, ".dev.vars"));
  const supabaseUrl =
    process.env.SUPABASE_URL ||
    envFromFile.SUPABASE_URL ||
    DEFAULT_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_KEY ||
    envFromFile.SUPABASE_SERVICE_KEY ||
    envFromFile.SUPABASE_KEY ||
    DEFAULT_SUPABASE_KEY;

  if (!supabaseUrl) throw new Error("Missing SUPABASE_URL");
  if (!supabaseKey) {
    throw new Error("Missing SUPABASE_SERVICE_KEY or SUPABASE_KEY");
  }

  return {
    supabaseUrl: String(supabaseUrl).replace(/\/rest\/v1\/?$/, "").replace(/\/$/, ""),
    supabaseKey,
  };
}

function supabaseHeaders(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=minimal",
  };
}

function curlBinary() {
  return process.platform === "win32" ? "curl.exe" : "curl";
}

function curlRequest(
  url,
  { method = "GET", headers = [], body = null, parseJson = true } = {},
) {
  const args = ["-k", "-sS", "-X", method, url, "-w", "\n%{http_code}"];
  for (const header of headers) {
    args.push("-H", header);
  }
  if (body !== null) {
    args.push("--data-raw", body);
  }

  const output = execFileSync(curlBinary(), args, {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
  });

  const splitAt = output.lastIndexOf("\n");
  const text = splitAt >= 0 ? output.slice(0, splitAt) : output;
  const statusText = splitAt >= 0 ? output.slice(splitAt + 1).trim() : "200";
  const status = Number(statusText);

  if (!Number.isFinite(status) || status < 200 || status >= 300) {
    throw new Error(`${url} HTTP ${statusText}: ${text.slice(0, 500)}`);
  }

  return parseJson ? JSON.parse(text) : { status, text };
}

function readFirst(item, keys) {
  for (const key of keys) {
    if (item?.[key] !== undefined && item[key] !== null && item[key] !== "") {
      return item[key];
    }
  }
  return undefined;
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function extractArray(payload, keys) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return [];
}

function buildTeamNameMap(payload) {
  const teams = extractArray(payload, ["teams", "data", "items"]);
  const byId = new Map();
  for (const team of teams) {
    const id = String(
      readFirst(team, ["team_id", "teamId", "id", "_id"]) || "",
    ).trim();
    const name = readFirst(team, ["name", "team_name", "teamName", "name_en"]);
    if (id && name) byId.set(id, String(name));
  }
  return byId;
}

function normalizeStandings(groupsPayload, teamsPayload) {
  const groups = extractArray(groupsPayload, ["groups", "data", "items"]);
  const teamNamesById = buildTeamNameMap(teamsPayload);
  const rows = [];
  const warnings = [];

  for (const group of groups) {
    const groupName = String(group.name || group.group || "").trim();
    if (!groupName) {
      warnings.push("Skipped group without a name.");
      continue;
    }

    const teams = extractArray(group, ["teams", "table", "standings"]);
    if (teams.length !== 4) {
      warnings.push(`Group ${groupName} has ${teams.length} teams.`);
    }

    const seenTeamIds = new Set();
    const seenPositions = new Set();

    teams.forEach((team, index) => {
      const teamId = String(
        readFirst(team, ["team_id", "teamId", "id", "_id"]) || "",
      ).trim();
      if (!teamId) {
        warnings.push(`Group ${groupName} has a row without team_id.`);
        return;
      }

      const position = toNumber(readFirst(team, ["position", "rank", "standing", "pos"]), index + 1);
      if (seenTeamIds.has(teamId)) warnings.push(`Group ${groupName} duplicate team_id ${teamId}.`);
      if (seenPositions.has(position)) warnings.push(`Group ${groupName} duplicate position ${position}.`);
      seenTeamIds.add(teamId);
      seenPositions.add(position);

      const goalsFor = toNumber(readFirst(team, ["gf", "goals_for"]), 0);
      const goalsAgainst = toNumber(readFirst(team, ["ga", "goals_against"]), 0);
      const teamName =
        readFirst(team, ["team_name", "teamName", "name"]) ||
        teamNamesById.get(teamId) ||
        `Team ${teamId}`;

      rows.push({
        group_name: groupName,
        team_id: teamId,
        team_name: String(teamName),
        position,
        played: toNumber(readFirst(team, ["mp", "played", "p"]), 0),
        won: toNumber(readFirst(team, ["w", "won"]), 0),
        drawn: toNumber(readFirst(team, ["d", "drawn", "draws"]), 0),
        lost: toNumber(readFirst(team, ["l", "lost"]), 0),
        goals_for: goalsFor,
        goals_against: goalsAgainst,
        goal_difference: goalsFor - goalsAgainst,
        points: toNumber(readFirst(team, ["pts", "points"]), 0),
        updated_at: new Date().toISOString(),
      });
    });
  }

  return { rows, warnings, groups: groups.length };
}

async function upsertRows(config, rows) {
  curlRequest(
    `${config.supabaseUrl}/rest/v1/group_standings?on_conflict=group_name,team_id`,
    {
      method: "POST",
      headers: Object.entries(supabaseHeaders(config.supabaseKey)).map(
        ([key, value]) => `${key}: ${value}`,
      ),
      body: JSON.stringify(rows),
      parseJson: false,
    },
  );
}

async function main() {
  const startedAt = Date.now();
  const config = readConfig();

  const [groupsPayload, teamsPayload] = await Promise.all([
    Promise.resolve(curlRequest(GROUPS_URL)),
    Promise.resolve(curlRequest(TEAMS_URL)),
  ]);

  console.log("worldcup26.ir /get/groups payload:");
  console.log(JSON.stringify(groupsPayload, null, 2));

  const { rows, warnings, groups } = normalizeStandings(groupsPayload, teamsPayload);
  console.log(`Prepared ${rows.length} standings rows across ${groups} groups.`);
  warnings.forEach((warning) => console.warn(`WARN: ${warning}`));

  if (process.argv.includes("--dry-run")) {
    console.log("Dry run requested. No Supabase write performed.");
    return;
  }

  await upsertRows(config, rows);

  console.log(
    JSON.stringify({
      success: true,
      groups,
      teams: rows.length,
      updated: rows.length,
      executionMs: Date.now() - startedAt,
      warnings,
    }),
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
