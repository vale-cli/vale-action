import assert from 'node:assert/strict';
import { test } from 'node:test';
import { configFlags } from '../src/fix';

test('configFlags keeps only the flags that pick a configuration', () => {
  assert.deepEqual(
    configFlags([
      '--glob=*.md',
      '--config=docs/.vale.ini',
      '--minAlertLevel=error',
      '--no-global'
    ]),
    ['--config=docs/.vale.ini', '--no-global']
  );
});

test('configFlags keeps the value of a spaced --config', () => {
  assert.deepEqual(configFlags(['--config', 'docs/.vale.ini', '--glob=*.md']), [
    '--config',
    'docs/.vale.ini'
  ]);
});

test('configFlags handles a trailing --config with no value', () => {
  assert.deepEqual(configFlags(['--config']), ['--config']);
});
