# QuickExpense

QuickExpense is a small web app for recording personal or family expenses into a shared Google Sheets spreadsheet.

The app is optimized for quick entry from a phone or desktop browser and supports four main flows:

- Google sign-in
- spreadsheet setup and validation
- adding a new expense row
- viewing the latest records or searching the loaded dataset

## Tech stack

- React 18 + TypeScript + Vite
- Express backend for session handling and Google OAuth / Google Sheets calls
- Vitest for unit tests

## What the app expects

QuickExpense writes to a Google Spreadsheet that contains a sheet named `Expenses`.

The required header row is:

`Date, PLN, BYN, EUR, USD, Category, WhoSpent, ForWhom, Comment, PaymentChannel, Theme`

If the `Expenses` sheet exists and the first row is empty, the app creates the header automatically during setup.

## Prerequisites

- Node.js 20+ recommended
- npm
- A Google Cloud OAuth client with Google Sheets access enabled
- A Google account that can open and edit the target spreadsheet

## Environment variables

Create a `.env` file in the project root:

```env
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3001/api/auth/callback
FRONTEND_BASE_URL=http://localhost:5173
PORT=3001
SESSION_SECRET=replace-this-for-local-use
```

Notes:

- `GOOGLE_REDIRECT_URI` must match the redirect URI configured in Google Cloud.
- `FRONTEND_BASE_URL` should point to the frontend URL you use locally.
- Do not commit real secrets to a public repository.

## Install dependencies

```bash
npm install
```

## Run locally

Start both the backend and the Vite frontend:

```bash
npm run dev
```

This starts:

- frontend: `http://localhost:5173`
- backend: `http://localhost:3001`

Open the frontend URL in your browser, sign in with Google, then complete the spreadsheet setup screen.

## Build

Create the production frontend build:

```bash
npm run build
```

This generates static frontend assets in `dist\`.

## Launch after build

The current repository does not include a single packaged production server. The usual local verification flow after building is:

1. Start the backend:

```bash
npm run dev:server
```

2. Serve the built frontend:

```bash
npm run preview
```

By default, `vite preview` serves the frontend on `http://localhost:4173`. If you use preview instead of the dev server, update `FRONTEND_BASE_URL` so OAuth redirects back to the preview URL.

## Run tests

```bash
npm test
```

## Main user flows

- `Setup`: save and validate the Google Sheets URL
- `Add`: append a new expense row
- `Tail`: show up to the last 20 rows
- `Search`: filter loaded expenses by category and comment text

## Notes for publishing

Before pushing this project to a public GitHub repository, make sure you only copy source code, tests, and safe configuration files. Exclude local secrets, session data, and any private runtime files.
