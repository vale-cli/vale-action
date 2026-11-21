import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, test } from 'node:test';
import { verify } from '../src/install';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vale-action-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const asset = 'vale_3.0.0_Linux_64-bit.tar.gz';
const archive = path.join(dir, 'archive');
fs.writeFileSync(archive, 'vale');
const digest = crypto.createHash('sha256').update('vale').digest('hex');

function list(contents: string): string {
  const p = path.join(dir, `checksums-${crypto.randomUUID()}.txt`);
  fs.writeFileSync(p, contents);
  return p;
}

test('verify accepts an archive that matches its checksum', () => {
  const p = list(`${'0'.repeat(64)}  other.zip\n${digest}  ${asset}\n`);
  assert.doesNotThrow(() => verify(archive, p, 'checksums.txt', asset));
});

test('verify rejects an archive that does not match', () => {
  const p = list(`${'0'.repeat(64)}  ${asset}\n`);
  assert.throws(
    () => verify(archive, p, 'checksums.txt', asset),
    /doesn't match its published checksum/
  );
});

test('verify rejects an asset the list does not name', () => {
  const p = list(`${digest}  vale_3.0.0_macOS_arm64.tar.gz\n`);
  assert.throws(
    () => verify(archive, p, 'checksums.txt', asset),
    /isn't listed in checksums.txt/
  );
});

test('verify does not match an asset by suffix alone', () => {
  const p = list(`${digest}  x${asset}\n`);
  assert.throws(() => verify(archive, p, 'checksums.txt', asset), /isn't listed/);
});
