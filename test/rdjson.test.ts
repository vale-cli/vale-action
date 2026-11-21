import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, test } from 'node:test';
import { Fixer, toDiagnostics, ValeAlert } from '../src/rdjson';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vale-action-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));

fs.writeFileSync(
  path.join(dir, 'test.md'),
  [
    'This has a typo in it.',
    'café typo here',
    '😀 typo here',
    'This is very very good.'
  ].join('\n')
);

function alert(fields: Partial<ValeAlert>): ValeAlert {
  return {
    Action: { Name: '', Params: null },
    Check: 'Vale.Spelling',
    Description: '',
    Line: 1,
    Link: '',
    Match: 'typo',
    Message: "Did you really mean 'typo'?",
    Severity: 'error',
    Span: [12, 15],
    ...fields
  };
}

const fixable = { Action: { Name: 'suggest', Params: ['spellings'] } };

test('columns are unchanged on an ASCII line', async () => {
  const [d] = await toDiagnostics(
    { 'test.md': [alert({})] },
    { cwd: dir, nameRuleInMessage: false }
  );
  assert.deepEqual(d.location.range, {
    start: { line: 1, column: 12 },
    end: { line: 1, column: 16 }
  });
});

test('columns are bytes after a multi-byte character', async () => {
  const [accent, emoji] = await toDiagnostics(
    {
      'test.md': [
        alert({ Line: 2, Span: [6, 9] }),
        alert({ Line: 3, Span: [3, 6] })
      ]
    },
    { cwd: dir, nameRuleInMessage: false }
  );
  // `é` is two bytes.
  assert.deepEqual(accent.location.range, {
    start: { line: 2, column: 7 },
    end: { line: 2, column: 11 }
  });
  // `😀` is four bytes and one character, though two UTF-16 units.
  assert.deepEqual(emoji.location.range, {
    start: { line: 3, column: 6 },
    end: { line: 3, column: 10 }
  });
});

test('a file that cannot be read keeps Vale\'s columns', async () => {
  const [d] = await toDiagnostics(
    { 'missing.md': [alert({ ...fixable })] },
    { cwd: dir, nameRuleInMessage: false, fix: async () => ['type'] }
  );
  assert.equal(d.location.range.start.column, 12);
  assert.equal(d.suggestions, undefined);
});

test('severity, code, and message', async () => {
  const [err, warn, info] = await toDiagnostics(
    {
      'test.md': [
        alert({ Link: 'https://vale.sh' }),
        alert({ Severity: 'warning' }),
        alert({ Severity: 'suggestion' })
      ]
    },
    { cwd: dir, nameRuleInMessage: true }
  );
  assert.equal(err.severity, 'ERROR');
  assert.equal(warn.severity, 'WARNING');
  assert.equal(info.severity, 'INFO');
  assert.deepEqual(err.code, { value: 'Vale.Spelling', url: 'https://vale.sh' });
  assert.deepEqual(warn.code, { value: 'Vale.Spelling' });
  assert.equal(err.message, "[Vale.Spelling] Did you really mean 'typo'?");
});

test('suggestions are capped at three', async () => {
  const [d] = await toDiagnostics(
    { 'test.md': [alert({ ...fixable })] },
    {
      cwd: dir,
      nameRuleInMessage: false,
      fix: async () => ['type', 'typos', 'top', 'toy']
    }
  );
  assert.deepEqual(
    d.suggestions?.map(s => s.text),
    ['type', 'typos', 'top']
  );
  assert.deepEqual(d.suggestions?.[0].range, d.location.range);
});

test('no lookup for an alert without an action', async () => {
  let calls = 0;
  const fix: Fixer = async () => {
    calls++;
    return ['type'];
  };
  const [d] = await toDiagnostics(
    { 'test.md': [alert({})] },
    { cwd: dir, nameRuleInMessage: false, fix }
  );
  assert.equal(calls, 0);
  assert.equal(d.suggestions, undefined);
});

test('no suggestion when the source does not hold the match', async () => {
  const [d] = await toDiagnostics(
    { 'test.md': [alert({ ...fixable, Match: 'tpyo' })] },
    { cwd: dir, nameRuleInMessage: false, fix: async () => ['type'] }
  );
  assert.equal(d.suggestions, undefined);
});

test('a removal takes the trailing space with it', async () => {
  const [d] = await toDiagnostics(
    {
      'test.md': [
        alert({
          Line: 4,
          Span: [9, 12],
          Match: 'very',
          Action: { Name: 'remove', Params: null }
        })
      ]
    },
    { cwd: dir, nameRuleInMessage: false, fix: async () => [''] }
  );
  assert.deepEqual(d.suggestions?.[0].range, {
    start: { line: 4, column: 9 },
    end: { line: 4, column: 14 }
  });
});

test('one lookup per alert, in output order', async () => {
  const alerts = Array.from({ length: 20 }, (_, i) =>
    alert({ ...fixable, Message: `m${i}` })
  );
  const got = await toDiagnostics(
    { 'test.md': alerts },
    { cwd: dir, nameRuleInMessage: false, fix: async a => [a.Message] }
  );
  assert.deepEqual(
    got.map(d => d.suggestions?.[0].text),
    alerts.map(a => a.Message)
  );
});
