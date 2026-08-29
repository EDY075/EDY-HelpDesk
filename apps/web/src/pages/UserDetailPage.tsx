import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Laptop } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { ErrorState, ListSkeleton } from "../components/Feedback";
import { Avatar, StatusChip } from "../components/TicketPrimitives";
import { getUser } from "../lib/api";
export function UserDetailPage() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["user", id], queryFn: () => getUser(id) });
  if (q.isPending) return <ListSkeleton />;
  if (q.isError || !q.data)
    return <ErrorState onRetry={() => void q.refetch()} />;
  const u = q.data;
  return (
    <div className="page-stack">
      <header className="user-hero">
        <Link className="breadcrumb" to="/users">
          <ArrowLeft size={14} />
          Users
        </Link>
        <div>
          <Avatar name={u.displayName} />
          <div>
            <span className="eyebrow eyebrow--accent">User workspace</span>
            <h1>{u.displayName}</h1>
            <p>
              {u.department.name} · {u.email ?? "No email recorded"}
            </p>
          </div>
        </div>
      </header>
      <section className="panel">
        <header className="panel__header">
          <div>
            <span className="section-kicker">Ownership</span>
            <h2>Assigned assets</h2>
          </div>
        </header>
        {u.assets.length ? (
          <div className="user-assets">
            {u.assets.map((a) => (
              <Link key={a.id} to={`/assets/${a.id}`}>
                <Laptop size={24} />
                <div>
                  <small className="ticket-code">{a.assetCode}</small>
                  <strong>{a.hostname || a.name}</strong>
                  <span>
                    {a.operatingSystem || "Not inventoried"} · {a.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mini-empty">No assets assigned.</div>
        )}
      </section>
      <div className="user-ticket-grid">
        {(
          [
            ["Open tickets", u.openTickets],
            ["Recent tickets", u.recentTickets],
          ] as const
        ).map(([title, tickets]) => (
          <section className="panel" key={String(title)}>
            <header className="panel__header">
              <h2>{String(title)}</h2>
            </header>
            {tickets.length ? (
              <div className="related-list">
                {tickets.map((t) => (
                  <Link key={t.id} to={`/tickets/${t.id}`}>
                    <small>{t.ticketNumber}</small>
                    <strong>{t.title}</strong>
                    <StatusChip status={t.status} />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mini-empty">No related tickets.</div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
