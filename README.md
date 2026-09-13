# Tonycomm Billing

Clean source code for the Tonycomm ISP stack - billing, customers, tickets, mobile, VPN, and network tools in one place.

**Repository:** https://github.com/tonycommgroupltd/billing  

Built and maintained by **Jram Tech** (Tonycomm Group LTD).

Secrets stay in local env files. Never commit real passwords, API keys, or `.env` files.

---

## What this is

This repository is a **clean export** of the systems we use to run an ISP day to day:

- Sell and renew internet packages  
- Manage customers, invoices, M-Pesa payments, and disconnections  
- Authenticate PPPoE users through RADIUS  
- Run a tickets / field-work desk (installations, support, fleet, inventory)  
- Support staff and customer mobile apps  
- Manage VPN peers, TR-069 / ACS devices, and OLT monitoring

It is meant for developers who need to **run, extend, or deploy** these apps - not a dump of server scripts, logs, or secrets.



---

## What you can do with it


| Area                | You can…                                                                          |
| ------------------- | --------------------------------------------------------------------------------- |
| **Admin / desktop** | Run the ISP admin UI (customers, services, finance, hotspot, hub sync, ONU tools) |
| **Billing API**     | Create invoices, take payments, cut/restore service, talk to FreeRADIUS           |
| **Tickets**         | Log and assign tickets, daily roster, installations, inventory, fleet             |
| **Mobile**          | Customer/staff mobile experience against the Node mobile API                      |
| **Network APIs**    | VPN peers, TR-069 helpers, OLT status                                             |


Typical setup is:

1. **Laravel backend** + MySQL + FreeRADIUS for billing and online sessions
2. **Frontend** pointed at that API (browser or Electron desktop)
3. **Tickets UI** + **tickets-api** (PHP) on the tickets database
4. **mobile-api** + **mobile** for phone apps
5. Optional: **vpn-api**, **tr069-api**, **olt-api** beside the main stack

You can run packages alone for development, or wire them together like production.

---

## Repository layout

```
frontend/       Tonycomm ISP Admin (React + Electron)  - was app-portal
backend/        Laravel billing / RADIUS / finance API
mobile/         Expo mobile app
mobile-api/     Node API for mobile & portal helpers   - was app-api
tickets/        Tickets React frontend
tickets-api/    Tickets PHP API
vpn-api/        VPN peer management API
tr069-api/      TR-069 / ACS helper API
olt-api/        OLT monitoring API
```

Older clones used `app-portal` / `app-api`. Those folders are replaced by `frontend` / `mobile-api` (same products, cleaner names).

---

## Requirements

- **Node.js** 18+ (frontend, tickets, mobile-api, vpn/tr069/olt APIs)  
- **PHP** 8.1+ with Composer (backend Laravel; tickets-api)  
- **MySQL** 8 (billing DB + tickets DB)  
- **FreeRADIUS** 3.x if you need live PPPoE auth (production)  
- Optional: Expo CLI for mobile; Electron build tools for the desktop installer

---

## Quick start (local)

### 1. Backend (Laravel)

```bash
cd backend
cp .env.example .env
composer install
php artisan key:generate
# Edit .env - DB, JWT, SMS, M-Pesa, etc.
php artisan migrate
php artisan serve
```

API base is typically `/api/v1`.

### 2. Frontend (ISP Admin)

```bash
cd frontend
cp .env.example .env
npm install
npm start
```

Point `REACT_APP_*` URLs at your backend. For the desktop app, use the Electron scripts in `package.json` when you are ready to build an installer.

### 3. Tickets

**API (PHP)**

```bash
cd tickets-api
cp config.local.php.example config.local.php
# Set DB credentials, JWT secret (must match ISP login exchange if used), SMS keys
```

Serve this folder with Apache/Nginx (or PHP built-in server for light testing). Apply `*-schema.sql` files if you are creating a fresh tickets database.

**UI**

```bash
cd tickets
cp .env.example .env
npm install
npm start
```

Set the API URL to your tickets-api host.

### 4. Mobile + mobile-api

```bash
cd mobile-api
cp .env.example .env
npm install
npm start
```

```bash
cd mobile
npm install
npx expo start
```

Configure the mobile app to use your mobile-api base URL.

### 5. Optional network services

Each of these is a small Node service:

```bash
cd vpn-api    && cp .env.example .env && npm install && npm start
cd tr069-api  && cp .env.example .env && npm install && npm start
cd olt-api    && cp .env.example .env && npm install && npm start
```

Fill `.env` with the hosts, credentials, and ports for your environment.

---

## Configuration & secrets


| Package                                    | Config file                                        |
| ------------------------------------------ | -------------------------------------------------- |
| `frontend`, `tickets`, `mobile`, Node APIs | `.env` from `.env.example`                         |
| `backend`                                  | `.env` from `.env.example`                         |
| `tickets-api`                              | `config.local.php` from `config.local.php.example` |


**Rules**

- Rotate any keys that ever lived on a shared machine  
- Keep Laravel `JWT_SECRET` and tickets `isp_api.jwt_secret` aligned if you use unified login

---

## How the pieces talk (simple view)

```
[ ISP Admin frontend ] -----> [ Laravel backend ] -----> MySQL (billing)
                                      |
                                      +-----> FreeRADIUS / routers

[ Tickets UI ] -------------> [ tickets-api PHP ] -----> MySQL (tickets)

[ Mobile app ] -------------> [ mobile-api Node ] -----> billing / tickets as configured

[ vpn-api / tr069-api / olt-api ] ---> network gear / ACS / OLT tools
```

Exact hostnames and reverse proxies depend on your deployment (Contabo, hub, cPanel, etc.). This repo ships **application code**, not server inventory.

---

## What is intentionally not included

- `node_modules` / `vendor` (install locally)  
- Production `.env` files and passwords  
- Build outputs (`dist`, `release-desktop`, etc.)



---

## Suggested workflow

1. Clone this repo
2. Start with **backend** + **frontend** until login and a customer list work
3. Add **tickets-api** + **tickets** if you need the helpdesk
4. Add **mobile-api** + **mobile** when you need the apps
5. Attach **vpn / tr069 / olt** APIs only if those features are required

Change one package at a time, commit with a clear message, and test against a non-production database first.

---

## Support & credit

**Maintainer:** Jram Tech - Tonycomm Group LTD

Repo: https://github.com/tonycommgroupltd/billing

Keep attribution to **Jram Tech** / Tonycomm Group. Do not republish with live credentials or customer data.

If something is unclear when you clone, ask - better a short question than guessing production env values.

---

*Tonycomm Billing - clean source by Jram Tech*
