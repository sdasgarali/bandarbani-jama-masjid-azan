# Azan Admin Panel

Web dashboard for the admin-controlled Azan (Adhan) app system. Built with
**Next.js (App Router) + TypeScript + Tailwind CSS**. Talks to the backend REST
API described in `../docs/API.md`.

## Features

- **Login / logout** with JWT access token (in memory) + refresh token, and a
  refresh-on-401 interceptor. All dashboard routes are protected.
- **Dashboard** — quick stats (devices active/inactive, schedule version, last
  publish, active audio).
- **Schedule editor** — 5 prayer times (HH:mm, 24h), per-prayer toggles
  (enabled / audioEnabled / notificationEnabled), timezone, and a confirmed
  **Publish** action showing the current published version + history.
- **Azan audio** — upload/replace MP3 (multipart), active audio metadata,
  in-browser player preview, and previous versions.
- **Devices** — table with status badges, counts, checkbox selection, and
  **Send test notification** / **Trigger test Azan** (all or selected).
- **App versions** — distribution derived from registered devices.

Every view has loading, error and empty states; actions emit toasts.

## Getting started

```bash
cd admin-panel
cp .env.example .env.local     # then edit NEXT_PUBLIC_API_BASE if needed
npm install
npm run dev                    # http://localhost:3000
```

### Environment

| Variable               | Default                          | Purpose                        |
| ---------------------- | -------------------------------- | ------------------------------ |
| `NEXT_PUBLIC_API_BASE` | `http://localhost:4000/api/v1`   | Backend REST base URL (no `/`) |

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run start` — serve the production build
- `npm run lint` — ESLint

## Auth token storage note

The access token is held in memory only. The refresh token is stored in
`localStorage` for session persistence across reloads (simple, same-origin SPA).
`localStorage` is XSS-readable; a backend-set **httpOnly, Secure, SameSite=Strict**
cookie is the hardened production choice. See `lib/auth.ts`.
