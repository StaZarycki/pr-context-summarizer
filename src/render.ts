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
  const lines = [
    `${marker}
# ${issue?.key ?? keys[0] ?? `PR #${pr.number}`}: ${issue?.title ?? pr.title}

**Business context**
- ${
      issue
        ? `Status: ${issue.status} · Priority: ${
            issue.priority ?? 'n/a'
          } · Assignee: ${issue.assignee ?? 'n/a'}${
            issue.estimate ? ` · Estimate: ${issue.estimate}` : ''
          }`
        : 'No linked issue data'
    }
${issue?.description ? `- Summary: ${truncate(issue.description, 400)}` : ''}${
      businessWarn ? `\n- ${businessWarn}` : ''
    }

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
- PR: #${pr.number}
${issue ? `- Jira: ${issue.key}` : ''}

<sub>Keys seen: ${keys.join(', ') || '—'}</sub>
`,
  ];
  return lines.join('\n');
}
function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
