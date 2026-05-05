type IconProps = {
  className?: string;
};

const ARTICLE_PARAGRAPHS = [
  'A companion should reopen the last meaningful page instead of sending the user through a start screen first.',
  'The article stays on the stage. Chrome should become lighter, quieter, and secondary to the reading surface.',
  'When review is active, the bottom strip appears for grading actions. Outside review, the strip disappears entirely.',
  'The top strip keeps only a few global actions, shown as icons instead of text buttons, so the content remains dominant.',
  'This placeholder still uses mock text, but the shell is now aligned with the layout rule: article first, narrow icon bars second.'
];

function IconButton(props: { children: React.ReactNode }) {
  return (
    <button
      className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-canvas text-foreground shadow-panel"
      type="button"
    >
      {props.children}
    </button>
  );
}

function SearchIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.2-4.2" />
    </svg>
  );
}

function ClockIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function InboxIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M4 6h16v10H15l-2 3-2-3H4z" />
    </svg>
  );
}

function MoreIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

function AgainIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M7 7H3v4" />
      <path d="M4 11a8 8 0 1 0 3-6" />
    </svg>
  );
}

function HardIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M8 15h8" />
      <path d="M12 5v10" />
      <circle cx="12" cy="17.5" r="1.5" />
    </svg>
  );
}

function GoodIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="m7 12 3 3 7-7" />
    </svg>
  );
}

function EasyIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="m6 13 4 4L19 8" />
      <path d="m6 9 2 2" />
    </svg>
  );
}

function TopFloatingBar() {
  return (
    <header className="fixed inset-x-0 top-0 z-20 flex justify-center px-4 pt-4">
      <div className="flex w-full max-w-[720px] items-center justify-between rounded-full border border-border bg-canvas px-3 py-2 shadow-panel">
        <div className="flex items-center gap-2">
          <IconButton>
            <ClockIcon />
          </IconButton>
          <IconButton>
            <SearchIcon />
          </IconButton>
        </div>
        <div className="flex items-center gap-2">
          <IconButton>
            <InboxIcon />
          </IconButton>
          <IconButton>
            <MoreIcon />
          </IconButton>
        </div>
      </div>
    </header>
  );
}

function BottomFloatingBar() {
  return (
    <footer className="fixed inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-5">
      <div className="flex w-full max-w-[520px] items-center justify-between rounded-full border border-border bg-canvas px-3 py-2 shadow-panel">
        <IconButton>
          <AgainIcon />
        </IconButton>
        <IconButton>
          <HardIcon />
        </IconButton>
        <IconButton>
          <GoodIcon />
        </IconButton>
        <IconButton>
          <EasyIcon />
        </IconButton>
      </div>
    </footer>
  );
}

function ArticleSurface() {
  return (
    <main className="min-h-screen bg-canvas text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-[760px] flex-col px-6 pb-24 pt-24">
        <div className="mb-10">
          <p className="text-xs uppercase tracking-[0.22em] text-accent">Last article</p>
          <h1 className="mt-4 text-[2rem] font-semibold leading-tight sm:text-[2.7rem]">Thinking in review sessions, not static notes</h1>
        </div>
        <article className="space-y-6 text-[1.04rem] leading-8 text-foreground/88">
          {ARTICLE_PARAGRAPHS.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          {ARTICLE_PARAGRAPHS.map((paragraph, index) => (
            <p key={`${paragraph}-${index}`}>{paragraph}</p>
          ))}
        </article>
      </div>
    </main>
  );
}

function DeviceSurface() {
  return (
    <>
      <ArticleSurface />
      <TopFloatingBar />
      <BottomFloatingBar />
    </>
  );
}

export function CompanionApp() {
  return <DeviceSurface />;
}
