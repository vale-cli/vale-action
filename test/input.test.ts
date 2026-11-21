import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parse } from '../src/input';

test('parse splits flags on whitespace', () => {
  assert.deepEqual(parse('  --glob=*.md   --no-global '), [
    '--glob=*.md',
    '--no-global'
  ]);
  assert.deepEqual(parse(''), []);
});

test('parse keeps a quoted filter in one piece', () => {
  assert.deepEqual(parse(`--filter='.Level == "error"' --no-exit`), [
    '--filter=.Level == "error"',
    '--no-exit'
  ]);
});

test('parse keeps an empty quoted value', () => {
  assert.deepEqual(parse(`--glob='' --no-global`), ['--glob=', '--no-global']);
  assert.deepEqual(parse(`""`), ['']);
});

test('parse leaves backslashes alone', () => {
  assert.deepEqual(parse('--config=docs\\.vale.ini'), [
    '--config=docs\\.vale.ini'
  ]);
});

test('parse rejects an unbalanced quote', () => {
  assert.throws(() => parse(`--filter='.Level`), /Unbalanced '/);
});
