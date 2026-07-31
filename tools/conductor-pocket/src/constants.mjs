import path from 'node:path';
import os from 'node:os';

export const APP_NAME = 'Conductor Pocket';
export const APP_VERSION = '0.2.0';
export const SHELL_REVISION = '0.2.0-images-20260730';
export const DEFAULT_PORT = 4317;
export const LOOPBACK_HOST = '127.0.0.1';
export const MAX_MESSAGE_BYTES = 16 * 1024;
export const MAX_JSON_BODY_BYTES = 256 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 4;
export const MAX_IMAGE_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_OUTPUT_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 2560;
export const MAX_IMAGE_PIXELS = 52_000_000;
export const SESSION_COOKIE = '__Host-cp_session';
export const PAIR_COOKIE = '__Host-cp_pair';
export const DEFAULT_DATA_DIR = path.join(os.homedir(), '.config', 'conductor-pocket');
export const DEFAULT_CONFIG_PATH = path.join(DEFAULT_DATA_DIR, 'config.json');
export const DEFAULT_DB_PATH = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'com.conductor.app',
  'conductor.db',
);
export const CONDUCTOR_APP_PATH = '/Applications/Conductor.app';
export const PAIRING_TTL_MS = 15 * 60 * 1000;
export const PAIR_SESSION_TTL_MS = 5 * 60 * 1000;
export const UNLOCK_TTL_MS = 60 * 60 * 1000;
export const UNLOCK_IDLE_TTL_MS = 5 * 60 * 1000;
export const DEVICE_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
export const TRUSTED_DEVICE_TTL_MS = 29 * 24 * 60 * 60 * 1000;
export const SESSION_ROTATION_GRACE_MS = 5 * 60 * 1000;
export const REAUTHENTICATION_MODE_FACE_ID = 'face-id';
export const REAUTHENTICATION_MODE_TAILSCALE_SESSION =
  'tailscale-session';
export const SSE_HEARTBEAT_MS = 5 * 1000;
export const DB_POLL_MS = 2 * 1000;
