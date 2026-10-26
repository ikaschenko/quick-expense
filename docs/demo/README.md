# Demo Sample Data

Use [generate-sample-data.ps1](generate-sample-data.ps1) to extend an existing fictional expense history or generate a replacement history. It runs locally, uses PowerShell's CSV parser, needs no npm packages, and never contacts Google or reads app credentials. Requires Windows PowerShell 5.1 or PowerShell 7 (`pwsh` on macOS/Linux).

## Ready-To-Import Snapshot

The [2026-10-26 output](generated/2026-10-26/sample-expenses-append.csv) extends the supplied July 15 snapshot through October 26, 2026. The existing spreadsheet was not changed.

| Month | Existing USD | Added USD | Total USD |
| --- | ---: | ---: | ---: |
| July 2026 | 3,484.05 | 988.09 | 4,472.14 |
| August 2026 | 0.00 | 9,048.28 | 9,048.28 |
| September 2026 | 0.00 | 4,504.43 | 4,504.43 |
| October 1-26, 2026 | 0.00 | 3,489.52 | 3,489.52 |

The snapshot has 229 new rows. August includes a $4,200 family holiday. October is incomplete: its full-month target is $4,160.58. Historical months are mostly $2,700-$3,400, so the new $4,000-$5,000 monthly pattern intentionally increases spending without changing history.

## Extend The Latest Export

Run from the repository root in PowerShell. Export the current Expenses tab as CSV before every update; do not reuse an older export after importing new rows.

```powershell
& './docs/demo/generate-sample-data.ps1' `
  -ConfigCsv './docs/demo/sample-categories.csv' `
  -ExpensesCsv "$HOME/Downloads/QuickExpense_ENG_Sample-2yr - Expenses.csv" `
  -EndDate '2026-10-26' `
  -OutputDirectory './docs/demo/generated/next-recording'
```

Replace the end date and output directory for each recording. Omitting `EndDate` uses the local date. A Config-tab CSV export with a `Categories` column can replace the included [category snapshot](sample-categories.csv).

If execution policy blocks the script, run the same arguments with `powershell.exe -NoProfile -ExecutionPolicy Bypass -File './docs/demo/generate-sample-data.ps1'`. This applies only to that process; do not change the machine-wide policy.

The generator detects the last expense date and starts the following day. It requires ascending dates and exactly these headers, in this order:

```text
Date,GBP,EUR,USD,Category,Spent By,Spent For,Comment,Channel,Theme
```

Historical cells are preserved as spreadsheet values, including formatted USD strings, empty fields, quoted text, and multiline comments. Missing trailing CSV fields become explicit empty cells. CSV quoting/encoding may differ, so the complete export is not byte-for-byte identical to the source. Dates use `M/d/yyyy`; new currency amounts are plain decimal numbers. Invalid dates, nonpositive/invalid USD values, unknown categories, and mismatched headers stop generation. Empty history requires regeneration mode.

## Import Safely

1. In Google Sheets, make a backup copy of the demo spreadsheet. Confirm the live Expenses tab still ends on July 15, 2026 before using the ready-made append snapshot. If it has changed, regenerate from its latest export instead.
2. Use **File > Import > Upload** to import `sample-expenses-append.csv` as a **new temporary sheet**. Keep automatic conversion of dates and numbers enabled. This CSV contains a header row: do not blindly append the whole file.
3. Confirm the temporary tab has 10 columns, 229 data rows for this snapshot, dates from July 16 through October 26, and numeric amounts. Check the USD monthly sums against `sample-expenses-summary.csv`.
4. Copy only the data rows, excluding the header, and paste **values only** into the first empty row of the existing Expenses tab, columns A:J. Keep the existing Config tab, formatting, column mapping, and permissions unchanged.
5. Confirm chronological order, the absence of a second header, and the final date. Refresh QuickExpense, check monthly/yearly views, and test a search for `summer holiday` or the fictional names.
6. Delete the temporary import tab after verification. Do not import the same append file twice: this manual workflow has no duplicate detection.

Outputs:

- `sample-expenses-append.csv`: new rows only, plus a header. Use this for an existing spreadsheet.
- `sample-expenses-complete.csv`: historical rows followed by new rows, plus a header. Use only for a separate replacement/demo copy; appending it duplicates history.
- `sample-expenses-summary.csv`: totals for the affected months, distinguishing existing spend, additions, full-month targets, and partial months.

The script never modifies the input or an existing output file. Pick a new output directory for reruns. Validation and generation happen before writing; a disk/permission error while exporting can still leave partial output files, which should not be imported.

## Regenerate A Whole History

For a fresh fictional dataset, omit `ExpensesCsv` and provide a first-of-month `StartDate`:

```powershell
& './docs/demo/generate-sample-data.ps1' `
  -ConfigCsv './docs/demo/sample-categories.csv' `
  -StartDate '2024-07-01' `
  -EndDate '2026-10-26' `
  -Seed 20261026 `
  -OutputDirectory './docs/demo/generated/regenerated-2026-10-26'
```

In regeneration mode, append and complete files contain the same new history. Use a new spreadsheet or a backup copy, never overwrite real family expenses. To extend a regenerated or updated dataset later, use its complete CSV or a fresh spreadsheet export as `ExpensesCsv`.

## Fictional Household Model

- Family of five: adults Alex and Jamie; children Sam, Taylor, and Casey. Names, comments, and purchases are invented, with no addresses, emails, contacts, or account numbers in generated rows. Review any historical input separately before publishing it.
- Ordinary monthly target: `MonthlyBudget` (default $4,500, allowed $4,000-$5,000) with seeded variation of up to 8%. The default stays within about $4,140-$4,860. Nondefault budgets also vary, so their totals can fall outside $4,000-$5,000.
- Fixed bills: $1,500 mortgage, $460 education, $95 internet/mobile, $170 utilities, $40 subscriptions. Every October includes $600 home insurance; every August includes the $4,200 vacation. There is no car-purchase event in the current profile.
- Weekly groceries, top-ups, takeaway, and fuel; smaller daily purchases and periodic household, healthcare, clothing, hobby, and other expenses. Variable purchase weights are scaled to meet the monthly target exactly, so they are illustrative, not market-price estimates.
- Partial final months use the elapsed-day fraction of the month's target. Existing spending in the starting month is subtracted before allocating remaining bills and variable purchases. If the remaining budget cannot cover them, generation fails rather than changing history.
- USD is the canonical amount on every row. Most new rows have no foreign currency. Vacation has EUR; occasional hobby purchases have GBP. Synthetic rates are **1 USD = 0.85 EUR / 0.75 GBP**, not live or historical FX quotes. These are equivalents of the USD value, not additional expenses to add together. Old FX cells remain unchanged even if inconsistent.
- `Channel` and `Theme` remain blank. Existing categories are retained, including `Investments` and `Personal Cash`; as in the original demo, they contribute to displayed expense totals.
- Same inputs, seed, parameters, and PowerShell version reproduce the same files. Extending in multiple batches preserves prior rows but does not promise the identical result of a single longer generation, because remaining-month allocations are recalculated.

## Verification

```powershell
npm test -- tests/server/generate-sample-data.test.js
npm test
```

CLI tests cover preservation of history, CSV quoting, date boundaries and leap day, monthly totals, FX, repeatability, overwrite protection, and malformed inputs. Windows tests use the built-in `powershell.exe`; other platforms require `pwsh`, and explicitly skip this suite when it is unavailable. V8 coverage does not measure the PowerShell subprocess.

The original AI conversation/script has not been recovered; this is a replacement generator based on the supplied Expenses/Config exports and the confirmed demo requirements.