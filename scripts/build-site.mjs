#!/usr/bin/env node
// Assembles the static GitHub Pages site in _site/: the directory (index.html), the pages in apps/ (each
// with its own link preview and files, from site/site.json), the emulator built from the
// v86_64 submodule and the staged images. The layout is the repository's own, so the pages'
// relative paths (../v86_64/build/, ../images/) work the same served locally and published.
//
//   ./scripts/setup.sh && node scripts/build-site.mjs [--out _site]
//
// SITE_URL overrides site.json's site_url (for a fork or a custom domain).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const arg = (name, def) => { const i = args.indexOf(name); return i >= 0 && i + 1 < args.length ? args[i + 1] : def; };
const site = JSON.parse(fs.readFileSync(path.join(root, "site/site.json"), "utf8"));
const out = path.resolve(arg("--out", path.join(root, "_site")));
const site_url = (process.env.SITE_URL || site.site_url).replace(/\/?$/, "/");

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, ".nojekyll"), "");

function copy(rel, dest = rel)
{
    const src = path.join(root, rel);
    if(!fs.existsSync(src)) throw new Error(`${rel} is missing: run ./scripts/setup.sh first`);
    fs.mkdirSync(path.dirname(path.join(out, dest)), { recursive: true });
    fs.copyFileSync(src, path.join(out, dest));
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

// the emulator
for(const file of ["build/libv86.js", "build/v86.wasm", "bios/seabios.bin", "bios/vgabios.bin",
                   "icons/favicon.svg", "icons/icon-32.png", "icons/icon-180.png"]) copy(`v86_64/${file}`);

// the guest and Bitcoin Core
const alpine = "alpine-virt-3.19.9-x86_64";
for(const file of [`${alpine}.iso`, `${alpine}/boot/vmlinuz-virt`, `${alpine}/boot/initramfs-virt`]) copy(`images/${file}`);
if(fs.statSync(path.join(root, "images", `${alpine}.iso`)).size >= 100 * 1024 * 1024) throw new Error("the ISO is too large for GitHub Pages");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "images/bitcoin/manifest.json"), "utf8"));
for(const file of ["manifest.json", ...manifest.files.map(f => f.name)]) copy(`images/bitcoin/${file}`);

const escape = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// Open Graph / Twitter card tags for a page published at url
function card_tags({ url, title, description, image, image_alt, theme_color })
{
    const image_url = image && new URL(image, site_url).href;
    return [
        `<link rel="canonical" href="${escape(url)}">`,
        `<meta name="description" content="${escape(description)}">`,
        `<meta property="og:type" content="website">`,
        `<meta property="og:site_name" content="${escape(site.site_name)}">`,
        `<meta property="og:url" content="${escape(url)}">`,
        `<meta property="og:title" content="${escape(title)}">`,
        `<meta property="og:description" content="${escape(description)}">`,
        ...(image ? [
            `<meta property="og:image" content="${escape(image_url)}">`,
            `<meta property="og:image:width" content="1200">`,
            `<meta property="og:image:height" content="630">`,
            `<meta property="og:image:alt" content="${escape(image_alt)}">`,
            `<meta name="twitter:image" content="${escape(image_url)}">`,
            `<meta name="twitter:image:alt" content="${escape(image_alt)}">`,
        ] : []),
        `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`,
        `<meta name="twitter:title" content="${escape(title)}">`,
        `<meta name="twitter:description" content="${escape(description)}">`,
        ...(theme_color ? [`<meta name="theme-color" content="${escape(theme_color)}">`] : []),
    ].join("\n");
}

// a page, with its card tags after the <title>
function publish(rel, card)
{
    let html = fs.readFileSync(path.join(root, rel), "utf8");
    if(!/<\/title>\n/.test(html)) throw new Error(`${rel}: no <title> to insert the meta tags after`);
    html = html.replace(/<\/title>\n/, () => "</title>\n" + card_tags({ url: new URL(rel === "index.html" ? "" : rel, site_url).href, ...card }) + "\n");
    fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
    fs.writeFileSync(path.join(out, rel), html);
}

publish("index.html", { title: site.title, description: site.description, image: site.image, image_alt: site.image_alt, theme_color: "#0d1b1c" });
if(site.image) copy(`site/${site.image}`, site.image);
copy("site/site.json");   // the directory's cards
for(const app of site.apps)
{
    publish(`apps/${app.page}.html`, app);
    if(app.image) copy(`site/${app.image}`, app.image);
    for(const pattern of app.files || []) for(const file of expand(pattern)) copy(file);
    console.log(`apps/${app.page}.html`);
}
console.log(`site in ${out} for ${site_url} (Bitcoin Core ${manifest.bitcoin_core})`);
