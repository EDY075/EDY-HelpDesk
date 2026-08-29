import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyticsEnvelopeSchema } from "@edy/contracts";
import { protectCsvFormula, recordsToCsv, safeExportPath } from "./reports.js";

describe("Phase 6 export safety", () => {
  it.each(["=SUM(A1:A2)", "+cmd", "-2+3", "@formula"])("neutralizes CSV formula input %s", (value) => expect(protectCsvFormula(value)).toBe(`'${value}`));
  it("quotes fields and escapes embedded quotes", () => expect(recordsToCsv([{ label: 'a,"b"', value: "safe" }])).toContain('"a,""b"""'));
  it("creates no misleading header for an empty dataset", () => expect(recordsToCsv([])).toBe(""));
  it("accepts only backend-generated UUID file names", () => { const root=path.resolve("storage","exports");expect(safeExportPath(root,"10000000-0000-4000-8000-000000000001.csv")).toBe(path.join(root,"10000000-0000-4000-8000-000000000001.csv")); });
  it.each(["../report.csv","C:\\report.csv","\\\\server\\share\\report.csv","report.csv","10000000-0000-4000-8000-000000000001.pdf"])("rejects unsafe path %s", (value) => expect(()=>safeExportPath("storage/exports",value)).toThrow("INVALID_EXPORT_PATH"));
  it("validates the versioned analytics envelope and rejects extra sensitive fields", () => { const base={schemaVersion:1,generatedAt:new Date().toISOString(),source:"edy-helpdesk",dataset:"Tickets",records:[{ticketCode:"HD-1"}]};expect(analyticsEnvelopeSchema.safeParse(base).success).toBe(true);expect(analyticsEnvelopeSchema.safeParse({...base,password:"secret"}).success).toBe(false); });
});
