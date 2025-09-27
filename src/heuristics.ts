export function analyze(pr: any) {
  const riskPaths = [
    /^migrations?\//,
    /^infrastructure\//,
    /^helm\//,
    /^terraform\//,
    /^src\/graphql\//,
    /^api\//,
  ];
  const components = new Map<string, number>();
  let riskyHits: string[] = [];
  let breakingHints: string[] = [];
  let depMajors: string[] = [];

  for (const f of pr.files) {
    const top = (f.filename.split('/')[0] || '').toLowerCase();
    components.set(top, (components.get(top) || 0) + 1);

    if (riskPaths.some((rx) => rx.test(f.filename))) riskyHits.push(f.filename);

    if (f.filename.endsWith('.ts') && f.patch) {
      const removedExports = (
        f.patch.match(
          /^-\s*export\s+(?:function|class|type|interface|const)\s+/gm
        ) || []
      ).length;
      if (removedExports)
        breakingHints.push(
          `${f.filename}: ${removedExports} exported symbol(s) removed`
        );
      const routeChange = f.patch.match(
        /^[+-].*(?:@Get|@Post|@Put|@Delete|\brouter\.(get|post|put|delete)\(|app\.(get|post|put|delete)\().*$/m
      );
      if (routeChange)
        breakingHints.push(`${f.filename}: possible route/interface change`);
    }

    if (f.filename.endsWith('package.json') && f.patch) {
      const major = [...f.patch.matchAll(/"([^"]+)":\s*"(\d+)\.(\d+)\.(\d+)"/g)]
        .filter(([, , maj]) => parseInt(maj) >= 1) // simplistic; surface all majors
        .map(([_, name, maj]) => `${name}@${maj}.x`);
      if (major.length) depMajors.push(...major);
    }

    if (/\bDROP\b|\bRENAME COLUMN\b|\bSET NOT NULL\b/i.test(f.patch || '')) {
      breakingHints.push(
        `${f.filename}: migration may drop/rename/tighten constraints`
      );
    }
  }

  const topDirs = [...components.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([d]) => d);
  return {
    riskyHits: uniq(riskyHits).slice(0, 15),
    breakingHints: uniq(breakingHints).slice(0, 10),
    depMajors: uniq(depMajors).slice(0, 10),
    topDirs,
  };
}

const uniq = <T>(a: T[]) => Array.from(new Set(a));
