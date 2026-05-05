type IconProps = {
  className?: string;
};

export type TopBarAction = 'review' | 'recent' | 'search' | 'capture' | 'more';

function IconButton(props: { active?: boolean; ariaLabel: string; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      aria-label={props.ariaLabel}
      className={`flex h-9 w-9 items-center justify-center rounded-full border text-foreground transition-colors ${
        props.active ? 'border-foreground/25 bg-bg-subtle' : 'border-border bg-canvas'
      }`}
      onClick={props.onClick}
      type="button"
    >
      {props.children}
    </button>
  );
}

function SearchIcon({ className = 'h-5 w-5' }: IconProps) {
  return <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6" /><path d="m20 20-4.2-4.2" /></svg>;
}

function ClockIcon({ className = 'h-5 w-5' }: IconProps) {
  return <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg>;
}

function ReviewIcon({ className = 'h-5 w-5' }: IconProps) {
  return <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M8 5h8" /><path d="M12 5v5" /><path d="M8 14h8" /><path d="m9.5 18 1.7 1.7 3.3-3.4" /></svg>;
}

function MoreIcon({ className = 'h-5 w-5' }: IconProps) {
  return <svg className={className} fill="currentColor" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>;
}

function CaptureIcon({ className = 'h-5 w-5' }: IconProps) {
  return <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M12 5v14" /><path d="M5 12h14" /></svg>;
}

function AgainIcon({ className = 'h-5 w-5' }: IconProps) {
  return <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M7 7H3v4" /><path d="M4 11a8 8 0 1 0 3-6" /></svg>;
}

function HardIcon({ className = 'h-5 w-5' }: IconProps) {
  return <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M8 15h8" /><path d="M12 5v10" /><circle cx="12" cy="17.5" r="1.5" /></svg>;
}

function GoodIcon({ className = 'h-5 w-5' }: IconProps) {
  return <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24"><path d="m7 12 3 3 7-7" /></svg>;
}

function EasyIcon({ className = 'h-5 w-5' }: IconProps) {
  return <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24"><path d="m6 13 4 4L19 8" /><path d="m6 9 2 2" /></svg>;
}

export function TopFloatingBar(props: {
  activeAction: TopBarAction;
  onAction(action: TopBarAction): void;
  visible: boolean;
}) {
  return (
    <header
      className={`sticky top-4 z-20 mb-6 flex justify-center px-1 transition-all duration-200 ${
        props.visible ? 'translate-y-0 opacity-100' : '-translate-y-6 opacity-0'
      }`}
      data-testid="companion-top-floating-bar"
    >
      <div className="inline-flex items-center gap-2 rounded-full border border-border bg-canvas px-3 py-2 text-foreground shadow-panel">
        <IconButton active={props.activeAction === 'review'} ariaLabel="Review" onClick={() => props.onAction('review')}>
          <ReviewIcon className="h-5 w-5" />
        </IconButton>
        <IconButton active={props.activeAction === 'recent'} ariaLabel="Recent" onClick={() => props.onAction('recent')}>
          <ClockIcon className="h-5 w-5" />
        </IconButton>
        <IconButton active={props.activeAction === 'search'} ariaLabel="Search" onClick={() => props.onAction('search')}>
          <SearchIcon className="h-5 w-5" />
        </IconButton>
        <IconButton active={props.activeAction === 'capture'} ariaLabel="Capture" onClick={() => props.onAction('capture')}>
          <CaptureIcon className="h-5 w-5" />
        </IconButton>
        <IconButton active={props.activeAction === 'more'} ariaLabel="More" onClick={() => props.onAction('more')}>
          <MoreIcon className="h-5 w-5" />
        </IconButton>
      </div>
    </header>
  );
}

export function BottomFloatingBar(props: { visible: boolean }) {
  return (
    <footer
      className={`fixed inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-5 transition-all duration-200 ${
        props.visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
      }`}
    >
      <div className="inline-flex items-center gap-3 rounded-full border border-border bg-canvas px-3 py-2 shadow-panel">
        <IconButton ariaLabel="Again"><AgainIcon /></IconButton>
        <IconButton ariaLabel="Hard"><HardIcon /></IconButton>
        <IconButton ariaLabel="Good"><GoodIcon /></IconButton>
        <IconButton ariaLabel="Easy"><EasyIcon /></IconButton>
      </div>
    </footer>
  );
}
