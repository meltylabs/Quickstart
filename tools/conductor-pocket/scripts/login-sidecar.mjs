import { withOperationLock } from '../src/operation-lock.mjs';
import {
  assertSidecarLaunchProfile,
  assertSupportedStatusVersion,
  assertSupportedTailscaleVersion,
  formulaBinaries,
  readSidecarStatus,
  run,
  sidecarLoginOutcome,
} from './lib/sidecar.mjs';
import {
  presentSidecarLogin,
  requestSidecarLogin,
  sidecarUpArguments,
} from './lib/login.mjs';

async function login() {
  const argumentsList = process.argv.slice(2);
  if (
    argumentsList.some((argument) => argument !== '--print-url') ||
    argumentsList.filter((argument) => argument === '--print-url').length > 1
  ) {
    throw new Error('Usage: npm run sidecar:login -- [--print-url]');
  }
  const printUrl = argumentsList.includes('--print-url');
  const { cli, daemon } = await formulaBinaries();
  await assertSupportedTailscaleVersion(cli);
  await assertSidecarLaunchProfile(daemon);
  const initialStatus = await readSidecarStatus();
  assertSupportedStatusVersion(initialStatus);
  const initialOutcome = sidecarLoginOutcome(initialStatus);
  if (initialOutcome?.authUrl) {
    await presentSidecarLogin(initialOutcome, { printUrl });
    return;
  }
  if (initialStatus.BackendState === 'Running') {
    await run(cli, sidecarUpArguments());
    const status = await readSidecarStatus();
    assertSupportedStatusVersion(status);
    if (status.BackendState !== 'Running') {
      throw new Error(
        'The dedicated Tailscale node stopped running while its safety settings were applied',
      );
    }
    await presentSidecarLogin({ status, authUrl: null }, { printUrl });
    return;
  }

  const outcome = await requestSidecarLogin(cli);
  assertSupportedStatusVersion(outcome.status);
  await presentSidecarLogin(outcome, { printUrl });
}

withOperationLock('authenticate the dedicated Tailscale sidecar', login).catch(
  (error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  },
);
