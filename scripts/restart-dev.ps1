$conns = Get-NetTCPConnection -LocalPort 3005 -State Listen -ErrorAction SilentlyContinue
foreach ($c in $conns) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }
if (Test-Path .next) { Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue }
if ($conns) { "killed: " + (($conns.OwningProcess | Sort-Object -Unique) -join ',') } else { 'nada a escutar na 3005' }
"next-existe: " + (Test-Path .next)
