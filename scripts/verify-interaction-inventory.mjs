import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const inventoryPath = path.join(root, 'apps', 'web', 'src', 'lib', 'interaction-inventory.ts');
const ownedSurfaceFiles = [
  path.join(root, 'apps', 'web', 'app', '(workspace)', 'new-chat', 'page.tsx'),
  path.join(root, 'apps', 'web', 'app', 'components', 'connected-golden-run.tsx'),
];

const inventorySource = await readFile(inventoryPath, 'utf8');
const inventory = new Map();
for (const match of inventorySource.matchAll(/\{([\s\S]*?)\}/g)) {
  const id = match[1].match(/\bid:\s*'([^']+)'/);
  if (id) inventory.set(id[1], { automated: /automated:\s*true/.test(match[1]) });
}

const rendered = new Map();
for (const file of ownedSurfaceFiles) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/data-interaction-id=["']([^"']+)["']/g)) {
    const id = match[1];
    const list = rendered.get(id) ?? [];
    list.push(path.relative(root, file));
    rendered.set(id, list);
  }
}

const errors = [];
for (const [id, files] of rendered) {
  const entry = inventory.get(id);
  if (!entry)
    errors.push(`Rendered interaction ${id} is missing from the inventory (${files.join(', ')}).`);
  else if (!entry.automated)
    errors.push(`Rendered interaction ${id} is not marked for automated coverage.`);
}
for (const [id, entry] of inventory) {
  if (entry.automated && id.startsWith('connected-') && !rendered.has(id)) {
    errors.push(`Automated Golden Run interaction ${id} has no rendered coverage marker.`);
  }
}

if (errors.length > 0) {
  console.error(
    ['Interaction inventory check failed:', ...errors.map((error) => `- ${error}`)].join('\n'),
  );
  process.exitCode = 1;
} else {
  console.log(
    `Interaction inventory check passed: ${rendered.size} rendered interactions verified.`,
  );
}
