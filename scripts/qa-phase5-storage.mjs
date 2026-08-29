import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const protectedFiles = [
  ["ARCHITECTURE.md", "091972EE6CBF218C1B5BC6991263B1B9AD2EF4B76153787FBE4C22AD1BBE82D1"],
  ["ROADMAP.md", "E424B87621BF324874323ED22CFA35C2D2276EF7378D88B9624612C8AFBC9E1F"],
  ["SECURITY.md", "C9793752F99D3D30ED45B88851E3BC0D2824B3AAA524D7A126F16ED9D7A7C5C1"],
];
const adrHashes = [
  "26A472E9793EE90EE16D15FA7504C20C50013779692B8B45AC133D344571579C",
  "339F0B444C5D119794496BCFC20AD8B2C6BF02C52EEA28D2A4A57964DA200DC5",
  "4546812F327EA61D05E074EF2145656A7B2B4CDA5E20229A59AB905B4DE11241",
  "6D874F3243D5BCFE83A0DEB4D7122C61EDAA8B6C208DD267C02298F581B1B7E8",
  "7ADE854825E6E2840C0C69C7B4483D0539FF2F0FBB6D4A810BC0EC1CB6D30A3E",
  "5DDB770FBB561CCDB34B9511A327E8325967CFA9851F100CCED98B535572872E",
];
const adrs = readdirSync("docs/adr").filter((file) => file.endsWith(".md")).sort();
assert.equal(adrs.length, 6);
for (const [index, file] of adrs.entries()) protectedFiles.push([path.join("docs/adr", file), adrHashes[index]]);
for (const [file, expectedHash] of protectedFiles) {
  const actualHash = createHash("sha256").update(readFileSync(file)).digest("hex").toUpperCase();
  assert.equal(actualHash, expectedHash, file);
}

const db = new Database("storage/edy-helpdesk.db", { readonly: true });
try {
  assert.equal(db.pragma("integrity_check", { simple: true }), "ok");
  assert.deepEqual(db.pragma("foreign_key_check"), []);
  const count = (sql) => db.prepare(sql).get().n;
  assert.equal(count("SELECT count(*) n FROM _edy_migrations"), 6);
  assert.equal(count("SELECT count(*) n FROM SecurityCase"), 5);
  assert.equal(count("SELECT count(*) n FROM SecurityCase WHERE version < 1"), 0);
  assert.equal(count("SELECT count(*) n FROM (SELECT ticketId FROM SecurityCase GROUP BY ticketId HAVING count(*) > 1)"), 0);
  assert.equal(count("SELECT count(*) n FROM SecurityEvidence WHERE type = 'TicketContext'"), 5);
  const timelineEntries = count("SELECT count(*) n FROM SecurityTimelineEntry");
  const localPendingOutbox = count("SELECT count(*) n FROM IntegrationOutbox WHERE eventType LIKE 'security.case.%' AND status = 'Pending'");
  assert.ok(timelineEntries >= 5);
  assert.ok(localPendingOutbox >= 5);
  assert.equal(count("SELECT count(*) n FROM IntegrationOutbox WHERE eventType LIKE 'security.case.%' AND status <> 'Pending'"), 0);
  const allowedPayloadKeys = ["asset", "caseCode", "correlationId", "evidenceSummaries", "severity", "sourceTicketCode", "status", "summary", "timelineTimestamps"];
  const outboxRows = db.prepare("SELECT payload FROM IntegrationOutbox WHERE eventType LIKE 'security.case.%'").all();
  for (const row of outboxRows) {
    const payload = JSON.parse(row.payload);
    assert.deepEqual(Object.keys(payload).sort(), allowedPayloadKeys);
    assert.doesNotMatch(JSON.stringify(payload), /password\s*[:=]|cookie\s*[:=]|token\s*[:=]|bearer\s+[a-z0-9._-]+|raw\s+(stdout|stderr)/iu);
  }
  assert.equal(count("SELECT count(*) n FROM DiagnosticResult WHERE sourceMode <> 'Demo'"), 0);
  const triggers = db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name IN ('AuditEvent_prevent_update','AuditEvent_prevent_delete','SecurityTimelineEntry_prevent_update','SecurityTimelineEntry_prevent_delete') ORDER BY name").all();
  assert.equal(triggers.length, 4);
  console.log(JSON.stringify({ phase5Storage: "PASS", protectedDocuments: protectedFiles.length, migrations: 6, integrity: "ok", foreignKeyViolations: 0, securityCases: 5, ticketContextEvidence: 5, timelineEntries, localPendingOutbox, validatedOutboxPayloads: outboxRows.length, appendOnlyTriggers: 4, operationalResultsInDemo: 0 }));
} finally {
  db.close();
}
