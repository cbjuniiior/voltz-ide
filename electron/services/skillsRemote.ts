import https from 'node:https';

export interface RemoteFile {
  /** Caminho relativo à raiz da skill (ex.: 'SKILL.md', 'reference/typography.md'). */
  relPath: string;
  content: string;
}

const UA = 'voltz-ide';
// Tetos de segurança — uma skill copiável é só markdown leve.
const MAX_FILES = 80;
const MAX_FILE_BYTES = 512 * 1024;       // 512 KB por arquivo
const MAX_TOTAL_BYTES = 4 * 1024 * 1024; // 4 MB no total

function httpGet(url: string, headers: Record<string, string> = {}, redirects = 0): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    if (redirects > 5) { reject(new Error('redirecionamentos demais')); return; }
    const req = https.get(url, { headers: { 'User-Agent': UA, ...headers } }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        httpGet(next, headers, redirects + 1).then(resolve, reject);
        return;
      }
      let data = '';
      let bytes = 0;
      res.setEncoding('utf8');
      res.on('data', (c: string) => {
        bytes += Buffer.byteLength(c, 'utf8');
        if (bytes > MAX_FILE_BYTES) { req.destroy(new Error('arquivo grande demais')); return; }
        data += c;
      });
      res.on('end', () => resolve({ status, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(20_000, () => req.destroy(new Error('timeout ao baixar do GitHub')));
  });
}

interface TreeResp {
  tree?: Array<{ path: string; type: string; size?: number }>;
  truncated?: boolean;
}

/** Lista todos os caminhos de arquivo (blobs) de um repo numa branch. */
export async function fetchRepoBlobPaths(owner: string, repo: string, branch: string): Promise<string[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
  const { status, body } = await httpGet(url, { Accept: 'application/vnd.github+json' });
  if (status === 403) throw new Error('GitHub recusou (rate limit). Tente novamente em alguns minutos.');
  if (status !== 200) throw new Error(`GitHub API respondeu ${status}.`);
  const json = JSON.parse(body) as TreeResp;
  return (json.tree ?? []).filter((t) => t.type === 'blob').map((t) => t.path);
}

/** Baixa o conteúdo cru de um arquivo. */
export async function fetchRawFile(owner: string, repo: string, branch: string, filePath: string): Promise<string> {
  const encoded = filePath.split('/').map(encodeURIComponent).join('/');
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${encoded}`;
  const { status, body } = await httpGet(url);
  if (status !== 200) throw new Error(`Falha ao baixar ${filePath} (${status}).`);
  return body;
}

/**
 * Baixa todos os arquivos sob `folder` de um repo. Os relPaths retornados são
 * relativos a `folder`. Opcionalmente filtra só arquivos de texto/markdown.
 */
export async function fetchFolder(
  owner: string, repo: string, branch: string, folder: string,
  opts: { mdOnly?: boolean } = {},
): Promise<RemoteFile[]> {
  const allPaths = await fetchRepoBlobPaths(owner, repo, branch);
  const prefix = folder.replace(/^\/+|\/+$/g, '') + '/';
  let wanted = allPaths.filter((p) => p.startsWith(prefix));
  if (opts.mdOnly) {
    wanted = wanted.filter((p) => /\.(md|markdown|txt|json|ya?ml)$/i.test(p));
  }
  if (wanted.length === 0) throw new Error(`Nada encontrado em ${folder}.`);
  if (wanted.length > MAX_FILES) wanted = wanted.slice(0, MAX_FILES);

  const files: RemoteFile[] = [];
  let total = 0;
  for (const p of wanted) {
    const content = await fetchRawFile(owner, repo, branch, p);
    total += Buffer.byteLength(content, 'utf8');
    if (total > MAX_TOTAL_BYTES) break;
    files.push({ relPath: p.slice(prefix.length), content });
  }
  return files;
}

/**
 * Baixa, em UMA única chamada à tree API, todas as skills (subpastas com
 * SKILL.md) sob `folder`. Retorna uma lista de { id (nome da subpasta), files }.
 */
export async function fetchFolderOfSkills(
  owner: string, repo: string, branch: string, folder: string,
): Promise<Array<{ id: string; files: RemoteFile[] }>> {
  const allPaths = await fetchRepoBlobPaths(owner, repo, branch);
  const prefix = folder.replace(/^\/+|\/+$/g, '') + '/';
  const groups = new Map<string, string[]>();
  for (const p of allPaths) {
    if (!p.startsWith(prefix)) continue;
    const seg = p.slice(prefix.length).split('/');
    if (seg.length < 2) continue; // arquivo solto na pasta, não é uma skill
    const sub = seg[0];
    if (!groups.has(sub)) groups.set(sub, []);
    groups.get(sub)!.push(p);
  }
  const out: Array<{ id: string; files: RemoteFile[] }> = [];
  for (const [sub, paths] of groups) {
    if (!paths.some((p) => /\/SKILL\.md$/i.test(p))) continue; // só pastas com SKILL.md
    const subPrefix = prefix + sub + '/';
    const files: RemoteFile[] = [];
    let bytes = 0;
    for (const p of paths.slice(0, MAX_FILES)) {
      const content = await fetchRawFile(owner, repo, branch, p);
      bytes += Buffer.byteLength(content, 'utf8');
      if (bytes > MAX_TOTAL_BYTES) break;
      files.push({ relPath: p.slice(subPrefix.length), content });
    }
    if (files.length) out.push({ id: sub, files });
  }
  return out;
}
