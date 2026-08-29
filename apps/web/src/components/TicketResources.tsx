import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Laptop } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "./Auth";
import { ErrorState, ListSkeleton } from "./Feedback";
import {
  ApiError,
  changeTicketKnowledge,
  getArticles,
  getMetadata,
  getTicketKnowledge,
  linkTicketAsset,
  type Ticket,
} from "../lib/api";

export function TicketResources({ ticket }: { ticket: Ticket }) {
  const { session } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [pending, setPending] = useState(false);
  const canEdit =
    ticket.status !== "Closed" &&
    (session?.account.role === "Admin" ||
      (session?.account.role === "Technician" &&
        ticket.assignee?.id === session.account.id));
  const knowledge = useQuery({
    queryKey: ["ticket-knowledge", ticket.id],
    queryFn: () => getTicketKnowledge(ticket.id),
  });
  const meta = useQuery({ queryKey: ["metadata"], queryFn: getMetadata });
  const articles = useQuery({
    queryKey: ["knowledge-search", search],
    queryFn: () => getArticles({ search, status: "Published", pageSize: 25 }),
    enabled: canEdit,
  });
  async function run(work: () => Promise<unknown>) {
    setPending(true);
    setError("");
    try {
      await work();
      await qc.invalidateQueries({ queryKey: ["ticket", ticket.id] });
      await qc.invalidateQueries({ queryKey: ["ticket-knowledge", ticket.id] });
      await qc.invalidateQueries({ queryKey: ["asset"] });
      setConflict(false);
    } catch (e) {
      setConflict(e instanceof ApiError && e.status === 409);
      setError(
        e instanceof ApiError
          ? (e.detail ?? e.message)
          : "The relationship could not be changed.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="panel ticket-resources">
      <header className="panel__header">
        <div>
          <span className="section-kicker">Resolution context</span>
          <h2>Assets & knowledge</h2>
        </div>
      </header>
      {error ? (
        <div className="inline-alert" role="alert">
          {error}
          {conflict ? (
            <button
              className="button button--secondary"
              onClick={() => {
                void qc.invalidateQueries({ queryKey: ["ticket", ticket.id] });
                setError("");
                setConflict(false);
              }}
            >
              Reload latest version
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="resource-section">
        <h3>
          <Laptop size={16} />
          Related asset
        </h3>
        {ticket.asset ? (
          <Link className="resource-link" to={`/assets/${ticket.asset.id}`}>
            <span className="ticket-code">
              {String(ticket.asset.assetCode ?? ticket.asset.assetTag)}
            </span>
            <strong>{ticket.asset.name}</strong>
          </Link>
        ) : (
          <p>No related asset.</p>
        )}
        {canEdit ? (
          <label className="field">
            <span>Link or change asset</span>
            <select
              aria-label="Related asset selection"
              value={ticket.asset?.id ?? ""}
              disabled={pending}
              onChange={(e) =>
                void run(() =>
                  linkTicketAsset(ticket.id, {
                    version: ticket.version,
                    assetId: e.target.value || null,
                  }),
                )
              }
            >
              <option value="">No related asset</option>
              {ticket.asset &&
              !meta.data?.assets.some((a) => a.id === ticket.asset?.id) ? (
                <option value={ticket.asset.id}>
                  {ticket.asset.assetTag} · Archived
                </option>
              ) : null}
              {meta.data?.assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {String(a.assetCode ?? a.assetTag)} · {a.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <div className="resource-section">
        <h3>
          <BookOpen size={16} />
          Related knowledge
        </h3>
        <p className="action-help">
          Open a reference while resolving the ticket. Nothing is copied or
          executed automatically.
        </p>
        {knowledge.isPending ? (
          <ListSkeleton rows={2} />
        ) : knowledge.isError ? (
          <ErrorState onRetry={() => void knowledge.refetch()} />
        ) : knowledge.data?.data.length ? (
          <div className="ticket-knowledge-list">
            {knowledge.data.data.map((a) => (
              <div key={a.id}>
                <Link
                  to={`/knowledge/${a.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <small className="ticket-code">{a.articleCode}</small>
                  <strong>{a.title}</strong>
                  <span>{a.category.name} · Opens in new tab</span>
                </Link>
                {canEdit ? (
                  <button
                    type="button"
                    className="button button--ghost"
                    disabled={pending}
                    aria-label={`Unlink ${a.title}`}
                    onClick={() =>
                      void run(() =>
                        changeTicketKnowledge(ticket.id, "unlink", {
                          version: ticket.version,
                          articleId: a.id,
                        }),
                      )
                    }
                  >
                    Unlink
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mini-empty">No related knowledge yet.</p>
        )}
        {canEdit ? (
          <div className="knowledge-linker">
            <label className="field">
              <span>Find published knowledge</span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search code, title, or symptom…"
              />
            </label>
            {articles.isError ? (
              <ErrorState onRetry={() => void articles.refetch()} />
            ) : (
              <label className="field">
                <span>Link article</span>
                <select
                  value=""
                  disabled={pending}
                  onChange={(e) => {
                    if (e.target.value)
                      void run(() =>
                        changeTicketKnowledge(ticket.id, "link", {
                          version: ticket.version,
                          articleId: e.target.value,
                        }),
                      );
                  }}
                >
                  <option value="">Select a published article</option>
                  {articles.data?.data
                    .filter(
                      (a) => !knowledge.data?.data.some((k) => k.id === a.id),
                    )
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.articleCode} · {a.title}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
