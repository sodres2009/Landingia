$conns = Get-NetTCPConnection -LocalPort 8100 -State Listen -ErrorAction SilentlyContinue
foreach ($c in $conns) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }
if ($conns) { "killed: " + (($conns.OwningProcess | Sort-Object -Unique) -join ',') } else { 'nada na 8100' }
