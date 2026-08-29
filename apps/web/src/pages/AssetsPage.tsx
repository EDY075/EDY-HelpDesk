import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowLeft,
  Boxes,
  HardDrive,
  Laptop,
  Network,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  UserRound,
} from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../components/Auth";
import {EndpointHealth} from '../components/EndpointHealth';
import { SecurityCaseCode, SecurityStatusBadge, SeverityBadge } from '../components/SecurityPrimitives';
import { securityCaseCode } from '../lib/security-ui';
import { formatDateTime, translateUi } from '../i18n/I18nProvider';
import { EmptyState, ErrorState, ListSkeleton } from "../components/Feedback";
import {
  ApiError,
  archiveAsset,
  assetStatuses,
  assetTypes,
  assignAsset,
  createAsset,
  getAsset,
  getAssetSecurityCases,
  getAssets,
  getMetadata,
  restoreAsset,
  updateAsset,
  type Asset,
  type SecurityCase,
} from "../lib/api";

const label = (v: string) => v.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, c=>c.toUpperCase());
const fmt = (v: string | null | undefined) =>
  v
    ? formatDateTime(v)
    : translateUi("Not recorded");
const bytes = (v: number | null | undefined) =>
  v === null || v === undefined
    ? translateUi("Not recorded")
    : `${Math.round(v / 1024 ** 3)} GB`;
export function AssetsPage() {
  const [params, setParams] = useSearchParams();
  const { session } = useAuth();
  const [editing, setEditing] = useState(false);
  const q = useQuery({
    queryKey: ["assets", params.toString()],
    queryFn: () => getAssets(Object.fromEntries(params)),
  });
  const meta = useQuery({ queryKey: ["metadata"], queryFn: getMetadata });
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: createAsset,
    onSuccess: async () => {
      setEditing(false);
      await qc.invalidateQueries({ queryKey: ["assets"] });
    },
  });
  const set = (key: string, value: string) => {
    const n = new URLSearchParams(params);
    if (value) n.set(key, value);
    else n.delete(key);
    if (key !== "page") n.delete("page");
    if (key === 'sort') n.set('order', value === 'assetCode' || value === 'name' ? 'asc' : 'desc');
    setParams(n);
  };
  const canWrite = session?.account.role !== "Viewer";
  const [saveError, setSaveError] = useState("");
  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow eyebrow--accent">Endpoint inventory</span>
          <h1>Assets</h1>
          <p>
            Operational ownership, lifecycle, and manually maintained technical
            context.
          </p>
        </div>
        {canWrite ? (
          <button
            className="button button--primary"
            onClick={() => setEditing(true)}
          >
            <Plus size={15} />
            Register asset
          </button>
        ) : null}
      </header>
      {editing ? (
        <AssetEditor
          departments={meta.data?.departments ?? []}
          onCancel={() => setEditing(false)}
          pending={mutation.isPending}
          onSubmit={async (x) => {
            try {
              await mutation.mutateAsync(x);
              setSaveError("");
            } catch (e) {
              setSaveError(
                e instanceof ApiError
                  ? (e.detail ?? e.message)
                  : "Unable to save asset.",
              );
            }
          }}
        />
      ) : null}
      {saveError ? (
        <div className="inline-alert" role="alert">
          {saveError}
        </div>
      ) : null}
      <section className="asset-toolbar" aria-label="Asset filters">
        <label className="search-field">
          <Search size={16} />
          <input
            autoFocus={params.get("focus") === "search"}
            type="search"
            aria-label="Search assets"
            placeholder="Search code, hostname, serial, model…"
            value={params.get("search") ?? ""}
            onChange={(e) => set("search", e.target.value)}
          />
        </label>
        {[
          ["type", "Type", assetTypes],
          ["status", "Status", assetStatuses],
        ].map(([key, title, values]) => (
          <label className="filter-select" key={String(key)}>
            <span>{String(title)}</span>
            <select
              value={params.get(String(key)) ?? ""}
              onChange={(e) => set(String(key), e.target.value)}
            >
              <option value="">All</option>
              {Array.from(values as readonly string[]).map((x) => (
                <option key={x} value={x}>
                  {label(x)}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="filter-select">
          <span>Department</span>
          <select
            value={params.get("departmentId") ?? ""}
            onChange={(e) => set("departmentId", e.target.value)}
          >
            <option value="">All</option>
            {meta.data?.departments.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-select">
          <span>Assigned</span>
          <select
            value={params.get("assignedUserId") ?? ""}
            onChange={(e) => set("assignedUserId", e.target.value)}
          >
            <option value="">Anyone</option>
            <option value="unassigned">Unassigned</option>
            {meta.data?.requesters.map((x) => (
              <option key={x.id} value={x.id}>
                {x.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-select">
          <span>OS</span>
          <input
            value={params.get("operatingSystem") ?? ""}
            onChange={(e) => set("operatingSystem", e.target.value)}
            placeholder="Any OS"
          />
        </label>
      </section>
      <section className="panel asset-queue">
        <header className="panel__header">
          <div>
            <span className="section-kicker">Inventory</span>
            <h2>{q.data?.pagination.total ?? "—"} endpoints</h2>
          </div>
          <label className="compact-select">
            Sort
            <select
              value={params.get("sort") ?? "updatedAt"}
              onChange={(e) => set("sort", e.target.value)}
            >
              <option value="updatedAt">Recently updated</option>
              <option value="assetCode">Asset code</option>
              <option value="name">Name</option>
              <option value="lastSeenAt">Last seen</option>
            </select>
          </label>
        </header>
        {q.isPending ? (
          <ListSkeleton />
        ) : q.isError ? (
          <ErrorState onRetry={() => void q.refetch()} />
        ) : q.data?.data.length ? (
          <div className="asset-list">
            {q.data.data.map((a) => (
              <Link to={`/assets/${a.id}`} key={a.id} className="asset-row">
                <span className="asset-device">
                  <Device type={a.type} />
                </span>
                <span className="asset-identity">
                  {a.archivedAt ? <small>Archived · historical record</small> : null}
                  <small>{a.assetCode}</small>
                  <strong>{a.hostname || a.name}</strong>
                  <em>
                    {[a.manufacturer, a.model].filter(Boolean).join(" ") ||
                      a.name}
                  </em>
                </span>
                <span>
                  <small>User</small>
                  <strong>{a.owner?.displayName || "Unassigned"}</strong>
                </span>
                <span>
                  <small>Department</small>
                  <strong>{a.department.name}</strong>
                </span>
                <span>
                  <small>OS</small>
                  <strong>
                    {[a.operatingSystem, a.osVersion]
                      .filter(Boolean)
                      .join(" ") || "Not inventoried"}
                  </strong>
                </span>
                <span
                  className={`asset-state asset-state--${a.status.toLowerCase()}`}
                >
                  {label(a.status)}
                </span>
                <span>
                  <small>Last seen</small>
                  <strong>
                    {a.lastSeenAt ? fmt(a.lastSeenAt) : "Not reported"}
                  </strong>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No assets match these filters."
            description="Clear a filter or register a manually inventoried endpoint."
          />
        )}
      </section>
      <label className="archive-toggle">
        <input
          type="checkbox"
          checked={params.get("includeArchived") === "true"}
          onChange={(e) =>
            set("includeArchived", e.target.checked ? "true" : "")
          }
        />
        Include archived assets
      </label>
      <PageNav
        page={q.data?.pagination.page ?? 1}
        total={q.data?.pagination.totalPages ?? 0}
        set={set}
      />
    </div>
  );
}
function Device({ type }: { type: string }) {
  const I =
    type === "NetworkDevice"
      ? Network
      : type === "Server"
        ? HardDrive
        : type === "Laptop" || type === "Desktop"
          ? Laptop
          : Boxes;
  return <I aria-hidden="true" />;
}
function PageNav({
  page,
  total,
  set,
}: {
  page: number;
  total: number;
  set: (k: string, v: string) => void;
}) {
  return total > 1 ? (
    <nav className="pagination" aria-label="Asset pages">
      <button
        disabled={page <= 1}
        onClick={() => set("page", String(page - 1))}
      >
        Previous
      </button>
      <span>
        Page {page} of {total}
      </span>
      <button
        disabled={page >= total}
        onClick={() => set("page", String(page + 1))}
      >
        Next
      </button>
    </nav>
  ) : null;
}
function AssetEditor({
  item,
  departments,
  onCancel,
  onSubmit,
  pending,
}: {
  item?: Asset;
  departments: Array<{ id: string; name: string }>;
  onCancel: () => void;
  onSubmit: (x: Record<string, unknown>) => Promise<unknown>;
  pending: boolean;
}) {
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const pick = (n: string) =>
      ((f.get(n) as string | null) ?? "").trim() || null;
    void onSubmit({
      ...(item ? { version: item.version } : {}),
      name: pick("name"),
      type: f.get("type"),
      departmentId: f.get("departmentId"),
      hostname: pick("hostname"),
      manufacturer: pick("manufacturer"),
      model: pick("model"),
      serialNumber: pick("serialNumber"),
      operatingSystem: pick("operatingSystem"),
      osVersion: pick("osVersion"),
      cpu: pick("cpu"),
      ramBytes: f.get("ramGb") ? Number(f.get("ramGb")) * 1024 ** 3 : null,
      storageBytes: f.get("storageGb")
        ? Number(f.get("storageGb")) * 1024 ** 3
        : null,
      ipv4: pick("ipv4"),
      macAddress: pick("macAddress"),
      status: f.get("status"),
      location: pick("location"),
      notes: pick("notes"),
      purchaseDate: pick('purchaseDate') ? new Date(`${pick('purchaseDate')}T00:00:00Z`).toISOString() : null,
      warrantyUntil: pick('warrantyUntil') ? new Date(`${pick('warrantyUntil')}T00:00:00Z`).toISOString() : null,
    });
  }
  return (
    <form className="panel record-editor" onSubmit={submit}>
      <header className="panel__header">
        <div>
          <span className="section-kicker">Manual inventory</span>
          <h2>{item ? "Update endpoint" : "Register endpoint"}</h2>
        </div>
      </header>
      <div className="form-grid">
        <Field name="name" label="Asset name" value={item?.name} required />
        <label className="field">
          <span>Type</span>
          <select name="type" defaultValue={item?.type ?? "Laptop"}>
            {assetTypes.map((x) => (
              <option key={x} value={x}>
                {label(x)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Department</span>
          <select
            name="departmentId"
            required
            defaultValue={item?.department.id ?? ""}
          >
            <option value="" disabled>
              Select department
            </option>
            {departments.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select name="status" defaultValue={item?.status ?? "Active"}>
            {assetStatuses.map((x) => (
              <option key={x} value={x}>
                {label(x)}
              </option>
            ))}
          </select>
        </label>
        {[
          "hostname",
          "manufacturer",
          "model",
          "serialNumber",
          "operatingSystem",
          "osVersion",
          "cpu",
          "ipv4",
          "macAddress",
          "location",
        ].map((n) => (
          <Field
            key={n}
            name={n}
            label={label(n)}
            value={typeof item?.[n] === "string" ? item[n] : ""}
          />
        ))}
        <Field
          name="ramGb"
          label="RAM (GB)"
          value={item?.ramBytes ? String(item.ramBytes / 1024 ** 3) : ""}
          type="number"
        />
        <Field
          name="storageGb"
          label="Storage (GB)"
          value={
            item?.storageBytes ? String(item.storageBytes / 1024 ** 3) : ""
          }
          type="number"
        />
        <label className="field field--wide">
          <span>Notes</span>
          <textarea name="notes" rows={3} defaultValue={item?.notes ?? ""} />
        </label>
        <Field name="purchaseDate" label="Purchase date" type="date" value={typeof item?.purchaseDate === 'string' ? item.purchaseDate.slice(0,10) : ''}/>
        <Field name="warrantyUntil" label="Warranty until" type="date" value={typeof item?.warrantyUntil === 'string' ? item.warrantyUntil.slice(0,10) : ''}/>
      </div>
      <footer className="form-actions">
        <button
          className="button button--ghost"
          type="button"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button className="button button--primary" disabled={pending}>
          {pending ? "Saving…" : "Save asset"}
        </button>
      </footer>
    </form>
  );
}
function Field({
  name,
  label,
  value = "",
  required = false,
  type = "text",
}: {
  name: string;
  label: string;
  value?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input name={name} type={type} required={required} defaultValue={value} />
    </label>
  );
}

export function AssetDetailPage() {
  const { id = "" } = useParams();
  const { session } = useAuth();
  const q = useQuery({ queryKey: ["asset", id], queryFn: () => getAsset(id) });
  const security = useQuery({ queryKey: ["asset-security-cases", id], queryFn: () => getAssetSecurityCases(id) });
  const meta = useQuery({ queryKey: ["metadata"], queryFn: getMetadata });
  const qc = useQueryClient();
  const [edit, setEdit] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState('');
  const mut = useMutation({
    mutationFn: async (work: () => Promise<unknown>) => work(),
    onSuccess: async () => {
      setEdit(false);
      setMessage('Asset updated. History and audit have been preserved.');
      setError("");
      setConflict(false);
      await qc.invalidateQueries({ queryKey: ["asset", id] });
      await qc.invalidateQueries({ queryKey: ["assets"] });
      await qc.invalidateQueries({ queryKey: ['metadata'] });
      await qc.invalidateQueries({ queryKey: ['user'] });
    },
  });
  async function run(work: () => Promise<unknown>) {
    setError("");
    setConflict(false);
    setMessage("");
    try {
      await mut.mutateAsync(work);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setConflict(true);
      else
        setError(
          e instanceof ApiError
            ? (e.detail ?? e.message)
            : "The action could not be completed.",
        );
    }
  }
  if (q.isPending) return <ListSkeleton />;
  if (!q.data || q.isError)
    return <ErrorState onRetry={() => void q.refetch()} />;
  const a = q.data;
  const canEdit = session?.account.role !== "Viewer";
  return (
    <div className="page-stack endpoint-workspace">
      <header className="endpoint-hero">
        <div>
          <Link className="breadcrumb" to="/assets">
            <ArrowLeft size={14} />
            Assets
          </Link>
          <span className="ticket-code">{a.assetCode}</span>
          <h1>{a.hostname || a.name}</h1>
          <p>{[a.manufacturer, a.model].filter(Boolean).join(" ") || a.name}</p>
          <span
            className={`asset-state asset-state--${a.status.toLowerCase()}`}
          >
            {label(a.status)}
          </span>
          {a.archivedAt ? <span className="record-state">Archived</span> : null}
        </div>
        <div className="hero-actions">
          <button
            className="button button--secondary"
            onClick={() => void q.refetch()}
          >
            <RefreshCw size={15} />
            Reload
          </button>
          {canEdit && !a.archivedAt ? (
            <button
              className="button button--primary"
              onClick={() => setEdit(true)}
            >
              Edit inventory
            </button>
          ) : null}
          {session?.account.role === "Admin" ? (
            <button
              className="button button--secondary"
              onClick={() =>
                void run(() =>
                  a.archivedAt
                    ? restoreAsset(a.id, a.version)
                    : archiveAsset(a.id, a.version),
                )
              }
            >
              {a.archivedAt ? <RotateCcw size={15} /> : <Archive size={15} />}{" "}
              {a.archivedAt ? "Restore" : "Archive"}
            </button>
          ) : null}
        </div>
      </header>
      {message ? <div className="toast toast--success" role="status">{message}</div> : null}
      {conflict ? (
        <div className="conflict-banner" role="alert">
          <div>
            <strong>This asset changed while you were editing.</strong>
            <span>Reload the latest version before trying again.</span>
          </div>
          <button
            className="button button--secondary"
            onClick={() => {
              setConflict(false);
              setError("");
              setEdit(false);
              void q.refetch();
            }}
          >
            Reload latest version
          </button>
        </div>
      ) : null}
      {error ? <div className="inline-alert" role="alert">{error}</div> : null}
      {edit ? (
        <AssetEditor
          key={a.version}
          item={a}
          departments={meta.data?.departments ?? []}
          pending={mut.isPending}
          onCancel={() => setEdit(false)}
          onSubmit={(x) => run(() => updateAsset(a.id, x))}
        />
      ) : null}
      <section className="endpoint-facts">
        <Fact
          label="Assigned user"
          value={a.owner?.displayName || "No user assigned."}
        />
        <Fact label="Department" value={a.department.name} />
        <Fact
          label="Operating system"
          value={
            [a.operatingSystem, a.osVersion].filter(Boolean).join(" ") ||
            "No technical inventory available."
          }
        />
        <Fact
          label="Last seen"
          value={a.lastSeenAt ? fmt(a.lastSeenAt) : "Not reported in manual inventory"}
        />
      </section>
      <div className="workspace-grid">
        <div className="workspace-main">
          <section className="panel endpoint-section">
            <header className="panel__header">
              <div>
                <span className="section-kicker">Technical inventory</span>
                <h2>System & network</h2>
              </div>
              <span>Manual data</span>
            </header>
            <div className="spec-grid">
              <Fact label="CPU" value={a.cpu || "Not recorded"} />
              <Fact label="RAM" value={bytes(a.ramBytes)} />
              <Fact label="Storage" value={bytes(a.storageBytes)} />
              <Fact label="IPv4" value={a.ipv4 || "Not recorded"} />
              <Fact label="MAC" value={a.macAddress || "Not recorded"} />
              <Fact label="Serial" value={a.serialNumber || "Not recorded"} />
              <Fact label="Location" value={a.location || 'Not recorded'} />
              <Fact label="Purchase date" value={fmt(typeof a.purchaseDate === 'string' ? a.purchaseDate : null)} />
              <Fact label="Warranty until" value={fmt(typeof a.warrantyUntil === 'string' ? a.warrantyUntil : null)} />
            </div>
            {a.notes ? <p className="inventory-note">{a.notes}</p> : null}
          </section>
          <section className="panel endpoint-section">
            <header className="panel__header">
              <div>
                <span className="section-kicker">Service context</span>
                <h2>Related tickets</h2>
              </div>
            </header>
            {a.tickets?.length ? (
              <div className="related-list">
                {(
                  a.tickets as Array<{
                    id: string;
                    ticketNumber: string;
                    title: string;
                    status: string;
                  }>
                ).map((t) => (
                  <Link to={`/tickets/${t.id}`} key={t.id}>
                    <small>{t.ticketNumber}</small>
                    <strong>{t.title}</strong>
                    <span>{label(t.status)}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mini-empty">No related tickets.</div>
            )}
          </section>
          <section className="panel endpoint-section endpoint-security-cases">
            <header className="panel__header">
              <div>
                <span className="section-kicker">Security triage</span>
                <h2>Security Cases</h2>
              </div>
              <span>{security.data?.openCount ?? 0} open</span>
            </header>
            {security.isPending ? <ListSkeleton /> : security.isError ? <ErrorState onRetry={() => void security.refetch()} /> : security.data?.data.length ? (
              <div className="security-compact-list">
                {(security.data.data as SecurityCase[]).slice(0, 5).map((item) => <Link className="security-compact" to={`/security/cases/${item.id}`} key={item.id}><div><SecurityCaseCode value={securityCaseCode(item)} /><strong>{item.title}</strong><span>Potentially relevant · requires analyst review</span></div><SeverityBadge severity={item.severity} /><SecurityStatusBadge status={item.status} /></Link>)}
              </div>
            ) : <div className="mini-empty">No security cases are linked to this endpoint.</div>}
          </section>
          <EndpointHealth assetId={a.id}/>
        </div>
        <aside className="workspace-context">
          <section className="panel action-panel">
            <header>
              <span className="section-kicker">Ownership</span>
              <h2>Assignment</h2>
            </header>
            {canEdit && !a.archivedAt ? (
              <label className="field">
                <span>Assigned user</span>
                <select
                  value={a.assignedUserId ?? ""}
                  onChange={(e) =>
                    void run(() =>
                      assignAsset(a.id, {
                        version: a.version,
                        assignedUserId: e.target.value || null,
                      }),
                    )
                  }
                >
                  <option value="">No user assigned</option>
                  {meta.data?.requesters.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.displayName}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p>{a.owner?.displayName || "No user assigned."}</p>
            )}
          </section>
          <section className="panel activity-panel">
            <header className="panel__header">
              <div>
                <span className="section-kicker">History</span>
                <h2>Activity</h2>
              </div>
            </header>
            {a.activity?.length ? (
              <ol className="timeline">
                {(
                  a.activity as Array<{
                    id: string;
                    action: string;
                    occurredAt: string;
                  }>
                ).map((e) => (
                  <li key={e.id}>
                    <span className="timeline__marker">
                      <UserRound size={13} />
                    </span>
                    <div>
                      <strong>{label(e.action.replace(/[._]/g, " "))}</strong>
                      <time>{fmt(e.occurredAt)}</time>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="mini-empty">No activity yet.</div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}
