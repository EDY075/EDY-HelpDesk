import { Component, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

type Props = { children: ReactNode; resetKey: string };
type State = { failed: boolean };

export class PageErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State { return { failed: true }; }

  componentDidCatch(): void {
    // The global runtime owns sanitized telemetry. Never render raw exception details.
  }

  componentDidUpdate(previous: Props): void {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="page-stack"><section className="panel page-boundary" role="alert"><span className="page-boundary__icon"><AlertTriangle size={20} /></span><div><span className="section-kicker">Workspace isolated</span><h1>This page could not be displayed</h1><p>The application shell and your session remain available. Retry this page or use the navigation to continue safely.</p><button className="button button--secondary" type="button" onClick={() => this.setState({ failed: false })}><RotateCcw size={15} />Retry page</button></div></section></div>;
  }
}
