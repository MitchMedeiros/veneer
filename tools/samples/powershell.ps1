# Get running processes
function Get-Big {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [int]$Limit = 10
    )
    $items = Get-Process | Where-Object { $_.WorkingSet -gt 100MB } | Select-Object -First $Limit
    foreach ($item in $items) {
        Write-Host "Process: $($item.Name) uses $($item.WorkingSet)" -ForegroundColor Green
    }
    <# block
       comment #>
    if ($items.Count -eq 0) { return $null } else { return @{ Count = $items.Count; Name = 'none' } }
}
