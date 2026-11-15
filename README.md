# WMS Tracking — PT Wahana Safety Indonesia

App terpisah dari WMS 2.0 untuk customer, sales, dan Branch Manager / Director.
HTML + JS murni (tanpa framework), di-host di GitHub Pages, bisa dipasang ke layar HP Android dan iPhone.

| Menu | Siapa | Login |
|---|---|---|
| Lacak Pesanan | customer, sales | tidak (link berkode `?t=KODE`) |
| Status Stok | customer, sales | tidak (link berkode) |
| Monitoring PO | sales (PO dari SO miliknya), manager (semua) | PIN WMS |
| Analisa Barang | Branch Manager / Director (dead, slow, fast moving, top 10 barang & customer per gudang) | PIN WMS |

## Cara kerja

App memanggil `doPost` Web App Apps Script yang sama dengan WMS 2.0:

- tanpa login: `{fn: "pub", args: [KODE, "lacak" | "stok" | "info", {...}]}` → `TrackApi.gs`
- login: `{fn: "loginPin"}` lalu `{fn: "rpc", args: [token, "po.sales" | "ana.ringkas", {...}]}`

Butuh di project Apps Script: file `TrackApi.gs` + 1 baris `pub` di `doPost` (Api.gs), lalu Deploy > Manage deployments > New version.

## Pengaturan

`config.js`
- `EXEC_URL` — link Web App (berakhiran `/exec`)
- `KEY` — boleh kosong; kode diambil dari link `?t=KODE` lalu diingat di HP

Link untuk dibagikan: `https://ferrysetyawan109.github.io/wms-tracking/?t=KODE`
(KODE = config `PUBLIC_TRACK_KEY` di WMS, menu Manager > Link tracking umum).

## Pasang di HP

- **Android (Chrome):** buka link → menu ⋮ → *Tambahkan ke layar utama* / *Instal aplikasi*.
- **iPhone (Safari):** buka link → tombol Bagikan → *Tambah ke Layar Utama*.

## Update

Ganti file → commit ke `main`. GitHub Pages memperbarui dalam ±1 menit.
Kalau HP masih memakai versi lama, naikkan nama cache di `sw.js` (`wms-track-v1` → `v2`).
