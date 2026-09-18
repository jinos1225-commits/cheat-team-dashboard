# CHEAT 팀별 진행 일감 대시보드 (GitHub Pages 버전)

기존 Claude 아티팩트 버전(매번 Claude API + Atlassian MCP를 호출)을 **토큰 소모 없는 독립 웹사이트**로 바꾼 버전입니다.

## 동작 방식

```
GitHub Actions (15분마다, 또는 수동 실행)
   └─ scripts/fetch-jira.mjs 실행
        └─ Jira Cloud REST API(v3)를 이메일+API 토큰으로 직접 호출 (Claude API 미사용)
   └─ 결과를 data/cheat_data.json 으로 저장 후 저장소에 커밋

GitHub Pages
   └─ index.html 이 브라우저에서 data/cheat_data.json 을 fetch로 읽어서 화면에 표시
   └─ Jira에는 브라우저가 직접 접속하지 않음 (Jira 자격증명이 브라우저에 노출되지 않음)
```

즉, "Jira를 호출하는 주체"는 여러분의 브라우저가 아니라 GitHub Actions입니다. 요청하신 대로 사이트 자체에는 로그인 화면이 없습니다.

> ⚠️ **꼭 확인하세요**: 이 저장소/Pages가 public이면, `data/cheat_data.json`(=Jira 일감 스냅샷)은 링크를 아는 누구나 볼 수 있습니다. 사내망/VPN 제한은 "사람이 Jira에 직접 접속하는 경로"에는 유효하지만, 이 구조에서는 사람이 Jira에 직접 접속하지 않으므로 별도 보호가 되지 않습니다. 사내에서만 URL을 공유하는 방식으로 운용하시거나, 더 강한 보호가 필요하면 저장소를 private으로 바꾸고 (GitHub Enterprise/Team의 "Pages 접근 제한" 기능 필요) 조직원만 열람 가능하게 하는 방법을 나중에 추가할 수 있습니다.

## 1. 저장소 만들기

1. 이 폴더 전체를 새 GitHub 저장소로 올립니다. (예: `cheat-team-dashboard`)
2. 저장소 `Settings > Pages`에서:
   - Source: `Deploy from a branch`
   - Branch: `main` / `/ (root)`
   - 저장 후 몇 분 뒤 `https://<계정or조직>.github.io/<저장소이름>/` 로 접속 가능

## 2. Jira API 토큰 준비

1. Jira에 로그인할 때 쓰는 계정으로 https://id.atlassian.com/manage-profile/security/api-tokens 접속
2. "Create API token"으로 토큰 생성 (조회 전용 서비스 계정이 있다면 그 계정으로 만드는 걸 권장합니다)
3. 아래 3개 값을 준비:
   - `JIRA_BASE_URL` : 예) `https://com2us.atlassian.net`
   - `JIRA_EMAIL` : 토큰을 만든 계정의 이메일
   - `JIRA_API_TOKEN` : 방금 만든 토큰 문자열

## 3. GitHub Secrets 등록

저장소 `Settings > Secrets and variables > Actions > Secrets` 에서 `New repository secret`으로 다음 3개를 등록합니다.

| Name | Value |
|---|---|
| `JIRA_BASE_URL` | 여러분의 Jira 사이트 URL |
| `JIRA_EMAIL` | Jira 계정 이메일 |
| `JIRA_API_TOKEN` | 위에서 만든 API 토큰 |

(선택) 프로젝트 키가 `CHEAT`가 아니라면 `Settings > Secrets and variables > Actions > Variables`에 `JIRA_PROJECT_KEY` 변수를 추가하세요.

## 4. 워크플로우 실행 권한 확인

`Settings > Actions > General > Workflow permissions`에서 **"Read and write permissions"**가 선택되어 있어야 워크플로우가 `data/cheat_data.json`을 커밋할 수 있습니다.

## 5. 첫 실행

`Actions` 탭 → `Update Jira data` 워크플로우 → `Run workflow` 버튼으로 수동 실행해서 정상적으로 `data/cheat_data.json`이 갱신되는지 확인하세요. 이후에는 `.github/workflows/update-data.yml`의 cron 설정(기본 15분마다)에 따라 자동으로 갱신됩니다.

## 커스터마이징

- **팀/컴포넌트 매핑**: `scripts/fetch-jira.mjs`의 `TEAM_MAP`과 `index.html`의 `TEAM_MAP`을 **함께** 수정하세요 (양쪽에 동일하게 있어야 합니다).
- **갱신 주기**: `.github/workflows/update-data.yml`의 `cron` 값을 바꾸세요. (GitHub Actions 무료 크론은 정확한 시각 보장이 안 되고 최소 간격도 제한적이니 너무 짧게 잡지 않는 걸 권장합니다.)
- **커스텀 필드 번호**(`customfield_10015`, `customfield_10117`)가 다르면 `fetch-jira.mjs`의 `FIELDS`와 `simplifyIssue()`, `buildOverdueJql()`의 `cf[10117]` 부분을 여러분의 Jira 필드 ID로 바꿔주세요.

## 원래 아티팩트 버전과의 차이

| 항목 | 기존(아티팩트) | 이 버전 |
|---|---|---|
| Jira 조회 방식 | Claude API + Atlassian MCP (호출마다 토큰 소모) | GitHub Actions가 Jira REST API 직접 호출 (토큰 소모 없음) |
| "더 불러오기"(페이지네이션) | 있음 | 없음 (백엔드에서 항상 전체를 미리 다 가져와 저장) |
| 개인 설정 저장 | `window.storage` (아티팩트 전용) | 브라우저 `localStorage` |
| 접근 제어 | 없음 (Claude 대화 안에서만 접근) | 없음 (요청하신 대로) — 대신 위 경고사항 참고 |
