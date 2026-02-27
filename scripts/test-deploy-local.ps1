<#
.SYNOPSIS
    Local deployment simulation - test backend (Docker) and frontend (Vercel/Next.js) builds
    before pushing to production. Catches errors locally instead of from server logs.

.PARAMETER Target
    Which target to test: "all", "backend", "frontend", "docs"

.PARAMETER SkipDockerBuild
    Skip actual Docker image build (only validate Dockerfile + context).

.EXAMPLE
    .\scripts\test-deploy-local.ps1                       # Test everything
    .\scripts\test-deploy-local.ps1 -Target backend       # Test only backend
    .\scripts\test-deploy-local.ps1 -Target frontend      # Test only frontend
    .\scripts\test-deploy-local.ps1 -Target backend -SkipDockerBuild  # Quick backend check
#>

param(
    [ValidateSet("all", "backend", "frontend", "docs")]
    [string]$Target = "all",
    [switch]$SkipDockerBuild
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$script:pass = 0
$script:fail = 0
$script:warn = 0

function Write-Header($text) {
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Cyan
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host ("=" * 60) -ForegroundColor Cyan
}

function Write-Check {
    param([string]$Name, [string]$Status, [string]$Detail)

    switch ($Status) {
        "PASS" { $icon = "[OK]";   $color = "Green";  $script:pass++ }
        "FAIL" { $icon = "[FAIL]"; $color = "Red";    $script:fail++ }
        "WARN" { $icon = "[WARN]"; $color = "Yellow"; $script:warn++ }
    }

    $line = "  $icon $Name"
    if ($Detail) { $line += " -- $Detail" }
    Write-Host $line -ForegroundColor $color
}

function Test-FileInDockerContext {
    param([string]$RelativePath)

    $fullPath = Join-Path $root $RelativePath
    if (-not (Test-Path $fullPath)) {
        return @{ Available = $false; Reason = "File does not exist" }
    }

    $dockerignorePath = Join-Path $root ".dockerignore"
    if (Test-Path $dockerignorePath) {
        $lines = Get-Content $dockerignorePath | Where-Object { $_ -and -not $_.StartsWith("#") }
        $excluded = $false
        foreach ($l in $lines) {
            $trimmed = $l.Trim()
            if ($trimmed.StartsWith("!")) {
                $pattern = $trimmed.Substring(1).TrimEnd("/")
                if ($RelativePath -like "$pattern*" -or $RelativePath -eq $pattern) {
                    $excluded = $false
                }
            }
            else {
                $pattern = $trimmed.TrimEnd("/")
                if ($RelativePath -like "$pattern*" -or $RelativePath.StartsWith("$pattern/") -or $RelativePath -eq $pattern) {
                    $excluded = $true
                }
            }
        }
        if ($excluded) {
            return @{ Available = $false; Reason = "Excluded by .dockerignore" }
        }
    }

    return @{ Available = $true; Reason = "" }
}

# ================================================================
# 1. BACKEND - Docker Build Simulation
# ================================================================

function Test-Backend {
    Write-Header "BACKEND - Docker Build Checks"

    $requiredFiles = @(
        "Dockerfile",
        "package.json",
        "pnpm-workspace.yaml",
        "pnpm-lock.yaml",
        "backend/package.json",
        "frontend/package.json",
        "tsconfig.base.json",
        "smartcontract/plutus.json",
        "backend/prisma/schema.prisma",
        "backend/tsconfig.json"
    )

    foreach ($file in $requiredFiles) {
        $check = Test-FileInDockerContext -RelativePath $file
        if ($check.Available) {
            Write-Check -Name "Docker context: $file" -Status "PASS"
        }
        else {
            Write-Check -Name "Docker context: $file" -Status "FAIL" -Detail $check.Reason
        }
    }

    if (Test-Path "patches") {
        $patchCount = @(Get-ChildItem patches -Filter "*.patch" -ErrorAction SilentlyContinue).Count
        Write-Check -Name "Patches directory" -Status "PASS" -Detail "$patchCount patch file(s)"
    }
    else {
        Write-Check -Name "Patches directory" -Status "WARN" -Detail "No patches/ directory found"
    }

    Write-Host ""
    Write-Host "  Validating Dockerfile COPY instructions..." -ForegroundColor DarkGray
    $dockerfile = Get-Content Dockerfile
    $copyLines = $dockerfile | Where-Object { $_ -match "^\s*COPY\s+" -and $_ -notmatch "--from=" }
    foreach ($cl in $copyLines) {
        if ($cl -match "COPY\s+(\S+)") {
            $src = $Matches[1]
            if ($src -eq ".") { continue }
            $check = Test-FileInDockerContext -RelativePath $src
            if ($check.Available) {
                Write-Check -Name "COPY $src" -Status "PASS"
            }
            else {
                Write-Check -Name "COPY $src" -Status "FAIL" -Detail $check.Reason
            }
        }
    }

    if (Test-Path ".dockerignore") {
        $diContent = Get-Content ".dockerignore" -Raw
        if ($diContent -match "smartcontract/" -and $diContent -notmatch "!smartcontract/plutus") {
            Write-Check -Name ".dockerignore exceptions" -Status "FAIL" -Detail "smartcontract/ excluded without plutus.json exception"
        }
        else {
            Write-Check -Name ".dockerignore exceptions" -Status "PASS"
        }
    }

    Write-Host ""
    Write-Host "  Testing TypeScript compilation (backend)..." -ForegroundColor DarkGray
    try {
        $null = & pnpm --filter backend build 2>&1 | Out-String
        if ($LASTEXITCODE -eq 0) {
            Write-Check -Name "Backend TypeScript build" -Status "PASS"
        }
        else {
            Write-Check -Name "Backend TypeScript build" -Status "FAIL" -Detail "Exit code $LASTEXITCODE"
        }
    }
    catch {
        Write-Check -Name "Backend TypeScript build" -Status "FAIL" -Detail $_.Exception.Message
    }

    Write-Host ""
    Write-Host "  Validating Prisma schema..." -ForegroundColor DarkGray
    try {
        Push-Location "backend"
        $null = & npx prisma validate 2>&1 | Out-String
        $prismaExit = $LASTEXITCODE
        Pop-Location
        if ($prismaExit -eq 0) {
            Write-Check -Name "Prisma schema validation" -Status "PASS"
        }
        else {
            Write-Check -Name "Prisma schema validation" -Status "FAIL" -Detail "Exit code $prismaExit"
        }
    }
    catch {
        Pop-Location -ErrorAction SilentlyContinue
        Write-Check -Name "Prisma schema validation" -Status "WARN" -Detail "Could not run prisma validate"
    }

    $dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
    if ($dockerCmd -and (-not $SkipDockerBuild)) {
        Write-Host ""
        Write-Host "  Running Docker build (may take a few minutes)..." -ForegroundColor DarkGray
        try {
            $dockerOut = & docker build -t solvernet-backend-test . 2>&1 | Out-String
            if ($LASTEXITCODE -eq 0) {
                Write-Check -Name "Docker build" -Status "PASS" -Detail "Image built successfully"
                & docker rmi solvernet-backend-test 2>&1 | Out-Null
            }
            else {
                $lastLines = ($dockerOut -split "`n" | Select-Object -Last 5) -join "; "
                Write-Check -Name "Docker build" -Status "FAIL" -Detail $lastLines
            }
        }
        catch {
            Write-Check -Name "Docker build" -Status "FAIL" -Detail $_.Exception.Message
        }
    }
    elseif (-not $dockerCmd) {
        Write-Check -Name "Docker build" -Status "WARN" -Detail "Docker not available -- skipped"
    }
    else {
        Write-Check -Name "Docker build" -Status "WARN" -Detail "Skipped (-SkipDockerBuild)"
    }
}

# ================================================================
# 2. FRONTEND - Vercel / Next.js Build Simulation
# ================================================================

function Test-Frontend {
    Write-Header "FRONTEND - Vercel Build Checks"

    $pkg = Get-Content "frontend/package.json" -Raw | ConvertFrom-Json
    $nextVersion = $pkg.dependencies.next
    if ($nextVersion) {
        Write-Check -Name "Next.js in dependencies" -Status "PASS" -Detail "Version: $nextVersion"
    }
    else {
        Write-Check -Name "Next.js in dependencies" -Status "FAIL" -Detail "Not found in frontend/package.json"
    }

    $frontendVercel = Join-Path (Join-Path $root "frontend") "vercel.json"
    if (Test-Path $frontendVercel) {
        $fvConfig = Get-Content $frontendVercel -Raw | ConvertFrom-Json
        Write-Check -Name "frontend/vercel.json exists" -Status "PASS"

        if ($fvConfig.installCommand -match "cd \.\.") {
            Write-Check -Name "Install cmd navigates to root" -Status "PASS"
        }
        else {
            Write-Check -Name "Install cmd navigates to root" -Status "WARN" -Detail "May not find pnpm-lock.yaml"
        }
    }
    else {
        Write-Check -Name "frontend/vercel.json exists" -Status "FAIL" -Detail "Create it for monorepo Vercel deploy"
    }

    $rootVercel = Join-Path $root "vercel.json"
    if (Test-Path $rootVercel) {
        $rvConfig = Get-Content $rootVercel -Raw | ConvertFrom-Json
        if ($rvConfig.framework -eq "nextjs") {
            Write-Check -Name "Root vercel.json" -Status "WARN" -Detail "Has framework:nextjs but root has no next dep. Set Root Dir=frontend in Vercel"
        }
        else {
            Write-Check -Name "Root vercel.json" -Status "PASS"
        }
    }

    $frontendFiles = @(
        "frontend/next.config.ts",
        "frontend/tsconfig.json",
        "frontend/src/app/layout.tsx",
        "frontend/src/app/page.tsx"
    )
    foreach ($f in $frontendFiles) {
        if (Test-Path $f) {
            Write-Check -Name "File: $f" -Status "PASS"
        }
        else {
            Write-Check -Name "File: $f" -Status "FAIL" -Detail "Missing"
        }
    }

    Write-Host ""
    Write-Host "  Running Next.js build (frontend -- mirrors Vercel buildCommand)..." -ForegroundColor DarkGray
    try {
        $null = & pnpm --filter frontend build 2>&1 | Out-String
        if ($LASTEXITCODE -eq 0) {
            Write-Check -Name "Next.js build" -Status "PASS"
        }
        else {
            Write-Check -Name "Next.js build" -Status "FAIL" -Detail "Exit code $LASTEXITCODE"
        }
    }
    catch {
        Write-Check -Name "Next.js build" -Status "FAIL" -Detail $_.Exception.Message
    }
}

# ================================================================
# 3. DOCS-SITE - Nextra Build Simulation
# ================================================================

function Test-Docs {
    Write-Header "DOCS-SITE - Vercel Build Checks (Root Dir: docs-site)"

    $docsDir = Join-Path $root "docs-site"
    if (-not (Test-Path $docsDir)) {
        Write-Check -Name "docs-site directory" -Status "WARN" -Detail "Not found -- skipping"
        return
    }

    # package.json must have next (Vercel reads this when Root Directory = docs-site)
    $pkgPath = Join-Path $docsDir "package.json"
    $pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
    $nextVersion = $pkg.dependencies.next
    if ($nextVersion) {
        Write-Check -Name "Next.js in docs-site/package.json" -Status "PASS" -Detail "Version: $nextVersion"
    }
    else {
        Write-Check -Name "Next.js in docs-site/package.json" -Status "FAIL" -Detail "Not found -- Vercel will fail to detect Next.js"
    }

    # vercel.json must exist inside docs-site
    $docsVercel = Join-Path $docsDir "vercel.json"
    if (Test-Path $docsVercel) {
        $dvc = Get-Content $docsVercel -Raw | ConvertFrom-Json
        Write-Check -Name "docs-site/vercel.json exists" -Status "PASS"

        if ($dvc.buildCommand -match "cd \.\.") {
            Write-Check -Name "Build cmd navigates to root" -Status "PASS" -Detail $dvc.buildCommand
        }
        else {
            Write-Check -Name "Build cmd navigates to root" -Status "WARN" -Detail "buildCommand should 'cd ..' when Root Directory = docs-site"
        }

        if ($dvc.framework -eq "nextjs") {
            Write-Check -Name "framework: nextjs declared" -Status "PASS"
        }
        else {
            Write-Check -Name "framework: nextjs declared" -Status "WARN" -Detail "Add framework:nextjs for explicit Vercel detection"
        }
    }
    else {
        Write-Check -Name "docs-site/vercel.json exists" -Status "FAIL" -Detail "Required for independent deployment -- create it"
    }

    # Critical files
    $docsFiles = @("docs-site/theme.config.tsx", "docs-site/next.config.js")
    foreach ($f in $docsFiles) {
        if (Test-Path $f) {
            Write-Check -Name "File: $f" -Status "PASS"
        }
        else {
            Write-Check -Name "File: $f" -Status "WARN" -Detail "Missing"
        }
    }

    # Actual build (mirrors Vercel: pnpm --filter solvernet-docs build from root)
    Write-Host ""
    Write-Host "  Running docs-site build (mirrors Vercel buildCommand)..." -ForegroundColor DarkGray
    try {
        $null = & pnpm --filter solvernet-docs build 2>&1 | Out-String
        if ($LASTEXITCODE -eq 0) {
            Write-Check -Name "Docs-site build" -Status "PASS"
        }
        else {
            Write-Check -Name "Docs-site build" -Status "FAIL" -Detail "Exit code $LASTEXITCODE"
        }
    }
    catch {
        Write-Check -Name "Docs-site build" -Status "FAIL" -Detail $_.Exception.Message
    }
}

# ================================================================
# 4. GIT - Pre-push checks
# ================================================================

function Test-Git {
    Write-Header "GIT - Pre-push Checks"

    $status = & git status --porcelain 2>&1
    if ($status) {
        $count = @($status).Count
        Write-Check -Name "Uncommitted changes" -Status "WARN" -Detail "$count file(s) -- remember to commit before push"
    }
    else {
        Write-Check -Name "Working tree clean" -Status "PASS"
    }

    $tracked = & git ls-files smartcontract/plutus.json 2>&1
    if ($tracked) {
        Write-Check -Name "plutus.json tracked in git" -Status "PASS"
    }
    else {
        Write-Check -Name "plutus.json tracked in git" -Status "FAIL" -Detail "Not tracked -- Docker build will fail"
    }
}

# ================================================================
# 5. VERCEL PROJECTS OVERVIEW - both deployments at a glance
# ================================================================

function Test-VercelProjects {
    Write-Header "VERCEL PROJECTS OVERVIEW (2 separate projects)"

    Write-Host ""
    Write-Host "  Project 1 -- Main Frontend (tdexms.vercel.app)" -ForegroundColor White
    Write-Host "  Dashboard setting: Root Directory = frontend" -ForegroundColor DarkGray

    $fvPath = Join-Path $root "frontend/vercel.json"
    if (Test-Path $fvPath) {
        $fv = Get-Content $fvPath -Raw | ConvertFrom-Json
        if ($fv.framework -eq "nextjs") {
            Write-Check -Name "frontend/vercel.json: framework=nextjs" -Status "PASS"
        }
        else {
            Write-Check -Name "frontend/vercel.json: framework=nextjs" -Status "FAIL" -Detail "Add framework:nextjs"
        }
        if ($fv.buildCommand -match "--filter frontend") {
            Write-Check -Name "frontend/vercel.json: buildCommand targets frontend" -Status "PASS" -Detail $fv.buildCommand
        }
        else {
            Write-Check -Name "frontend/vercel.json: buildCommand" -Status "WARN" -Detail $fv.buildCommand
        }
        if ($fv.installCommand -match "cd \.\.") {
            Write-Check -Name "frontend/vercel.json: install from monorepo root" -Status "PASS"
        }
        else {
            Write-Check -Name "frontend/vercel.json: install from monorepo root" -Status "FAIL"
        }
    }
    else {
        Write-Check -Name "frontend/vercel.json" -Status "FAIL" -Detail "File missing"
    }

    Write-Host ""
    Write-Host "  Project 2 -- Docs Site (docs-tdexms.vercel.app)" -ForegroundColor White
    Write-Host "  Dashboard setting: Root Directory = docs-site" -ForegroundColor DarkGray

    $dvPath = Join-Path $root "docs-site/vercel.json"
    if (Test-Path $dvPath) {
        $dv = Get-Content $dvPath -Raw | ConvertFrom-Json
        if ($dv.framework -eq "nextjs") {
            Write-Check -Name "docs-site/vercel.json: framework=nextjs" -Status "PASS"
        }
        else {
            Write-Check -Name "docs-site/vercel.json: framework=nextjs" -Status "FAIL" -Detail "Add framework:nextjs"
        }
        if ($dv.buildCommand -match "--filter solvernet-docs") {
            Write-Check -Name "docs-site/vercel.json: buildCommand targets solvernet-docs" -Status "PASS" -Detail $dv.buildCommand
        }
        else {
            Write-Check -Name "docs-site/vercel.json: buildCommand" -Status "WARN" -Detail $dv.buildCommand
        }
        if ($dv.installCommand -match "cd \.\.") {
            Write-Check -Name "docs-site/vercel.json: install from monorepo root" -Status "PASS"
        }
        else {
            Write-Check -Name "docs-site/vercel.json: install from monorepo root" -Status "FAIL"
        }
    }
    else {
        Write-Check -Name "docs-site/vercel.json" -Status "FAIL" -Detail "File missing"
    }

    Write-Host ""
    Write-Host "  REMINDER: In Vercel dashboard you need 2 separate projects:" -ForegroundColor Yellow
    Write-Host "    Project 1 -> Settings -> Root Directory = frontend" -ForegroundColor Yellow
    Write-Host "    Project 2 -> Settings -> Root Directory = docs-site" -ForegroundColor Yellow
    Write-Host ""
}

# ================================================================
# Run selected tests
# ================================================================

Write-Host ""
Write-Host "  =====================================" -ForegroundColor White
Write-Host "  SolverNet -- Local Deploy Test" -ForegroundColor White
Write-Host "  Target: $Target" -ForegroundColor DarkGray
Write-Host "  =====================================" -ForegroundColor White

Test-Git
Test-VercelProjects

switch ($Target) {
    "all"      { Test-Backend; Test-Frontend; Test-Docs }
    "backend"  { Test-Backend }
    "frontend" { Test-Frontend }
    "docs"     { Test-Docs }
}

# ================================================================
# Summary
# ================================================================

Write-Host ""
Write-Header "SUMMARY"
Write-Host "  Passed:   $($script:pass)" -ForegroundColor Green
if ($script:warn -gt 0) {
    Write-Host "  Warnings: $($script:warn)" -ForegroundColor Yellow
}
if ($script:fail -gt 0) {
    Write-Host "  Failed:   $($script:fail)" -ForegroundColor Red
}
Write-Host ""

if ($script:fail -gt 0) {
    Write-Host "  >> DEPLOY WOULD FAIL -- fix the issues above before pushing." -ForegroundColor Red
    Write-Host ""
    exit 1
}
elseif ($script:warn -gt 0) {
    Write-Host "  >> Deploy likely OK but review warnings." -ForegroundColor Yellow
    Write-Host ""
    exit 0
}
else {
    Write-Host "  >> ALL CLEAR -- safe to push to production." -ForegroundColor Green
    Write-Host ""
    exit 0
}
