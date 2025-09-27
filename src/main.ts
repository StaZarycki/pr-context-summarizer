import * as core from '@actions/core';
import * as github from '@actions/github';
import { fetchPrBundle } from './github.js';
import { fetchJiraIssue, fetchManyJiraIssues } from './jira.js';
import { analyze } from './heuristics.js';
import { render, renderWithAi } from './render.js';
import { upsertComment } from './comment.js';
import { generateAiDescription } from './llm.js';

type OctokitClient = ReturnType<typeof github.getOctokit>;

function extractAllKeys(pr: any, pattern: string): string[] {
  const rx = new RegExp(pattern, 'g');
  const sources = [
    pr.title,
    pr.headRef,
    pr.baseRef,
    ...pr.commits.map((c: any) => c.message),
    ...pr.files.map((f: any) => f.filename),
  ];
  const keys = new Set<string>();
  for (const s of sources) {
    if (!s) continue;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(s)) !== null)
      keys.add((m.groups?.key ?? m[0]).toUpperCase());
  }
  return [...keys].slice(0, 25); // cap to avoid spam
}

async function run() {
  const token =
    core.getInput('githubToken') ||
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN;

  if (!token) {
    core.setFailed('Missing GITHUB_TOKEN (or githubToken input).');
    return;
  }

  const octokit: OctokitClient = github.getOctokit(token);
  const { context } = github;

  if (!context.payload.pull_request) {
    core.info('Not a PR event, exiting.');
    return;
  }

  const issueKeyPattern =
    core.getInput('issueKeyPattern') || '(?<key>[A-Z]{2,}-\\d+)';
  const maxFiles = Number(core.getInput('maxFiles') || '200');
  const maxDiffBytes = Number(core.getInput('maxDiffBytes') || '350000');
  const updateExistingComment =
    (core.getInput('updateExistingComment') || 'true') === 'true';

  const inputs = {
    jiraBaseUrl: core.getInput('jiraBaseUrl', { required: true }),
    jiraEmail: core.getInput('jiraEmail', { required: true }),
    jiraApiToken: core.getInput('jiraApiToken', { required: true }),
    issueKeyPattern,
    maxFiles,
    maxDiffBytes,
    updateExistingComment,
  };

  const pr = await fetchPrBundle(
    octokit,
    context,
    inputs.maxFiles,
    inputs.maxDiffBytes
  );
  const keys = extractAllKeys(pr, inputs.issueKeyPattern);
  const primaryKey = keys[0];

  let issues: Record<string, any> = {};
  let primaryIssue: any = null;
  let businessWarn: string | null = null;

  if (keys.length) {
    issues = await fetchManyJiraIssues(inputs, keys);
    primaryIssue = issues[primaryKey] ?? null;
  } else {
    businessWarn = '⚠️ No issue keys found in title/branch/commits.';
  }

  const tech = analyze(pr);

  const openaiApiKey =
    core.getInput('openaiApiKey') || process.env.OPENAI_API_KEY || '';
  const openaiModel = core.getInput('openaiModel') || 'gpt-4o-mini';

  let body: string;
  if (openaiApiKey) {
    try {
      const aiDescription = await generateAiDescription({
        pr,
        issues,
        tech,
        apiKey: openaiApiKey,
        model: openaiModel,
      });
      body = renderWithAi({
        pr,
        issue: primaryIssue,
        keys,
        businessWarn,
        aiDescription,
        allIssues: issues,
      });
    } catch (e: any) {
      core.warning(
        `AI description failed: ${
          e.message ?? String(e)
        }; falling back to heuristic render.`
      );
      // Fallback to your existing render()
      body = render({ pr, issue: primaryIssue, tech, keys, businessWarn });
    }
  } else {
    body = render({ pr, issue: primaryIssue, tech, keys, businessWarn });
  }

  const dryRun = core.getInput('dryRun') === 'true';

  if (dryRun) {
    core.info(
      'Dry-run mode: writing summary to GitHub job summary instead of PR comment.'
    );
    await core.summary
      .addHeading('PR Context Summary (Dry Run)')
      .addRaw(body, true)
      .write();
  } else {
    await upsertComment(octokit, context, body, inputs.updateExistingComment);
  }
}

function extractKeys(
  fields: (string | undefined)[],
  pattern: string
): string[] {
  const rx = new RegExp(pattern, 'g');
  const keys = new Set<string>();
  for (const f of fields) {
    if (!f) continue;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(f)) !== null)
      keys.add((m.groups?.key ?? m[0]).toUpperCase());
  }
  return [...keys];
}

run().catch((err) =>
  core.setFailed(err instanceof Error ? err.message : String(err))
);
