import { ArrowLeft, Compass, ShieldCheck } from 'lucide-react';
import { Link } from 'wouter';

export default function NotFound() {
  return (
    <main className="not-found">
      <div className="not-found-card">
        <Link href="/" className="brand" data-testid="link-not-found-brand">
          <span className="brand-mark"><span /></span><span>mizan<span className="brand-period">.</span></span>
        </Link>
        <div className="not-found-symbol"><Compass size={22} strokeWidth={1.7} /></div>
        <span className="page-kicker">A SMALL DETOUR</span>
        <h1>We can’t find<br />that page.</h1>
        <p>The address may have changed, or the page may no longer be here. Your account and entries are safe.</p>
        <Link href="/" className="btn btn-primary" data-testid="link-not-found-home"><ArrowLeft size={15} /> Back to Mizan</Link>
        <div className="not-found-foot"><ShieldCheck size={14} /> Your private space is still here.</div>
      </div>
      <div className="not-found-index">404 <i /> MIZAN · PERSONAL FINANCE</div>
    </main>
  );
}
