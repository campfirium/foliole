export function buildFloatingThemeReadScript() {
  return `
      (() => {
        ${buildThemeReadPrelude()}
        return {
          hasAppTheme: true,
          ${buildThemeValueFieldsScript()}
          hintVisible: true,
          strings: ${buildThemeStringsScript()}
        };
      })()
    `;
}

function buildThemeReadPrelude() {
  return `
        const root = document.documentElement;
        const styles = getComputedStyle(root);
        const hasAppTheme = Boolean(styles.getPropertyValue('--app-shellless-surface-bg').trim());
        const readResolvedBaseColor = () => {
          const datasetMode = root.dataset.resolvedBaseColor;
          if (datasetMode === 'dark' || datasetMode === 'light') return datasetMode;
          const storedMode = localStorage.getItem('foliole-base-color');
          if (storedMode === 'dark' || storedMode === 'light') return storedMode;
          return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        };
        if (!hasAppTheme) return { hasAppTheme: false, resolvedBaseColor: readResolvedBaseColor(), strings: ${buildThemeStringsScript()} };
        const readColor = (property, value, fallback) => {
          const probe = document.createElement('div');
          probe.style[property] = value;
          root.appendChild(probe);
          const computed = getComputedStyle(probe)[property] || fallback;
          probe.remove();
          return computed === 'rgba(0, 0, 0, 0)' ? fallback : computed;
        };
        const readValue = (property, value, fallback) => {
          const probe = document.createElement('div');
          probe.style[property] = value;
          root.appendChild(probe);
          const computed = getComputedStyle(probe)[property] || fallback;
          probe.remove();
          return computed || fallback;
        };`;
}

function buildThemeValueFieldsScript() {
  return `
          accent: readColor('backgroundColor', 'var(--app-accent-color)', '#3f8f68'),
          actionForeground: readColor('color', 'var(--app-shellless-muted-fg)', 'rgba(32, 33, 36, 0.52)'),
          actionHoverBackground: readColor('backgroundColor', 'var(--app-shellless-control-hover-bg)', 'rgba(32, 33, 36, 0.04)'),
          actionHoverForeground: readColor('color', 'var(--app-shellless-title-fg)', 'rgba(32, 33, 36, 0.78)'),
          background: readColor('backgroundColor', 'var(--app-shellless-surface-bg)', 'rgb(255, 255, 255)'),
          border: readColor('borderColor', 'var(--app-shellless-border-color)', 'rgb(188, 189, 187)'),
          controlBorder: readColor('borderColor', 'var(--app-shellless-control-border-color)', 'rgba(32, 33, 36, 0.22)'),
          controlBorderHover: readColor('borderColor', 'var(--app-shellless-control-border-hover-color)', 'rgba(32, 33, 36, 0.36)'),
          controlForeground: readColor('color', 'var(--app-shellless-control-fg)', 'rgba(32, 33, 36, 0.52)'),
          controlHoverBackground: readColor('backgroundColor', 'var(--app-shellless-control-hover-bg)', 'rgba(32, 33, 36, 0.04)'),
          controlRadius: readValue('borderRadius', 'var(--app-shellless-control-radius)', '8px'),
          contentInlinePadding: readValue('paddingLeft', 'var(--app-shellless-content-inline-padding)', '26px'),
          foreground: readColor('color', 'var(--app-shellless-fg)', 'rgba(32, 33, 36, 0.86)'),
          inputBackground: readColor('backgroundColor', 'var(--app-shellless-input-bg)', 'rgb(255, 255, 255)'),
          inputFontFamily: readValue('fontFamily', 'var(--app-shellless-input-font-family)', '-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI Variable","Segoe UI","Microsoft YaHei UI",sans-serif'),
          inputFontSize: readValue('fontSize', 'var(--app-shellless-input-font-size)', '15.64px'),
          inputLineHeight: readValue('lineHeight', 'var(--app-shellless-input-line-height)', '1.75'),
          inputPaddingBlockEnd: readValue('paddingBottom', 'var(--app-shellless-input-padding-block-end)', '12px'),
          inputPaddingBlockStart: readValue('paddingTop', 'var(--app-shellless-input-padding-block-start)', '24px'),
          mutedForeground: readColor('color', 'var(--app-shellless-muted-fg)', 'rgba(32, 33, 36, 0.52)'),
          placeholderForeground: readColor('color', 'var(--app-shellless-placeholder-fg)', 'rgba(32, 33, 36, 0.36)'),
          radius: readValue('borderRadius', 'var(--app-shellless-radius)', '8px'),
          shadow: readValue('boxShadow', 'var(--app-shellless-shadow)', '0 8px 22px rgb(15 17 19 / 0.045)'),
          titleForeground: readColor('color', 'var(--app-shellless-title-fg)', 'rgba(32, 33, 36, 0.68)'),
          uiFontFamily: readValue('fontFamily', 'var(--app-shellless-ui-font-family)', '-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI Variable","Segoe UI","Microsoft YaHei UI",sans-serif'),
          divider: readColor('borderColor', 'var(--app-shellless-divider-color)', 'rgba(32, 33, 36, 0.10)'),`;
}

function buildThemeStringsScript() {
  return `(() => {
            const preference = localStorage.getItem('foliole-app-language');
            const languages = Array.from(navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]).filter(Boolean);
            const usesChinese = preference === 'zh-Hans' || (preference !== 'en' && languages.some((language) => language.toLowerCase().startsWith('zh')));
            return usesChinese
              ? { hideHint: '×', hideHintLabel: '隐藏提示', hint: '回车保存，空白时导入剪贴板', locale: 'zh-Hans', showHint: '?', showHintLabel: '显示提示', placeholder: '...', save: '保存' }
              : { hideHint: '×', hideHintLabel: 'Hide shortcut hint', hint: 'Enter saves. Empty input imports the clipboard.', locale: 'en', showHint: '?', showHintLabel: 'Show shortcut hint', placeholder: '...', save: 'Save' };
          })()`;
}
