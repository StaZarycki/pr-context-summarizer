import OpenAI from 'openai';

type Jira = {
  key: string;
  title: string;
  status?: string;
  priority?: string;
  assignee?: string;
  estimate?: number | null;
  description?: string;
} | null;

type Tech = {
  topDirs: string[];
  riskyHits: string[];
  depMajors: string[];
  breakingHints: string[];
};

type PrBundle = {
  number: number;
  title: string;
  author: string;
  htmlUrl: string;
  stats: { files: number; additions: number; deletions: number };
  files: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    patch?: string;
  }>;
  commits: Array<{ sha: string; message: string }>;
  headRef: string;
  baseRef: string;
};

export async function generateAiDescription({
  pr,
  issues,
  tech,
  apiKey,
  model,
}: {
  pr: PrBundle;
  issues: Record<string, any>;
  tech: Tech;
  apiKey: string;
  model: string;
}): Promise<string> {
  const client = new OpenAI({ apiKey });

  // 1) Build compact, token-friendly context from code changes
  const codeSignals = buildCodeSignals(pr, tech);

  // 2) System + task prompt that enforces sectioned output with minimal emojis
  const system = `You are a meticulous, concise code change summarizer for pull requests.
Write a compact Markdown description with these EXACT sections and emojis:
1) ✨ Most important changes
2) 💥 Breaking changes
3) 🐛 Fixes
4) ⚠️ Things to consider

Rules:
- Bullet lists only, 1–5 bullets per section.
- Prefer concrete details: APIs, routes, types, schemas, env vars, migrations.
- If a section has nothing relevant, write "—".
- Use at most ~2 emojis total per section (the heading emoji counts as one).
- Mention Jira context briefly when useful, but don't bloat.`;

  const issueList = Object.values(issues || {}) as Jira[];
  const relatedIssues = issueList
    .filter((it): it is NonNullable<Jira> => Boolean(it))
    .slice(0, 20)
    .map((it) => `- ${it.key}: ${it.title} [${it.status ?? 'n/a'}]`)
    .join('\n');

  const user = [
    `PR: #${pr.number} | ${pr.title}`,
    `Scope: ${pr.stats.files} files, +${pr.stats.additions}/-${pr.stats.deletions}`,
    relatedIssues
      ? `Related Jira issues:\n${relatedIssues}`
      : `Related Jira issues: none`,
    '=== CODE SIGNALS ===',
    codeSignals,
  ].join('\n');

  const format = [
    `### ✨ Most important changes
- {bullets}

### 💥 Breaking changes
- {bullets}

### 🐛 Fixes
- {bullets}

### ⚠️ Things to consider
- {bullets}`,
  ].join('\n\n');

  const res = await client.responses.create({
    model,
    temperature: 0.15,
    max_output_tokens: 650,
    input: [
      { role: 'system', content: system },
      {
        role: 'user',
        content: `Create the description using this skeleton exactly:\n\n${format}\n\nContext:\n${user}`,
      },
    ],
  });

  const out = (res.output_text ?? '').trim();
  return validateSections(out) ? out : fallbackSections(pr, issueList, tech);
}

// Build compact signals from diffs + commits without pasting giant patches
function buildCodeSignals(pr: PrBundle, tech: Tech): string {
  const topFiles = pr.files.slice(0, 60); // cap to avoid token blowup
  const fileLines = topFiles
    .map((f) => {
      const hints: string[] = [];
      // quick regex probes inside patch (truncated by your fetcher)
      if (f.patch) {
        if (/\b(GET|POST|PUT|DELETE)\b.*\//.test(f.patch))
          hints.push('route-change');
        if (/^-\s*export\s+/m.test(f.patch)) hints.push('removed-export');
        if (/\bDROP\b|\bRENAME COLUMN\b|\bSET NOT NULL\b/i.test(f.patch))
          hints.push('migration-risk');
        if (/process\.env|ENV|secrets?/i.test(f.patch)) hints.push('env-var');
        if (/GraphQL|schema|type\s+\w+|@ObjectType|@Field/.test(f.patch))
          hints.push('schema-change');
      }
      const tag = hints.length ? ` [${hints.join(',')}]` : '';
      return `• ${f.status.toUpperCase()} ${f.filename} (+${f.additions}/-${
        f.deletions
      })${tag}`;
    })
    .join('\n');

  const cc = pr.commits
    .slice(0, 30)
    .map((c) => c.message.split('\n')[0])
    .filter(Boolean);

  const breakingFromCommits = cc
    .filter((m) => /BREAKING CHANGE|!:/.test(m))
    .map((m) => `• ${m}`)
    .join('\n');

  const depMajors = tech.depMajors.length
    ? `Major deps: ${tech.depMajors.join(', ')}`
    : '';

  const risky = tech.riskyHits.length
    ? `Risky areas: ${tech.riskyHits.slice(0, 12).join(', ')}`
    : '';

  const hints = tech.breakingHints.length
    ? `Heuristic breaking hints:\n${tech.breakingHints
        .slice(0, 10)
        .map((x) => `• ${x}`)
        .join('\n')}`
    : '';

  return [
    `Top components: ${tech.topDirs.join(', ') || '—'}`,
    depMajors,
    risky,
    hints,
    breakingFromCommits
      ? `Conventional commit signals:\n${breakingFromCommits}`
      : '',
    `Files (${Math.min(pr.files.length, 60)} of ${pr.files.length} shown):`,
    fileLines,
  ]
    .filter(Boolean)
    .join('\n');
}

function validateSections(md: string): boolean {
  return (
    /### ✨ Most important changes/i.test(md) &&
    /### 💥 Breaking changes/i.test(md) &&
    /### 🐛 Fixes/i.test(md) &&
    /### ⚠️ Things to consider/i.test(md)
  );
}

function fallbackSections(pr: PrBundle, issues: Jira[], tech: Tech): string {
  // Simple heuristic fallback that fills sections with your existing signals
  const important = [
    `• Scope: ${pr.stats.files} files, +${pr.stats.additions}/-${pr.stats.deletions}`,
    tech.topDirs[0] ? `• Main components: ${tech.topDirs.join(', ')}` : '',
  ].filter(Boolean);
  const breaking = tech.breakingHints.length
    ? tech.breakingHints.slice(0, 6).map((x) => `• ${x}`)
    : ['• —'];
  const fixes = pr.commits
    .map((c) => c.message.split('\n')[0])
    .filter((m) => /\bfix|bug|hotfix\b/i.test(m))
    .slice(0, 5)
    .map((m) => `• ${m}`);
  if (fixes.length === 0) fixes.push('• —');
  const linkedIssues = (issues || [])
    .filter((it): it is NonNullable<Jira> => Boolean(it))
    .map((it) =>
      `• ${it.key}: ${it.title}${it.status ? ` [${it.status}]` : ''}`,
    );
  const consider = [
    tech.depMajors.length
      ? `• Major dependency bumps: ${tech.depMajors.join(', ')}`
      : '',
    ...linkedIssues,
  ].filter(Boolean);
  if (linkedIssues.length === 0) {
    consider.push('• No linked issue context found');
  }
  if (consider.length === 0) consider.push('• —');

  return [
    `### ✨ Most important changes
${important.join('\n')}

### 💥 Breaking changes
${breaking.join('\n')}

### 🐛 Fixes
${fixes.join('\n')}

### ⚠️ Things to consider
${consider.join('\n')}`,
  ].join('\n\n');
}

function truncate(s: string, n: number) {
  return s && s.length > n ? s.slice(0, n - 1) + '…' : s;
}
