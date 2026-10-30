#!/usr/bin/env node
// Build a password-protected page from an unencrypted source in private/.
//
//     node tools/encrypt.mjs caltrain
//
// reads   private/caltrain/content.html  (+ files it references via data-src="media/...")
// writes  caltrain.html                  (encrypted page, safe to publish)
//         caltrain/*.js                  (each media file, encrypted)
//
// The page and every media file are encrypted with AES-256-GCM using a key derived
// from the password (PBKDF2-SHA256), so nothing readable is ever committed. The
// browser decrypts everything after the visitor enters the password.
//
// Re-run it whenever you edit the source or want to change the password.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ITERATIONS = 600000;
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TYPES = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm' };

const b64 = bytes => Buffer.from(bytes).toString('base64');
const randomBytes = n => crypto.getRandomValues(new Uint8Array(n));
const fail = message => { console.error(message); process.exit(1); };

// Read a password from the terminal without echoing it
function ask(prompt) {
    return new Promise(resolve => {
        const stdin = process.stdin;
        process.stdout.write(prompt);
        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding('utf8');
        let value = '';
        const onData = ch => {
            if (ch === '\r' || ch === '\n') {
                stdin.setRawMode(false);
                stdin.pause();
                stdin.off('data', onData);
                process.stdout.write('\n');
                resolve(value);
            } else if (ch === '\u0003') {
                process.exit(1);
            } else if (ch === '\u007f') {
                value = value.slice(0, -1);
            } else {
                value += ch;
            }
        };
        stdin.on('data', onData);
    });
}

const name = process.argv[2];
if (!name) fail('usage: node tools/encrypt.mjs <page-name>');
const sourceDir = path.join(ROOT, 'private', name);
const contentPath = path.join(sourceDir, 'content.html');
if (!fs.existsSync(contentPath)) fail(`missing ${contentPath}`);

let password = process.env.PAGE_PASSWORD;
if (!password) {
    if (!process.stdin.isTTY) fail('run this in a terminal so it can ask for the password');
    password = await ask('password: ');
    if (password !== await ask('again: ')) fail('passwords did not match');
}
if (!password) fail('empty password');

const salt = randomBytes(16);
const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const encrypt = async (iv, data) => new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));

// Drop source-only comments so they aren't shipped
const html = fs.readFileSync(contentPath, 'utf8').replace(/<!--[\s\S]*?-->/g, '').trim();

// Encrypt each referenced media file to an opaquely named .bin
const outDir = path.join(ROOT, name);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir);
const media = {};
let total = 0;
const refs = [...new Set([...html.matchAll(/data-src="([^"]+)"/g)].map(m => m[1]))].sort();
for (const ref of refs) {
    const file = path.join(sourceDir, ref);
    if (!fs.existsSync(file)) fail(`missing media file ${file}`);
    const iv = randomBytes(12);
    const data = Buffer.concat([iv, await encrypt(iv, fs.readFileSync(file))]);
    const id = Buffer.from(randomBytes(8)).toString('hex');
    const script = `__lockedMedia(${JSON.stringify(id)},${JSON.stringify(b64(data))});\n`;
    fs.writeFileSync(path.join(outDir, `${id}.js`), script);
    total += script.length;
    media[ref] = {
        id,
        file: `${name}/${id}.js`,
        type: TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
    };
}

const iv = randomBytes(12);
const enc = {
    salt: b64(salt),
    iterations: ITERATIONS,
    iv: b64(iv),
    ct: b64(await encrypt(iv, new TextEncoder().encode(JSON.stringify({ html, media })))),
};

const template = fs.readFileSync(path.join(ROOT, 'tools', 'locked-template.html'), 'utf8');
fs.writeFileSync(path.join(ROOT, `${name}.html`),
    template.replace('{{TITLE}}', name).replace('{{ENC}}', JSON.stringify(enc)));

console.log(`wrote ${name}.html and ${refs.length} encrypted files in ${name}/ (${(total / 1e6).toFixed(1)} MB)`);
