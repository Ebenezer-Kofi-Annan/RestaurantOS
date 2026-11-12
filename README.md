# RestaurantOS PWA

The first working RestaurantOS release runs a single demo branch in Port Louis. It uses React and Vite for the staff PWA, Express for the API, and PGlite for a persistent local PostgreSQL database. Demo data includes six tables, takeaway, menu items, and recipe stock.

## Run locally

Use Node.js 24 or newer. Open PowerShell in this directory and run:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd start
```

Open `http://127.0.0.1:4173` in Chrome or Edge. Use the browser’s install option if you want RestaurantOS in a standalone window. Keep the server running while using the app. The first start creates the database in `.data/pgdata`.

For development, use `npm.cmd run dev`. Use the built app when checking installation and the offline app shell. To start a separate demo on another port or with a separate database, set `RESTAURANTOS_PORT` and `RESTAURANTOS_DATA_DIR` before starting. Set `RESTAURANTOS_SEED_EXAMPLES=0` with a new database directory to start with the menu, tables, and stock only.

## Try a shift

1. Select **Register closed** and enter `1500.00` as the opening float.
2. Choose **New order**, select a table or takeaway, and add a chicken tikka wrap. Use **Options & note** to add a modifier or kitchen instruction. Send the order to the kitchen.
3. Open **Kitchen** and accept the new order. Acceptance deducts the recipe ingredients. Move the order through preparing and ready, then mark it served or handed over.
4. Open the order and record cash payment. A wrap without priced extras is MUR 390.00. Enter `500.00` to see MUR 110.00 in change. The receipt can be printed through the browser.
5. Complete the served order. In **Reports**, confirm that expected cash is MUR 1,890.00, then close the register with the counted amount. If the count differs, the form requires a reason.

## Scope

This is a local demo for a single branch and register. It uses sample data, cash recording, and demo receipts. Staff accounts, branch access controls, card processing, direct hardware, and fiscal issuance are later implementation work. The installable shell can load without a server connection. Orders, kitchen updates, and payments require a live API connection.

Run `npm.cmd test` for the service, HTTP, and service worker checks.
