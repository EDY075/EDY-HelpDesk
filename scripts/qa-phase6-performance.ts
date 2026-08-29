import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import Database from "better-sqlite3";
import { seedDatabase } from "../prisma/seed.js";
import { buildAnalytics } from "../apps/api/src/modules/analytics/metrics.js";
import { resolveDateRange } from "../apps/api/src/modules/analytics/date-range.js";
import { generateReportRecords } from "../apps/api/src/modules/analytics/reports.js";
import { createPrismaClient } from "../apps/api/src/platform/prisma.js";

const root=path.resolve(process.cwd());
const directory=path.join(root,"storage","performance-qa",`phase6-${randomUUID()}`);
await mkdir(directory,{recursive:true});const databasePath=path.join(directory,"performance.db");const sqlite=new Database(databasePath);
try{for(const entry of (await readdir(path.join(root,"prisma","migrations"),{withFileTypes:true})).filter(item=>item.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name)))sqlite.exec(await readFile(path.join(root,"prisma","migrations",entry.name,"migration.sql"),"utf8"));}finally{sqlite.close()}
const db=createPrismaClient(`file:${databasePath}`);
try{
  await seedDatabase(db);const requester=await db.user.findFirstOrThrow(),department=await db.department.findFirstOrThrow(),category=await db.ticketCategory.findFirstOrThrow(),policy=await db.slaPolicy.findFirstOrThrow({where:{priority:"Medium"}}),technician=await db.account.findFirstOrThrow({where:{role:"Technician"}}),now=Date.now();
  await db.ticket.createMany({data:Array.from({length:5_000},(_,index)=>({id:randomUUID(),ticketNumber:`PERF-2026-${String(index+1).padStart(6,"0")}`,title:`Synthetic performance ticket ${index+1}`,description:"Synthetic non-production performance fixture.",priority:"Medium" as const,status:index%4===0?"Resolved" as const:"Assigned" as const,requesterId:requester.id,departmentId:department.id,categoryId:category.id,assigneeAccountId:technician.id,slaPolicyId:policy.id,createdAt:new Date(now-(index%25)*86_400_000),resolvedAt:index%4===0?new Date(now-(index%25)*86_400_000+3_600_000):null}))});
  const interval=resolveDateRange({range:"30d"});const dashboardStart=performance.now();const analytics=await buildAnalytics(db,technician.id,interval);const dashboardMs=Number((performance.now()-dashboardStart).toFixed(1));const reportStart=performance.now();const rows=await generateReportRecords(db,"TicketReport","Admin",technician.id,interval);const reportMs=Number((performance.now()-reportStart).toFixed(1));if(dashboardMs>5_000||reportMs>5_000)throw new Error("Phase 6 performance threshold exceeded");console.log(JSON.stringify({phase6Performance:"PASS",syntheticTickets:await db.ticket.count(),dashboardMs,reportMs,reportRows:rows.length,openTickets:analytics.overview.openTickets,databasePath}));
}finally{await db.$disconnect()}
