param(
  [Parameter(Mandatory=$true)]
  [ValidateSet('windows.system.summary','windows.resource.usage','windows.services.important','windows.update.status','network.ip.configuration','network.gateway.validate','network.dns.validate','network.route.summary','eventlog.query')]
  [string]$ActionId,
  [ValidateSet('System','Application')][string]$LogName='System',
  [ValidateSet('Critical','Error','Warning','Information')][string]$Level='Error',
  [ValidateSet('1h','6h','24h','7d')][string]$TimeWindow='1h',
  [ValidateRange(1,100)][int]$Limit=50
)
# Versioned read-only collector. Never add a target, path, query, service or command parameter.
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$WarningPreference='SilentlyContinue'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$isElevated=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if($isElevated){exit 77}
$availability='Supported'
$data=$null
function Read-Adapters {
  $items=@(Get-NetIPConfiguration | Where-Object {$_.NetAdapter.Status -eq 'Up'} | Select-Object -First 16)
  @($items | ForEach-Object {
    $config=$_
    $dhcp=$null
    try {$dhcp=(Get-NetIPInterface -InterfaceIndex $config.InterfaceIndex -AddressFamily IPv4 | Select-Object -First 1).Dhcp -eq 'Enabled'} catch {}
    [ordered]@{name=[string]$config.InterfaceAlias;status='Up';ipv4=@($config.IPv4Address | Select-Object -First 16 | ForEach-Object {[string]$_.IPAddress});prefixes=@($config.IPv4Address | Select-Object -First 16 | ForEach-Object {[int]$_.PrefixLength});gateways=@($config.IPv4DefaultGateway | Select-Object -First 8 | ForEach-Object {[string]$_.NextHop});dnsServers=@($config.DNSServer.ServerAddresses | Select-Object -First 16 | ForEach-Object {[string]$_});dhcpEnabled=$dhcp}
  })
}
try {
  switch($ActionId) {
    'windows.system.summary' {
      $os=Get-CimInstance -ClassName Win32_OperatingSystem
      $boot=([datetime]$os.LastBootUpTime).ToUniversalTime()
      $data=[ordered]@{hostname=[Environment]::MachineName;edition=[string]$os.Caption;version=[string]$os.Version;build=[string]$os.BuildNumber;architecture=[string]$os.OSArchitecture;bootTime=$boot.ToString('o');uptimeSeconds=[long]([datetime]::UtcNow-$boot).TotalSeconds}
    }
    'windows.resource.usage' {
      $os=Get-CimInstance -ClassName Win32_OperatingSystem
      $cpu=@(Get-CimInstance -ClassName Win32_Processor)
      $drive=Get-CimInstance -ClassName Win32_LogicalDisk -Filter ("DeviceID='"+[Environment]::GetEnvironmentVariable('SystemDrive')+"'")
      $total=[long]$os.TotalVisibleMemorySize*1024;$available=[long]$os.FreePhysicalMemory*1024
      $usage=$null;$sample=@($cpu | Where-Object {$null -ne $_.LoadPercentage})
      if($sample.Count -gt 0){$usage=[double]($sample | Measure-Object -Property LoadPercentage -Average).Average}
      $data=[ordered]@{cpuPercent=$usage;logicalCpuCount=[int]($cpu | Measure-Object -Property NumberOfLogicalProcessors -Sum).Sum;totalRamBytes=$total;usedRamBytes=$total-$available;availableRamBytes=$available;driveTotalBytes=[long]$drive.Size;driveUsedBytes=[long]$drive.Size-[long]$drive.FreeSpace;driveAvailableBytes=[long]$drive.FreeSpace}
    }
    'windows.services.important' {
      $services=@('Dhcp','Dnscache','EventLog','LanmanWorkstation','W32Time','wuauserv','Spooler' | ForEach-Object {
        $name=$_;$status='Unknown';$display=$name;$start=$null
        try {$s=Get-Service -Name $name;$status=[string]$s.Status;$display=[string]$s.DisplayName;$start=[string]$s.StartType} catch {}
        [ordered]@{serviceName=$name;displayName=$display;status=$status;startType=$start}
      })
      $data=[ordered]@{services=$services}
    }
    'windows.update.status' {
      $updates=@(Get-HotFix)
      $dates=@($updates | Where-Object {$null -ne $_.InstalledOn} | Sort-Object InstalledOn -Descending)
      $last=$null;if($dates.Count -gt 0){$last=([datetime]$dates[0].InstalledOn).ToUniversalTime().ToString('o')}
      $data=[ordered]@{installedHotfixCount=$updates.Count;lastInstalledAt=$last;pendingUpdatesKnown=$false;note='Installed hotfix history only. Pending updates, compliance and reboot requirements are not assessed. No scan or installation requested.'}
    }
    'network.ip.configuration' {$data=[ordered]@{adapters=@(Read-Adapters)}}
    'network.gateway.validate' {
      $r=Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 1
      $gateway=$null;$reachable=$null;$latency=$null;$loss=$null;$probes=0
      if($r -and $r.NextHop -ne '0.0.0.0'){
        $gateway=[string]$r.NextHop;$success=0;$totalLatency=0
        $ping=New-Object System.Net.NetworkInformation.Ping
        try {for($i=0;$i -lt 2;$i++){$probes++;try {$reply=$ping.Send($gateway,1000);if($reply.Status -eq 'Success'){$success++;$totalLatency+=$reply.RoundtripTime}} catch {}}} finally {$ping.Dispose()}
        $reachable=$success -gt 0;$loss=100*(2-$success)/2;if($success){$latency=[double]$totalLatency/$success}
      }
      $data=[ordered]@{gateway=$gateway;reachable=$reachable;latencyMs=$latency;packetLossPercent=$loss;probes=$probes}
    }
    'network.dns.validate' {
      $configured=@(Read-Adapters | Where-Object {$_.dnsServers.Count -gt 0}).Count -gt 0
      $watch=[Diagnostics.Stopwatch]::StartNew();$addresses=@();$succeeded=$false
      try {$addresses=@(Resolve-DnsName -Name 'example.com' -DnsOnly -NoHostsFile -QuickTimeout | Where-Object {$_.IPAddress} | Select-Object -First 16 | ForEach-Object {[string]$_.IPAddress});$succeeded=$addresses.Count -gt 0} catch {}
      $watch.Stop();$data=[ordered]@{domain='example.com';configured=$configured;succeeded=$succeeded;addresses=$addresses;latencyMs=$watch.Elapsed.TotalMilliseconds}
    }
    'network.route.summary' {
      $routes=@(Get-NetRoute -AddressFamily IPv4 | Sort-Object RouteMetric | Select-Object -First 33)
      $data=[ordered]@{routes=@($routes | Select-Object -First 32 | ForEach-Object {[ordered]@{destination=[string]$_.DestinationPrefix;interfaceIndex=[int]$_.InterfaceIndex;gateway=[string]$_.NextHop;metric=[int]$_.RouteMetric}});truncated=$routes.Count -gt 32}
    }
    'eventlog.query' {
      $levels=@{Critical=1;Error=2;Warning=3;Information=4};$hours=@{'1h'=1;'6h'=6;'24h'=24;'7d'=168}
      $events=@()
      try {$events=@(Get-WinEvent -FilterHashtable @{LogName=$LogName;Level=$levels[$Level];StartTime=(Get-Date).AddHours(-$hours[$TimeWindow])} -MaxEvents $Limit)}
      catch {if($_.FullyQualifiedErrorId -notlike 'NoMatchingEventsFound*'){throw}}
      $data=[ordered]@{logName=$LogName;events=@($events | ForEach-Object {
        $message='Message unavailable.';try {$message=[string]$_.Message} catch {}
        if($message.Length -gt 2048){$message=$message.Substring(0,2048)}
        [ordered]@{timestamp=$_.TimeCreated.ToUniversalTime().ToString('o');eventId=[int]$_.Id;level=$Level;provider=[string]$_.ProviderName;message=$message}
      })}
    }
  }
} catch {
  if($_.Exception -is [UnauthorizedAccessException] -or $_.Exception.HResult -eq -2147024891){$availability='PermissionLimited';$data=$null}
  elseif($_.Exception -is [System.Management.Automation.CommandNotFoundException]){$availability='Unsupported';$data=$null}
  else {exit 2}
}
$engine='WindowsPowerShell';if($PSVersionTable.PSEdition -eq 'Core'){$engine='PowerShell'}
[ordered]@{schemaVersion=1;actionId=$ActionId;collectedAt=[datetime]::UtcNow.ToString('o');engine=($engine+' '+$PSVersionTable.PSVersion.ToString());availability=$availability;data=$data} | ConvertTo-Json -Depth 10 -Compress
