# wasm-bitcoin-tools

Bitcoin tools that run an unmodified Bitcoin Core in your browser. Each page boots Alpine Linux
headlessly (no display, no network device) in [v86_64](https://github.com/portlandhodl/v86_64),
an x86-64 emulator in WebAssembly. It then runs the official x86_64 Bitcoin Core in it with
networking disabled, and drives it over the serial console. Files reach the machine through a
virtio 9p share in the page, and results come back the same way. Nothing is uploaded.

Live: https://portlandhodl.github.io/wasm-bitcoin-tools/ is a directory of all the tools.

| Tool | What it does |
|---|---|
| [apps/bitcoin-wallet-check.html](apps/bitcoin-wallet-check.html) | Imports a `wallet.dat` (SQLite restored, Berkeley DB migrated), optionally unlocks it, and lists its descriptors and addresses. Demo wallets in [apps/bitcoin-wallets/](apps/bitcoin-wallets/) run with one click. |
| [apps/anchorwatch-recovery.html](apps/anchorwatch-recovery.html) | Reads an AnchorWatch Trident Vault recovery kit (PDF) and has Bitcoin Core validate its descriptors, create the watch-only wallet, list the receive and change addresses and back up the wallet for download. |
| [apps/psbt-finalizer.html](apps/psbt-finalizer.html) | Combines PSBTs from several signers, fills in scripts from public descriptors, reports what each input still needs and finalizes them with `finalizepsbt`, on a wallet-less node at block 0. Timelocked spends finalize too: `after()`/`older()` are checked against the transaction's own `nLockTime`/`nSequence`. Samples in [apps/psbt-samples/](apps/psbt-samples/). |

## Layout

- `v86_64/`: the emulator, as a git submodule. `scripts/setup.sh` builds
  `v86_64/build/libv86.js` and `v86_64/build/v86.wasm` from it. The pages load it, its BIOS
  and its icons from `../v86_64/`.
- `apps/`: the tools, one HTML page each, with their own files next to them.
- `images/` (not in git): the Alpine guest and Bitcoin Core with its glibc runtime, staged
  by `scripts/stage-alpine.sh` and `scripts/stage-bitcoin.sh`.
- `index.html`: the directory of the tools. Its cards, and each page's link preview, come
  from [site/site.json](site/site.json).
- `scripts/build-site.mjs`: assembles the GitHub Pages site in `_site/`, with the same
  layout. [.github/workflows/pages.yml](.github/workflows/pages.yml) runs it on every
  push to master.

## Running it locally

    git clone --recurse-submodules https://github.com/portlandhodl/wasm-bitcoin-tools
    cd wasm-bitcoin-tools
    ./scripts/setup.sh          # emulator, Alpine 3.19 virt (downloaded, sha256-checked), Bitcoin Core 31.1
    ./scripts/serve.sh          # http://localhost:8000/

The emulator build needs Node.js, Rust with the `wasm32-unknown-unknown` target and clang
(see [v86_64's Readme](https://github.com/portlandhodl/v86_64)). Bitcoin Core's staging copies
the glibc loader and libraries from the host, so it needs x86_64 glibc Linux. Have an Alpine
ISO already? Pass it with `./scripts/setup.sh path/to/alpine-virt-3.19.9-x86_64.iso`.

To move to a newer emulator, update the submodule (`git -C v86_64 pull`), run `./scripts/setup.sh`,
check the pages, and commit the new submodule commit.

## Adding a tool

Put the page in `apps/`, loading the emulator from `../v86_64/` and the images from `../images/`
as the existing pages do. Then add an entry to `apps` in `site/site.json` with its name, tagline,
icon, tags, link preview and the extra `files` it fetches. The directory and the Pages build
pick it up from there.
