import * as core from '@actions/core';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * What reviewdog says when it reaches GitHub's limit on annotations.
 *
 * The wording has held since 0.17, and only the code that hits the limit
 * prints it -- which matters, because the failure it reports is worded the
 * same as the ones we do want to fail on.
 */
export const TOO_MANY = 'Too many results (annotations) in diff';

/**
 * `atAnnotationLimit` reports whether reviewdog gave up on showing them all.
 *
 * It fails the run when it does, to say that the rest won't appear -- which
 * says nothing about the prose, and shouldn't decide the job either way.
 */
export function atAnnotationLimit(stdout: string, stderr: string): boolean {
  return stdout.includes(TOO_MANY) || stderr.includes(TOO_MANY);
}

/**
 * The first reviewdog that can fail on a severity rather than on anything.
 */
export const FAIL_LEVEL_SINCE = [0, 21, 0];

/**
 * `atLeast` compares a reported version against one we need.
 */
export function atLeast(version: string, minimum: number[]): boolean {
  const parts = version.split('.').map(p => parseInt(p, 10));

  for (let i = 0; i < minimum.length; i++) {
    if (isNaN(parts[i])) {
      return false;
    } else if (parts[i] !== minimum[i]) {
      return parts[i] > minimum[i];
    }
  }

  return true;
}

/**
 * `eventPath` is the event payload to hand reviewdog.
 *
 * reviewdog takes the repository's owner and name from the payload and from
 * nowhere else -- there's no fall back to `GITHUB_REPOSITORY`, the way there
 * is for the commit. A runner that writes a thin payload, as some do for a
 * scheduled run, leaves it posting to `/repos///check-runs`.
 *
 * So when the payload doesn't name a repository, we hand reviewdog a copy
 * that does. Everything else about it is left alone, and a payload that
 * already names one is passed through untouched.
 *
 * See https://github.com/reviewdog/reviewdog/issues/832.
 */
export function eventPath(): string | undefined {
  const original = process.env['GITHUB_EVENT_PATH'];
  const slug = process.env['GITHUB_REPOSITORY'];

  if (!original || !slug || !fs.existsSync(original)) {
    return original;
  }

  let event: { repository?: { name?: string; owner?: { login?: string } } };
  try {
    event = JSON.parse(fs.readFileSync(original, 'utf8'));
  } catch (error) {
    core.debug(`Unable to read ${original}: ${error}`);
    return original;
  }

  if (event.repository?.name && event.repository?.owner?.login) {
    return original;
  }

  const [owner, name] = slug.split('/');
  if (!owner || !name) {
    return original;
  }

  event.repository = {
    ...event.repository,
    name,
    owner: { ...event.repository?.owner, login: owner }
  };

  const patched = path.join(
    process.env['RUNNER_TEMP'] || os.tmpdir(),
    'vale-action-event.json'
  );
  fs.writeFileSync(patched, JSON.stringify(event));

  core.debug(`The event payload doesn't name a repository; using ${patched}.`);
  return patched;
}
