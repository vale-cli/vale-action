import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import {
  atAnnotationLimit,
  atLeast,
  eventPath,
  FAIL_LEVEL_SINCE,
  TOO_MANY
} from '../src/reviewdog';

test('atLeast compares versions part by part', () => {
  assert.equal(atLeast('0.21.0', FAIL_LEVEL_SINCE), true);
  assert.equal(atLeast('0.21.3', FAIL_LEVEL_SINCE), true);
  assert.equal(atLeast('0.22.0', FAIL_LEVEL_SINCE), true);
  assert.equal(atLeast('1.0.0', FAIL_LEVEL_SINCE), true);
  assert.equal(atLeast('0.20.9', FAIL_LEVEL_SINCE), false);
  assert.equal(atLeast('0.9.99', FAIL_LEVEL_SINCE), false);
});

test('atLeast treats an unreadable version as too old', () => {
  assert.equal(atLeast('', FAIL_LEVEL_SINCE), false);
  assert.equal(atLeast('master', FAIL_LEVEL_SINCE), false);
  assert.equal(atLeast('0.21', FAIL_LEVEL_SINCE), false);
});

test('atAnnotationLimit looks at both streams', () => {
  assert.equal(atAnnotationLimit(`x ${TOO_MANY} y`, ''), true);
  assert.equal(atAnnotationLimit('', `${TOO_MANY}`), true);
  assert.equal(atAnnotationLimit('reviewdog: failed', 'exit 1'), false);
});

const ENV = ['GITHUB_EVENT_PATH', 'GITHUB_REPOSITORY', 'RUNNER_TEMP'];
let saved: Record<string, string | undefined> = {};
let dir = '';

beforeEach(() => {
  saved = Object.fromEntries(ENV.map(k => [k, process.env[k]]));
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vale-action-'));
  process.env['RUNNER_TEMP'] = dir;
  process.env['GITHUB_REPOSITORY'] = 'acme/docs';
});

afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = saved[k];
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

function payload(event: object): string {
  const p = path.join(dir, 'event.json');
  fs.writeFileSync(p, JSON.stringify(event));
  process.env['GITHUB_EVENT_PATH'] = p;
  return p;
}

test('eventPath passes a complete payload through', () => {
  const p = payload({ repository: { name: 'docs', owner: { login: 'acme' } } });
  assert.equal(eventPath(), p);
});

test('eventPath fills in a payload with no repository', () => {
  const p = payload({ schedule: '0 0 * * *' });

  const got = eventPath();
  assert.notEqual(got, p);

  const event = JSON.parse(fs.readFileSync(got as string, 'utf8'));
  assert.equal(event.schedule, '0 0 * * *');
  assert.equal(event.repository.name, 'docs');
  assert.equal(event.repository.owner.login, 'acme');
});

test('eventPath keeps the rest of a partial repository', () => {
  payload({ repository: { id: 7, owner: { id: 9 } } });

  const event = JSON.parse(fs.readFileSync(eventPath() as string, 'utf8'));
  assert.equal(event.repository.id, 7);
  assert.equal(event.repository.owner.id, 9);
  assert.equal(event.repository.owner.login, 'acme');
});

test('eventPath leaves an unreadable payload alone', () => {
  const p = path.join(dir, 'event.json');
  fs.writeFileSync(p, '{not json');
  process.env['GITHUB_EVENT_PATH'] = p;
  assert.equal(eventPath(), p);
});

test('eventPath leaves a payload alone without a repository to add', () => {
  const p = payload({});
  delete process.env['GITHUB_REPOSITORY'];
  assert.equal(eventPath(), p);
});
