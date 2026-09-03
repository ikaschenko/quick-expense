# PROJECT: Quick Expense (application)

This document describes Business Requirements for the software application.



# 1\. VISION

Small web application or site to manage own/family expenses, supporting key use cases:

1. submit an expense record (Add)
2. browse and filter expense history (History)

Key problem to solve: ability to record expenses on-the-go as a time saver, without spending time on collecting receipts and processing at the end of the month. The data should be finally stored in a shared google spreadsheet (hereinafter called 'database') so that it could be easily detachable from the application and e.g. exported/analyzed.

Another expected gain: being able to find information in expenses log without a PC, from a smartphone. But google sheets can't open the file via UI because it's quite big already (up to 5 megabytes by the moment of writing this).

Important notes: for v1 the following things are intentionally excluded

* No edit existing record functionality.
* No delete functionality.
* No export feature.
* No reporting/aggregation.
* No audit trail.

# 2\. FUNCTIONAL REQUIREMENTS

This section describes key functionality of the application as well as user interface.

## 2.1 Authentication

User should login to the app in order to use it. Google "social login" (like on many internet sites today) should be available as main option. This is important so that the application will hold the email of this user in memory for further use.

Without login, no option is available, but only the "sign in" button which should lead to a standard google "social login" where a user chooses a google account. There's no need in any "Sign up" because only existing google accounts should be used.

After user signs in, on main screen there are 4 key buttons: Setup, Add, Tail, Search. For details how each button should work - see below in separate sections.

> **As of the Home Screen redesign (issue #36):** the main screen is no longer a menu of buttons. It is a spending dashboard — see **§2.7 Home Screen Dashboard**. The Setup, Tail, Search, and Add Expense functions are accessible via the global bottom navigation bar. The bottom nav's Setup icon shows a status badge (green ✓ or red ⚠) reflecting the current sheet connection state.

Application is intended for any Google user who has access to the spreadsheet.

Any Google user with edit access to the configured spreadsheet can use the application.

No roles (admin/user) in v1.

Authorization is implicitly controlled by Google Sheets access rights.

How long should login session persist? Keep the session as long as possible. Only ask user to re-authenticate if it passed more than 24 hours since the last time they used the application.

Should access be revalidated on every Add/History action? Validate spreadsheet access:

* On Setup
* On each write (Add)
* On each load (Search)

If access revoked → show blocking error and redirect to Setup.

Technical background for the Security aspect of this application:

* OAuth 2.0 Authorization Code Flow with PKCE must be used.
* No refresh tokens stored in browser storage.
* Access tokens stored in memory only.
* Silent reauthentication should be attempted while Google session is active.
* If token renewal fails → user must login again.
* Maximum logical session duration: 24 hours.

The application must request the minimal required Google OAuth scopes:

* [https://www.googleapis.com/auth/spreadsheets](https://www.googleapis.com/auth/spreadsheets) (read/write access to spreadsheets)  
No broader Google Drive scopes should be requested.  
Principle of least privilege must be applied.

## 2.2 Configuration (Setup)

Before enabling any further use cases, a user must provide necessary initial inputs for the application - the location of a shared google spreadsheet. All further data will be saved by the application into this spreadsheet.

So, configuration fields should be available in the app:

a) link to the shared google spreadsheet

b) buttons: Back, Save

After user provides a link and clicks "Save", application tries to access the file under the account of a signed-in current user. If no access or no such file - show an error message and either let user re-try or cancel this step.

On clicking "Back" button - return to a previous screen without saving a link to file.

Configuration is stored per authenticated user (linked to Google email). Each user may configure a different spreadsheet.

Where is the configuration stored? Store a full link in a minimal backend runtime store associated with the authenticated email and protected by the server session.

If a user clears browser storage but retains a valid server session, the configured spreadsheet may still be restored from the backend store. If a user signs in from another device, configuration availability depends on the deployed backend runtime data storage for that environment.

If a user changes a spreadsheet link - perform a standard validation (see rules described in the below section).

### 2.2.1 File structure (Setup)

Exact expected structure of the Google Spreadsheet is described below.

File name = not defined, can be any.

Single sheet = named "Expenses" (Version 1 supports exactly one predefined sheet named Expenses. Other sheets are ignored.) If the "Expenses" sheet does not exist in the spreadsheet, it is auto-created during Setup.

First row = header, see below list of columns and their sequence/types.

Fields list:

a) Date, mandatory, ISO format YYYY-MM-DD. By default, fill with Today date (Client local timezone), but allow some standard date picker control for a user to set another date.

b) Sum (group of fields), filling at least 1 of those fields is mandatory with a number (currency)

\- USD (always present)

\- Up to 3 additional non-USD currencies, configurable per user from a dictionary of 25 supported currencies (e.g. PLN, BYN, EUR, GBP, etc.)

Users configure their active currencies via the Setup page. Currency selection is stored in the database (`user_currencies` table) and reflected as columns in the spreadsheet header. Archived currencies (previously active, now removed) keep their columns in the sheet for historical data.

c) Category, free text, mandatory (with ability to select via quick search from all previously entered values in this field across the database)

d) WhoSpent (Spent By), text, mandatory. Email of a current user by default, with ability to select via quick search from all previously entered values in this field across the database.

e) ForWhom (Spent For), text, mandatory, with ability to select via quick search from all previously entered values in this field across the database - or enter a new text value.

f) Comment, optional, text

g) PaymentChannel, optional, text, with ability to select via quick search from all previously entered values in this field across the database (e.g. bank name, or a card name, or cash vs. card differentiation)

h) Theme, optional, text, with ability to select via quick search from all previously entered values in this field across the database

The header row in the "Expenses" sheet contains columns in this order:

Date
[user-configured currency columns]
USD
Category
WhoSpent
ForWhom
Comment
PaymentChannel
Theme

For example, a user who configured PLN, BYN, and EUR would have:

Date
PLN
BYN
EUR
USD
Category
WhoSpent
ForWhom
Comment
PaymentChannel
Theme

The currency columns between Date and USD are dynamic and depend on the user's configuration. USD is always present.

Header validation must check exact match (case-sensitive) and exact column order.

Application validates header row on Setup. Also, re-validation should occur on every Add, Tail, Search operations. This prevents from any manual modifications after Setup.

What happens if the spreadsheet exists but has no correct header structure? Answer: On Setup:

\- If the "Expenses" sheet does not exist → auto-create it.

\- If sheet is empty → auto-create header row.

\- If sheet exists but headers mismatch → show blocking error with expected vs. actual column comparison and do not allow usage.

After a successful Setup validation, the application reports what actions were taken (e.g. "Expenses tab created", "Column headers created automatically", "Columns migrated from legacy format", or "Column headers valid"). If headers mismatch, the error includes a side-by-side table of expected vs. actual column names with mismatched columns highlighted.

Can multiple currency fields be filled simultaneously? Answer: Allow USD together with at most one non-USD currency. Only one non-USD currency may be filled at a time (regardless of which currencies are configured).

**USD is mandatory when a non-USD amount is entered.** If the user fills a non-USD currency field, the USD amount must also be provided — either entered directly or derived via an exchange rate. The form blocks submission and shows a single error: *"USD amount is required — enter an exchange rate here or fill the USD field directly."* The backend enforces the same rule independently (HTTP 400).

Currency conversion: Here are key cases:

* If a non-USD field is being filled, the user may enter a manual USD conversion rate for that currency and the application derives the USD field from it.
* If a USD field is being filled, no automatic conversion is performed for any non-USD field.

For the conversion of currency, here are key guidelines:

* Currency conversion rates can be entered manually by the user in the Add flow.
* When adding an expense, the form fetches the market rate for the selected date from a free key-less exchange-rate API and pre-fills the rate input. For today, the rate is also displayed as a tappable hint: *"Market: X.XX"*. Tapping the hint copies the rate into the input field. If the fetch fails for any reason, the form falls back to fully manual entry. Edit mode derives the rate from the existing USD and non-USD amounts when both are available.
* Converted USD value must be rounded to 2 decimal places.
* Missing or invalid manual rate input must block Save when a non-USD amount is entered and USD is not entered directly.
* The last-used FX rate for each currency is backed up in the database and used as a fallback when a market rate is unavailable for a normal Add flow.

What format for currency fields? Answer:

* Decimal numbers allowed.
* Dot as decimal separator.
* Negative values are allowed (for example, when a user sold some item via ebay, so this is a profit instead of expense).

What if identical record is submitted twice? Answer: No duplicate detection in v1. Each Save appends a new row.

## 2.3 New expense submission (Add)

Prerequisites for this step: successful sign in and successful configuration set up complete.

To submit a new expense, click "Add" on a main screen.

On this screen — show Buttons: **Back**, **Save & Continue**, **Save & Close**.

Upon either Save button is clicked, the new record is added to the database (shared google spreadsheet) and file saved.

**Save & Continue:** shows a brief green "Saved!" flash on both buttons, clears only the amount fields (all currency amounts — non-USD and USD), retains all other fields, returns keyboard focus to the first amount field, and stays on the Add screen.

**Save & Close:** saves the record and navigates to the Home screen (`/home`). A temporary green badge overlays the Add (`+`) button in the bottom navigation bar for ~5 seconds. No success message is shown on the Add screen.

On **Back** — return to the previous screen without saving.

### 2.3.1 Date selection

The date field defaults to today (client local timezone). The user may pick any date — past, today, or future — using a standard date picker. Future dates are allowed to support planned/upcoming expenses.

### 2.3.2 Append vs. insert mode

When a new expense is saved, the backend decides between two write modes based on the submitted date and the existing data:

- **Append mode** (default): the new row is added after the last row in the sheet. Used whenever the submitted date is ≥ the last row's date, the sheet has no data, the date format is unrecognisable, or the sheet has a date-order issue.
- **Insert mode**: used when the submitted date is earlier than the last row's date **and** the sheet rows are in chronological order. The backend scans backward to find the last row whose date ≤ the submitted date and inserts the new row immediately after it. If multiple rows share the submitted date, the new row is inserted after all of them.

After an insert-mode write, the in-memory dataset is fully reloaded from the sheet (to keep all row numbers consistent). A non-dismissible loading overlay is shown during this operation: *"Recording an entry with an earlier date. This may take a moment while the history is being updated…"*

See §2.3.4 for the equivalent behaviour when editing an existing expense's date.

### 2.3.3 Date order integrity warning

During every dataset load (initial load, Reload, or post-insert reload), the backend checks whether all Date values in the sheet are in non-decreasing chronological order.

If at least one out-of-order date is detected, a persistent red banner is displayed in the header area of **all screens** (Home, Add, History):

*"⚠ Critical issue: your sheet's dates are not in chronological order. Open the sheet and sort all rows by Date (ascending) to fix this."*

The banner is not manually dismissible. It disappears automatically the next time the dataset is loaded and no ordering violation is found. When the banner is active, the backend falls back to append mode for all new expense submissions.

### 2.3.4 Edit with date change — row repositioning

When an existing expense is saved with a changed date that would place it out of chronological order relative to its immediate sheet neighbors (the row above or below), the backend **repositions** the row:

1. The expense is written at the chronologically correct position using the same insert/append decision logic as §2.3.2 (backend function `addExpenseRow`).
2. After the new row is confirmed written, the original row is deleted. Insert-before-delete ensures no data loss on partial failure — at worst a duplicate row exists, which is recoverable.
3. If the new date still falls between the row's immediate neighbors, an in-place cell update is performed (no row move, no dataset reload).
4. If the sheet already has a date-order issue (§2.3.3), the editor falls back to in-place update to avoid worsening the situation.

A repositioning write triggers the same non-dismissible loading overlay and full dataset reload as an insert-mode add (§2.3.2). The edit card closes only after the reload completes.

## 2.4 Preload for Home Dashboard and History

For the Home dashboard and for Tail and Search operations — upon mounting the relevant screen, the application should check if the dataset is loaded from back-end. Key rules:

* If never loaded (or invalidated a previously loaded data) - then automatically load a fresh dataset.
* If dataset is already loaded in memory and has not been invalidated (by Add or Reload), the application must reuse the in-memory dataset without performing another API call.
* If dataset is not loaded or was invalidated, a fresh dataset must be retrieved before proceeding.

Loaded dataset remains valid only within the current browser session and until a successful Add operation or manual Reload.  
External modifications in the spreadsheet by other users are not automatically detected unless Reload is triggered.  
Header validation is always performed before any operation, but row-level dataset freshness is not automatically revalidated.

**Progressive two-phase loading:** For sheets with a significant history, the initial load returns only the most recent data (default: last 24 months), allowing the Home dashboard and Tail view to become interactive immediately. Older historical records are fetched transparently in the background. The Search screen shows a non-blocking informational message "Complete history is still loading…" while the background fetch is in progress, and removes it automatically when complete. The split threshold and recent window are configurable server-side; for sheets with few records all data loads in a single request with no behavioral difference.

From UI point of view, while loading the data, an icon of 'loading' should be displayed with the text "Loading expenses from Google Sheet…". In case of any errors during load (e.g. no file, no access, not enough memory, and so no), and error message should be displayed under the button.

## 2.5 Expense History (History)

Prerequisites: successful sign in and configuration.

The separate **Tail** and **Search** screens have been merged into a single **History** screen (`/history`).

> **As of the History unification:** `/tail` and `/search` routes redirect to `/home`; the canonical history URL is `/history`.

### Default view (unfiltered)

Displays the most recent records in reverse-insertion order (same as old Tail). The header shows total record count and how many rows are currently visible. A **"Show earlier"** button progressively expands the view. **Reload** re-fetches the full sheet.

### Filtering

A comment text input (always visible at the top of the page) enables instant substring search across the Comment field (case-insensitive, debounced). An expandable **Filter** panel provides additional criteria:

- **Category** — chip-based multi-select (exact match, AND logic)
- **Amount (USD)** — numeric from/to range
- **SpentBy** — substring match
- **SpentFor** — substring match
- **Custom columns** — one substring input per configured custom column

When any filter is active, the full dataset is searched client-side and results are shown instead of the recency view. A badge on the Filter toggle counts active panel filters. **Clear filters** resets all fields. Filter state persists across navigation within the session (stored in `DatasetContext`).

While the background Phase-2 history load is still in progress, a non-blocking banner "Complete history is still loading…" is shown.

Search is client-side. If the sheet exceeds the 10 MB payload cap, History is denied with an error (same rule as §3.5).

Available actions: **Reload**, **Edit** (redirect to edit form), **Delete last row** (confirm dialog, last row only), **Repeat** (opens the Add Expense form pre-populated with all fields from the selected row; Date resets to today; the user may adjust any field and save as a new expense row).

## 2.7 Home Screen Dashboard

When a user is authenticated **and** has a sheet configured **and** the sheet contains at least one expense record, the home screen displays a spending summary dashboard instead of a simple navigation menu.

### 2.7.1 Data source and loading

Dashboard data is loaded via the same mechanism as History (shared in-memory dataset). If a valid cache exists (e.g. from a recent History or Add visit), it is reused without an extra network call. While loading, skeleton placeholders are shown for each metric card. If loading fails, an error banner with a Retry action is shown.

### 2.7.2 TODAY card

- Header: **"TODAY · {local date}"** (e.g. "TODAY · Jun 9")
- Right side: link **"N entries →"** navigating to Tail/History
- Body: if no entries today — *"No expense entries"*; otherwise the USD total (`$Y`)
- **Dual-currency display:** if *all* today's entries share exactly one non-USD currency code AND each has a USD amount, display **"PLN X / $Y"** (sum of that currency / sum of USD). In all other cases show USD only.

### 2.7.3 JUNE SO FAR (MTD) card

- Header: **"{MONTH NAME} SO FAR"** (e.g. "JUNE SO FAR")
- Right side: **"N entries →"** link to Tail/History
- Body: USD total for Jan 1 – today's date of the current month
- **Year-over-year deviation** (shown only when prior-year data exists in the dataset for the same calendar-month period): `▲ +X% · +$Y vs Jun '25` or `▼ -X%...`. Omitted entirely when no prior-year data is present.
- **Mini ECharts line/area chart:** daily USD totals for each day in the selected month, plotted as exact connected daily points using accumulated spend. For the current month, actual data includes today and any future-dated expenses; remaining days are null and shown with a gray forecast area and dashed reference line. Completed months are entirely actual, including zero-spend days. Gray vertical lines mark week boundaries (each Monday). Tapping a data point shows a tooltip with the date, daily amount, and accumulated total.

### 2.7.4 YEARLY VIEW widget (issue #81)

- Header: **"YEARLY VIEW"** with a single info icon (see 2.7.8 for tooltip behavior)
- Body: two columns, stacking vertically below 480px viewport width
- **Left column — "{YEAR} SO FAR"** (e.g. "2026 SO FAR"):
  - USD total for Jan 1 – today of the current year
  - **Year-over-year deviation:** same logic as MTD, scaled to year-to-date comparison
- **Right column — "Full year FORECAST"**:
  - Projected full-year USD total, based on the recent daily spending rate
  - Shows *"Not enough data"* instead of an amount when the forecast cannot be computed (insufficient recent baseline data)
  - **Year-over-year deviation:** compares the forecast to last year's actual full-year total; shown as muted *"No data"* when the prior year has no recorded expenses at all

### 2.7.5 Aggregation rules

- All aggregations cover **all rows in the sheet for all users** (all `WhoSpent` values). No per-user filtering.
- USD column is used for all monetary totals. Non-USD columns are used only for the dual-currency TODAY display.
- Records with empty USD (legacy or migration data) contribute $0 to totals — no error shown.

### 2.7.6 Setup status badge

The Setup item in the global bottom navigation bar shows an overlaid status icon on the gear icon:
- **Green ✓:** sheet is connected and configuration is valid
- **Red ⚠:** no sheet connected, or `configMode === 'config-invalid'`, or last validation failed

The badge is visible on all pages (rendered by `Layout`). The "Connected · {sheet name}" card that previously appeared inside the Home content area has been removed.

### 2.7.7 Instant Home Screen via Metrics Cache (issue #40)

To eliminate the 5–8 second reload on repeated Home visits, the dashboard persists pre-computed metrics in browser `localStorage` under the key `qe_metrics_{userEmail}`.

**Cache content:** TODAY totals, MTD totals + YoY deviation + daily chart amounts, YTD totals + YoY deviation, Rolling 12M totals, week-boundary positions, `cacheDate` (YYYY-MM-DD), and `sheetLastModifiedTime` (ISO 8601 Drive timestamp, or `null`).

**Cache invalidation rules:**
- A cache from an earlier day is **not** discarded — it is rendered immediately as stale while a refresh runs (see "UX on a cross-day cache hit" below).
- Invalidated when the Drive `modifiedTime` of the spreadsheet is newer than the stored `sheetLastModifiedTime`. Checked on an explicit Home page load **only when the cache is from today** via `GET /api/sheet/modifiedtime` (within the existing `drive.file` scope — no scope change). A cross-day cache always refreshes, so the check is skipped.
- Cleared immediately on sign-out, when the user disconnects their spreadsheet (config clear), and when a different spreadsheet is linked.
- If the Drive API returns `null` for `modifiedTime` (e.g. shared-setup guests whose spreadsheet is not in their `drive.file` grant, or URL-pasted sheets), the same-day cache is not trusted and the app falls back to a full sheet reload on every Home visit.

**After CRUD operations:** When a surgical in-memory mutation completes (append-mode Add, in-place Edit, Delete last), the Home screen recomputes all metrics from the updated in-memory dataset and rewrites the cache immediately. `sheetLastModifiedTime` is stored as the current UTC time (optimistic). Result: Home shows instant, up-to-date data after Add/Edit/Delete — no "Refreshing…" indicator.

**Cache write timing:** After Phase 1 of the two-phase dataset load (recent 24 months). Phase 2 (history > 24 months) may rewrite the cache a second time when it completes, updating YoY comparisons.

**UX on cache hit:** The dashboard renders instantly with cached values while a background `GET /api/sheet/modifiedtime` request validates freshness. A subtle "Refreshing…" status indicator is shown during validation. If the sheet is unchanged, the cached view remains until live records are needed; navigating the MTD card to another month loads the shared dataset and shows an updating placeholder until those records arrive. If the sheet changed, a full reload occurs silently and the cache is updated.

**UX on a cross-day cache hit:** After hours or days of inactivity the dashboard still appears instantly instead of a loading skeleton. The cards are dimmed, an `Updating… · as of <MMM D>` hint states how old the figures are, and a full refresh starts immediately. Because a date rollover invalidates period-relative figures, the TODAY card — and the current-month card when the cache predates the current month — shows an `Updating…` placeholder (with its entry-count link hidden) rather than a wrong number; the year-to-date, forecast and rolling-12-month cards keep showing cached values. When live data arrives, dimming, hint and placeholders disappear together.

### 2.7.8 Widget info tooltips (issue #63)

Each of the 4 dashboard metric cards (TODAY, MTD, YEARLY VIEW, ROLLING 12M) shows a small **info icon (ⓘ)** next to its header. Tapping the icon toggles an inline explanatory tooltip below the header; tapping again (or re-tapping the same icon) hides it. Each widget's tooltip state is independent — opening one does not close the others. All tooltips start collapsed. The icon is keyboard-accessible (button element, `aria-expanded` reflects open state).

Tooltip copy per widget:
- **TODAY:** "Total amount of expenses for today."
- **MTD:** "Total amount of expenses for the ongoing month, compared to the same date range for the previous month (shown only when comparable prior-month data exists)."
- **YEARLY VIEW:** "Total amount of expenses for the ongoing year, compared to the same date range for the previous year (if enough data). The forecast projects your full-year total from your recent daily spending rate." (This also covers the YTD forecast line — there is no separate help icon for it.)
- **ROLLING 12M:** "Total amount of expenses over the trailing 12 months (up to yesterday), compared to the preceding 12-month period (shown when that data exists)."

### 2.7.9 Month details drill-down (issue #89)

Below the MTD chart, a **"Month details"** toggle button expands/collapses a details panel for the selected calendar month (tap again to collapse; collapsed by default). The MTD month navigation loads live records when a fresh metrics-cache view does not yet have the dataset, so prior-month totals and charts are available without first expanding the panel.

- **Average spent per day:** total USD spend for the month-to-date range ÷ the inclusive number of calendar days elapsed so far (days with $0 spend still count).
- **Category breakdown table:** one row per category, the category's percentage of the displayed rows' current-month USD total (one fractional digit), current-month USD total vs. the same date range in the prior calendar month, sorted descending by current-month amount. When the displayed current-month total is zero, the percentage is shown as 0.0%.
  - A row shows the prior-month amount as **"-"** and omits the deviation percentage when the category has no comparable prior-month spend.
  - When the prior-month amount for a category is exactly $0, the deviation percentage is also omitted (avoids showing a meaningless +∞%).
  - When both amounts exist, a signed deviation percentage is shown (▲ red for an increase, ▼ green for a decrease).
  - Numeric values in the table do not wrap; the current-month amount and deviation are kept together with a non-breaking space.
- **Category pie chart:** above the table, one slice per shown category (same Top 5 / All + Group filters). Each slice callout shows the category name plus its whole-dollar USD amount and share of the period (one decimal below 10%, whole number at or above 10%). When more than 10 slices are shown, only the 10 largest keep a callout and a hint below the chart reads *"+N smaller categories — tap a segment for details"*. Tapping or clicking any segment opens a tooltip with the category name, exact amount and share; tapping empty chart area dismisses it.
- **Row filter — "Top 5" / "All":** segmented control limiting the table to the top 5 categories by current-month spend, or showing all.
  - **"Group" toggle:** when enabled, categories whose names share the same first whole word (case-insensitive) are merged into a single row labeled `{first word}...`, using the casing of the first-encountered record. A category's first word must collide with at least one other category *present in the current month* to be grouped — a same-first-word category that only appears in the prior month does not trigger a merge.
- If the panel is expanded before the full dataset has loaded (e.g. straight from a fresh metrics-cache hit), it forces a dataset load and shows a loading spinner instead of stats.
- When there are no expenses in the selected range, the table is replaced with *"No expenses in this period."*

## 2.8 Share Setup with Another User

### 2.8.1 Story 1 — Manage shared access (owner)

A "Share your setup" sub-section is present on the Setup page, visible only to the setup owner (guests do not see it). The owner may add any Gmail address as a guest with access level **Edit** or **View**. No duplicate emails are allowed. Before adding, the backend checks whether the target email already has an independent setup; if so, the add action is blocked with a message: *"This user already has their own setup configured. They need to unlink their sheet first before you can share yours with them."* The sharing list persists in the database; the owner may update (access level only, email is read-only) or remove guests at any time. There is no limit on the number of guests per owner. An informational message between the section title and the user list reminds the owner to also share the Google Spreadsheet file directly in Google Sheets, as the application cannot grant file-level permissions.

### 2.8.2 Story 2 — Receive shared setup (guest)

When a new user authenticates, the backend checks whether any active owner has added that Google email to their share list and the user has no independent setup. If matched, the user's profile stores a reference to the owner record (no configuration data is copied). The guest lands on Home (or Add) after login — not on Setup. If the guest navigates to Setup, they see the owner's settings in read-only mode with a banner: *"This setup has been shared with you by \<owner email\>. You cannot modify it."* Any future changes the owner makes (currencies, column visibility, etc.) are automatically reflected for all guests.

### 2.8.3 Story 3 — Access level enforcement (guest)

- **Edit access:** full access to Add, History (including Edit and Delete).
- **View access:** History (read-only) is available. All write actions (Add, Edit, Delete) remain visible but are locked. Tapping a locked action shows: *"You don't have permission for this action. Contact the setup owner to request access."*
- The backend enforces access level independently — write requests from View-only guests are rejected with HTTP 403 regardless of UI state.
- Setup is read-only for all guests regardless of access level.

### 2.8.4 Story 4 — Broken shared setup recovery (guest)

On every sign-in and authenticated API call, the backend validates that the guest's referenced owner config is intact. If the reference is invalid (owner deleted, spreadsheet removed or inaccessible), the backend flags the guest session as degraded. On the next page load, a blocking modal appears with no other actions available: *"The configuration shared with you is no longer valid. It must be cleared before you can use this application. Would you like to reset and set up from scratch?"* Selecting **No** keeps the modal. Selecting **Yes** clears the guest reference from the database and redirects to Setup for independent configuration.

### 2.8.5 Story 5 — Email notifications for share/revoke events

When a guest is **added**, an email is dispatched fire-and-forget (after the HTTP `201` response) from the configured sender address (`EMAIL_FROM`), to the guest, CC'd to the owner, with Reply-To the owner. Subject: `[QuickExpense] Application setup shared with you`. When a guest is **removed**, a revocation email is dispatched similarly. Subject: `[QuickExpense] Shared setup was revoked from you`. No email is sent when the access level is updated (Edit ↔ View). Email delivery failures are logged server-side only and never surfaced to the UI. Email sending requires `RESEND_API_KEY` and `EMAIL_FROM` env vars; if either is absent at startup, sending is silently skipped and the app runs normally.

# 3\. NON FUNCTIONAL REQUIREMENTS

## 3.1 Platforms

Platforms to run on:

a) Desktop (windows, linux)

b) Android (via web app)

c) iOS (via web app)

## 3.2 Error Handling

What are expected error categories? Answer: standard error responses for:

* Authentication error
* Authorization error
* Spreadsheet not found
* Network failure
* Validation error (e.g. invalid number format, wrong headers in the file)
* Unexpected server error

## 3.3 Concurrency

What if multiple users write simultaneously? Answer:

* Rely on Google Sheets API append operation.
* No manual row indexing.
* Use atomic append endpoint.

Google API Quotas and Rate Limits (Architectural Risk)

* Is there any expected maximum number of users? Answer: Up to 10 per each provided google spreadsheet.
* Is this intended for private family usage only? Answer: mostly yes (at least for V1 mvp).
* In case of any exceeded limits (e.g. per-user and per-project quota) - show an error message explaining the problem and suggestion.

## 3.4 Hosting Environment

This application (at least V1) uses a minimal backend for OAuth, server-side session handling, and Google Sheets API communication.

Frontend should call the backend API rather than calling Google Sheets directly.

## 3.5 Scalability

Search and Tail features are available only if the JSON-serialized response payload returned by Google Sheets API does not exceed 10 MB.  
Payload size is calculated in the browser after full dataset retrieval using the byte size of the JSON string representation of the dataset.  
If the calculated size exceeds 10 MB, Search and Tail operations must be denied with an explanatory error message.

