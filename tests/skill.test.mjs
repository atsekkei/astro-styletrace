import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('astro-styletrace skill is discoverable by skills cli conventions', async () => {
  const skill = await readFile('.agents/skills/astro-styletrace/SKILL.md', 'utf8');
  assert.match(skill, /^---\nname: astro-styletrace\n/m);
  assert.match(skill, /^description: .+astro-styletrace.+/m);
  assert.match(skill, /Read `\.astro-styletrace\/handoff\.md` first\./);
});

test('astro-styletrace skill has OpenAI interface metadata', async () => {
  const metadata = await readFile('.agents/skills/astro-styletrace/agents/openai.yaml', 'utf8');
  assert.match(metadata, /display_name: "astro-styletrace"/);
  assert.match(metadata, /default_prompt: "Use \$astro-styletrace/);
});
