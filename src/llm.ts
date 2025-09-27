// src/llm.ts
import OpenAI from 'openai';

type SummarizeArgs = {
  pr: any;
  issue: any | null;
  tech: {
    topDirs: string[];
    riskyHits: string[];
    depMajors: string[];
    breakingHints: string[];
  };
  keys: string[];
  businessWarn: string | null;
  apiKey: string;
  model: string;
};

export async function llmSummarize({
  pr,
  issue,
  tech,
  keys,
  businessWarn,
  apiKey,
  model,
}: SummarizeArgs): Promise<string> {
  const client = new OpenAI({ apiKey });

  // Keep prompt small; feed only signals, not full diff
  const sys = `You write one compact Markdown PR comment for engineers + PMs.
Follow EXACTLY this structure and be concise. If info is missing, state it plainly.`;

  const user = [
    `Repo PR #: ${pr.number}`,
    `PR Title: ${pr.title}`,
    `Author: ${pr.author}`,
    `Scope: ${pr.stats.files} files, +${pr.stats.additions}/-${pr.stats.deletions}`,
    `Top components: ${tech.topDirs.join(', ') || '—'}`,
    tech.riskyHits.length
      ? `Risky areas: ${tech.riskyHits.slice(0, 8).join(', ')}`
      : `Risky areas: —`,
    tech.depMajors.length
      ? `Major deps: ${tech.depMajors.join(', ')}`
      : `Major deps: —`,
    tech.breakingHints.length
      ? `Potential breaking: ${tech.breakingHints.slice(0, 8).join(' | ')}`
      : `Potential breaking: —`,
    '',
    issue
      ? `Issue: ${issue.key} | ${issue.title} | Status=${
          issue.status
        } | Priority=${issue.priority ?? 'n/a'} | Assignee=${
          issue.assignee ?? 'n/a'
        } | Estimate=${issue.estimate ?? 'n/a'}`
      : 'Issue: not available',
    issue?.description
      ? `Issue summary: ${truncate(issue.description, 600)}`
      : '',
    businessWarn ? `Warnings: ${businessWarn}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const format = `# ${issue?.key ?? keys[0] ?? `PR #${pr.number}`}: ${
    issue?.title ?? pr.title
  }

**Business context**
- {status/priority/assignee/estimate}
- Summary: {one or two sentences}
- ${businessWarn ? 'Note: include Jira warning if present.' : ''}

**Technical highlights**
- Scope: {files, lines}
- Components: {top dirs}
- Risky areas: {if any}
- Major deps: {if any}
- Potential breaking:
  - {bulleted hints or "—"}

**Testing & rollout**
- Tests updated/added: {short}
- Manual checks: {short}
- Backward compatibility: {short}
- Observability: {short}

**Links**
- PR: #${pr.number}
${issue ? `- Jira: ${issue.key}` : ''}

<sub>Keys seen: ${keys.join(', ') || '—'}</sub>`;

  const completion = await client.responses.create({
    model,
    temperature: 0.2,
    max_output_tokens: 700,
    input: [
      { role: 'system', content: sys },
      {
        role: 'user',
        content: `Write the comment in this exact skeleton:\n${format}\n\nContext:\n${user}`,
      },
    ],
  });

  const text = completion.output_text?.trim() ?? '';
  // Extremely defensive: ensure our hidden marker gets added later by render/upsert
  return text || fallbackMinimal(pr, issue, tech, keys, businessWarn);
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function fallbackMinimal(
  pr: any,
  issue: any | null,
  tech: any,
  keys: string[],
  businessWarn: string | null
) {
  return `# ${issue?.key ?? keys[0] ?? `PR #${pr.number}`}: ${
    issue?.title ?? pr.title
  }

**Business context**
- ${
    issue
      ? `Status: ${issue.status} · Priority: ${
          issue.priority ?? 'n/a'
        } · Assignee: ${issue.assignee ?? 'n/a'}${
          issue?.estimate ? ` · Estimate: ${issue.estimate}` : ''
        }`
      : 'No linked issue data'
  }${businessWarn ? `\n- ${businessWarn}` : ''}

**Technical highlights**
- Scope: ${pr.stats.files} files, +${pr.stats.additions}/-${pr.stats.deletions}
- Components: ${tech.topDirs.join(', ') || '—'}
- Risky areas: ${
    tech.riskyHits[0] ? tech.riskyHits.slice(0, 6).join(', ') : '—'
  }
- Major deps: ${tech.depMajors[0] ? tech.depMajors.join(', ') : '—'}
- Potential breaking:
  - ${tech.breakingHints[0] ? tech.breakingHints.join('\n  - ') : '—'}

**Testing & rollout**
- Tests updated/added: (fill)
- Manual checks: (fill)
- Backward compatibility: (notes)
- Observability: (logs/metrics)

**Links**
- PR: #${pr.number}
${issue ? `- Jira: ${issue.key}` : ''}

<sub>Keys seen: ${keys.join(', ') || '—'}</sub>`;
}
