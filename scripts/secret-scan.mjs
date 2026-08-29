import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const root = process.cwd();
const excludedDirectories = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  "storage",
  "logs",
  "archive",
  "generated",
  ".npm-cache",
  "screenshots",
  "debug-artifacts",
]);
// `.env` is an intentionally local, git-ignored runtime input. Scan the
// versionable `.env.example` contract and every source/document file instead.
const excludedFiles = new Set([".env", "package-lock.json", "secret-scan.mjs"]);
const textExtensions = new Set([
  ".cjs",
  ".css",
  ".env",
  ".example",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".prisma",
  ".sql",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
  ".ps1",
  ".cs",
]);

const secretPatterns = [
  { name: "private key", regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: "AWS access key", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "GitHub token", regex: /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/g },
  { name: "GitHub fine-grained token", regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { name: "OpenAI-style key", regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: "Google API key", regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: "Twilio credential identifier", regex: /\b(?:AC|SK)[a-f0-9]{32}\b/gi },
  { name: "JWT", regex: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g },
  { name: "personal Windows path", regex: /[A-Za-z]:[\\/]Users[\\/](?!Public(?:[\\/]|$))[^\s`"'<>]+/gi },
  { name: "credentialed database URL", regex: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s:@/]+:[^\s@/]+@/gi },
  { name: "webhook URL", regex: /https?:\/\/[^\s`"'<>]+\/(?:[^\s`"'<>]*webhooks?[^\s`"'<>]*)/gi },
  { name: "E.164 phone number", regex: /(?<!\d)\+[1-9]\d{9,14}(?!\d)/g },
  { name: "forbidden personal name", regex: /\bEdmilson\b/gi },
];

// Never print a matched private value: findings contain file/line/type only.
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
for (const [name, value] of [
  ["local hostname", os.hostname()],
  ["Windows username", os.userInfo().username],
  ["local DNS suffix", process.env.USERDNSDOMAIN],
]) {
  if (value && value.length >= 3) secretPatterns.push({name, regex:new RegExp(`\\b${escapeRegex(value)}\\b`, "gi")});
}
for(const item of Object.values(os.networkInterfaces()).flat().filter(Boolean)) {
  if(item.mac&&item.mac!=='00:00:00:00:00:00')secretPatterns.push({name:'local interface MAC',regex:new RegExp(escapeRegex(item.mac),'gi')});
  if(item.family==='IPv4'&&!item.internal)secretPatterns.push({name:'local IPv4 address',regex:new RegExp(escapeRegex(item.address),'gi')});
  if(item.family==='IPv6'&&!item.internal)secretPatterns.push({name:'local IPv6 address',regex:new RegExp(escapeRegex(item.address),'gi')});
}
secretPatterns.push(
  {name:"MAC address", regex:/\b(?!(?:02[:-])(?:[0-9a-f]{2}[:-]){4}[0-9a-f]{2}\b)(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b/gi},
  {name:"internal DNS name", regex:/\b(?!(?:comments|comment|item)\.internal\b)(?:[a-z0-9-]+\.)+(?:internal|corp|lan|ad)\b/gi},
);
// IPv4 literals: retain private/loopback/documentation ranges and CIDR boundaries.
// Public IPs are private operational data here, even when not credentials.
function isPublicIPv4(value) {
  const parts=value.split('.').map(Number);
  if(parts.length!==4||parts.some(n=>n>255))return false;
  const [a,b,c]=parts;
  return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===192&&b===0&&c===2||a===198&&b===51&&c===100||a===203&&b===0&&c===113||a===255);
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(fullPath)));
    else if (!excludedFiles.has(entry.name)) files.push(fullPath);
  }

  return files;
}

function shouldScan(filePath) {
  const base = path.basename(filePath);
  return base === ".env.example" || textExtensions.has(path.extname(filePath));
}

const findings = [];
for (const filePath of (await collectFiles(root)).filter(shouldScan)) {
  const text = await readFile(filePath, "utf8");
  const relativePath = path.relative(root, filePath);

  for(const match of text.matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g)) {
    // Dotted software versions are not addresses (e.g. recorded PS engine version).
    const prefix=text.slice(Math.max(0,match.index-32),match.index);
    if(isPublicIPv4(match[0])&&!/(?:WindowsPowerShell|PowerShell|engine version|version)\s*[`"': ]*$/i.test(prefix))findings.push(`${relativePath}:${text.slice(0,match.index).split(/\r?\n/).length} public IPv4 address`);
  }
  for(const match of text.matchAll(/\b(?:[a-z0-9-]+\.)+local\b/gi)) {
    // Approved synthetic account/host identifiers are explicit, not blanket .local exclusions.
    if(!['qa.local','admin.local','viewer.local','technician.local','demo.local'].includes(match[0].toLowerCase()))findings.push(`${relativePath}:${text.slice(0,match.index).split(/\r?\n/).length} internal DNS name`);
  }

  for (const pattern of secretPatterns) {
    pattern.regex.lastIndex = 0;
    for (const match of text.matchAll(pattern.regex)) {
      const line = text.slice(0, match.index).split(/\r?\n/).length;
      const lineText = text.split(/\r?\n/)[line - 1] ?? "";
      if (
        pattern.name === "forbidden personal name" &&
        /Copyright \(c\) 2026 Edmilson Gomes\b/.test(lineText)
      ) {
        continue;
      }
      findings.push(`${relativePath}:${line} ${pattern.name}`);
    }
  }

  for (const match of text.matchAll(/\b[A-Z][A-Z0-9_]*(?:PASSWORD|TOKEN|SECRET|API_KEY|AUTH_KEY)[ \t]*=[ \t]*([^\s#]+)/g)) {
    const value = match[1] ?? "";
    if (!/^(?:change-me|example|placeholder|<[^>]+>|""|'')$/i.test(value)) {
      const line = text.slice(0, match.index).split(/\r?\n/).length;
      findings.push(`${relativePath}:${line} credential-like assignment`);
    }
  }

  for (const match of text.matchAll(/\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi)) {
    const domain = (match[1] ?? "").toLowerCase();
    if (!domain.endsWith(".invalid") && !["example.com", "example.org", "example.net"].includes(domain)) {
      const line = text.slice(0, match.index).split(/\r?\n/).length;
      findings.push(`${relativePath}:${line} non-example email address`);
    }
  }
}

if (findings.length > 0) {
  console.error(`Secret scan failed with ${findings.length} finding(s):`);
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log("Secret scan passed: source/docs checked for secrets, local identifiers, profile paths, public IPv4, MAC addresses, internal DNS names and non-example email. Ignored private runtime artifacts were not scanned.");
