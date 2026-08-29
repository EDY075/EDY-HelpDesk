import type { PrismaClient } from "../apps/api/src/generated/prisma/client.js";
import { nextCode } from "../apps/api/src/modules/inventory-knowledge/shared.js";

// All identities and inventory below are fictional. Documentation is inert plain text.
export async function seedPhase3(prisma: PrismaClient) {
  const admin = await prisma.account.findUniqueOrThrow({
    where: { username: "demo.admin" },
  });
  const devices = [
    {
      tag: "DEMO-P3-FIN",
      name: "Finance mobile workstation",
      hostname: "DEMO-FIN-014",
      type: "Laptop",
      department: "FIN",
      user: "morgan.lee@example.invalid",
      manufacturer: "Dell",
      model: "Latitude 5440",
      os: "Windows 11 Pro",
      cpu: "Intel Core i5 · synthetic inventory",
      ram: 16,
      storage: 512,
      ip: "192.0.2.14",
      mac: "02:00:00:00:00:14",
      status: "Active",
    },
    {
      tag: "DEMO-P3-IT",
      name: "IT support workstation",
      hostname: "DEMO-IT-021",
      type: "Desktop",
      department: "IT",
      user: "alex.kim@example.invalid",
      manufacturer: "Lenovo",
      model: "ThinkCentre M90",
      os: "Windows 11 Pro",
      cpu: "Intel Core i7 · synthetic inventory",
      ram: 32,
      storage: 1024,
      ip: "192.0.2.21",
      mac: "02:00:00:00:00:21",
      status: "Active",
    },
    {
      tag: "DEMO-P3-PRINT",
      name: "Operations shared printer",
      hostname: "DEMO-OPS-PRN",
      type: "Printer",
      department: "OPS",
      user: null,
      manufacturer: "HP",
      model: "LaserJet Enterprise",
      os: null,
      cpu: null,
      ram: null,
      storage: null,
      ip: "192.0.2.30",
      mac: "02:00:00:00:00:30",
      status: "Maintenance",
    },
    {
      tag: "DEMO-P3-HR",
      name: "HR onboarding laptop",
      hostname: "DEMO-HR-008",
      type: "Laptop",
      department: "HR",
      user: "taylor.brooks@example.invalid",
      manufacturer: "Lenovo",
      model: "ThinkPad T14",
      os: "Windows 11 Pro",
      cpu: "AMD Ryzen 5 · synthetic inventory",
      ram: 16,
      storage: 512,
      ip: "192.0.2.8",
      mac: "02:00:00:00:00:08",
      status: "Active",
    },
    {
      tag: "DEMO-P3-NET",
      name: "Training network switch",
      hostname: "DEMO-IT-SW01",
      type: "NetworkDevice",
      department: "IT",
      user: null,
      manufacturer: "Aruba",
      model: "Instant On 1930",
      os: null,
      cpu: null,
      ram: null,
      storage: null,
      ip: "192.0.2.1",
      mac: "02:00:00:00:00:01",
      status: "InStock",
    },
  ];
  for (const d of devices)
    await prisma.$transaction(async (tx) => {
      if (await tx.asset.findUnique({ where: { assetTag: d.tag } })) return;
      const department = await tx.department.findUniqueOrThrow({
        where: { code: d.department },
      });
      const user = d.user
        ? await tx.user.findUnique({ where: { email: d.user } })
        : null;
      const asset = await tx.asset.create({
        data: {
          assetCode: await nextCode(tx, "asset", "AST"),
          assetTag: d.tag,
          name: d.name,
          hostname: d.hostname,
          assetType: d.type,
          manufacturer: d.manufacturer,
          model: d.model,
          serialNumber: `SYNTH-${d.tag}`,
          operatingSystem: d.os,
          osVersion: d.os ? "24H2" : null,
          cpu: d.cpu,
          ramBytes: d.ram ? d.ram * 1024 ** 3 : null,
          storageBytes: d.storage ? d.storage * 1024 ** 3 : null,
          ipv4: d.ip,
          macAddress: d.mac,
          status: d.status,
          departmentId: department.id,
          ownerId: user?.id,
          location: "Synthetic training environment",
          notes:
            "Portfolio Demo: manually entered, fictional inventory. No hardware was scanned.",
          lastSeenAt: null,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: admin.id,
          actorType: "account",
          actorRoleSnapshot: "Admin",
          action: "asset.created",
          resourceType: "asset",
          resourceId: asset.id,
          outcome: "success",
          metadata: { synthetic: true },
        },
      });
      if (user)
        await tx.auditEvent.create({
          data: {
            actorId: admin.id,
            actorType: "account",
            action: "asset.assigned",
            resourceType: "asset",
            resourceId: asset.id,
            outcome: "success",
            changedFields: { previousUserId: null, newUserId: user.id },
            metadata: { synthetic: true },
          },
        });
    });
  const articles = [
    [
      "Network",
      "DNS resolution failure",
      "Separate name resolution symptoms from general connectivity issues.",
      "The requester can reach an approved resource by its documented address but the same resource fails by name. Scope the incident before changing any network settings.",
      "Names fail in more than one approved application. Other users on the same segment may or may not be affected. A browser-only error is insufficient to establish a DNS issue.",
      "1. Record the affected hostname, time and exact user-visible error without collecting credentials.\n2. Compare the expected name with the service documentation.\n3. Ask whether another approved application is affected.\n4. Review manually supplied adapter settings against the approved baseline. Do not run commands from this article.",
      "Correct a documented typo or submit the verified configuration discrepancy to the network owner. Changes to DNS settings require the organization’s approved change process; do not substitute a public resolver without approval.",
      "Ask the requester to retry the original workflow using the approved hostname. Record whether the issue persists in the original application. If unresolved, escalate with sanitized findings and the affected time window.",
      "dns|network",
      "HD-2026-000001",
    ],
    [
      "Printer",
      "Printer appears offline",
      "Restore an approved print workflow after checking the device and queue context.",
      "A shared training printer is listed as offline or jobs remain pending. Avoid clearing a queue that may contain another user’s work.",
      "The selected printer name differs from the expected device, a paused status is visible, or the device panel indicates paper or consumable attention.",
      "1. Confirm the intended printer and its location.\n2. Ask for the device panel status and check the selected queue in Settings.\n3. Confirm whether the fault affects one requester or the whole department.\n4. Record the symptom without copying document contents.",
      "Address an observable paper or cover condition using the device guide. Select the correct approved queue if the wrong one was chosen. Queue changes or driver installation must follow the approved support process.",
      "With requester consent, print a non-sensitive test page to the correct device. Confirm both successful output and absence of duplicate pending jobs. Record the result in the ticket.",
      "printer|queue",
      "HD-2026-000003",
    ],
    [
      "Account",
      "Password or account access issue",
      "Guide verification and recovery without handling passwords.",
      "The requester cannot sign in to an approved application. A recovery workflow must distinguish a locked account, expired password and an unrelated service outage.",
      "The user sees an account-specific warning or repeated sign-in rejection. Never ask the requester to send their password, recovery codes or one-time codes.",
      "1. Confirm the application name and exact non-sensitive error.\n2. Verify requester identity using the organization’s approved process.\n3. Check the documented recovery channel and whether a known outage applies.\n4. Stop and escalate if the request is suspicious.",
      "Direct the verified requester to the official self-service recovery flow. If manual assistance is required, route the request to an authorized account administrator. This article performs no account change.",
      "The requester confirms sign-in on the official application. Record only the recovery outcome, never credentials or tokens. Close only after confirming the original access need.",
      "account|password",
      "HD-2026-000002",
    ],
    [
      "Hardware",
      "Slow Windows computer",
      "Collect a bounded performance description before choosing a remedy.",
      "A Windows workstation responds slowly during normal work. Preserve unsaved work and determine whether the delay is application-specific or system-wide.",
      "Long application launch times, sluggish navigation or delays opening approved local files. The timing and workload are more useful than an unsupported diagnosis.",
      "1. Ask when the slowdown began and what changed.\n2. Record the affected applications and whether restarting them changes the symptom.\n3. Review manually provided resource usage observations without collecting personal window titles.\n4. Compare the recorded inventory with application requirements.",
      "Agree on a low-risk next step with the requester, such as closing an unneeded application after saving work. Persistent resource pressure or hardware faults require a separate approved investigation. Do not disable security software or delete user files.",
      "Repeat the originally slow workflow under comparable conditions and record the requester’s assessment. If unresolved, escalate with workload, timestamps and sanitized observations.",
      "windows|performance",
      "HD-2026-000005",
    ],
    [
      "Software",
      "Approved application crashes on launch",
      "Capture reproducible application failure details while preserving work.",
      "An approved application exits before the requester can complete a task. Avoid speculative reinstalls that may remove settings or local data.",
      "A visible error dialog, immediate exit or a repeatable failure after a specific action. Confirm the behavior is not a normal sign-in or update prompt.",
      "1. Record application name and version from its visible interface.\n2. Capture the exact sanitized error text.\n3. Identify the smallest reproducible action and whether other users are affected.\n4. Check the documented supported OS and release notes supplied by the application owner.",
      "Use the application owner’s approved recovery procedure. If a repair or reinstall is necessary, first confirm licensing, backup and authorization. Do not run downloaded repair scripts or disable endpoint protection.",
      "Ask the requester to launch the application and repeat the original task with non-sensitive sample data. Record the successful version or escalate the remaining error.",
      "application|crash",
      "HD-2026-000004",
    ],
    [
      "Access",
      "Access permission request",
      "Route least-privilege access requests with clear ownership and approval.",
      "A requester needs access to a business resource. Treat a permission request separately from an outage or account recovery incident.",
      "The resource is available but the requester receives an access-denied message or cannot find an expected function. Existing access may be insufficient for the requested task.",
      "1. Confirm the exact resource and business task.\n2. Identify the data owner and approved access profile.\n3. Collect approval through the organization’s established workflow.\n4. Do not copy private resource contents into the ticket.",
      "Route the approved least-privilege profile to the authorized administrator. Temporary access should have a reviewed end date. No access is granted automatically by this article or by linking it to a ticket.",
      "The requester confirms only the approved task is available. Document approver, profile and outcome without storing secrets. Retain the approval reference according to local policy.",
      "access|approval",
      "HD-2026-000006",
    ],
    [
      "Software",
      "Windows Update needs attention",
      "Triage an update failure without unsafe cleanup or forced restarts.",
      "Windows reports that an approved update could not complete. Repeated failures require the update identifier and context, not a guessed repair command.",
      "An error code appears in the update UI, a restart is pending or the same update is offered repeatedly. Verify the device is within an approved maintenance window.",
      "1. Record the visible update identifier and error code.\n2. Ask whether a restart is pending and whether work is saved.\n3. Review manually provided free-space and power information.\n4. Check the organization’s update guidance before proposing changes.",
      "Schedule a supported retry or restart only with requester consent and according to the maintenance policy. Persistent failures should be escalated to endpoint administration. Do not erase update folders, change registry keys or bypass update policy.",
      "Review the visible update history with the requester after the approved action. Confirm the original business application still works. Record the outcome or the remaining error for escalation.",
      "windows|update",
      null,
    ],
  ] as const;
  for (const [
    category,
    title,
    summary,
    problem,
    symptoms,
    diagnosticSteps,
    solution,
    validationSteps,
    tags,
    ticketCode,
  ] of articles)
    await prisma.$transaction(async (tx) => {
      // Stable synthetic identity via seed audit marker, not a mutable title lookup.
      const marker = `phase3.knowledge.${title}`;
      if (
        await tx.auditEvent.findFirst({
          where: { action: "knowledge.created", reason: marker },
        })
      )
        return;
      const categoryRow = await tx.ticketCategory.findUniqueOrThrow({
        where: { name: category },
      });
      const article = await tx.knowledgeArticle.create({
        data: {
          articleCode: await nextCode(tx, "knowledge", "KB"),
          title,
          summary,
          problem,
          symptoms,
          diagnosticSteps,
          solution,
          validationSteps,
          tags: `|${tags}|`,
          categoryId: categoryRow.id,
          authorAccountId: admin.id,
          status: "Published",
          publishedAt: new Date(),
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: admin.id,
          actorType: "account",
          action: "knowledge.created",
          resourceType: "knowledge",
          resourceId: article.id,
          outcome: "success",
          reason: marker,
          metadata: { synthetic: true },
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: admin.id,
          actorType: "account",
          action: "knowledge.published",
          resourceType: "knowledge",
          resourceId: article.id,
          outcome: "success",
          metadata: { synthetic: true },
        },
      });
      if (ticketCode) {
        const ticket = await tx.ticket.findUnique({
          where: { ticketNumber: ticketCode },
        });
        if (ticket) {
          await tx.knowledgeArticleTicket.create({
            data: { articleId: article.id, ticketId: ticket.id },
          });
          await tx.auditEvent.create({
            data: {
              actorId: admin.id,
              actorType: "account",
              action: "ticket.knowledge_linked",
              resourceType: "ticket",
              resourceId: ticket.id,
              outcome: "success",
              changedFields: { articleId: article.id },
              metadata: { synthetic: true },
            },
          });
        }
      }
    });
}
