export function SettingsAboutSection() {
  return (
    <section aria-label="About settings section" className="settings-group">
      <h3 className="settings-group-title">Application</h3>
      <div className="settings-row settings-row-readonly">
        <div className="settings-row-copy">
          <h4>Foliole desktop</h4>
          <p>Reader-first outlining and review workflow built with Tauri + React.</p>
        </div>
        <span className="settings-pill">v0.1.0</span>
      </div>
    </section>
  );
}
