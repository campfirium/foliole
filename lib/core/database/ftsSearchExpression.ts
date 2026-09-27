export type SearchExpression =
  | { kind: 'and'; left: SearchExpression; right: SearchExpression }
  | { kind: 'not'; left: SearchExpression; right: SearchExpression }
  | { kind: 'or'; left: SearchExpression; right: SearchExpression }
  | { kind: 'term'; value: string };

export function escapeFtsPhrase(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function expressionPrecedence(expression: SearchExpression) {
  return expression.kind === 'or' ? 1 : expression.kind === 'and' ? 2 : expression.kind === 'not' ? 3 : 4;
}

export function compileSearchExpression(expression: SearchExpression, parentPrecedence = 0): string {
  if (expression.kind === 'term') return escapeFtsPhrase(expression.value);
  const precedence = expressionPrecedence(expression);
  const left = compileSearchExpression(expression.left, precedence);
  const right = compileSearchExpression(expression.right, precedence);
  const compiled = `${left} ${expression.kind.toUpperCase()} ${right}`;
  return precedence < parentPrecedence ? `(${compiled})` : compiled;
}

export function evaluateSearchExpression(
  expression: SearchExpression,
  normalizedHaystack: string,
  matchesTerm: (value: string) => boolean = (value) => normalizedHaystack.includes(value)
): boolean {
  if (expression.kind === 'term') return matchesTerm(expression.value);
  if (expression.kind === 'not') {
    return evaluateSearchExpression(expression.left, normalizedHaystack, matchesTerm)
      && !evaluateSearchExpression(expression.right, normalizedHaystack, matchesTerm);
  }
  if (expression.kind === 'and') {
    return evaluateSearchExpression(expression.left, normalizedHaystack, matchesTerm)
      && evaluateSearchExpression(expression.right, normalizedHaystack, matchesTerm);
  }
  return evaluateSearchExpression(expression.left, normalizedHaystack, matchesTerm)
    || evaluateSearchExpression(expression.right, normalizedHaystack, matchesTerm);
}
