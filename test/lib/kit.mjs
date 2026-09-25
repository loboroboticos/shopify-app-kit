// Kit-level constants and a spawn wrapper shared by the tests. Zero dependencies.
import { spawnSync } from 'node:child_process';
import { read } from './fs.mjs';

// The plugin version: every vendored hook header, the overlay stamp and the manifest $schema tag carry it.
export const KIT_VERSION = JSON.parse(read('.claude-plugin', 'plugin.json')).version;

// A template placeholder: {{APP_NAME}} and friends (templates/README.md documents the set).
export const PLACEHOLDER = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;

// run(cmd, args, opts): spawnSync with utf8 output.
export const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });
