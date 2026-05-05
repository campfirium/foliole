interface SettingsReviewSectionProps {
  desiredRetention: number;
  onDesiredRetentionChange: (value: number) => void;
}

export function SettingsReviewSection({
  desiredRetention,
  onDesiredRetentionChange
}: SettingsReviewSectionProps) {
  return (
    <section aria-label="Review settings section" className="settings-group">
      <h3 className="settings-group-title">Scheduler</h3>
      <div className="settings-row">
        <div className="settings-row-copy">
          <h4>Desired retention</h4>
          <p>Lower values shorten intervals. Recommended around 0.80-0.95. Review previews update after each change.</p>
        </div>
        <div className="settings-slider-wrap">
          <input
            aria-label="Desired retention"
            className="settings-range"
            max={0.99}
            min={0.01}
            onChange={(event) => onDesiredRetentionChange(Number(event.target.value))}
            step={0.01}
            type="range"
            value={desiredRetention}
          />
          <span className="settings-range-value">{desiredRetention.toFixed(2)}</span>
        </div>
      </div>
    </section>
  );
}
