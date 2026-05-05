import { useState } from 'react';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../../shared/config/appSettings';
import {
  getWhitelistedLocalStorageItem,
  removeWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from '../../../../shared/platform/storage';
import {
  DEFAULT_NODE_ICON_REVIEW_VARIANT_MODE,
  normalizeNodeIconReviewVariantMode,
  type NodeIconReviewVariantMode
} from '../../../nodes/components/nodeIconSvgSettings';
import { NodeTreeRowIcon } from '../../../nodes/components/NodeTreeRowIcon';

const SAMPLE_SVG = '<svg viewBox="0 0 16 16"><path d="M2 12C5 10 8 6 14 3" fill="none" stroke="currentColor"/></svg>';

function readStoredValue(key: string) {
  return getWhitelistedLocalStorageItem(key) ?? '';
}

function saveOptionalString(key: string, value: string) {
  if (value.trim().length === 0) {
    removeWhitelistedLocalStorageItem(key);
    return;
  }
  setWhitelistedLocalStorageItem(key, value);
}

function getInitialReviewVariantMode() {
  return normalizeNodeIconReviewVariantMode(
    getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconReviewVariantMode),
    Boolean(getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconSecondarySvg))
  );
}

function PreviewIcon(props: { kind: 'reading' | 'review'; label: string }) {
  return (
    <div className="settings-node-icon-preview-item" data-node-icon-preview={props.kind}>
      <span className="settings-node-icon-preview-badge">
        <NodeTreeRowIcon kind={props.kind} state="active" />
      </span>
      <span>{props.label}</span>
    </div>
  );
}

function useNodeIconSettingsState() {
  const [primarySvg, setPrimarySvg] = useState(() => readStoredValue(APP_SETTINGS_STORAGE_KEYS.nodeIconPrimarySvg));
  const [secondarySvg, setSecondarySvg] = useState(() => readStoredValue(APP_SETTINGS_STORAGE_KEYS.nodeIconSecondarySvg));
  const [reviewVariantMode, setReviewVariantMode] = useState<NodeIconReviewVariantMode>(getInitialReviewVariantMode);

  const handlePrimarySvgChange = (value: string) => {
    setPrimarySvg(value);
    saveOptionalString(APP_SETTINGS_STORAGE_KEYS.nodeIconPrimarySvg, value);
  };

  const handleSecondarySvgChange = (value: string) => {
    setSecondarySvg(value);
    saveOptionalString(APP_SETTINGS_STORAGE_KEYS.nodeIconSecondarySvg, value);
  };

  const handleReviewVariantModeChange = (value: NodeIconReviewVariantMode) => {
    setReviewVariantMode(value);
    if (value === DEFAULT_NODE_ICON_REVIEW_VARIANT_MODE) {
      removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconReviewVariantMode);
      return;
    }
    setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconReviewVariantMode, value);
  };

  const handleReset = () => {
    setPrimarySvg('');
    setSecondarySvg('');
    setReviewVariantMode(DEFAULT_NODE_ICON_REVIEW_VARIANT_MODE);
    removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconPrimarySvg);
    removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconSecondarySvg);
    removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconReviewVariantMode);
  };

  return {
    primarySvg,
    secondarySvg,
    reviewVariantMode,
    reviewUsesCustomSvg: reviewVariantMode === 'svg',
    handlePrimarySvgChange,
    handleSecondarySvgChange,
    handleReviewVariantModeChange,
    handleReset
  };
}

function PrimarySvgRow(props: {
  primarySvg: string;
  onPrimarySvgChange: (value: string) => void;
}) {
  return (
    <div className="settings-row settings-row-node-icon">
      <div className="settings-row-copy">
        <h4>Primary SVG</h4>
        <p>Applies to the full node icon set. Review cards reuse this SVG unless you provide a separate review variant.</p>
      </div>
      <div className="settings-node-icon-controls">
        <label className="settings-node-icon-field">
          <span className="sr-only">Primary node icon SVG</span>
          <textarea
            aria-label="Primary node icon SVG"
            className="settings-node-icon-textarea"
            onChange={(event) => props.onPrimarySvgChange(event.target.value)}
            placeholder={SAMPLE_SVG}
            rows={4}
            spellCheck={false}
            value={props.primarySvg}
          />
        </label>
      </div>
    </div>
  );
}

function ReviewVariantRow(props: {
  reviewUsesCustomSvg: boolean;
  reviewVariantMode: NodeIconReviewVariantMode;
  secondarySvg: string;
  onReviewVariantModeChange: (value: NodeIconReviewVariantMode) => void;
  onSecondarySvgChange: (value: string) => void;
}) {
  return (
    <div className="settings-row settings-row-node-icon">
      <div className="settings-row-copy">
        <h4>Review variant</h4>
        <p>Choose whether review icons use a second SVG, a horizontal flip, or a vertical flip of the primary SVG.</p>
      </div>
      <div className="settings-node-icon-controls">
        <label className="settings-select-wrap">
          <span className="sr-only">Review icon variant mode</span>
          <select
            aria-label="Review icon variant mode"
            className="settings-select"
            onChange={(event) => props.onReviewVariantModeChange(event.target.value as NodeIconReviewVariantMode)}
            value={props.reviewVariantMode}
          >
            <option value="svg">Second SVG</option>
            <option value="flip-y">Flip vertically</option>
            <option value="flip-x">Flip horizontally</option>
          </select>
        </label>
        <label className="settings-node-icon-field">
          <span className="sr-only">Review node icon SVG</span>
          <textarea
            aria-label="Review node icon SVG"
            className="settings-node-icon-textarea"
            disabled={!props.reviewUsesCustomSvg}
            onChange={(event) => props.onSecondarySvgChange(event.target.value)}
            placeholder={props.reviewUsesCustomSvg ? SAMPLE_SVG : 'Ignored while flip mode is selected.'}
            rows={4}
            spellCheck={false}
            value={props.secondarySvg}
          />
        </label>
        <p className="settings-node-icon-hint">
          Leaving the second SVG empty still falls back to the primary SVG with a vertical flip, matching the current single-SVG behavior.
        </p>
      </div>
    </div>
  );
}

function PreviewRow(props: { onReset: () => void }) {
  return (
    <div className="settings-row settings-row-node-icon">
      <div className="settings-row-copy">
        <h4>Preview</h4>
        <p>Use preview to confirm the reading and review variants before leaving settings. Restore defaults clears both SVG inputs and the review variant mode.</p>
      </div>
      <div className="settings-node-icon-controls">
        <div aria-label="Node icon preview" className="settings-node-icon-preview">
          <PreviewIcon kind="reading" label="Reading" />
          <PreviewIcon kind="review" label="Review" />
        </div>
        <button className="settings-action-button" onClick={props.onReset} type="button">
          Restore default icons
        </button>
      </div>
    </div>
  );
}

export function NodeIconSettingsSection() {
  const state = useNodeIconSettingsState();

  return (
    <section aria-label="Node icon settings section" className="settings-group">
      <h3 className="settings-group-title">Node icons</h3>
      <PrimarySvgRow primarySvg={state.primarySvg} onPrimarySvgChange={state.handlePrimarySvgChange} />
      <ReviewVariantRow
        onReviewVariantModeChange={state.handleReviewVariantModeChange}
        onSecondarySvgChange={state.handleSecondarySvgChange}
        reviewUsesCustomSvg={state.reviewUsesCustomSvg}
        reviewVariantMode={state.reviewVariantMode}
        secondarySvg={state.secondarySvg}
      />
      <PreviewRow onReset={state.handleReset} />
    </section>
  );
}
