[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$ConfigCsv,
    [string]$ExpensesCsv,
    [string]$StartDate,
    [string]$EndDate = (Get-Date -Format 'yyyy-MM-dd'),
    [string]$OutputDirectory = (Join-Path $PSScriptRoot 'generated'),
    [ValidateRange(4000, 5000)][int]$MonthlyBudget = 4500,
    [ValidateRange(1, 1000000)][int]$Seed = 20261026
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$culture = [cultureinfo]::InvariantCulture
$headers = @('Date', 'GBP', 'EUR', 'USD', 'Category', 'Spent By', 'Spent For', 'Comment', 'Channel', 'Theme')
$family = @('Alex', 'Jamie', 'Sam', 'Taylor', 'Casey')

function Convert-Date([string]$Value, [string]$Format) {
    try {
        return [datetime]::ParseExact($Value, $Format, $culture)
    } catch {
        throw "Invalid date '$Value'; expected $Format."
    }
}

function Convert-Amount([string]$Value) {
    $amount = [decimal]::Parse($Value, [Globalization.NumberStyles]::Currency, [cultureinfo]'en-US')
    if ($amount -le 0 -or [decimal]::Round($amount, 2) -ne $amount) {
        throw "Expected a positive USD amount with at most two decimal places: '$Value'."
    }
    return $amount
}

function New-PlanItem($Date, $Category, $Amount, $Comment, $Fixed = $false, $Foreign = '') {
    return [pscustomobject]@{
        Date = $Date; Category = $Category; Amount = [decimal]$Amount
        Comment = $Comment; Fixed = $Fixed; Foreign = $Foreign
    }
}

$end = Convert-Date $EndDate 'yyyy-MM-dd'
$config = @(Import-Csv -LiteralPath $ConfigCsv)
if ($config.Count -eq 0 -or 'Categories' -notin $config[0].PSObject.Properties.Name) {
    throw 'Config CSV must contain a Categories column with at least one category.'
}
$categories = @($config | ForEach-Object { $_.Categories } | Where-Object { $_ })
$required = @(
    'Housing', 'Education', 'Internet & Mobile', 'Housing - Utilities', 'Subscriptions',
    'Entertainment & Leisure', 'Food & Groceries', 'Dining Out', 'Car', 'Transport',
    'Household Supplies', 'Personal Care & Self-care', 'Clothing & Footwear', 'Healthcare',
    'Healthcare - Dental', 'Hobbies', 'Gifts', 'Charity', 'Insurance', 'Investments',
    'Home Goods', 'Unplanned Expenses', 'Junk Food', 'Personal Cash', 'Housing - Renovation'
)
foreach ($category in $required) {
    if ($category -cnotin $categories) { throw "Config CSV is missing category '$category'." }
}

$history = @()
$totals = @{}
$lastDate = [datetime]::MinValue
if ($ExpensesCsv) {
    if ($StartDate) { throw 'Use either ExpensesCsv (extend history) or StartDate (regenerate), not both.' }
    $history = @(Import-Csv -LiteralPath $ExpensesCsv)
    if ($history.Count -eq 0) { throw 'Expenses CSV is empty. Use StartDate to generate new history.' }
    if (($history[0].PSObject.Properties.Name -join '|') -cne ($headers -join '|')) {
        throw "Expenses CSV headers must be exactly: $($headers -join ',')."
    }
    foreach ($row in $history) {
        $date = Convert-Date $row.Date 'M/d/yyyy'
        if ($date -lt $lastDate) { throw 'Existing expenses must be in ascending date order.' }
        if ($row.Category -cnotin $categories) { throw "Unknown existing category '$($row.Category)'." }
        $lastDate = $date
        $monthKey = $date.ToString('yyyy-MM')
        if (-not $totals.ContainsKey($monthKey)) { $totals[$monthKey] = [decimal]0 }
        $totals[$monthKey] += Convert-Amount $row.USD
    }
    $start = $lastDate.AddDays(1)
} else {
    if (-not $StartDate) { throw 'Supply ExpensesCsv to extend history, or StartDate to regenerate.' }
    $start = Convert-Date $StartDate 'yyyy-MM-dd'
    if ($start.Day -ne 1) { throw 'Regeneration StartDate must be the first day of a month.' }
}
if ($end -lt $start) { throw 'EndDate must be on or after the first missing date; nothing was written.' }

$outputPaths = @('sample-expenses-append.csv', 'sample-expenses-complete.csv', 'sample-expenses-summary.csv') |
    ForEach-Object { Join-Path $OutputDirectory $_ }
foreach ($path in $outputPaths) {
    if (Test-Path -LiteralPath $path) { throw "Output already exists: $path. Choose a new OutputDirectory." }
}

$generated = [Collections.Generic.List[object]]::new()
$summary = [Collections.Generic.List[object]]::new()
$month = [datetime]::new($start.Year, $start.Month, 1)
while ($month -le $end) {
    $monthKey = $month.ToString('yyyy-MM')
    $random = [Random]::new($Seed + $month.Year * 12 + $month.Month)
    $monthEnd = $month.AddMonths(1).AddDays(-1)
    $through = if ($end -lt $monthEnd) { $end } else { $monthEnd }
    $from = if ($start -gt $month) { $start } else { $month }
    $fullTarget = [decimal]([math]::Round($MonthlyBudget * (0.92 + $random.NextDouble() * 0.16), 2))
    $vacation = $month.Month -eq 8
    if ($vacation) { $fullTarget += 4200 }
    $target = [decimal]([math]::Round($fullTarget * $through.Day / $monthEnd.Day, 2))
    $existing = if ($totals.ContainsKey($monthKey)) { $totals[$monthKey] } else { [decimal]0 }
    $plan = [Collections.Generic.List[object]]::new()
    foreach ($bill in @(
        @(1, 'Housing', 1500, 'monthly mortgage'),
        @(5, 'Education', 460, 'college tuition installment'),
        @(9, 'Internet & Mobile', 95, 'home internet and family mobile plan'),
        @(12, 'Housing - Utilities', 170, 'electricity and water'),
        @(24, 'Subscriptions', 40, 'family streaming and cloud subscriptions')
    )) {
        $plan.Add((New-PlanItem ($month.AddDays($bill[0] - 1)) $bill[1] $bill[2] $bill[3] $true))
    }
    if ($vacation) {
        $plan.Add((New-PlanItem ($month.AddDays(11)) 'Entertainment & Leisure' 4200 'family summer holiday: accommodation and travel' $true 'EUR'))
    }
    for ($day = $month; $day -le $monthEnd; $day = $day.AddDays(1)) {
        if ($day.DayOfWeek -eq [DayOfWeek]::Saturday) {
            $plan.Add((New-PlanItem $day 'Food & Groceries' ($random.Next(100, 181)) 'weekly family supermarket shop'))
        }
        if ($day.DayOfWeek -eq [DayOfWeek]::Wednesday) {
            $plan.Add((New-PlanItem $day 'Food & Groceries' ($random.Next(25, 51)) 'fruit, milk and pantry top-up'))
        }
        if ($day.DayOfWeek -eq [DayOfWeek]::Friday) {
            $plan.Add((New-PlanItem $day 'Dining Out' ($random.Next(35, 91)) 'family takeaway night'))
            $plan.Add((New-PlanItem $day 'Car' ($random.Next(40, 66)) 'fuel refill'))
        }
        $smallCategory = if ($random.Next(0, 4) -eq 0) { 'Junk Food' } else { 'Food & Groceries' }
        $smallComment = if ($smallCategory -eq 'Junk Food') { 'afternoon ice cream and snacks' } else { 'bread, fruit and school lunch supplies' }
        $plan.Add((New-PlanItem $day $smallCategory ($random.Next(4, 16)) $smallComment))
    }
    foreach ($purchase in @(
        @(3, 'Transport', 35, 'family bus cards'),
        @(7, 'Household Supplies', 45, 'cleaning supplies and school stationery'),
        @(10, 'Hobbies', 40, 'art materials and hobby supplies'),
        @(14, 'Personal Cash', 40, 'children pocket money'),
        @(16, 'Healthcare', 55, 'pharmacy and routine doctor co-pay'),
        @(17, 'Personal Care & Self-care', 65, 'haircuts and toiletries'),
        @(19, 'Clothing & Footwear', 100, 'seasonal clothes and shoes'),
        @(20, 'Entertainment & Leisure', 65, 'family cinema outing'),
        @(21, 'Home Goods', 55, 'replacement kitchen items'),
        @(22, 'Gifts', 45, 'birthday present for a friend'),
        @(25, 'Charity', 20, 'community food bank donation'),
        @(26, 'Unplanned Expenses', 50, 'replacement school backpack'),
        @(27, 'Investments', 100, 'monthly savings contribution')
    )) {
        $foreign = if ($purchase[1] -eq 'Hobbies' -and $month.Month % 2 -eq 0) { 'GBP' } else { '' }
        $plan.Add((New-PlanItem ($month.AddDays($purchase[0] - 1)) $purchase[1] ($purchase[2] * (0.8 + $random.NextDouble() * 0.4)) $purchase[3] $false $foreign))
    }
    if ($month.Month % 3 -eq 0) {
        $plan.Add((New-PlanItem ($month.AddDays(17)) 'Healthcare - Dental' 140 'routine family dental checkup'))
        $plan.Add((New-PlanItem ($month.AddDays(22)) 'Housing - Renovation' 110 'minor home repair materials'))
    }
    if ($month.Month -eq 10) {
        $plan.Add((New-PlanItem ($month.AddDays(14)) 'Insurance' 600 'annual home insurance premium' $true))
    }
    $eligible = @($plan | Where-Object { $_.Date -ge $from -and $_.Date -le $through } | Sort-Object Date)
    $fixedSum = [decimal]0
    $variableSum = [decimal]0
    foreach ($item in $eligible) {
        if ($item.Fixed) { $fixedSum += $item.Amount } else { $variableSum += $item.Amount }
    }
    $remainingCents = [long]([math]::Round(($target - $existing - $fixedSum) * 100))
    $variableItems = @($eligible | Where-Object { -not $_.Fixed })
    if ($remainingCents -lt $variableItems.Count -or $variableSum -le 0) {
        throw "Existing spending and remaining bills exceed the $monthKey budget. Nothing was written. Use a higher MonthlyBudget or review the source."
    }
    $variableIndex = 0
    $allocated = [long]0
    $weight = [decimal]0
    foreach ($item in $eligible) {
        if ($item.Fixed) {
            $amount = $item.Amount
        } else {
            $variableIndex++
            $weight += $item.Amount
            $available = $remainingCents - $variableItems.Count
            $cumulative = [long]([math]::Round($available * $weight / $variableSum)) + $variableIndex
            $amount = [decimal]($cumulative - $allocated) / 100
            $allocated = $cumulative
        }
        $payer = $family[$random.Next(0, 2)]
        $beneficiary = if ($item.Category -in @('Education', 'Personal Cash', 'Clothing & Footwear')) {
            $family[$random.Next(2, 5)]
        } else { 'Family' }
        $gbp = if ($item.Foreign -eq 'GBP') { ($amount * [decimal]0.75).ToString('F2', $culture) } else { '' }
        $eur = if ($item.Foreign -eq 'EUR') { ($amount * [decimal]0.85).ToString('F2', $culture) } else { '' }
        $generated.Add([pscustomobject][ordered]@{
            Date = $item.Date.ToString('M/d/yyyy', $culture)
            GBP = $gbp; EUR = $eur; USD = $amount.ToString('F2', $culture)
            Category = $item.Category; 'Spent By' = $payer; 'Spent For' = $beneficiary
            Comment = $item.Comment; Channel = ''; Theme = ''
        })
    }
    $added = [decimal]0
    foreach ($row in @($generated | Where-Object { (Convert-Date $_.Date 'M/d/yyyy').ToString('yyyy-MM') -eq $monthKey })) {
        $added += Convert-Amount $row.USD
    }
    if ($existing + $added -ne $target) { throw "Budget allocation failed for $monthKey." }
    $summary.Add([pscustomobject][ordered]@{
        Month = $monthKey; From = $from.ToString('yyyy-MM-dd'); Through = $through.ToString('yyyy-MM-dd')
        ExistingUSD = $existing.ToString('F2', $culture); AddedUSD = $added.ToString('F2', $culture)
        TotalUSD = ($existing + $added).ToString('F2', $culture)
        FullMonthTargetUSD = $fullTarget.ToString('F2', $culture)
        VacationMonth = $vacation; PartialMonth = ($through -lt $monthEnd)
    })
    $month = $month.AddMonths(1)
}

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$generated | Export-Csv -LiteralPath $outputPaths[0] -NoTypeInformation -Encoding utf8
@($history; $generated.ToArray()) | Export-Csv -LiteralPath $outputPaths[1] -NoTypeInformation -Encoding utf8
$summary | Export-Csv -LiteralPath $outputPaths[2] -NoTypeInformation -Encoding utf8
$summary | Format-Table -AutoSize
Write-Output "Generated $($generated.Count) fictional rows. Source files were not modified."
Write-Output "Output: $([IO.Path]::GetFullPath($OutputDirectory))"