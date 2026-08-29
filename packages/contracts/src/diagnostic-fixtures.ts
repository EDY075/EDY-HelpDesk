import type {DiagnosticActionId,DiagnosticEnvelope} from './diagnostics.js';
// Fictional values only. Never generated from or replaced by host observations.
export function syntheticDiagnostic(actionId:DiagnosticActionId):DiagnosticEnvelope {
  const now=new Date().toISOString();
  const values:Record<DiagnosticActionId,unknown>={
    'windows.system.summary':{hostname:'DEMO-ENDPOINT',edition:'Windows 11 Pro (synthetic)',version:'10.0',build:'26100',architecture:'64-bit',bootTime:new Date(Date.now()-450000000).toISOString(),uptimeSeconds:450000},
    'windows.resource.usage':{cpuPercent:23,logicalCpuCount:8,totalRamBytes:16*1024**3,usedRamBytes:15*1024**3,availableRamBytes:1024**3,driveTotalBytes:500*1024**3,driveUsedBytes:460*1024**3,driveAvailableBytes:40*1024**3},
    'windows.services.important':{services:[{serviceName:'Dhcp',displayName:'DHCP Client',status:'Running',startType:'Automatic'},{serviceName:'Dnscache',displayName:'DNS Client',status:'Running',startType:'Automatic'},{serviceName:'Spooler',displayName:'Print Spooler',status:'Stopped',startType:'Manual'}]},
    'windows.update.status':{installedHotfixCount:5,lastInstalledAt:now,pendingUpdatesKnown:false,note:'Synthetic installed history. Pending updates are not assessed.'},
    'network.ip.configuration':{adapters:[{name:'Synthetic Ethernet',status:'Up',ipv4:['192.0.2.14'],prefixes:[24],gateways:['192.0.2.1'],dnsServers:['192.0.2.53'],dhcpEnabled:true}]},
    'network.gateway.validate':{gateway:'192.0.2.1',reachable:true,latencyMs:2,packetLossPercent:0,probes:2},
    'network.dns.validate':{domain:'example.com',configured:true,succeeded:false,addresses:[],latencyMs:1000},
    'network.route.summary':{routes:[{destination:'0.0.0.0/0',interfaceIndex:4,gateway:'192.0.2.1',metric:25}],truncated:false},
    'eventlog.query':{logName:'System',events:[{timestamp:now,eventId:1014,level:'Warning',provider:'Synthetic DNS Client',message:'Synthetic event: name resolution did not complete in the expected interval. Validate DNS configuration; no remediation was performed.'},{timestamp:now,eventId:7000,level:'Warning',provider:'Synthetic Service Control',message:'Synthetic event: a manually configured support service was not running. Confirm the intended configuration.'}]},
  };
  return {schemaVersion:1,actionId,collectedAt:now,engine:'Synthetic fixture',availability:'Supported',data:values[actionId]};
}
