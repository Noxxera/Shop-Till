# ShopTill — POS & Inventory

A lightweight, offline-first point-of-sale and inventory app for a small shop.
Built as a static site (no build step) backed by Supabase (Postgres + Auth).

## Project structure

```
shop-till/
├── index.html          # Markup only — structure of the screens
├── css/
│   └── styles.css       # All styling (design tokens in :root)
└── js/
    ├── config.js        # Supabase URL + publishable key, client init
    ├── state.js         # Shared state, localStorage helpers, small utils
    ├── api.js           # All Supabase calls: auth, data loads, product CRUD, RPCs
    ├── ui.js            # DOM rendering & presentation (no network)
    ├── pos.js           # Cart maths, checkout, and the offline sales queue + sync
    └── app.js           # Navigation, settings, exports, boot + event wiring
```

Scripts load in dependency order at the end of `index.html`:
`config → state → api → ui → pos → app`.

## Running locally

It is a static site, so just open `index.html` in a browser (double-click works —
the scripts are classic scripts, not ES modules, so `file://` is fine).
It needs internet access to reach Supabase.

## Hosting (GitHub Pages)

1. Put the **contents** of this folder (`index.html`, `css/`, `js/`) at the **root**
   of a public repo.
2. Repo → Settings → Pages → Source: *Deploy from a branch*, Branch: `main`, `/ (root)`.
3. Open the URL it gives you (e.g. `https://<user>.github.io/<repo>/`).
4. In Supabase → Authentication → URL Configuration, add that URL.

## Configuration

Connection settings live in `js/config.js`. The Supabase **publishable** key is
safe to expose in the browser; data is protected by Row Level Security policies in
the database (see `shoptill-schema.sql`). Never put the **secret** key here.

## Roles

- **Owner** — full access: products, cost prices, reports/profit, refunds, settings.
- **Employee** — sell + view stock only. Cost prices and reports are blocked at the
  database level, not just hidden in the UI.

First user to sign up becomes the owner; everyone after is an employee.
