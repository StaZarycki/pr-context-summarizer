# PR Context Summarizer

> **A GitHub Action that automatically summarizes pull requests with business context from Jira and AI-generated descriptions of code changes.**

---

## ✨ What it does

When a pull request is opened or updated, this Action:

- Fetches the linked Jira issue (title, status, priority, assignee, description).
- Scans the PR metadata, commits, and code signals (files, risky paths, dependency bumps, migration hints).
- Uses **AI** to generate a structured description with four sections:
  - ✨ Most important changes
  - 💥 Breaking changes
  - 🐛 Fixes
  - ⚠️ Things to consider
- Posts or updates a single comment on the PR.

---

## 📸 Example Output

```
# ABC-123: As an admin, I can manage users

**Business context**
- Status: In Progress · Priority: High · Assignee: Ada Lovelace · Estimate: 3

### ✨ Most important changes
- Added new /users API endpoint
- Extended User entity with roles

### 💥 Breaking changes
- Removed old /account endpoint

### 🐛 Fixes
- Fixed null handling in UserService

### ⚠️ Things to consider
- Migration alters users table
- Major dependency bump: nestjs@10.x

**Links**
- PR: #42
- Jira: ABC-123
```

---

## 📦 Usage

Create a workflow file (e.g. `.github/workflows/pr-summarizer.yml`) in your repo:

```yaml
name: PR Context Summarizer
on:
  pull_request:
    types: [opened, reopened, synchronize]
  workflow_dispatch:

jobs:
  summarize:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - name: Run PR Context Summarizer
        uses: your-username/pr-context-summarizer@v1
        with:
          jiraBaseUrl: ${{ vars.JIRA_BASE_URL }}
          jiraEmail: ${{ secrets.JIRA_EMAIL }}
          jiraApiToken: ${{ secrets.JIRA_API_TOKEN }}
          githubToken: ${{ secrets.GITHUB_TOKEN }}
          openaiApiKey: ${{ secrets.OPENAI_API_KEY }} # optional, enables AI
          openaiModel: gpt-4o-mini # optional, default
```

---

## 🔑 Inputs

| Name                    | Required | Default                       | Description                                                |
| ----------------------- | -------- | ----------------------------- | ---------------------------------------------------------- |
| `jiraBaseUrl`           | ✅       | –                             | Jira Cloud base URL, e.g. `https://example.atlassian.net`. |
| `jiraEmail`             | ✅       | –                             | Jira account email used with the API token.                |
| `jiraApiToken`          | ✅       | –                             | Jira API token (see below).                                |
| `githubToken`           | ❌       | `${{ secrets.GITHUB_TOKEN }}` | Token for posting PR comments.                             |
| `openaiApiKey`          | ❌       | –                             | OpenAI API key; if set, AI generates the PR description.   |
| `openaiModel`           | ❌       | `gpt-4o-mini`                 | Model name to use.                                         |
| `issueKeyPattern`       | ❌       | `(?<key>[A-Z]{2,}-\d+)`       | Regex to extract Jira keys from PR title/branch.           |
| `maxFiles`              | ❌       | `200`                         | Max files to scan.                                         |
| `maxDiffBytes`          | ❌       | `350000`                      | Max diff size to analyze.                                  |
| `updateExistingComment` | ❌       | `true`                        | Update existing bot comment instead of posting new.        |

---

## 🔐 Jira Setup

1. Go to [Atlassian API Tokens](https://id.atlassian.com/manage/api-tokens).
2. Create a new token and copy it.
3. Add the following in your repo:
   - **Secrets** → `JIRA_EMAIL`, `JIRA_API_TOKEN`
   - **Variables** → `JIRA_BASE_URL`

---

## 🛠 Development

For contributors:

```bash
npm install
npm run build   # compile + bundle with ncc
```

Commit the `dist/` folder when releasing.

---

## 🏷 Versioning

- Use full semver tags (`v1.0.0`, `v1.1.0`, …).
- Maintain a floating major tag (`v1`) so consumers can pin to `@v1`.
