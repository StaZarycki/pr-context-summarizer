import * as core from '@actions/core';
export function render({
  pr,
  issue,
  tech,
  keys,
  businessWarn,
}: {
  pr: any;
  issue: any | null;
  tech: any;
  keys: string[];
  businessWarn: string | null;
}) {
  const marker = '<!-- pr-synth:v1 -->';
  const uniqueKeys = uniqueIssueKeys(keys);
  const multipleIssues = uniqueKeys.length > 1;
  const titleKey = multipleIssues
    ? formatIssueHeading(uniqueKeys)
    : issue?.key ?? uniqueKeys[0] ?? `PR #${pr.number}`;
  const titleText = multipleIssues
    ? pr.title
    : issue?.title ?? pr.title;
  const lines = [
    `${marker}
# ${titleKey}: ${titleText}

**Business context**
- ${
      multipleIssues
        ? 'Multiple Jira issues referenced'
        : issue
        ? `Status: ${issue.status} · Priority: ${
            issue.priority ?? 'n/a'
          } · Assignee: ${issue.assignee ?? 'n/a'}${
            issue.estimate ? ` · Estimate: ${issue.estimate}` : ''
          }`
        : 'No linked issue data'
    }
${
  !multipleIssues && issue?.description
    ? `- Summary: ${truncate(issue.description, 400)}`
    : ''
}${businessWarn ? `\n- ${businessWarn}` : ''}

**Technical highlights**
- Scope: ${pr.stats.files} files, +${pr.stats.additions}/-${pr.stats.deletions}
- Components: ${tech.topDirs.join(', ') || '—'}
${
  tech.riskyHits.length
    ? `- Risky areas: ${tech.riskyHits.slice(0, 6).join(', ')}${
        tech.riskyHits.length > 6 ? ' …' : ''
      }`
    : '- Risky areas: —'
}
${tech.depMajors.length ? `- Major deps: ${tech.depMajors.join(', ')}` : ''}
${
  tech.breakingHints.length
    ? `- Potential breaking: \n  - ${tech.breakingHints.join('\n  - ')}`
    : '- Potential breaking: —'
}

**Testing & rollout**
- Tests updated/added: (if applicable)
- Manual checks: (describe)
- Backward compatibility: (notes)
- Observability: (logs/metrics/alerts)

**Links**
- PR: ${formatPrLink(pr)}
${
  multipleIssues
    ? uniqueKeys.length
      ? `- Jira: ${formatIssueList(uniqueKeys)}`
      : ''
    : issue
    ? `- Jira: ${issue.key}`
    : ''
}

<sub>Keys seen: ${keys.join(', ') || '—'}</sub>
`,
  ];
  return lines.join('\n');
}
function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// src/render.ts
export function renderWithAi({
  pr,
  issue,
  keys,
  businessWarn,
  aiDescription,
  allIssues,
}: {
  pr: any;
  issue: any | null;
  keys: string[];
  businessWarn: string | null;
  aiDescription: string;
  allIssues: Record<string, any>;
}) {
  const marker = '<!-- pr-synth:v1 -->';
  const base = process.env.JIRA_BASE_URL || ''; // pass as env in workflow if you want

  const relatedIssues = dedupeIssues(Object.values(allIssues));
  const related = relatedIssues.length
    ? relatedIssues
        .map((it: any) => {
          const prLink = getLinkedPrUrl(it);
          const fallback = base ? `${base}/browse/${it.key}` : '';
          const url = prLink || fallback;
          const key = url ? `[${it.key}](${url})` : it.key;
          const title = it.title ? ` ${it.title}` : '';
          return `- ${key}${title}`.trimEnd();
        })
        .join('\n')
    : '';

  const uniqueKeys = uniqueIssueKeys([
    ...keys,
    ...relatedIssues.map((it: any) => it?.key).filter(Boolean),
  ] as string[]);
  const multipleIssues = uniqueKeys.length > 1;
  const titleKey = multipleIssues
    ? formatIssueHeading(uniqueKeys)
    : issue?.key ?? uniqueKeys[0] ?? `PR #${pr.number}`;
  const titleText = multipleIssues
    ? pr.title
    : issue?.title ?? pr.title;
  const businessContext = multipleIssues
    ? 'Multiple Jira issues referenced'
    : issue
    ? `Status: ${issue.status} · Priority: ${issue.priority ?? 'n/a'} · Assignee: ${
        issue.assignee ?? 'n/a'
      }${issue?.estimate ? ` · Estimate: ${issue.estimate}` : ''}`
    : 'No linked issue data';

  return `${marker}
# ${titleKey}: ${titleText}

**Business context**
- ${businessContext}${businessWarn ? `\n- ${businessWarn}` : ''}

${aiDescription}

**Related issues**
${related || '—'}

**Links**
- PR: ${formatPrLink(pr)}
${
  !multipleIssues && issue
    ? `- Jira: [${issue.key}](${base ? `${base}/browse/${issue.key}` : ''})`
    : ''
}
<sub>Keys seen: ${keys.join(', ') || '—'}</sub>
`;
}

function uniqueIssueKeys(keys: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of keys) {
    if (!key) continue;
    const upper = key.toUpperCase();
    if (seen.has(upper)) continue;
    seen.add(upper);
    out.push(upper);
  }
  return out;
}

function formatIssueHeading(keys: string[]): string {
  if (!keys.length) return 'PR';
  if (keys.length === 1) return keys[0];
  if (keys.length === 2) return `${keys[0]} & ${keys[1]}`;
  return `${keys[0]}, ${keys[1]} (+${keys.length - 2} more)`;
}

function formatIssueList(keys: string[]): string {
  if (!keys.length) return '—';
  if (keys.length <= 5) return keys.join(', ');
  const shown = keys.slice(0, 5).join(', ');
  return `${shown} (+${keys.length - 5} more)`;
}

function dedupeIssues(issues: any[]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const it of issues) {
    if (!it?.key) continue;
    if (seen.has(it.key)) continue;
    seen.add(it.key);
    out.push(it);
  }
  return out;
}

function getLinkedPrUrl(issue: any): string | null {
  if (!issue || typeof issue !== 'object') return null;

  const direct = [
    issue.prHtmlUrl,
    issue.prHtmlURL,
    issue.prUrl,
    issue.prURL,
    issue.pullRequestUrl,
    issue.pullRequestURL,
    issue.pullUrl,
    issue.pull_url,
    issue.htmlUrl,
    issue.html_url,
    issue.url,
  ];
  for (const candidate of direct) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  const nestedObjects = [
    issue.pr,
    issue.linkedPr,
    issue.pullRequest,
    issue.pull_request,
    issue.githubPullRequest,
  ];
  for (const obj of nestedObjects) {
    const nested = getLinkedPrUrl(obj);
    if (nested) return nested;
  }

  const nestedArrays = [
    issue.prs,
    issue.linkedPrs,
    issue.linkedPRs,
    issue.pullRequests,
    issue.pull_requests,
    issue.githubPullRequests,
    issue.relatedPrs,
    issue.related_prs,
  ];
  for (const arr of nestedArrays) {
    if (!Array.isArray(arr)) continue;
    for (const entry of arr) {
      const nested = getLinkedPrUrl(entry);
      if (nested) return nested;
    }
  }

  return null;
}

function formatPrLink(pr: any): string {
  return pr?.htmlUrl ? `[#${pr.number}](${pr.htmlUrl})` : `#${pr.number}`;
}
