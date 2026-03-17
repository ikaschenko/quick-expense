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

Single sheet = named "Expenses" (Version 1 supports exactly one predefined sheet named Expenses. Other sheets are ignored.)

First row = header, see below list of columns and their sequence/types.

Fields list:

a) Date, mandatory, ISO format YYYY-MM-DD. By default, fill with Today date (Client local timezone), but allow some standard date picker control for a user to set another date.

b) Sum (group of fields), filling at least 1 of those fields is mandatory with a number (currency)

\- PLN

\- BYN

\- USD

\- EUR

c) Category, free text, mandatory (with ability to select via quick search from all previously entered values in this field across the database)

d) WhoSpent, text, mandatory. Email of a current user by default, with ability to select via quick search from all previously entered values in this field across the database.

e) ForWhom, text, optional, with ability to select via quick search from all previously entered values in this field across the database - or enter a new text value.

f) Comment, optional, text

g) PaymentChannel, optional, text, with ability to select via quick search from all previously entered values in this field across the database (e.g. "santander", "cash", "pko")

h) Theme, optional, text, with ability to select via quick search from all previously entered values in this field across the database

The header row in the "Expenses" sheet must contain the following column names in this exact order:

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

Header validation must check exact match (case-sensitive) and exact column order.

Application validates header row on Setup. Also, re-validation should occur on every Add, Tail, Search operations. This prevents from any manual modifications after Setup.

What happens if the spreadsheet exists but has no correct header structure? Answer: On Setup:

\- If sheet is empty → auto-create header row.

\- If sheet exists but headers mismatch → show blocking error and do not allow usage.

Can multiple currency fields be filled simultaneously? Answer: Allow USD together with at most one non-USD currency. Only one of PLN, BYN, or EUR may be filled at a time.

Currency conversion: Here are key cases:

* If a non-USD field is being filled, the user may enter a manual USD conversion rate for that currency and the application derives the USD field from it.
* If a USD field is being filled, no automatic conversion is performed for any non-USD field.

For the conversion of currency, here are key guidelines:

* Currency conversion rates are entered manually by the user in the Add flow.
* No external exchange-rate API integration is required in v1.
* Converted USD value must be rounded to 2 decimal places.
* Missing or invalid manual rate input must block Save when a non-USD amount is entered and USD is not entered directly.

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

## 2.4 Preload for Tail and Search

For operations like Tail and Search - upon clicking appropriate buttons on main screen, the application should check if the dataset is loaded from back-end. Key rules:

* If never loaded (or invalidated a previously loaded data) - then automatically load a fresh dataset.
* If dataset is already loaded in memory and has not been invalidated (by Add or Reload), the application must reuse the in-memory dataset without performing another API call.
* If dataset is not loaded or was invalidated, a fresh dataset must be retrieved before proceeding.

Loaded dataset remains valid only within the current browser session and until a successful Add operation or manual Reload.  
External modifications in the spreadsheet by other users are not automatically detected unless Reload is triggered.  
Header validation is always performed before any operation, but row-level dataset freshness is not automatically revalidated.

From UI point of view, while loading the data, an icon of 'loading' should be displayed. In case of any errors during load (e.g. no file, no access, not enough memory, and so no), and error message should be displayed under the button.

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

