#!/usr/bin/env node
// Builds the single-file offline version of each tool in _offline/: one HTML file that carries the
// emulator, its BIOS, Alpine Linux, Bitcoin Core and the tool's samples inline, so it runs from a
// USB stick on an air-gapped computer, opened straight from disk (file://), with nothing to fetch.
//
//   ./scripts/setup.sh && node scripts/build-offline.mjs [--out _offline]
//
// The files are base64 in <script type="application/octet-stream"> blocks, gzipped where that
// saves space. A small loader at the top of the page unpacks them once the page has loaded
// (offline_bundle.ready), answers the page's fetch() for them, and hands them to v86 as buffers
// (offline_bundle.v86_options). Each file is around 115 MB: too large for GitHub Pages, so the
// Pages workflow attaches them to the "offline" release instead.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const arg = (name, def) => { const i = args.indexOf(name); return i >= 0 && i + 1 < args.length ? args[i + 1] : def; };
const site = JSON.parse(fs.readFileSync(path.join(root, "site/site.json"), "utf8"));
const out = path.resolve(arg("--out", path.join(root, "_offline")));
const site_url = (process.env.SITE_URL || site.site_url).replace(/\/?$/, "/");

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

function read(rel)
{
    const src = path.join(root, rel);
    if(!fs.existsSync(src)) throw new Error(`${rel} is missing: run ./scripts/setup.sh first`);
    return fs.readFileSync(src);
}

// "dir/*.ext" or a path, relative to the repository
function expand(pattern)
{
    const dir = path.dirname(pattern), base = path.basename(pattern);
    if(!base.startsWith("*")) return [pattern];
    const found = fs.readdirSync(path.join(root, dir)).filter(f => f.endsWith(base.slice(1))).map(f => `${dir}/${f}`);
    if(!found.length) throw new Error(`nothing matches ${pattern}`);
    return found;
}

// what every tool's machine loads, relative to the repository
const alpine = "alpine-virt-3.19.9-x86_64";
const manifest = JSON.parse(read("images/bitcoin/manifest.json"));
const MACHINE_FILES = [
    "v86_64/build/v86.wasm", "v86_64/bios/seabios.bin", "v86_64/bios/vgabios.bin",
    `images/${alpine}.iso`, `images/${alpine}/boot/vmlinuz-virt`, `images/${alpine}/boot/initramfs-virt`,
    "images/bitcoin/manifest.json", ...manifest.files.map(f => `images/bitcoin/${f.name}`),
];

// a file's block, compressed once and shared by every page
const blocks = new Map();
function block(rel)
{
    if(blocks.has(rel)) return blocks.get(rel);
    const data = read(rel);
    const gz = zlib.gzipSync(data, { level: 9 });
    const gzip = gz.length < data.length * 0.95;
    const b = { size: data.length, gzip, base64: (gzip ? gz : data).toString("base64") };
    blocks.set(rel, b);
    return b;
}

const data_uri = (rel, type) => `data:${type};base64,${read(rel).toString("base64")}`;

// Unpacks the blocks, answers fetch() for them and turns v86's URLs into buffers. Runs before
// anything else on the page; FILES maps each file's URL, as the page writes it, to its block.
const LOADER = String.raw`
(() => {
    const FILES = __FILES__;
    const href = url => new URL(url, location.href).href;
    const by_href = new Map(Object.keys(FILES).map(url => [href(url), url]));
    const buffers = new Map();
    const decode = async ({ id, gzip }) =>
    {
        const el = document.getElementById(id);
        const text = el.textContent;
        el.remove();
        const raw = Uint8Array.fromBase64 ? Uint8Array.fromBase64(text) :
            new Uint8Array(await (await native_fetch("data:application/octet-stream;base64," + text)).arrayBuffer());
        if(!gzip) return raw.buffer;
        return new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    };
    const native_fetch = window.fetch.bind(window);
    const ready = new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve, { once: true }))
        .then(() => Promise.all(Object.entries(FILES).map(async ([url, f]) => buffers.set(url, await decode(f)))));
    window.fetch = async (input, init) =>
    {
        const url = by_href.get(href(typeof input === "string" || input instanceof URL ? input : input.url));
        if(!url) return native_fetch(input, init);
        const headers = { "content-length": String(FILES[url].size), "content-type": "application/octet-stream" };
        if(String(init?.method || input?.method || "GET").toUpperCase() === "HEAD") return new Response(null, { headers });
        await ready;
        return new Response(buffers.get(url).slice(0), { headers });
    };
    const KEYS = ["bios", "vga_bios", "cdrom", "bzimage", "initrd"];
    window.offline_bundle = {
        ready,
        v86_options(options)
        {
            options = { ...options };
            for(const key of KEYS)
            {
                const url = options[key]?.url && by_href.get(href(options[key].url));
                if(url) options[key] = { buffer: buffers.get(url) };
            }
            const wasm = options.wasm_path && by_href.get(href(options.wasm_path));
            if(wasm)
            {
                delete options.wasm_path;
                options.wasm_fn = env => WebAssembly.instantiate(buffers.get(wasm), env).then(r => r.instance.exports);
            }
            return options;
        },
    };
})();
`;

const sums = [];
for(const app of site.apps)
{
    const page = `apps/${app.page}.html`;
    let html = read(page).toString("utf8");
    const files = [...MACHINE_FILES, ...(app.files || []).flatMap(expand)];
    // the page's URLs for them: relative to apps/, the way the page writes them
    const url_of = rel => path.posix.relative("apps", rel);

    const table = {};
    let blocks_html = "";
    files.forEach((rel, i) =>
    {
        const b = block(rel), id = `offline_file_${i}`;
        table[url_of(rel)] = { id, size: b.size, gzip: b.gzip };
        blocks_html += `<script type="application/octet-stream" id="${id}">${b.base64}</script>\n`;
    });

    const swap = (from, to) =>
    {
        if(!html.includes(from)) throw new Error(`${page}: ${from} not found`);
        html = html.split(from).join(to);
    };
    const libv86 = read("v86_64/build/libv86.js").toString("utf8").replace(/<\/script/gi, "<\\/script");
    swap(`<script src="../v86_64/build/libv86.js"></script>`, `<script>${libv86}</script>`);
    swap(`href="../v86_64/icons/favicon.svg"`, `href="${data_uri("v86_64/icons/favicon.svg", "image/svg+xml")}"`);
    swap(`href="../v86_64/icons/icon-32.png"`, `href="${data_uri("v86_64/icons/icon-32.png", "image/png")}"`);
    html = html.split(`href="../index.html"`).join(`href="${site_url}"`);

    const loader = `<script>${LOADER.replace("__FILES__", JSON.stringify(table))}</script>\n`;
    if(!/<meta charset="utf-8">\n/i.test(html)) throw new Error(`${page}: no <meta charset> to put the loader after`);
    html = html.replace(/(<meta charset="utf-8">\n)/i, (m) => m + loader);
    if(!html.includes("</body>")) throw new Error(`${page}: no </body>`);
    html = html.replace("</body>", () => blocks_html + "</body>");

    const name = `${app.page}.html`;
    fs.writeFileSync(path.join(out, name), html);
    sums.push(`${crypto.createHash("sha256").update(html).digest("hex")}  ${name}`);
    console.log(`${name}: ${(Buffer.byteLength(html) / 1048576).toFixed(1)} MiB`);
}
fs.writeFileSync(path.join(out, "SHA256SUMS"), sums.join("\n") + "\n");
console.log(`offline builds in ${out} (Bitcoin Core ${manifest.bitcoin_core})`);
