import { ArrowLeft, FileQuestion } from 'lucide-react';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section className="not-found" aria-labelledby="not-found-title">
      <div className="not-found__code">404</div>
      <div className="not-found__icon">
        <FileQuestion size={28} aria-hidden="true" />
      </div>
      <span className="eyebrow eyebrow--accent">Page not found</span>
      <h1 id="not-found-title">This workspace route does not exist.</h1>
      <p>
        The page may belong to a future EDY HelpDesk phase or the address may be incorrect.
      </p>
      <Link className="primary-button" to="/overview">
        <ArrowLeft size={16} aria-hidden="true" />
        Return to overview
      </Link>
    </section>
  );
}
