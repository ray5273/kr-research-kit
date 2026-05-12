$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$skillsRoot = Join-Path $repoRoot "skills"
$requiredFiles = @(
    "SKILL.md"
)
$requiredReferenceFiles = @(
    "references\workflow.md",
    "references\output-format.md"
)
$sectorSkillNames = @(
    "kr-sector-plan",
    "kr-sector-data-pack",
    "kr-sector-analysis",
    "kr-sector-compare",
    "kr-sector-audit",
    "kr-sector-update"
)
$tempBase = Join-Path $repoRoot ".tmp"
New-Item -ItemType Directory -Force -Path $tempBase | Out-Null
$tempRoot = Join-Path $tempBase ("stock-skill-validate-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempRoot | Out-Null
$extensionDir = Join-Path $repoRoot "integrations\claude-dart-extension"

try {
Push-Location $repoRoot

$skillDirs = Get-ChildItem -Path $skillsRoot -Directory

if ($skillDirs.Count -eq 0) {
    Write-Error "No skills found under $skillsRoot"
}

foreach ($skillDir in $skillDirs) {
    Write-Host "Validating $($skillDir.Name)..."

    foreach ($relativePath in $requiredFiles) {
        $fullPath = Join-Path $skillDir.FullName $relativePath
        if (-not (Test-Path $fullPath)) {
            Write-Error "Missing required file: $fullPath"
        }
    }

    $openaiYaml = Join-Path $skillDir.FullName "agents\openai.yaml"
    if (-not (Test-Path $openaiYaml)) {
        Write-Warning "agents/openai.yaml not found in $($skillDir.Name) (required for Codex, not needed for Claude Code)"
    }

    if ($sectorSkillNames -contains $skillDir.Name) {
        foreach ($relativePath in $requiredReferenceFiles) {
            $fullPath = Join-Path $skillDir.FullName $relativePath
            if (-not (Test-Path $fullPath)) {
                Write-Error "Missing required sector reference file: $fullPath"
            }
        }
    }

    $skillMd = [System.IO.File]::ReadAllText((Join-Path $skillDir.FullName "SKILL.md"))
    if ($skillMd -notmatch "(?s)^---\r?\nname:\s.+?\r?\ndescription:\s.+?\r?\n---") {
        Write-Error "Invalid or missing frontmatter in $($skillDir.FullName)\SKILL.md"
    }

    Get-ChildItem -Path $skillDir.FullName -Recurse -Filter "*.js" | ForEach-Object {
        $relativeJsPath = Resolve-Path -Relative $_.FullName
        node --check $relativeJsPath | Out-Null
    }

    if (Test-Path $extensionDir) {
        Get-ChildItem -Path $extensionDir -Filter "*.js" | ForEach-Object {
            node --check $_.FullName | Out-Null
        }
    }

    if ($skillDir.Name -eq "kr-stock-analysis") {
        $chartSample = ".\examples\kr-stock-analysis\chart-sample.json"
        $chartScript = ".\skills\kr-stock-analysis\scripts\chart-basics.js"
        $fetchScript = ".\skills\kr-stock-analysis\scripts\fetch-kr-chart.js"
        $chartOut = ".\.tmp\$(Split-Path -Leaf $tempRoot)\kr-chart.png"
        $chartOverlayOut = ".\.tmp\$(Split-Path -Leaf $tempRoot)\kr-chart-overlay.png"
        $chartMomentumOut = ".\.tmp\$(Split-Path -Leaf $tempRoot)\kr-chart-momentum.png"

        $chartStderr = Join-Path $tempRoot "kr-chart.stderr"
        node $chartScript --input $chartSample --png-out $chartOut --image-path "chart.png" 2>$chartStderr | Out-Null
        if (Test-Path $chartStderr) {
            $chartFontLines = Get-Content -Path $chartStderr | Where-Object { $_ -match '\[font\]' }
            if (-not ($chartFontLines | Where-Object { $_ -match 'external=(true|available)' })) {
                $reason = if ($chartFontLines) { $chartFontLines[-1] } else { "no [font] signal" }
                Write-Warning "chart-basics.js rendered via bitmap fallback - Korean glyphs may be incomplete ($reason). Set KR_STOCK_CHART_FONT or install a Korean font."
            }
        }
        if (-not (Test-Path $chartOut) -or (Get-Item $chartOut).Length -le 0) {
            Write-Error "Expected chart PNG was not created: $chartOut"
        }
        if (-not (Test-Path $chartOverlayOut) -or (Get-Item $chartOverlayOut).Length -le 0) {
            Write-Error "Expected overlay chart PNG was not created: $chartOverlayOut"
        }
        if (-not (Test-Path $chartMomentumOut) -or (Get-Item $chartMomentumOut).Length -le 0) {
            Write-Error "Expected momentum chart PNG was not created: $chartMomentumOut"
        }

        node $fetchScript --help | Out-Null

        $valuationSample = ".\examples\kr-stock-analysis\valuation-band-sample.json"
        $valuationScript = ".\skills\kr-stock-analysis\scripts\valuation-chart.js"
        $valuationOut = ".\.tmp\$(Split-Path -Leaf $tempRoot)\kr-valuation.png"
        $valuationOutPer = ".\.tmp\$(Split-Path -Leaf $tempRoot)\kr-valuation-per.png"
        $valuationOutPbr = ".\.tmp\$(Split-Path -Leaf $tempRoot)\kr-valuation-pbr.png"

        $valuationStderr = Join-Path $tempRoot "kr-valuation.stderr"
        node $valuationScript --input $valuationSample --png-out $valuationOut --image-path "valuation.png" 2>$valuationStderr | Out-Null
        if (Test-Path $valuationStderr) {
            $valuationFontLines = Get-Content -Path $valuationStderr | Where-Object { $_ -match '\[font\]' }
            if (-not ($valuationFontLines | Where-Object { $_ -match 'external=(true|available)' })) {
                $reason = if ($valuationFontLines) { $valuationFontLines[-1] } else { "no [font] signal" }
                Write-Warning "valuation-chart.js rendered via bitmap fallback - Korean glyphs may be incomplete ($reason). Set KR_STOCK_CHART_FONT or install a Korean font."
            }
        }
        if (-not (Test-Path $valuationOutPer) -or (Get-Item $valuationOutPer).Length -le 0) {
            Write-Error "Expected PER valuation PNG was not created: $valuationOutPer"
        }
        if (-not (Test-Path $valuationOutPbr) -or (Get-Item $valuationOutPbr).Length -le 0) {
            Write-Error "Expected PBR valuation PNG was not created: $valuationOutPbr"
        }

        $stockOutputFormat = [System.IO.File]::ReadAllText((Join-Path $repoRoot "skills\kr-stock-analysis\references\output-format.md"))
        if (-not $stockOutputFormat.Contains("Decision Frame")) {
            Write-Error "Expected full memo output format to include Decision Frame."
        }
        if (-not $stockOutputFormat.Contains("DART Recheck")) {
            Write-Error "Expected full memo output format to include DART Recheck."
        }
        if (-not $stockOutputFormat.Contains("Street / Alternative Views")) {
            Write-Error "Expected full memo output format to include Street / Alternative Views."
        }
        if (-not $stockOutputFormat.Contains("Uncomfortable Questions")) {
            Write-Error "Expected full memo output format to include Uncomfortable Questions."
        }
        if (-not $stockOutputFormat.Contains("Decision-Changing Issues")) {
            Write-Error "Expected full memo output format to include Decision-Changing Issues."
        }
        if (-not $stockOutputFormat.Contains("Structured Stance")) {
            Write-Error "Expected full memo output format to include Structured Stance."
        }
        if (-not $stockOutputFormat.Contains("Follow-up Research Prompts")) {
            Write-Error "Expected full memo output format to include Follow-up Research Prompts."
        }

        if (-not $skillMd.Contains("## Source Roles")) {
            Write-Error "Expected kr-stock-analysis skill rules to define source roles."
        }
        if (-not $skillMd.Contains('For a `full memo`, lead with `Decision Frame`')) {
            Write-Error "Expected kr-stock-analysis skill rules to scope Decision Frame to full memos."
        }
        if (-not $skillMd.Contains('references/uncomfortable-question-rubric.md')) {
            Write-Error "Expected kr-stock-analysis skill rules to load the uncomfortable-question rubric."
        }
        $questionRubric = Join-Path $repoRoot "skills\kr-stock-analysis\references\uncomfortable-question-rubric.md"
        if (-not (Test-Path -LiteralPath $questionRubric)) {
            Write-Error "Expected kr-stock-analysis to ship an uncomfortable-question rubric reference."
        }
        $questionRubricText = [System.IO.File]::ReadAllText($questionRubric)
        if (-not $questionRubricText.Contains("Archetype: Captive IT Services / SI / Digital Transformation")) {
            Write-Error "Expected uncomfortable-question rubric to include the captive IT services archetype."
        }

        $reportSamples = Get-ChildItem -Path (Join-Path $repoRoot "analysis-example\kr") -Recurse -Filter "memo.md" |
            Where-Object {
                [System.IO.File]::ReadAllText($_.FullName, [System.Text.Encoding]::UTF8).Contains("## Decision Frame")
            } |
            Select-Object -First 3 -ExpandProperty FullName
        if ($reportSamples.Count -lt 3) {
            Write-Error "Expected at least three stock memo examples under analysis-example\\kr."
        }
        foreach ($reportSample in $reportSamples) {
            $reportText = [System.IO.File]::ReadAllText($reportSample, [System.Text.Encoding]::UTF8)
            if (-not $reportText.Contains("## Decision Frame")) {
                Write-Error "Expected stock memo example to include Decision Frame: $reportSample"
            }
            if (-not $reportText.Contains("## Street / Alternative Views")) {
                Write-Error "Expected stock memo example to include Street / Alternative Views: $reportSample"
            }
            if (-not $reportText.Contains("## Uncomfortable Questions")) {
                Write-Error "Expected stock memo example to include Uncomfortable Questions: $reportSample"
            }
            if (-not $reportText.Contains("## Decision-Changing Issues")) {
                Write-Error "Expected stock memo example to include Decision-Changing Issues: $reportSample"
            }
            if (-not $reportText.Contains("## Structured Stance")) {
                Write-Error "Expected stock memo example to include Structured Stance: $reportSample"
            }
            if (-not $reportText.Contains("## Follow-up Research Prompts")) {
                Write-Error "Expected stock memo example to include Follow-up Research Prompts: $reportSample"
            }
        }
    }

    if ($skillDir.Name -eq "kr-stock-plan") {
        $planOutputFormat = [System.IO.File]::ReadAllText((Join-Path $skillDir.FullName "references\output-format.md"))
        if (-not $skillMd.Contains("analysis-example/kr/<company>/memo.md")) {
            Write-Error "Expected kr-stock-plan rules to define memo.md as the canonical artifact."
        }
        if (-not $skillMd.Contains("memo-only")) {
            Write-Error "Expected kr-stock-plan rules to distinguish memo-only follow-ups."
        }
        if (-not $skillMd.Contains("refresh-needed")) {
            Write-Error "Expected kr-stock-plan rules to distinguish refresh-needed follow-ups."
        }
        if (-not $planOutputFormat.Contains("Planning only vs execute now:")) {
            Write-Error "Expected kr-stock-plan output format to distinguish planning-only mode."
        }
        if (-not $planOutputFormat.Contains("Canonical memo path:")) {
            Write-Error "Expected kr-stock-plan output format to include the canonical memo path."
        }
        if (-not $planOutputFormat.Contains('Follow-up classification (`memo-only` or `refresh-needed`):')) {
            Write-Error "Expected kr-stock-plan output format to include follow-up classification."
        }
    }

    if ($skillDir.Name -eq "kr-stock-data-pack") {
        $dataPackWorkflow = [System.IO.File]::ReadAllText((Join-Path $repoRoot "skills\kr-stock-data-pack\references\workflow.md"))
        if (-not $dataPackWorkflow.Contains("## Source Roles")) {
            Write-Error "Expected kr-stock-data-pack workflow to define source roles."
        }
        if (-not $dataPackWorkflow.Contains("Do not fill a note-driven block from company IR alone")) {
            Write-Error "Expected kr-stock-data-pack workflow to block company-IR-only backfills for note-driven claims."
        }

        $dataPackOutputFormat = [System.IO.File]::ReadAllText((Join-Path $repoRoot "skills\kr-stock-data-pack\references\output-format.md"))
        if (-not $dataPackOutputFormat.Contains("## External Views")) {
            Write-Error "Expected kr-stock-data-pack output format to include External Views."
        }
    }

    if ($skillDir.Name -eq "kr-stock-dart-analysis") {
        $dartWorkflow = [System.IO.File]::ReadAllText((Join-Path $repoRoot "skills\kr-stock-dart-analysis\references\workflow.md"))
        if (-not $dartWorkflow.Contains("derived from cumulative filing")) {
            Write-Error "Expected kr-stock-dart-analysis workflow to define cumulative-derivation labeling."
        }
        if (-not $dartWorkflow.Contains("## DART-First Enforcement")) {
            Write-Error "Expected kr-stock-dart-analysis workflow to define DART-first enforcement."
        }
        if (-not $dartWorkflow.Contains("Do not use company IR pages, newsroom posts, or third-party disclosure mirrors as substitutes for the DART filing path")) {
            Write-Error "Expected kr-stock-dart-analysis workflow to prohibit non-DART substitutes for note-driven work."
        }

        $dartOutputFormat = [System.IO.File]::ReadAllText((Join-Path $repoRoot "skills\kr-stock-dart-analysis\references\output-format.md"))
        if (-not $dartOutputFormat.Contains("KR_DART_STANDALONE_QUARTER_SECTION")) {
            Write-Error "Expected kr-stock-dart-analysis output format to define the standalone-quarter section marker."
        }
        if (-not $dartOutputFormat.Contains("## Source Map")) {
            Write-Error "Expected kr-stock-dart-analysis output format to include Source Map."
        }
        if (-not $dartOutputFormat.Contains("KR_DART_CONTRACT_EOKWON_COLUMNS")) {
            Write-Error "Expected kr-stock-dart-analysis contract output format to define 억원-based amount markers."
        }
        if (-not $dartOutputFormat.Contains("KR_DART_COVERAGE_SUMMARY_SECTION")) {
            Write-Error "Expected kr-stock-dart-analysis output format to define the coverage-summary section marker."
        }

        if (-not $skillMd.Contains("Never present a derived standalone quarter as if the filing disclosed it directly.")) {
            Write-Error "Expected kr-stock-dart-analysis skill rules to prohibit unlabeled derived-quarter claims."
        }
        if (-not $skillMd.Contains("Default to Korean for all user-facing output")) {
            Write-Error "Expected kr-stock-dart-analysis skill rules to default user-facing output to Korean."
        }
        if (-not $skillMd.Contains("DART is the mandatory starting point")) {
            Write-Error "Expected kr-stock-dart-analysis skill rules to make DART mandatory for note-driven annual work."
        }
        if (-not $skillMd.Contains("Do not satisfy a note-driven task from a company IR page")) {
            Write-Error "Expected kr-stock-dart-analysis skill rules to block company-IR substitution before DART note checks."
        }
        if (-not $skillMd.Contains("KR_DART_COVERAGE_SUMMARY_RULE")) {
            Write-Error "Expected kr-stock-dart-analysis skill rules to include the coverage-summary marker."
        }
        if (-not $skillMd.Contains("KR_DART_REFERENCE_DIGEST_RULE")) {
            Write-Error "Expected kr-stock-dart-analysis skill rules to include the reference-digest marker."
        }
        if (-not $skillMd.Contains("KR_DART_COVERAGE_VERIFICATION_RULE")) {
            Write-Error "Expected kr-stock-dart-analysis skill rules to include the coverage-verification marker."
        }
        if (-not $skillMd.Contains("KR_DART_CLAIM_RECHECK_RULE")) {
            Write-Error "Expected kr-stock-dart-analysis skill rules to include the claim-recheck marker."
        }
        $coverageExampleFiles = Get-ChildItem -Path (Join-Path $repoRoot "analysis-example\kr\LG CNS") -Filter "*.md"
        if (-not $coverageExampleFiles -or $coverageExampleFiles.Count -eq 0) {
            Write-Error "Expected an LG CNS integrated example under analysis-example\\kr."
        }
        $hasCoverageSummaryExample = $false
        foreach ($coverageExampleFile in $coverageExampleFiles) {
            $coverageExample = [System.IO.File]::ReadAllText($coverageExampleFile.FullName, [System.Text.Encoding]::UTF8)
            if ($coverageExample.Contains("KR_DART_COVERAGE_SUMMARY_EXAMPLE")) {
                $hasCoverageSummaryExample = $true
                break
            }
        }
        if (-not $hasCoverageSummaryExample) {
            Write-Error "Expected an LG CNS integrated example to include the coverage-summary marker."
        }

        $referenceExamplePath = Join-Path $repoRoot "analysis-example\kr\LG CNS\dart-reference.md"
        if (-not (Test-Path $referenceExamplePath)) {
            Write-Error "Expected an LG CNS DART reference example under analysis-example\\kr."
        }
        $referenceExample = [System.IO.File]::ReadAllText($referenceExamplePath, [System.Text.Encoding]::UTF8)
        if (-not $referenceExample.Contains("KR_DART_REFERENCE_DIGEST_EXAMPLE")) {
            Write-Error "Expected the LG CNS DART reference example to include the reference-digest marker."
        }

        $browserExportScript = ".\skills\kr-stock-dart-analysis\scripts\normalize-browser-dart-export.js"
        $browserExportSample = ".\examples\kr-stock-dart-analysis\dart-browser-export-sample.json"
        $browserExportOut = Join-Path $tempRoot "browser-dart.txt"
        $browserSectionsOut = Join-Path $tempRoot "browser-sections.json"
        $browserCoverageOut = Join-Path $tempRoot "browser-coverage.json"

        node $browserExportScript --input $browserExportSample --output $browserExportOut | Out-Null
        if (-not (Test-Path $browserExportOut) -or (Get-Item $browserExportOut).Length -le 0) {
            Write-Error "Expected normalized browser DART text output was not created: $browserExportOut"
        }

        node .\skills\kr-stock-dart-analysis\scripts\extract-dart-sections.js --input $browserExportOut --output $browserSectionsOut | Out-Null
        node .\skills\kr-stock-dart-analysis\scripts\verify-dart-coverage.js --input $browserSectionsOut --output $browserCoverageOut | Out-Null

        $browserCoverageText = [System.IO.File]::ReadAllText($browserCoverageOut)
        if (-not $browserCoverageText.Contains('"tocCount": 4')) {
            Write-Error "Expected browser export fixture coverage to include four TOC sections."
        }
    }

    if ($skillDir.Name -eq "kr-stock-update") {
        $baselineScript = ".\skills\kr-stock-update\scripts\extract-report-baseline.js"
        $normalizeScript = ".\skills\kr-stock-update\scripts\normalize-update-log.js"
        $reportSample = ".\analysis-example\kr\LG CNS\memo.md"
        $referenceSample = ".\analysis-example\kr\LG CNS\dart-reference.md"
        $dartCacheSample = ".\analysis-example\kr\LG CNS\dart-cache.json"
        $updateJson = Join-Path $tempRoot "kr-stock-update.json"
        $updateJsonReplace = Join-Path $tempRoot "kr-stock-update-replace.json"
        $updatedReport = Join-Path $tempRoot "kr-stock-update.md"
        $baselineOut = Join-Path $tempRoot "kr-stock-update-baseline.json"

        node $baselineScript --input $reportSample --reference $referenceSample --dart-cache $dartCacheSample --output $baselineOut | Out-Null
        if (-not (([System.IO.File]::ReadAllText($baselineOut)) -match '"memoDate": "2026-04-02"')) {
            Write-Error "Baseline parser did not capture the memo date."
        }
        if (-not (([System.IO.File]::ReadAllText($baselineOut)) -match '"lastFilingChecked": "2026-03-16"')) {
            Write-Error "Baseline parser did not capture the DART reference metadata."
        }

        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)

        $updateJsonContent = @'
{
  "date": "2026-04-10",
  "whatHappened": [
    "No material company-specific update found after the memo date."
  ],
  "whyItMatters": [
    "The original memo remains the operative baseline."
  ],
  "whatChangedInThesis": [
    "No material thesis change."
  ],
  "whatDidNotChange": [
    "The base view and risk framing remain intact."
  ],
  "signalsToWatchNext": [
    "Watch the next earnings release or capital-allocation event."
  ],
  "sources": [
    {
      "label": "Validation placeholder source",
      "url": "https://example.com/placeholder",
      "date": "2026-04-10"
    }
  ]
}
'@
        [System.IO.File]::WriteAllText($updateJson, $updateJsonContent, $utf8NoBom)

        $updateJsonReplaceContent = @'
{
  "date": "2026-04-10",
  "whatHappened": [
    "Replacement update for the same date."
  ],
  "whyItMatters": [
    "This validates same-date replacement behavior."
  ],
  "whatChangedInThesis": [
    "No material thesis change."
  ],
  "whatDidNotChange": [
    "The base view and risk framing remain intact."
  ],
  "signalsToWatchNext": [
    "Watch the next earnings release or capital-allocation event."
  ],
  "sources": [
    {
      "label": "Validation replacement source",
      "url": "https://example.com/replacement",
      "date": "2026-04-10"
    }
  ]
}
'@
        [System.IO.File]::WriteAllText($updateJsonReplace, $updateJsonReplaceContent, $utf8NoBom)

        node $normalizeScript --input $updateJson | Out-Null
        Copy-Item $reportSample $updatedReport
        node $normalizeScript --input $updateJson --report $updatedReport | Out-Null
        node $normalizeScript --input $updateJsonReplace --report $updatedReport | Out-Null

        $updatedText = [System.IO.File]::ReadAllText($updatedReport, [System.Text.Encoding]::UTF8)
        $normalizedUpdatedText = $updatedText -replace "`r`n?", "`n"
        $recentUpdateLabel = [string]::Concat([char[]](0xCD5C, 0xADFC, 0x20, 0xC5C5, 0xB370, 0xC774, 0xD2B8, 0xC77C, 0x3A))
        $headingCount = ([regex]::Matches($normalizedUpdatedText, '^### 2026-04-10 Update$', 'Multiline')).Count
        $recentUpdatePattern = "^{0}\s*2026-04-10$" -f [regex]::Escape($recentUpdateLabel)
        $recentUpdateCount = ([regex]::Matches($normalizedUpdatedText, $recentUpdatePattern, 'Multiline')).Count
        if ($headingCount -ne 1) {
            Write-Error "Expected exactly one dated update block after replacement."
        }
        if ($recentUpdateCount -ne 1) {
            Write-Error "Expected recent update label to be inserted or refreshed."
        }
        if ($normalizedUpdatedText -notmatch 'Replacement update for the same date\.') {
            Write-Error "Expected replacement content to exist in updated report."
        }
        if ($normalizedUpdatedText -match 'Validation placeholder source') {
            Write-Error "Expected previous same-date content to be replaced, not duplicated."
        }
    }
}

$sectorExampleRoot = Join-Path $repoRoot "analysis-example\kr-sector"
if (-not (Test-Path $sectorExampleRoot)) {
    Write-Error "Missing sector analysis example directory: $sectorExampleRoot"
}

$stockPlanExampleFiles = Get-ChildItem -Path (Join-Path $repoRoot "analysis-example\kr\LG CNS") -Filter "*.md"
$hasStockPlanExample = $false
foreach ($stockPlanExampleFile in $stockPlanExampleFiles) {
    $stockPlanText = [System.IO.File]::ReadAllText($stockPlanExampleFile.FullName, [System.Text.Encoding]::UTF8)
    if ($stockPlanText.Contains("Deliverable path:")) {
        $hasStockPlanExample = $true
        break
    }
}
if (-not $hasStockPlanExample) {
    Write-Error "Missing stock planning example file under analysis-example\kr\LG CNS."
}

$sectorExampleCount = (Get-ChildItem -Path $sectorExampleRoot -Filter "*.md" | Measure-Object).Count
if ($sectorExampleCount -lt 2) {
    Write-Error "Expected at least two sector example markdown files under $sectorExampleRoot"
}

node (Join-Path $repoRoot "scripts\validate-contracts.js")
if ($LASTEXITCODE -ne 0) { throw "Contract validation failed." }

node (Join-Path $repoRoot "scripts\audit-analysis-artifacts.js")
if ($LASTEXITCODE -ne 0) { throw "Golden artifact audit failed." }

Write-Host "Regression (dry-run): 엘앤에프"
node (Join-Path $repoRoot "scripts\harness.js") --mode regression --ticker 066970 --company "엘앤에프" --dry-run | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Regression dry-run failed." }

Write-Host "Validation passed."
}
finally {
    Pop-Location
    if (Test-Path $tempRoot) {
        Remove-Item -Recurse -Force $tempRoot
    }
}
