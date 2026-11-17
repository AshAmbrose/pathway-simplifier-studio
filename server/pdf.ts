/**
 * Prints an HTML page to PDF with the local Chrome (headless), for the Finish report. Chrome's own engine prints
 * the page exactly as the app draws it: vector figure, and every label as written (Greek letters, sub- and
 * superscripts), which a PDF library's built-in fonts can't do.
 *
 * Everything stays on this machine: the page is written to a temporary folder, printed, read back and deleted.
 * Returns null when no Chrome is found (set the CHROME_PATH environment variable to point at one); the browser then falls
 * back to its own print dialog.
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  process.env.CHROME_PATH ?? '',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
];
export const chromePath = () => CANDIDATES.find((p) => p && existsSync(p)) ?? null;

export function htmlToPdf(html: string): Promise<Buffer | null> {
  const chrome = chromePath();
  if (!chrome) return Promise.resolve(null);
  const dir = mkdtempSync(join(tmpdir(), 'pss-report-'));
  const page = join(dir, 'report.html'), out = join(dir, 'report.pdf');
  writeFileSync(page, html);
  return new Promise((resolve, reject) => {
    execFile(chrome, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--user-data-dir=${join(dir, 'profile')}`, `--print-to-pdf=${out}`, `file://${page}`],
      { timeout: 60_000 }, (err) => {
        try {
          if (!existsSync(out)) return reject(err ?? new Error('Chrome made no PDF.'));
          resolve(readFileSync(out));
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      });
  });
}
