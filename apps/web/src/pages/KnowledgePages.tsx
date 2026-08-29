import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  Copy,
  Plus,
  Search,
} from "lucide-react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useAuth } from "../components/Auth";
import { EmptyState, ErrorState, ListSkeleton } from "../components/Feedback";
import { formatDate } from '../i18n/I18nProvider';
import {
  ApiError,
  articleAction,
  createArticle,
  getArticle,
  getArticles,
  getMetadata,
  updateArticle,
  type Article,
} from "../lib/api";

const sections = [
  ["problem", "Problem"],
  ["symptoms", "Symptoms"],
  ["diagnosticSteps", "Diagnostic steps"],
  ["solution", "Solution"],
  ["validationSteps", "Validation"],
] as const;
const fmt = (v: string) => formatDate(v);
export function KnowledgePage() {
  const [params, setParams] = useSearchParams();
  const { session } = useAuth();
  const q = useQuery({
    queryKey: ["knowledge", params.toString()],
    queryFn: () => getArticles(Object.fromEntries(params)),
  });
  const meta = useQuery({ queryKey: ["metadata"], queryFn: getMetadata });
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v);
    else n.delete(k);
    if (k !== "page") n.delete("page");
    if (k === 'sort') n.set('order', v === 'title' ? 'asc' : 'desc');
    setParams(n);
  };
  return (
    <div className="page-stack knowledge-hub">
      <header className="page-header">
        <div>
          <span className="eyebrow eyebrow--accent">Support intelligence</span>
          <h1>Knowledge base</h1>
          <p>
            Find a proven support path. Apply it with context and human
            judgment.
          </p>
        </div>
        {session?.account.role !== "Viewer" ? (
          <Link className="button button--primary" to="/knowledge/new">
            <Plus size={15} />
            Create article
          </Link>
        ) : null}
      </header>
      <section className="knowledge-search">
        <label className="search-field">
          <Search size={19} />
          <input
            autoFocus={params.get("focus") === "search"}
            aria-label="Search knowledge"
            type="search"
            value={params.get("search") ?? ""}
            onChange={(e) => set("search", e.target.value)}
            placeholder="Search symptoms, solutions, tags, or KB code…"
          />
        </label>
        <div className="knowledge-controls">
          <label className="filter-select">
            <span>Category</span>
            <select
              value={params.get("categoryId") ?? ""}
              onChange={(e) => set("categoryId", e.target.value)}
            >
              <option value="">All categories</option>
              {meta.data?.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {session?.account.role !== "Viewer" ? (
            <label className="filter-select">
              <span>Status</span>
              <select
                value={params.get("status") ?? ""}
                onChange={(e) => set("status", e.target.value)}
              >
                <option value="">Draft & published</option>
                {["Draft", "Published", "Archived"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="filter-select">
            <span>Tag</span>
            <input
              placeholder="Any tag"
              value={params.get("tag") ?? ""}
              onChange={(e) => set("tag", e.target.value)}
            />
          </label>
          <label className="filter-select">
            <span>Sort</span>
            <select
              value={params.get("sort") ?? "updatedAt"}
              onChange={(e) => set("sort", e.target.value)}
            >
              <option value="updatedAt">Recently updated</option>
              <option value="title">Title</option>
            </select>
          </label>
        </div>
      </section>
      <section className="panel knowledge-results">
        <header className="panel__header">
          <div>
            <span className="section-kicker">Support library</span>
            <h2>{q.data?.pagination.total ?? "—"} articles</h2>
          </div>
          <span>Human-reviewed knowledge</span>
        </header>
        {q.isPending ? (
          <ListSkeleton />
        ) : q.isError ? (
          <ErrorState onRetry={() => void q.refetch()} />
        ) : q.data?.data.length ? (
          <div className="knowledge-list">
            {q.data.data.map((a) => (
              <Link
                className="knowledge-row"
                key={a.id}
                to={`/knowledge/${a.id}`}
              >
                <span className="knowledge-icon">
                  <BookOpen size={21} />
                </span>
                <div>
                  <div className="knowledge-row__meta">
                    <span className="ticket-code">{a.articleCode}</span>
                    <span
                      className={`article-status article-status--${a.status.toLowerCase()}`}
                    >
                      {a.status}
                    </span>
                  </div>
                  <h3>{a.title}</h3>
                  <p>{a.summary}</p>
                  <div className="knowledge-tags">
                    <span>{a.category.name}</span>
                    {a.tags.slice(0, 3).map((t) => (
                      <span key={t}>#{t}</span>
                    ))}
                  </div>
                </div>
                <aside>
                  <span>Updated {fmt(a.updatedAt)}</span>
                  <small>{a._count?.ticketLinks ?? 0} related tickets</small>
                  <ArrowUpRight size={18} />
                </aside>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No knowledge articles found."
            description="Try a symptom or clear filters. Only published articles are visible to Viewers."
          />
        )}
      </section>
      {(q.data?.pagination.totalPages ?? 0) > 1 ? (
        <nav className="pagination" aria-label="Knowledge pages">
          <button
            disabled={q.data!.pagination.page === 1}
            onClick={() => set("page", String(q.data!.pagination.page - 1))}
          >
            Previous
          </button>
          <span>
            Page {q.data!.pagination.page} of {q.data!.pagination.totalPages}
          </span>
          <button
            disabled={q.data!.pagination.page >= q.data!.pagination.totalPages}
            onClick={() => set("page", String(q.data!.pagination.page + 1))}
          >
            Next
          </button>
        </nav>
      ) : null}
    </div>
  );
}

export function ArticleDetailPage() {
  const { id = "" } = useParams();
  const { session } = useAuth();
  const q = useQuery({
    queryKey: ["article", id],
    queryFn: () => getArticle(id),
  });
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: async (work: () => Promise<unknown>) => work(),
    onSuccess: async () => {
      setEditing(false);
      setMessage("Article saved. The change is recorded in the audit trail.");
      setError("");
      await q.refetch();
      await qc.invalidateQueries({ queryKey: ["knowledge"] });
    },
  });
  async function run(work: () => Promise<unknown>) {
    setError("");
    setConflict(false);
    setMessage("");
    try {
      await mut.mutateAsync(work);
    } catch (e) {
      setConflict(e instanceof ApiError && e.status === 409);
      setError(
        e instanceof ApiError
          ? (e.detail ?? e.message)
          : "The change could not be saved.",
      );
    }
  }
  if (q.isPending) return <ListSkeleton />;
  if (q.isError || !q.data)
    return (
      <ErrorState
        title="Article not available for this session."
        onRetry={() => void q.refetch()}
      />
    );
  const a = q.data;
  const admin = session?.account.role === "Admin";
  const editable =
    a.status !== "Archived" &&
    (admin || (session?.account.role === "Technician" && a.status === "Draft"));
  return (
    <div className="page-stack article-workspace">
      <header className="article-hero">
        <div>
          <Link className="breadcrumb" to="/knowledge">
            <ArrowLeft size={14} />
            Knowledge base
          </Link>
          <div className="knowledge-row__meta">
            <span className="ticket-code">{a.articleCode}</span>
            <span
              className={`article-status article-status--${a.status.toLowerCase()}`}
            >
              {a.status}
            </span>
          </div>
          <h1>{a.title}</h1>
          <p>{a.summary}</p>
        </div>
        <div className="hero-actions">
          {editable ? (
            <button
              className="button button--primary"
              onClick={() => setEditing(true)}
            >
              Edit article
            </button>
          ) : null}
          {admin && a.status === "Draft" ? (
            <button
              className="button button--secondary"
              disabled={mut.isPending}
              onClick={() =>
                void run(() => articleAction(a.id, "publish", a.version))
              }
            >
              <Check size={15} />
              Publish
            </button>
          ) : null}
          {admin ? (
            <button
              className="button button--secondary"
              disabled={mut.isPending}
              onClick={() =>
                void run(() =>
                  articleAction(
                    a.id,
                    a.status === "Archived" ? "restore" : "archive",
                    a.version,
                  ),
                )
              }
            >
              {a.status === "Archived" ? "Restore as draft" : "Archive"}
            </button>
          ) : null}
          <button
            className="button button--secondary"
            onClick={() => {
              void navigator.clipboard
                .writeText(`${window.location.origin}/knowledge/${a.id}`)
                .then(
                  () => setMessage("Article link copied."),
                  () => setError("The browser could not copy this link."),
                );
            }}
          >
            <Copy size={15} />
            Copy link
          </button>
        </div>
      </header>
      {message ? (
        <div className="toast toast--success" role="status">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="inline-alert" role="alert">
          {error}
        </div>
      ) : null}
      {conflict ? (
        <div className="conflict-banner" role="alert">
          <p>A newer revision exists. Your draft has not overwritten it.</p>
          <button
            className="button button--secondary"
            onClick={() => {
                setEditing(false);
                setConflict(false);
                setError("");
                void q.refetch();
            }}
          >
            Reload latest version
          </button>
        </div>
      ) : null}
      {editing ? (
        <ArticleEditor
          key={a.version}
          item={a}
          pending={mut.isPending}
          onCancel={() => setEditing(false)}
          onSubmit={(x) =>
            run(() => updateArticle(a.id, { ...x, version: a.version }))
          }
        />
      ) : (
        <div className="article-layout">
          <article className="panel article-body">
            {sections.map(([key, title], i) => (
              <section
                key={key}
                id={key}
                className={key === "solution" ? "article-solution" : ""}
              >
                <header>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <h2>{title}</h2>
                </header>
                <p>{a[key] || "This section is not completed yet."}</p>
              </section>
            ))}
          </article>
          <aside className="article-context">
            <section className="panel context-card">
              <header>
                <span className="section-kicker">Revision context</span>
                <h2>About this article</h2>
              </header>
              <dl>
                <div>
                  <dt>Category</dt>
                  <dd>{a.category.name}</dd>
                </div>
                <div>
                  <dt>Author</dt>
                  <dd>{a.author.user?.displayName ?? a.author.username}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{fmt(a.updatedAt)}</dd>
                </div>
                <div>
                  <dt>Revision</dt>
                  <dd>v{a.version}</dd>
                </div>
              </dl>
              <div className="knowledge-tags">
                {a.tags.map((t) => (
                  <Link key={t} to={`/knowledge?tag=${encodeURIComponent(t)}`}>
                    #{t}
                  </Link>
                ))}
              </div>
            </section>
            <nav
              className="panel article-outline"
              aria-label="Article sections"
            >
              <span className="section-kicker">On this page</span>
              {sections.map(([key, title]) => (
                <a key={key} href={`#${key}`}>
                  {title}
                </a>
              ))}
            </nav>
            <section className="panel context-card">
              <header>
                <span className="section-kicker">Support context</span>
                <h2>Related tickets</h2>
              </header>
              {a.ticketLinks?.length ? (
                <div className="related-list">
                  {(
                    a.ticketLinks as Array<{
                      id: string;
                      ticket: {
                        id: string;
                        title: string;
                        ticketNumber: string;
                      };
                    }>
                  ).map((l) => (
                    <Link key={l.id} to={`/tickets/${l.ticket.id}`}>
                      <small>{l.ticket.ticketNumber}</small>
                      <strong>{l.ticket.title}</strong>
                    </Link>
                  ))}
                </div>
              ) : (
                <p>No related tickets.</p>
              )}
            </section>
            <p className="action-help">
              Reference material only. Steps never execute automatically.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}

export function NewArticlePage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [error, setError] = useState("");
  const mut = useMutation({
    mutationFn: createArticle,
    onSuccess: (a) => {
      void navigate(`/knowledge/${a.id}`);
    },
  });
  if (session?.account.role === "Viewer")
    return (
      <EmptyState
        title="Read-only access"
        description="Only technicians and administrators can create knowledge drafts."
      />
    );
  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow eyebrow--accent">
            Capture support knowledge
          </span>
          <h1>Create knowledge draft</h1>
          <p>
            Write a reusable, sanitized procedure. Publishing always requires
            administrator review.
          </p>
        </div>
      </header>
      {error ? (
        <div className="inline-alert" role="alert">
          {error}
        </div>
      ) : null}
      <ArticleEditor
        pending={mut.isPending}
        onCancel={() => void navigate("/knowledge")}
        onSubmit={async (x) => {
          try {
            await mut.mutateAsync(x);
          } catch (e) {
            setError(
              e instanceof ApiError
                ? (e.detail ?? e.message)
                : "Could not save the draft.",
            );
          }
        }}
      />
    </div>
  );
}
function ArticleEditor({
  item,
  pending,
  onSubmit,
  onCancel,
}: {
  item?: Article;
  pending: boolean;
  onSubmit: (x: Record<string, unknown>) => Promise<unknown>;
  onCancel: () => void;
}) {
  const meta = useQuery({ queryKey: ["metadata"], queryFn: getMetadata });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const x: Record<string, unknown> = Object.fromEntries(f);
    x.tags = ((f.get("tags") as string | null) ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    void onSubmit(x);
  }
  return (
    <form className="panel record-editor knowledge-editor" onSubmit={submit}>
      <header className="panel__header">
        <div>
          <span className="section-kicker">Structured editor</span>
          <h2>{item ? "Edit article" : "New draft"}</h2>
        </div>
        <span>Plain text · No HTML</span>
      </header>
      <div className="form-grid">
        <label className="field field--wide">
          <span>Title</span>
          <input
            name="title"
            required
            minLength={3}
            maxLength={200}
            defaultValue={item?.title}
          />
        </label>
        <label className="field field--wide">
          <span>Summary</span>
          <textarea
            name="summary"
            rows={2}
            maxLength={1000}
            defaultValue={item?.summary}
          />
        </label>
        <label className="field">
          <span>Category</span>
          <select
            name="categoryId"
            required
            defaultValue={item?.categoryId ?? ""}
          >
            <option value="" disabled>
              Select category
            </option>
            {meta.data?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Tags (comma separated)</span>
          <input name="tags" defaultValue={item?.tags.join(", ")} />
        </label>
        {sections.map(([key, title]) => (
          <label className="field field--wide" key={key}>
            <span>{title}</span>
            <textarea
              name={key}
              rows={key === "diagnosticSteps" || key === "solution" ? 5 : 3}
              maxLength={8000}
              defaultValue={item?.[key]}
              placeholder={
                key === "diagnosticSteps"
                  ? "1. Record the observable symptom.\n2. Follow the approved support procedure."
                  : undefined
              }
            />
          </label>
        ))}
      </div>
      <footer className="form-actions">
        <span className="action-help">
          Do not include passwords, personal details, or internal notes.
        </span>
        <button
          type="button"
          className="button button--ghost"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button className="button button--primary" disabled={pending}>
          {pending ? "Saving…" : item ? "Save article" : "Create draft"}
        </button>
      </footer>
    </form>
  );
}
