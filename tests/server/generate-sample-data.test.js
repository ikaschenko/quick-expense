// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const shell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
const hasPowerShell = !spawnSync(shell, ['-NoProfile', '-Command', 'exit 0']).error;
const generator = resolve('docs/demo/generate-sample-data.ps1');
const categories = [
  'Housing', 'Education', 'Internet & Mobile', 'Housing - Utilities', 'Subscriptions',
  'Entertainment & Leisure', 'Food & Groceries', 'Dining Out', 'Car', 'Transport',
  'Household Supplies', 'Personal Care & Self-care', 'Clothing & Footwear', 'Healthcare',
  'Healthcare - Dental', 'Hobbies', 'Gifts', 'Charity', 'Insurance', 'Investments',
  'Home Goods', 'Unplanned Expenses', 'Junk Food', 'Personal Cash', 'Housing - Renovation',
];
const header = 'Date,GBP,EUR,USD,Category,Spent By,Spent For,Comment,Channel,Theme';
const source = `${header}\n7/14/2026,,,1000,Housing,,,mortgage,,\n7/15/2026,,,"$2,484.05",Home Goods,,,"TV, ""demo""\nsecond line",,\n`;
const literal = (value) => `'${value.replaceAll("'", "''")}'`;

describe.skipIf(!hasPowerShell)('generate-sample-data CLI (requires PowerShell)', () => {
  let directory;
  let config;
  let expenses;
  let output;
  const parsedFiles = new Map();

  function run(extra = [], destination = output) {
    const endDate = extra.includes('-EndDate') ? [] : ['-EndDate', '2026-10-26'];
    return execFileSync(shell, [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', generator,
      '-ConfigCsv', config, '-OutputDirectory', destination,
      ...endDate, ...extra,
    ], { encoding: 'utf8', stdio: 'pipe', timeout: 30000 });
  }

  function rows(name, destination = output) {
    const path = join(destination, name);
    if (parsedFiles.has(path)) return parsedFiles.get(path);
    const parsed = JSON.parse(execFileSync(shell, [
      '-NoProfile', '-Command', `ConvertTo-Json -InputObject @(Import-Csv -LiteralPath ${literal(path)}) -Compress`,
    ], { encoding: 'utf8', timeout: 30000 }));
    parsedFiles.set(path, parsed);
    return parsed;
  }

  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'qe-demo-test-'));
    config = join(directory, 'config.csv');
    expenses = join(directory, 'expenses.csv');
    output = join(directory, 'output');
    writeFileSync(config, `Categories\n${categories.join('\n')}\n`);
    writeFileSync(expenses, source);
    run(['-ExpensesCsv', expenses]);
  }, 30000);

  afterAll(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it('should preserve every historical cell and leave the source file unchanged', () => {
    const complete = rows('sample-expenses-complete.csv');
    const original = JSON.parse(execFileSync(shell, [
      '-NoProfile', '-Command', `ConvertTo-Json -InputObject @(Import-Csv -LiteralPath ${literal(expenses)}) -Compress`,
    ], { encoding: 'utf8' }));
    expect(complete.slice(0, 2)).toEqual(original);
    expect(readFileSync(expenses, 'utf8')).toBe(source);
    expect(complete.length).toBe(rows('sample-expenses-append.csv').length + 2);
  }, 30000);

  it('should generate ordered rows only within the missing date range', () => {
    const added = rows('sample-expenses-append.csv');
    const dates = added.map((row) => {
      const [month, day, year] = row.Date.split('/').map(Number);
      return Date.UTC(year, month - 1, day);
    });
    expect(dates[0]).toBe(Date.UTC(2026, 6, 16));
    expect(dates.at(-1)).toBe(Date.UTC(2026, 9, 26));
    expect(dates).toEqual([...dates].sort((left, right) => left - right));
    expect(added.every((row) => categories.includes(row.Category))).toBe(true);
    expect(added.every((row) => /^\d+\.\d{2}$/.test(row.USD) && Number(row.USD) > 0)).toBe(true);
    expect(added.every((row) => row.Channel === '' && row.Theme === '')).toBe(true);
    expect(added.every((row) => ['Alex', 'Jamie'].includes(row['Spent By']))).toBe(true);
  }, 30000);

  it('should account for existing July spending, the vacation, and partial October', () => {
    const summary = rows('sample-expenses-summary.csv');
    const added = rows('sample-expenses-append.csv');
    expect(summary.map((row) => row.Month)).toEqual(['2026-07', '2026-08', '2026-09', '2026-10']);
    for (const month of summary) {
      const cents = added.filter((row) => Number(row.Date.split('/')[0]) === Number(month.Month.slice(5)))
        .reduce((sum, row) => sum + Math.round(Number(row.USD) * 100), 0);
      expect(cents).toBe(Math.round(Number(month.AddedUSD) * 100));
      expect(Math.round((Number(month.ExistingUSD) + Number(month.AddedUSD)) * 100))
        .toBe(Math.round(Number(month.TotalUSD) * 100));
    }
    expect(summary[0].ExistingUSD).toBe('3484.05');
    expect(Number(summary[0].TotalUSD)).toBeGreaterThanOrEqual(4000);
    expect(Number(summary[0].TotalUSD)).toBeLessThanOrEqual(5000);
    expect(Number(summary[1].TotalUSD)).toBeGreaterThanOrEqual(8000);
    expect(Number(summary[1].TotalUSD)).toBeLessThanOrEqual(10000);
    expect(Number(summary[3].TotalUSD)).toBeCloseTo(Number(summary[3].FullMonthTargetUSD) * 26 / 31, 2);
  }, 30000);

  it('should use consistent synthetic FX equivalents only on foreign purchases', () => {
    const added = rows('sample-expenses-append.csv');
    expect(added.some((row) => row.GBP)).toBe(true);
    expect(added.some((row) => row.EUR)).toBe(true);
    expect(added.some((row) => !row.GBP && !row.EUR)).toBe(true);
    for (const row of added) {
      expect(Boolean(row.GBP && row.EUR)).toBe(false);
      if (row.GBP) expect(Number(row.GBP)).toBeCloseTo(Number(row.USD) * 0.75, 2);
      if (row.EUR) expect(Number(row.EUR)).toBeCloseTo(Number(row.USD) * 0.85, 2);
    }
  }, 30000);

  it('should reproduce the same files with the same inputs and seed', () => {
    const repeated = join(directory, 'repeated');
    run(['-ExpensesCsv', expenses], repeated);
    for (const file of ['sample-expenses-append.csv', 'sample-expenses-complete.csv', 'sample-expenses-summary.csv']) {
      expect(readFileSync(join(repeated, file))).toEqual(readFileSync(join(output, file)));
    }
  }, 30000);

  it('should refuse to overwrite an existing output', () => {
    const before = readFileSync(join(output, 'sample-expenses-append.csv'));
    expect(() => run(['-ExpensesCsv', expenses])).toThrow(/Output already exists/);
    expect(readFileSync(join(output, 'sample-expenses-append.csv'))).toEqual(before);
  }, 30000);

  it('should regenerate a complete history and handle leap day', () => {
    const regenerated = join(directory, 'regenerated');
    run(['-StartDate', '2024-02-01', '-EndDate', '2024-02-29'], regenerated);
    const added = rows('sample-expenses-append.csv', regenerated);
    expect(added[0].Date).toBe('2/1/2024');
    expect(added.at(-1).Date).toBe('2/29/2024');
    expect(rows('sample-expenses-complete.csv', regenerated)).toEqual(added);
  }, 30000);

  it.each([
    ['already current', source, ['-EndDate', '2026-07-15'], /nothing was written/],
    ['invalid date', source.replace('7/15/2026', '2/30/2026'), [], /FormatException/],
    ['unsorted dates', source.replace('7/14/2026', '7/16/2026'), [], /ascending date order/],
    ['invalid amount', source.replace('1000,Housing', '-1,Housing'), [], /positive USD amount/],
    ['unknown category', source.replace('Home Goods', 'Secret Category'), [], /Unknown existing category/],
    ['incorrect headers', source.replace('Spent By', 'Payer'), [], /headers must be exactly/],
    ['over budget', source.replace('$2,484.05', '$9,484.05'), [], /exceed.*budget/],
  ])('should reject %s without creating outputs', (name, contents, extra, message) => {
    const invalid = join(directory, `${name}.csv`);
    writeFileSync(invalid, contents);
    expect(() => run(['-ExpensesCsv', invalid, ...extra], join(directory, name))).toThrow(message);
  }, 30000);
});