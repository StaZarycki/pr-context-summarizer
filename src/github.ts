import * as github from '@actions/github';

type OctokitClient = ReturnType<typeof github.getOctokit>;
type GhContext = typeof github.context;

export async function fetchPrBundle(
  octokit: OctokitClient,
  context: GhContext,
  maxFiles: number,
  maxDiffBytes: number
) {
  const { owner, repo } = context.repo;
  const number = context.payload.pull_request!.number;

  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: number,
  });

  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: number,
    per_page: 100,
  });

  const limited = files.slice(0, maxFiles).map((f) => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    patch:
      f.patch && Buffer.byteLength(f.patch, 'utf8') > maxDiffBytes
        ? undefined
        : f.patch,
  }));

  const commits = await octokit.paginate(octokit.rest.pulls.listCommits, {
    owner,
    repo,
    pull_number: number,
    per_page: 100,
  });

  return {
    number,
    title: pr.title,
    body: pr.body ?? '',
    author: pr.user?.login ?? '',
    htmlUrl: pr.html_url ?? '',
    headRef: pr.head.ref,
    baseRef: pr.base.ref,
    isDraft: !!pr.draft,
    files: limited,
    commits: commits.map((c) => ({ sha: c.sha, message: c.commit.message })),
    stats: {
      files: files.length,
      additions: pr.additions,
      deletions: pr.deletions,
    },
  };
}
