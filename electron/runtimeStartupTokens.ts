let runtimeStartupTokensCss = '';

export function setRuntimeStartupTokensCss(css: string) {
  runtimeStartupTokensCss = css;
}

export function getRuntimeStartupTokensInlineCss() {
  return runtimeStartupTokensCss;
}
