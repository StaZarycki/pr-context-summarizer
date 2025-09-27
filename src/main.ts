import * as core from '@actions/core';
import * as github from '@actions/github';
import { fetchPrBundle } from './github.js';
import { fetchJiraIssue } from './jira.js';
import { analyze } from './heuristics.js';
import { render } from './render.js';
import { upsertComment } from './comment.js';

type OctokitClient = ReturnType<typeof github.getOctokit>;

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
  const keys = extractKeys(
    [pr.title, pr.headRef, pr.baseRef],
    inputs.issueKeyPattern
  );
  const primaryKey = keys[0];

  let issue: any = null;
  let businessWarn: string | null = null;

  if (primaryKey) {
    try {
      issue = await fetchJiraIssue(inputs, primaryKey);
    } catch (e: any) {
      businessWarn = `⚠️ Jira fetch failed: ${e.message ?? String(e)}`;
    }
  } else {
    businessWarn = '⚠️ No issue key found in PR title/branch.';
  }

  const tech = analyze(pr);
  const body = render({ pr, issue, tech, keys, businessWarn });
  await upsertComment(octokit, context, body, inputs.updateExistingComment);
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
