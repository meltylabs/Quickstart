# Conductor Pocket security

## Protected assets

- Conductor transcript content and tool activity.
- User-selected image pixels and their workspace attachment files.
- The ability to inject a user message into an existing agent session.
- Session/account selection, workspace paths, branches, and model metadata.
- Device passkeys and relay session tokens.

Codex, Claude, GitHub, and other provider credentials are not copied into
Pocket. They remain inside the processes and profiles Conductor already owns.

## Trust boundaries

### Trusted

- The host's logged-in macOS account and its local files.
- The installed Conductor application.
- The loopback interface.
- The dedicated Pocket Tailscale node and Serve proxy after its identity
  header is matched to the paired identity.
- The iPhone platform authenticator after WebAuthn user verification.

### Not trusted

- The public internet.
- The LAN.
- Other tailnet users or shared-device users.
- Browser origins other than the configured tailnet HTTPS origin.
- User-controlled transcript content, workspace names, chat titles, and
  message text.
- Requests replayed after uncertain network failures.

## Controls

### Network

The HTTP server refuses non-loopback binds in config validation. It validates
the Host header and accepts only the configured tailnet host or explicit
loopback development hosts. Tailscale Serve strips spoofed identity headers
before adding authenticated values.

Pocket runs a second, user-mode Tailscale node with a separate node key, IP,
MagicDNS name, certificate, state directory, Unix socket, and Serve
configuration. The normal Mac node is never addressed by the formula CLI, and
every sidecar CLI command carries the explicit private socket. The sidecar
uses userspace networking, accepts neither routes nor DNS, advertises no exit
node or subnet, and exposes exactly one tailnet-only HTTPS root proxy to the
loopback relay. The loaded LaunchAgent arguments and Unix-socket owner must
match the audited daemon profile; DNS, route, SSH, web-client, connector, and
advertising preferences fail closed. Funnel and extra handlers fail
validation.

The one-time sidecar authorization URL is read back from that audited private
socket, accepted only when it is the canonical
`https://login.tailscale.com/a/…` shape, and never persisted by Pocket. It is
opened directly with macOS rather than written to command output unless the
operator explicitly requests `--print-url`. The short-lived CLI helper has
both an internal Tailscale timeout and bounded process cleanup, and Pocket
proves the daemon retained the same request after terminating it. Browser
approval therefore does not depend on a terminal or agent session remaining
alive.

### Authentication

Pairing uses a random 192-bit secret stored only as a hash. The secret is
carried in a URL fragment, expires in 15 minutes, and is consumed after a
successful passkey registration. A short authentication cookie protects the
registration ceremony.

Each paired device gets a WebAuthn credential and a separate 256-bit session
token. Only the token digest and public credential key are persisted. Strict
mode keeps unlock state only in relay memory. Face ID unlocks for at most one
hour and expires after five minutes without a heartbeat from a visible app.
SSE heartbeats never extend that deadline.

Optional trusted-device mode is accepted only when the relay proves it owns
the audited dedicated Tailscale origin and exclusive Serve root. A request is
unlocked only when the enrolled cookie digest, exact pinned Tailscale login,
server-side device-session deadline, remembered deadline, and persistent lock
state all pass. The device session lasts 30 days and remembered access lasts
at most 29 days. Manual lock is persisted, nonexplicit legacy auto-lock calls
are ignored, and successful WebAuthn verification rotates the bearer token and
refreshes both deadlines. The immediately prior token has a five-minute,
Face-ID-only recovery window for a lost cookie-update response; it cannot read
transcripts or send.

In both modes, the PWA stops its stream while hidden and adds an opaque
privacy shield before iOS takes an app-switcher snapshot.

### Authorization and request integrity

- Every protected request binds the cookie to its original Tailscale login.
- Mutations require the exact configured Origin.
- Mutations require an HMAC-derived, device-specific CSRF token.
- Send requests require an idempotency key and are serialized globally so
  concurrent UI automation cannot target different chats at once.
- Each idempotency key is bound to its normalized message and draft-replacement
  parameters. An explicit retry must reuse both the key and exact body, so a
  lost HTTP response cannot be replayed as different content.
- Pairing attempts are rate-limited.
- Input bodies and user messages have hard byte limits.
- Image bodies are accepted only after the normal device, Tailscale identity,
  unlock, Origin, and CSRF checks. They have independent rate, count, byte,
  dimension, output, and staged-storage limits.

### Conductor integrity

The relay opens Conductor's SQLite database with `readOnly: true` and
`PRAGMA query_only = ON`. It does not insert queue rows, edit session state,
or connect to Conductor's sidecar socket.

For a phone-selected image only, the relay creates a private Pocket-owned
subdirectory beneath the database-resolved workspace's
`.context/attachments/` directory. The request cannot provide a workspace
path, relative path, output name, or attachment marker. Workspace roots and
parents are resolved and checked for containment and symlinks; remote or
unavailable sandbox workspaces fail closed. Directories use mode `0700` and
files use mode `0600`.

Each Pocket directory is claimed before any pixels are written and contains an
atomically replaced `0600` ownership ledger. The ledger stores salted hashes
of the device, session, workspace, attachment ID, and upload identity plus
bounded image metadata and lifecycle deadlines; it does not store the raw
device ID, session ID, workspace path, or upload key. The relay validates the
directory inode, containment, file type, mode, size, and ledger scope before
rehydrating staged metadata after restart. It verifies the JPEG signature and
digest of the selected thumbnail or full image before serving it, and verifies
the full image again under the send lock before transport. It never prunes a
native Conductor attachment directory that lacks a valid Pocket claim. An aged
claimed directory left by a crash before ledger publication can be removed
without touching native attachments.

Accepted JPEG, PNG, HEIC, and HEIF inputs are decoded by the Mac and converted
through a pixel-only intermediate before a bounded JPEG is published. That
round trip removes EXIF/GPS/camera metadata that a direct image re-encode can
preserve. Temporary inputs and intermediates are removed after normalization,
and extended attributes are cleared. A metadata-free, bounded thumbnail is
generated from the same pixel-only intermediate for transcript grids. The
server then constructs Conductor's native attachment marker itself and binds
it to the authenticated device, session, and workspace before the existing
verified send path runs.

Staged-photo state is protected by a per-record lifecycle lock. A send marks
all selected ledgers retained only after every pre-transport check succeeds;
ordinary write failures roll the group back. A confirmed or ambiguous send
keeps its files, while a provably pre-send failure atomically restores the
group to staged and deletable before another send may begin. Restart scans,
quota accounting, expiry pruning, and device revocation include persisted
ledgers across every database-known local workspace. Retained files are never
deleted by staged-photo cleanup because a Conductor transcript may reference
them.

A send uses macOS Accessibility to:

1. select the database-resolved workspace;
2. select the database-resolved session title and duplicate ordinal;
3. refuse a differing Mac draft;
4. require a physical-input quiet lease, focus that exact composer, and enter
   process-targeted Unicode chunks, rechecking the lease, selected route, focus,
   and exact committed prefix between chunks;
5. prove the focused text area is the unique text area in Conductor's unique
   composer, recheck the exact draft, and post an unmodified Return key pair
   only to Conductor's process while retaining the same physical-input lease;
6. report delivery only after the exact new user-message row appears after the
   pre-send database cursor in the intended session.

If any check fails, the phone sees a specific failure code and the message
remains available for explicit retry. Reconnect never auto-sends a draft.
Physical-input interruptions are checked against that same post-cursor database
boundary before retry is permitted; any new or unreadable row keeps the outcome
non-retryable.

macOS exposes no Conductor window to Accessibility while the login session is
locked. Sends therefore fail closed until the Mac is unlocked. Pocket does not
change sleep, lock-screen, or login settings; read-only transcript sync remains
available.

### Browser

The CSP allows only same-origin code, styles, and connections. Images may also
use browser-local `blob:` URLs for immediate previews of files the user just
selected; no remote image origin is allowed.
Framing, object embedding, referrers, camera, microphone, location, payment,
USB, and serial access are disabled. The UI builds transcript nodes with
`textContent`; transcript Markdown is never injected as HTML.
Photo selection uses the browser's user-activated native file picker rather
than `getUserMedia`; Pocket never receives standing camera permission.

The service worker handles only an allowlist of Pocket shell paths, deletes
only `conductor-pocket-shell-*` caches, and never intercepts sibling routes or
`/api/`.
Device-local transcript snapshots are bounded and are not rendered until
after Pocket authorization. During an origin migration, the server records the
original device set, disables remote revocation, and accepts only a
version-matched self-sign-out. The phone first writes a persistent origin
tombstone, prevents every Pocket context from reopening its cache, verifies
through the service worker that no other browser window remains, and deletes
Pocket's localStorage keys, IndexedDB, Cache Storage, and root service worker.
Blocked deletion fails visibly and keeps the device enrolled. Only then does
the client send its retirement receipt. A device that never reconnects remains
protected by iOS Data Protection and Pocket's selected authorization gate.

There is one explicit recovery for a lost final receipt after the user reports
that the iOS Home Screen app was deleted. It requires the exact device ID,
source origin, source config revision, and two acknowledgement flags under the
global operation lock. The recovery records the missing receipt and
unverified local-purge status separately from self-purge receipts, removes the
entire server-side device object, rotates CSRF state, restarts the relay, and
verifies the exact new revision at loopback and the old HTTPS origin. It
returns before origin migration. Activation failure stops the relay without
restoring the revoked token, after preflight binds the listener to the audited
LaunchAgent and shutdown verifies both listener and health-endpoint death. The
completed migration retains this administrative attestation for audit.

Administrative recovery does not claim that iOS local data was erased. It
restores server-side security by revoking the old session before the old route
is removed and the browser origin, RP ID, CSRF secret, and pairing secret are
rotated. Any leftover offline transcript snapshot remains protected only by
iOS Data Protection.

## Residual risks

- A process already running as the host's logged-in macOS account can read the
  Conductor database or use macOS UI automation. Pocket does not claim to
  defend against compromise of the Mac user account.
- macOS Accessibility permission is broad. The relay's Node executable must
  be trusted and should not be replaced by an untrusted binary.
- The dedicated Tailscale state contains a node private key. Its directory is
  `0700`, files are `0600`, and FileVault remains the at-rest protection.
- Tailscale HTTPS certificate names can appear in public certificate
  transparency logs. The hostname reveals the service label, not its content
  or access.
- UI automation depends on Conductor's accessible structure. Version changes
  fail closed: a missing workspace, session, unique composer, focused text
  area, or exact draft produces an error rather than a guessed submission.
- Idempotency history is held in relay memory. An unlikely relay restart after
  Conductor accepts a message but before the phone receives the response can
  still make an explicit retry ambiguous; Pocket never retries automatically.
- A process or power loss in the narrow interval after an attachment ledger is
  conservatively marked retained but before Conductor accepts the message can
  leave an unsent `0600` image on the Mac. Pocket cannot distinguish that
  interval from a send interrupted after the key press without durable
  Conductor-side delivery transactions, so staged cleanup and device revocation
  do not delete the file automatically. This is a local-at-rest privacy
  residual, not a path for remote access or unintended resend.
- Tailscale users with access to the Mac's Serve endpoint can reach the
  unauthenticated app shell and pairing endpoint, but cannot pair without the
  high-entropy one-time link and matching identity.
- Trusted-device mode accepts the paired cookie and pinned Tailscale identity
  without Face ID on each routine open. A person holding the already-unlocked
  enrolled iPhone can therefore open Pocket until manual lock, revocation, or
  expiry. iOS device security is part of this explicitly selected boundary.
- Device-local browser storage cannot be remotely erased while the iPhone is
  permanently offline. iOS device security is the recovery boundary until
  that phone reconnects and completes its own retirement purge. If an operator
  uses the explicit deleted-app administrative recovery, local erasure remains
  user-reported and unverified in the retained audit record.
- Delivered image files intentionally remain beneath the workspace because
  transcript history refers to them. They inherit the Mac account and
  workspace's at-rest security boundary; Pocket never uploads them to a
  hosted service.
