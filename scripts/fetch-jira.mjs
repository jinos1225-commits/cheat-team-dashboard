// GitHub Actions에서 실행되는 스크립트.
// Jira Cloud REST API(v3, /search/jql)를 "직접" 호출해서 data/cheat_data.json 을 만든다.
// Claude API/MCP를 전혀 거치지 않으므로 토큰 소모가 없다.

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

// ---- 환경변수 (GitHub Secrets로 주입) ----
const JIRA_BASE_URL = requireEnv("JIRA_BASE_URL");   // 예: https://com2us.atlassian.net
const JIRA_EMAIL = requireEnv("JIRA_EMAIL");         // Jira에 로그인하는 이메일
const JIRA_API_TOKEN = requireEnv("JIRA_API_TOKEN"); // https://id.atlassian.com/manage-profile/security/api-tokens

const PROJECT_KEY = process.env.JIRA_PROJECT_KEY || "CHEAT";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`[fetch-jira] 필수 환경변수 ${name} 가 설정되지 않았습니다.`);
    process.exit(1);
  }
  return v;
}

// 팀(컴포넌트) 매핑 - 필요하면 여기만 수정하면 됩니다.
const TEAM_MAP = {
  "기획": ["K기획"],
  "UI": ["아트-UI"],
  "연출": ["아트-애니메이션"],
  "캐릭터모델링": ["아트-캐릭터"],
  "배경모델링": ["아트-배경"],
  "클라": ["K클라이언트", "클라-시스템"],
  "서버": ["서버", "K서버"],
  "인게임기획": ["인게임기획"],
  "인게임클라": ["클라-인게임"],
  "인게임서버": ["인게임서버"],
  "TA": ["클라-TA"],
  "PM": ["PM"],
};

const FIELDS = ["summary", "status", "assignee", "fixVersions", "customfield_10015", "customfield_10117"];

const authHeader = "Basic " + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");

function buildJql(components) {
  const list = components.map((c) => `"${c}"`).join(",");
  return `project = ${PROJECT_KEY} AND component in (${list}) AND statusCategory != Done AND status != "보류" ORDER BY updated DESC`;
}

function buildOverdueJql() {
  return `project = ${PROJECT_KEY} AND statusCategory != Done AND status != "보류" AND cf[10117] is not EMPTY AND cf[10117] < startOfDay() ORDER BY cf[10117] ASC`;
}

async function searchAll(jql) {
  let issues = [];
  let nextPageToken = null;

  while (true) {
    const body = {
      jql,
      fields: FIELDS,
      maxResults: 100,
      ...(nextPageToken ? { nextPageToken } : {}),
    };

    const res = await fetch(`${JIRA_BASE_URL}/rest/api/3/search/jql`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Jira 검색 실패 (${res.status}): ${text.slice(0, 500)}`);
    }

    const data = await res.json();
    issues = issues.concat((data.issues || []).map(simplifyIssue));

    if (data.nextPageToken) {
      nextPageToken = data.nextPageToken;
    } else {
      break;
    }
  }

  return issues;
}

function simplifyIssue(issue) {
  const f = issue.fields || {};
  return {
    key: issue.key,
    summary: f.summary || "",
    status: f.status ? f.status.name : "",
    statusCategory: f.status && f.status.statusCategory ? f.status.statusCategory.key : "new",
    assignee: f.assignee ? f.assignee.displayName : "미배정",
    fixVersions: (f.fixVersions || []).map((v) => v.name).join(", ") || "-",
    startDate: f.customfield_10015 || "-",
    targetDate: f.customfield_10117 || "-",
  };
}

async function fetchVersions() {
  const res = await fetch(`${JIRA_BASE_URL}/rest/api/3/project/${PROJECT_KEY}/versions`, {
    headers: { Authorization: authHeader, Accept: "application/json" },
  });
  if (!res.ok) {
    console.warn(`[fetch-jira] 버전 목록 조회 실패 (${res.status}) - 버전 필터 없이 진행합니다.`);
    return { released: [], unreleased: [] };
  }
  const versions = await res.json();
  return {
    released: versions.filter((v) => v.released).map((v) => v.name),
    unreleased: versions.filter((v) => !v.released && !v.archived).map((v) => v.name),
  };
}

async function main() {
  console.log(`[fetch-jira] ${PROJECT_KEY} 프로젝트 데이터 수집 시작...`);

  const teams = {};
  for (const [team, components] of Object.entries(TEAM_MAP)) {
    console.log(`[fetch-jira] 팀 조회: ${team}`);
    teams[team] = await searchAll(buildJql(components));
  }

  console.log("[fetch-jira] 목표 일정 지난 전체 일감 조회...");
  const overdue = await searchAll(buildOverdueJql());

  console.log("[fetch-jira] 버전 목록 조회...");
  const versions = await fetchVersions();

  const output = {
    fetchedAt: Date.now(),
    project: PROJECT_KEY,
    teams,
    overdue,
    versions,
  };

  const outDir = path.resolve("data");
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "cheat_data.json"), JSON.stringify(output, null, 0), "utf-8");

  console.log("[fetch-jira] data/cheat_data.json 저장 완료.");
}

main().catch((err) => {
  console.error("[fetch-jira] 실패:", err);
  process.exit(1);
});
