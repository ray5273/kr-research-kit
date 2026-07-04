# Script Inputs

## `scripts/fetch-sec-edgar.js`

Run live collection:

```text
SEC_USER_AGENT="KrResearchKit your-email@example.com" node skills/us-sec-analysis/scripts/fetch-sec-edgar.js --ticker AAPL --output analysis-example/us/Apple
```

Equivalent explicit user-agent form:

```text
node skills/us-sec-analysis/scripts/fetch-sec-edgar.js --ticker AAPL --forms 10-K,10-Q,8-K --output .tmp/sec-test --user-agent "KrResearchKit your-email@example.com"
```

Important flags:

- `--ticker <AAPL>` or `--cik <0000320193>`: one is required.
- `--forms <10-K,10-Q,8-K>`: comma-separated forms; default is `10-K,10-Q,8-K`.
- `--output <dir>`: required output directory.
- `--cache-dir <dir>`: defaults to `.tmp/sec-edgar-cache/`.
- `--user-agent <value>`: overrides `SEC_USER_AGENT`.
- `--fixture-dir <dir>`: offline validation mode using bundled sample SEC JSON/HTML files.

Outputs:

- `sec-filing-export.json`
- `sec-companyfacts.json`
- `sec-submissions.json`
- `latest-10k.txt` / `latest-10q.txt` / `latest-8k.txt` when selected filing HTML is available
- raw `.html` siblings for downloaded primary documents

Fixture example:

- [`examples/us-sec-analysis/submissions-aapl-sample.json`](../../../examples/us-sec-analysis/submissions-aapl-sample.json)

## `scripts/extract-sec-sections.js`

Run:

```text
node skills/us-sec-analysis/scripts/extract-sec-sections.js --input .tmp/sec-test/latest-10k.txt --form 10-K --output .tmp/sec-test/sec-sections.json
```

Inputs:

- plain-text filing export from `fetch-sec-edgar.js`
- `--form 10-K` or `--form 10-Q`

Output statuses:

- `parsed`
- `partial`
- `missing`
- `needs_review`

## `scripts/build-sec-reference.js`

Run:

```text
node skills/us-sec-analysis/scripts/build-sec-reference.js --input .tmp/sec-test/sec-filing-export.json --sections .tmp/sec-test/sec-sections.json --facts .tmp/sec-test/sec-companyfacts.json --output .tmp/sec-test/sec-reference.md --cache-out .tmp/sec-test/sec-cache.json
```

Outputs:

- `sec-reference.md`: Korean reference digest with filing set, XBRL summary, section coverage, and Source Map.
- `sec-cache.json`: machine-readable cache for later `us-stock-analysis` reuse.

Use this after any memo-critical 10-K/10-Q read so downstream analysis can cite a stable SEC evidence pack.
