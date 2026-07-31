import fs from 'node:fs/promises';
import path from 'node:path';
import {
  SIDECAR_DIRECTORY,
  SIDECAR_LABEL,
  SIDECAR_LAUNCH_AGENT_PATH,
  assertSupportedStatusVersion,
  assertSupportedTailscaleVersion,
  bootoutIfLoaded,
  formulaBinaries,
  removeVerifiedStaleSocket,
  run,
  sidecarDaemonArguments,
  waitForLaunchdRemoval,
  waitForSidecarResponse,
  writePrivateFile,
  xml,
} from './lib/sidecar.mjs';
import { withOperationLock } from '../src/operation-lock.mjs';

process.umask(0o077);

async function install() {
  const { cli, daemon } = await formulaBinaries();
  const tailscaleVersion = await assertSupportedTailscaleVersion(cli);
  await fs.mkdir(SIDECAR_DIRECTORY, { recursive: true, mode: 0o700 });
  await fs.chmod(SIDECAR_DIRECTORY, 0o700);

  const stdoutPath = path.join(SIDECAR_DIRECTORY, 'tailscaled.out.log');
  const stderrPath = path.join(SIDECAR_DIRECTORY, 'tailscaled.err.log');
  for (const logPath of [stdoutPath, stderrPath]) {
    const handle = await fs.open(logPath, 'a', 0o600);
    await handle.close();
    await fs.chmod(logPath, 0o600);
  }

  const daemonArguments = sidecarDaemonArguments(daemon);
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${SIDECAR_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${daemonArguments.map((argument) => `    <string>${xml(argument)}</string>`).join('\n')}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ProcessType</key>
  <string>Background</string>
  <key>Umask</key>
  <integer>63</integer>
  <key>StandardOutPath</key>
  <string>${xml(stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(stderrPath)}</string>
</dict>
</plist>
`;
  let previousPlist = null;
  try {
    previousPlist = await fs.readFile(SIDECAR_LAUNCH_AGENT_PATH, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  let previousJobWasLoaded = false;
  let plistReplaced = false;
  let status;
  try {
    await writePrivateFile(SIDECAR_LAUNCH_AGENT_PATH, plist);
    plistReplaced = true;
    previousJobWasLoaded = await bootoutIfLoaded(SIDECAR_LABEL);
    await waitForLaunchdRemoval(SIDECAR_LABEL);
    await removeVerifiedStaleSocket();
    await run('/bin/launchctl', [
      'bootstrap',
      `gui/${process.getuid()}`,
      SIDECAR_LAUNCH_AGENT_PATH,
    ]);
    status = await waitForSidecarResponse();
    assertSupportedStatusVersion(status);
  } catch (primaryError) {
    if (!plistReplaced) throw primaryError;
    try {
      await bootoutIfLoaded(SIDECAR_LABEL);
      await waitForLaunchdRemoval(SIDECAR_LABEL);
      await removeVerifiedStaleSocket();
      if (previousPlist == null) {
        await fs.unlink(SIDECAR_LAUNCH_AGENT_PATH).catch((error) => {
          if (error?.code !== 'ENOENT') throw error;
        });
        if (previousJobWasLoaded) {
          throw new Error('The prior sidecar job had no restorable LaunchAgent');
        }
      } else {
        await writePrivateFile(SIDECAR_LAUNCH_AGENT_PATH, previousPlist);
        if (previousJobWasLoaded) {
          await run('/bin/launchctl', [
            'bootstrap',
            `gui/${process.getuid()}`,
            SIDECAR_LAUNCH_AGENT_PATH,
          ]);
          await waitForSidecarResponse();
        }
      }
    } catch (rollbackError) {
      throw new AggregateError(
        [primaryError, rollbackError],
        'The sidecar install failed and the previous LaunchAgent could not be restored',
      );
    }
    throw primaryError;
  }

  const state = status?.BackendState || 'Starting';
  process.stdout.write(`Dedicated Conductor Pocket Tailscale node installed.

LaunchAgent: ${SIDECAR_LAUNCH_AGENT_PATH}
State directory: ${SIDECAR_DIRECTORY}
Backend state: ${state}
Tailscale version: ${tailscaleVersion}

${
  state === 'Running'
    ? 'The dedicated node is already authenticated. Next: npm run sidecar:cutover'
    : 'Authenticate it once with: npm run sidecar:login'
}
`);
}

withOperationLock('install dedicated Tailscale sidecar', install).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
