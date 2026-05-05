let runtimeStartupTokensCss = '';
let runtimeStartupTokensThemeSource: 'dark' | 'light' = 'light';

export function setRuntimeStartupTokensCss(css: string, themeSource: 'dark' | 'light' = 'light') {
  runtimeStartupTokensCss = css;
  runtimeStartupTokensThemeSource = themeSource;
}

export function getRuntimeStartupTokensInlineCss() {
  return runtimeStartupTokensCss;
}

export function getRuntimeStartupTokensThemeSource() {
  return runtimeStartupTokensThemeSource;
}
