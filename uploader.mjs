import fs from 'fs';
import path from 'path';

const TOKEN = process.env.GH_TOKEN;
const OWNER = 'Blazzzz-88';
const REPO = 'Dopamine.gg';
const BRANCH = 'main';

const IGNORED_DIRS = new Set(['node_modules', 'dist', '.git', 'scripts']);
const IGNORED_FILES = new Set(['.env', '.env.local', 'Dopamine.gg.zip', 'tsconfig.tsbuildinfo']);

async function getLatestCommitSha() {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
    headers: {
      Authorization: `token ${TOKEN}`,
      'User-Agent': 'NodeUploader',
      Accept: 'application/vnd.github.v3+json',
    },
  });
  if (!res.ok) throw new Error(`Refs failed: ${res.statusText}`);
  const data = await res.json();
  return data.object.sha;
}

function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (IGNORED_DIRS.has(file) || IGNORED_FILES.has(file)) continue;
    if (file.endsWith('.zip') || file.endsWith('.tsbuildinfo')) continue;

    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      getAllFiles(fullPath, fileList);
    } else {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

async function uploadBlob(filePath) {
  const content = fs.readFileSync(filePath);
  const base64Content = content.toString('base64');

  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/blobs`, {
    method: 'POST',
    headers: {
      Authorization: `token ${TOKEN}`,
      'User-Agent': 'NodeUploader',
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github.v3+json',
    },
    body: JSON.stringify({
      content: base64Content,
      encoding: 'base64',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Blob upload failed for ${filePath}: ${err}`);
  }
  const data = await res.json();
  return data.sha;
}

async function main() {
  console.log('Récupération du dernier commit sur GitHub...');
  const baseCommitSha = await getLatestCommitSha();
  console.log(`Commit de base : ${baseCommitSha}`);

  const rootDir = process.cwd();
  const files = getAllFiles(rootDir);
  console.log(`Nombre total de fichiers à envoyer : ${files.length}`);

  const treeEntries = [];
  let count = 0;

  for (const file of files) {
    const relPath = path.relative(rootDir, file).replace(/\\/g, '/');
    const sha = await uploadBlob(file);
    treeEntries.push({
      path: relPath,
      mode: '100644',
      type: 'blob',
      sha,
    });
    count++;
    if (count % 25 === 0 || count === files.length) {
      console.log(`Avancement : ${count} / ${files.length} fichiers téléversés`);
    }
  }

  console.log('Création de l\'arborescence Git (Tree)...');
  const treeRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/trees`, {
    method: 'POST',
    headers: {
      Authorization: `token ${TOKEN}`,
      'User-Agent': 'NodeUploader',
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github.v3+json',
    },
    body: JSON.stringify({
      base_tree: baseCommitSha,
      tree: treeEntries,
    }),
  });

  if (!treeRes.ok) throw new Error(await treeRes.text());
  const treeData = await treeRes.json();

  console.log('Création du Commit...');
  const commitRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/commits`, {
    method: 'POST',
    headers: {
      Authorization: `token ${TOKEN}`,
      'User-Agent': 'NodeUploader',
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github.v3+json',
    },
    body: JSON.stringify({
      message: 'Initialisation Dopamine.gg avec Supabase Cloud Sync & 3D WebGL',
      tree: treeData.sha,
      parents: [baseCommitSha],
    }),
  });

  if (!commitRes.ok) throw new Error(await commitRes.text());
  const commitData = await commitRes.json();

  console.log('Mise à jour de la branche main...');
  const refRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
    method: 'PATCH',
    headers: {
      Authorization: `token ${TOKEN}`,
      'User-Agent': 'NodeUploader',
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github.v3+json',
    },
    body: JSON.stringify({
      sha: commitData.sha,
      force: true,
    }),
  });

  if (!refRes.ok) throw new Error(await refRes.text());
  console.log('SUCCÈS TOTAL ! Tout le code est désormais en ligne sur GitHub !');
}

main().catch(console.error);
