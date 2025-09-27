type Inputs = { jiraBaseUrl: string; jiraEmail: string; jiraApiToken: string };

export async function fetchJiraIssue(inputs: Inputs, key: string) {
  const url = `${inputs.jiraBaseUrl}/rest/api/3/issue/${encodeURIComponent(
    key
  )}?fields=summary,description,priority,status,assignee,labels,customfield_10026,customfield_10020`;
  const res = await fetch(url, {
    headers: {
      Authorization:
        'Basic ' +
        Buffer.from(`${inputs.jiraEmail}:${inputs.jiraApiToken}`).toString(
          'base64'
        ),
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const j = await res.json();
  return {
    key,
    title: j.fields.summary,
    status: j.fields.status?.name,
    priority: j.fields.priority?.name,
    assignee: j.fields.assignee?.displayName,
    labels: j.fields.labels,
    estimate: j.fields.customfield_10026 ?? j.fields.customfield_10020 ?? null, // story points common IDs; safe fallback
    description: extractPlainText(j.fields.description),
  };
}

function extractPlainText(desc: any): string {
  // Jira Cloud often returns Atlassian Document Format (ADF)
  try {
    if (typeof desc === 'string') return desc;
    const walk = (n: any): string => {
      if (!n) return '';
      if (Array.isArray(n)) return n.map(walk).join('');
      if (n.type === 'text') return n.text || '';
      if (n.content) return walk(n.content);
      return '';
    };
    return walk(desc.content) || '';
  } catch {
    return '';
  }
}

export async function fetchManyJiraIssues(inputs: Inputs, keys: string[]) {
  const out: Record<string, any> = {};
  for (const key of keys) {
    try {
      out[key] = await fetchJiraIssue(inputs, key);
    } catch {
      /* ignore missing keys */
    }
  }
  return out;
}
