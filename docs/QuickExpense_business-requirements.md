# PROJECT: Quick Expense (application)

This document describes Business Requirements for the software application.



# 1\. VISION

Small web application or site to manage own/family expenses, supporting key use cases:

1. submit an expense record (Add)
2. view last N entered records (Tail)
3. and search through the archive of expenses (Search)

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

Should access be revalidated on every Add/Tail/Search action? Validate spreadsheet access:

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

d) WhoSpent, text, mandatory. Email of a current user by default, with ability to select via quick search from all previously entered values in this field across the database.

e) ForWhom, text, optional, with ability to select via quick search from all previously entered values in this field across the database - or enter a new text value.

f) Comment, optional, text

g) PaymentChannel, optional, text, with ability to select via quick search from all previously entered values in this field across the database (e.g. "santander", "cash", "pko")

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

* Currency conversion rates are entered manually by the user in the Add flow.
* When adding an expense dated **today**, the form fetches the current market rate from a free key-less exchange-rate API and displays it as a tappable hint next to the rate input: *"Market: X.XX"*. Tapping the hint copies the rate into the input field. If the fetch fails for any reason, the hint is not shown and the form falls back to fully manual entry. The hint is not shown when editing historical expenses.
* Converted USD value must be rounded to 2 decimal places.
* Missing or invalid manual rate input must block Save when a non-USD amount is entered and USD is not entered directly.
* The last-used FX rate for each currency is backed up in the database and pre-filled on the next Add.

What format for currency fields? Answer:

* Decimal numbers allowed.
* Dot as decimal separator.
* Negative values are allowed (for example, when a user sold some item via ebay, so this is a profit instead of expense).

What if identical record is submitted twice? Answer: No duplicate detection in v1. Each Save appends a new row.

## 2.3 New expense submission (Add)

Prerequisites for this step: successful sign in and successful configuration set up complete.

To submit a new expense, click "Add" on a main screen.

On this screen - show Buttons: Back, Save

Upon Save is clicked, the new record should be added to the database (shared google spreadsheet), and file saved.

After successful Add, where does user go? Answer: After Save - show a success message with a green icon, clear the form, stay on Add screen.

On Back - return to a previous screen.

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

If at least one out-of-order date is detected, a persistent red banner is displayed in the header area of **all screens** (Home, Add, Tail, Search):

*"⚠ Critical issue: your sheet's dates are not in chronological order. Open the sheet and sort all rows by Date (ascending) to fix this."*

The banner is not manually dismissible. It disappears automatically the next time the dataset is loaded and no ordering violation is found. When the banner is active, the backend falls back to append mode for all new expense submissions.

### 2.3.4 Edit with date change — row repositioning

When an existing expense is saved with a changed date that would place it out of chronological order relative to its immediate sheet neighbors (the row above or below), the backend **repositions** the row:

1. The expense is written at the chronologically correct position using the same insert/append decision logic as §2.3.2 (backend function `addExpenseRow`).
2. After the new row is confirmed written, the original row is deleted. Insert-before-delete ensures no data loss on partial failure — at worst a duplicate row exists, which is recoverable.
3. If the new date still falls between the row's immediate neighbors, an in-place cell update is performed (no row move, no dataset reload).
4. If the sheet already has a date-order issue (§2.3.3), the editor falls back to in-place update to avoid worsening the situation.

A repositioning write triggers the same non-dismissible loading overlay and full dataset reload as an insert-mode add (§2.3.2). The edit card closes only after the reload completes.

## 2.4 Preload for Home Dashboard, Tail and Search

For the Home dashboard and for Tail and Search operations — upon mounting the relevant screen, the application should check if the dataset is loaded from back-end. Key rules:

* If never loaded (or invalidated a previously loaded data) - then automatically load a fresh dataset.
* If dataset is already loaded in memory and has not been invalidated (by Add or Reload), the application must reuse the in-memory dataset without performing another API call.
* If dataset is not loaded or was invalidated, a fresh dataset must be retrieved before proceeding.

Loaded dataset remains valid only within the current browser session and until a successful Add operation or manual Reload.  
External modifications in the spreadsheet by other users are not automatically detected unless Reload is triggered.  
Header validation is always performed before any operation, but row-level dataset freshness is not automatically revalidated.

**Progressive two-phase loading:** For sheets with a significant history, the initial load returns only the most recent data (default: last 24 months), allowing the Home dashboard and Tail view to become interactive immediately. Older historical records are fetched transparently in the background. The Search screen shows a non-blocking informational message "Complete history is still loading…" while the background fetch is in progress, and removes it automatically when complete. The split threshold and recent window are configurable server-side; for sheets with few records all data loads in a single request with no behavioral difference.

From UI point of view, while loading the data, an icon of 'loading' should be displayed with the text "Loading expenses from Google Sheet…". In case of any errors during load (e.g. no file, no access, not enough memory, and so no), and error message should be displayed under the button.

## 2.5 View last N expenses (Tail)

Prerequisites for this step: successful sign in and successful configuration set up complete.

Button: "Tail".

Opens a new screen allowing to view-only up to last 20 lines added in the database. Based strictly on row order in sheet.

If file contains no or just a few rows? Show only a table with available records. If 0 records available - show an empty table with a message "No records found". If 10 - show as it is i.e. last 10 only. If more than 20 - show last 20.

"Tail" reuses "Search" dataset and vice versa (they share a loaded dataset between each other).

"Add" invalidates loaded dataset.

In terms of a displaying on a client device, if no space on the screen - standard scrolling controls are available. On a smartphone - standard scrolling ability via fingers.

Available buttons on this screen:

* "Back" - to return to a previous screen.
* "Reload" - for on-demand refresh of data from backend. What exactly does Reload refresh? Answer: Reload should a) Re-fetch spreadsheet, b) Rebuild distinct values lists, c) Clear in-memory cache.

## 2.6 Search for expenses (Search)

Prerequisites for this step: successful sign in and successful configuration set up.

To search for expenses, click "Search" on a main screen.

On entering this mode, application should load data from database (i.e. google spreadsheet) into memory. It's assumed to be not more than allowed limit on a dataset response payload (see in a separate section below), so can fit in memory. While loading, an icon of 'loading' should be displayed. In case of any errors during load (e.g. no file, no access, not enough memory, and so no), and error message should be displayed under the button. Show additional button "Reload" here - for on-demand refresh of data from backend. What exactly does Reload refresh? Answer: Reload should a) Re-fetch spreadsheet, b) Rebuild distinct values lists, c) Clear in-memory cache.

After data is loaded, then here are fields on the form:

a) category (to search across the category field in the database). This should be a multi-select dropdown control with all available values across the database.

b) comments (to search across the comments field in the database, via wildcard similar to "LIKE '%x%' in SQL). This is a text control, no default value.

Buttons: Back, Clear, Search.

On Search is clicked, the search process should work like a wildcard in a database. This mean search for any occurrence of entered substring in appropriate fields.

If either field is not filled, exclude it from search.

If any field is filled - use it as 'AND' condition in a search.

If no matching records are found - show a message 'Nothing is found', and button 'Back' which leads to a search screen. Keep previously entered values in input fields if a user returns to this screen.

If any records are found - show a table with records, with the same columns/names/values as described in "Add expense" section.

Why only category and comment searchable? Answer: Version 1 supports only:

* Category (multi-select exact match)
* Comment (substring match, case-insensitive)

Future versions may extend filters.

Is search case-sensitive? Answer: Search must be case-insensitive.

Should search be client-side or server-side? Answer: Search is client-side after the backend loads the spreadsheet dataset through Google Sheets API. Every time the search dataset is prepared - check the size of a response payload, and if exceeds allowed size (see in the separate section below) then show an error that the file is too big, deny search, allow only returning to previous screen and other functions. Assumptions: files less than the defined limit are acceptable for client devices (smartphones, pc web browser).

What if 100+ results found? Answer: show an information message "Too many records found", show only first 100, and show a total count of matching records. Allow user to return and refine conditions for a search. NO pagination in v1.

No sorting, only sequential display of found items according to their position in the dataset.

Available buttons on this screen:

* "Back" - persist filter values during session only, then return to a previous screen.
* "Clear" - clear entered values (if any), remain on the current screen.
* "Reload" - for on-demand refresh of data from backend. What exactly does Reload refresh? Answer: Reload should a) Re-fetch spreadsheet, b) Rebuild distinct values lists, c) Clear in-memory cache.

## 2.7 Home Screen Dashboard

When a user is authenticated **and** has a sheet configured **and** the sheet contains at least one expense record, the home screen displays a spending summary dashboard instead of a simple navigation menu.

### 2.7.1 Data source and loading

Dashboard data is loaded via the same mechanism as Tail/Search (shared in-memory dataset). If a valid cache exists (e.g. from a recent Tail or Add visit), it is reused without an extra network call. While loading, skeleton placeholders are shown for each metric card. If loading fails, an error banner with a Retry action is shown.

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
- **Mini area chart:** daily USD totals for each day in the current month (past days filled, future days empty). Gray vertical lines mark week boundaries (each Monday). Tapping a data point shows a tooltip `{date} · ${amount}`.

### 2.7.4 YEAR SO FAR (YTD) card

- Header: **"{YEAR} SO FAR"** (e.g. "2026 SO FAR")
- Right side: **"Details"** link (inline, not navigating) — tapping shows *"This feature is in development — coming soon."* inline; tapping anywhere else dismisses it
- Body: USD total for Jan 1 – today of the current year
- **Year-over-year deviation:** same logic as MTD, scaled to year-to-date comparison

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
- Invalidated at midnight — `cacheDate` ≠ today on next page load.
- Invalidated when the Drive `modifiedTime` of the spreadsheet is newer than the stored `sheetLastModifiedTime`. Checked on every explicit Home page load via `GET /api/sheet/modifiedtime` (within the existing `drive.file` scope — no scope change).
- Cleared immediately on sign-out and when the user disconnects their spreadsheet (config clear).
- If the Drive API returns `null` for `modifiedTime` (e.g. shared-setup guests whose spreadsheet is not in their `drive.file` grant, or URL-pasted sheets), the cache is not used and the app falls back to a full sheet reload on every Home visit.

**After CRUD operations:** When a surgical in-memory mutation completes (append-mode Add, in-place Edit, Delete last), the Home screen recomputes all metrics from the updated in-memory dataset and rewrites the cache immediately. `sheetLastModifiedTime` is stored as the current UTC time (optimistic). Result: Home shows instant, up-to-date data after Add/Edit/Delete — no "Refreshing…" indicator.

**Cache write timing:** After Phase 1 of the two-phase dataset load (recent 24 months). Phase 2 (history > 24 months) may rewrite the cache a second time when it completes, updating YoY comparisons.

**UX on cache hit:** The dashboard renders instantly with cached values while a background `GET /api/sheet/modifiedtime` request validates freshness. A subtle "Refreshing…" status indicator is shown during validation. If the sheet is unchanged, the indicator disappears and the cached view remains. If the sheet changed, a full reload occurs silently and the cache is updated.

## 2.8 Share Setup with Another User

### 2.8.1 Story 1 — Manage shared access (owner)

A "Share your setup" sub-section is present on the Setup page, visible only to the setup owner (guests do not see it). The owner may add any Gmail address as a guest with access level **Edit** or **View**. No duplicate emails are allowed. Before adding, the backend checks whether the target email already has an independent setup; if so, the add action is blocked with a message: *"This user already has their own setup configured. They need to unlink their sheet first before you can share yours with them."* The sharing list persists in the database; the owner may update (access level only, email is read-only) or remove guests at any time. There is no limit on the number of guests per owner. An informational message between the section title and the user list reminds the owner to also share the Google Spreadsheet file directly in Google Sheets, as the application cannot grant file-level permissions.

### 2.8.2 Story 2 — Receive shared setup (guest)

When a new user authenticates, the backend checks whether any active owner has added that Google email to their share list and the user has no independent setup. If matched, the user's profile stores a reference to the owner record (no configuration data is copied). The guest lands on Home (or Add) after login — not on Setup. If the guest navigates to Setup, they see the owner's settings in read-only mode with a banner: *"This setup has been shared with you by \<owner email\>. You cannot modify it."* Any future changes the owner makes (currencies, column visibility, etc.) are automatically reflected for all guests.

### 2.8.3 Story 3 — Access level enforcement (guest)

- **Edit access:** full access to Add, Tail, Search, Edit, and Delete.
- **View access:** Tail and Search are available. All write actions (Add, Edit, Delete) remain visible but are locked. Tapping a locked action shows: *"You don't have permission for this action. Contact the setup owner to request access."*
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

