import * as github from '@actions/github';

type OctokitClient = ReturnType<typeof github.getOctokit>;
type GhContext = typeof github.context;

const MARKER = '<!-- pr-synth:v1 -->';

export async function upsertComment(
  octokit: OctokitClient,
  context: GhContext,
  body: string,
  update = true
) {
  const { owner, repo } = context.repo;
  const number = context.payload.pull_request!.number;

  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number: number,
    per_page: 100,
  });

  const existing = comments.find((c) => c.body?.includes(MARKER));
  if (existing && update) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
  } else {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: number,
      body,
    });
  }
}
