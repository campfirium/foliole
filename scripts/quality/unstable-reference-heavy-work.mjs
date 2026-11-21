#!/usr/bin/env node
/* global console, process */

// Audit scanner: effects, memos, and third-party components whose dependencies
// receive a reference the caller recreates on every render while the guarded body
// does heavy work (see unstable-reference-heavy-work-catalog.mjs). Output is a list
// of audit candidates and a line-free baseline for diffing; it is not a lint gate.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import {
  COMPUTE_CALL_RULES,
  EXCLUDED_CALL_NAMES,
  HEAVY_CALL_RULES,
  HEAVY_NEW_RULES,
  REFERENCE_STABLE_CALLS,
  THIRD_PARTY_HEAVY_PROPS
} from './unstable-reference-heavy-work-catalog.mjs';

const EFFECT_HOOKS = new Set(['useEffect', 'useLayoutEffect', 'useInsertionEffect', 'useMemo']);
const MEMO_HOOKS = new Set(['useCallback', 'useMemo']);
const STABLE_HOOKS = new Set([
  'useRef',
  'useState',
  'useReducer',
  'useId',
  'useTransition',
  'useContext',
  'useSyncExternalStore',
  'useDeferredValue',
  'useEffectEvent'
]);
const PRIMITIVE_FLAGS =
  ts.TypeFlags.StringLike |
  ts.TypeFlags.NumberLike |
  ts.TypeFlags.BooleanLike |
  ts.TypeFlags.BigIntLike |
  ts.TypeFlags.EnumLike |
  ts.TypeFlags.Null |
  ts.TypeFlags.Undefined |
  ts.TypeFlags.Void |
  ts.TypeFlags.ESSymbolLike |
  ts.TypeFlags.Never;
const NON_PRODUCTION =
  /(\.(test|integration|testSupport|spec|stories|generated)\.|\.d\.ts$|\/(__tests__|test-support|testSupport|fixtures?)\/|\/demo\/generated\/)/iu;

export function isProductionFile(relativePath) {
  return /^src\/.*\.(ts|tsx)$/u.test(relativePath) && !NON_PRODUCTION.test(relativePath);
}

function unwrap(expr) {
  let node = expr;
  while (
    node &&
    (ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isTypeAssertionExpression(node))
  ) {
    node = node.expression;
  }
  return node;
}

function calleeName(call) {
  const callee = unwrap(call.expression);
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return '';
}

function isFunctionNode(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node)
  );
}

function functionName(fn) {
  if (fn.name && ts.isIdentifier(fn.name)) return fn.name.text;
  let parent = fn.parent;
  while (parent && ts.isCallExpression(parent)) parent = parent.parent;
  if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name))
    return parent.name.text;
  if (parent && ts.isPropertyAssignment(parent)) return parent.name.getText();
  return '';
}

function isRenderScope(fn) {
  return /^(use[A-Z0-9]|[A-Z])/u.test(functionName(fn));
}

function enclosingRenderScope(node) {
  let current = node.parent;
  while (current) {
    if (isFunctionNode(current)) return isRenderScope(current) ? current : null;
    current = current.parent;
  }
  return null;
}

// Props flow through named helpers too (renderX(props), map callbacks inside a
// component), so edges attach to the nearest named function, skipping inline callbacks.
function enclosingNamedScope(node) {
  let current = node.parent;
  while (current) {
    if (isFunctionNode(current) && functionName(current)) return current;
    current = current.parent;
  }
  return null;
}

function contains(outer, inner) {
  return (
    inner.getSourceFile() === outer.getSourceFile() &&
    inner.pos >= outer.pos &&
    inner.end <= outer.end
  );
}

export function createScanner({ program, repoRoot, options = {} }) {
  const checker = program.getTypeChecker();
  const rel = (sf) => path.relative(repoRoot, sf.fileName).replaceAll(path.sep, '/');
  const scopeId = (fn) => `${rel(fn.getSourceFile())}#${functionName(fn) || 'anonymous'}`;
  const where = (node) => {
    const sf = node.getSourceFile();
    return `${rel(sf)}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
  };
  const stats = {
    files: 0,
    heavyUses: 0,
    edges: 0,
    spreadEdges: 0,
    customHookValues: 0,
    contextValues: 0
  };

  function symbolOf(node) {
    let symbol =
      node.parent && ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node
        ? checker.getShorthandAssignmentValueSymbol(node.parent)
        : checker.getSymbolAtLocation(node);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    return symbol;
  }

  function isNonPrimitive(expr) {
    const type = checker.getTypeAtLocation(expr);
    const parts = type.isUnion() ? type.types : [type];
    return parts.some((part) => !(part.flags & PRIMITIVE_FLAGS));
  }

  const emptyResult = () => ({ inputs: new Set(), unstable: [] });
  const unstableResult = (reason) => ({ inputs: new Set(), unstable: [reason] });
  function merge(target, source) {
    for (const key of source.inputs) target.inputs.add(key);
    target.unstable.push(...source.unstable);
    return target;
  }

  function classifyDeps(call, scope, seen) {
    const deps = call.arguments[1];
    if (!deps || !ts.isArrayLiteralExpression(deps))
      return unstableResult(`${calleeName(call)} without deps`);
    return deps.elements.reduce(
      (acc, element) => merge(acc, classify(element, scope, seen)),
      emptyResult()
    );
  }

  function bindingPath(declaration) {
    const parts = [];
    let node = declaration;
    while (ts.isBindingElement(node)) {
      if (node.dotDotDotToken) parts.unshift('*');
      else if (ts.isArrayBindingPattern(node.parent))
        parts.unshift(String(node.parent.elements.indexOf(node)));
      else parts.unshift(node.propertyName?.getText() ?? node.name.getText());
      node = node.parent.parent;
    }
    return { root: node, parts };
  }

  function inputKeyOfDeclaration(declaration, scope) {
    const { root, parts } = bindingPath(declaration);
    if (!ts.isParameter(root) || root.parent !== scope) return null;
    return [String(scope.parameters.indexOf(root)), ...parts].join('.');
  }

  function joinKey(base, property) {
    return base.endsWith('.*') ? `${base.slice(0, -1)}${property}` : `${base}.${property}`;
  }

  // Object rest keeps the remaining properties, so a further path step reads through it.
  function restPath(parts, pathParts) {
    const restIndex = parts.indexOf('*');
    if (restIndex === -1) return { path: [...parts, ...pathParts], rest: false };
    if (pathParts.length === 0) return { path: parts.slice(0, restIndex), rest: true };
    return { path: [...parts.slice(0, restIndex), ...pathParts], rest: false };
  }

  function classifyIdentifier(id, scope, seen, pathParts) {
    const symbol = symbolOf(id);
    const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
    if (!declaration || !contains(scope, declaration)) return emptyResult();
    const inputKey = inputKeyOfDeclaration(declaration, scope);
    if (inputKey) return { inputs: new Set([pathParts.reduce(joinKey, inputKey)]), unstable: [] };
    if (ts.isFunctionDeclaration(declaration)) return unstableResult(`local function ${id.text}`);
    const { root, parts } = bindingPath(declaration);
    if (!ts.isVariableDeclaration(root) || !root.initializer) return emptyResult();
    const { path: fullPath, rest } = restPath(parts, pathParts);
    const seenKey = `${root.pos}:${fullPath.join('.')}:${rest}`;
    if (seen.has(seenKey)) return emptyResult();
    seen.add(seenKey);
    const result = classify(root.initializer, scope, seen, fullPath);
    return rest ? merge(result, unstableResult(`object rest ${id.text}`)) : result;
  }

  function classifyPropertyOf(objectLiteral, scope, seen, pathParts) {
    const [head, ...tail] = pathParts;
    for (const property of objectLiteral.properties) {
      const name = property.name?.getText();
      if (name !== head) continue;
      if (ts.isPropertyAssignment(property))
        return classify(property.initializer, scope, seen, tail);
      if (ts.isShorthandPropertyAssignment(property))
        return classify(property.name, scope, seen, tail);
      return unstableResult('inline method');
    }
    return objectLiteral.properties
      .filter((property) => ts.isSpreadAssignment(property))
      .reduce(
        (acc, property) => merge(acc, classify(property.expression, scope, seen, pathParts)),
        emptyResult()
      );
  }

  const hookReturnStack = new Set();
  function hookReturnValues(fn) {
    if (!ts.isBlock(fn.body)) return [fn.body];
    const values = [];
    const visit = (node) => {
      if (isFunctionNode(node)) return;
      if (ts.isReturnStatement(node) && node.expression) values.push(node.expression);
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(fn.body, visit);
    return values;
  }

  function classifyCustomHookCall(call, scope, seen, pathParts) {
    const hook = componentFunctionOf(symbolOf(unwrap(call.expression))?.valueDeclaration);
    if (!hook || moduleOf(hook) || hookReturnStack.has(hook)) {
      stats.customHookValues += 1;
      return emptyResult();
    }
    hookReturnStack.add(hook);
    const inner = hookReturnValues(hook).reduce(
      (acc, value) => merge(acc, classify(value, hook, new Set(), pathParts)),
      emptyResult()
    );
    hookReturnStack.delete(hook);
    const hookName = calleeName(call);
    const result = {
      inputs: new Set(),
      unstable: inner.unstable.map((reason) => `${hookName}() returns ${reason}`)
    };
    for (const key of inner.inputs) {
      const [index, ...rest] = key.split('.');
      const arg = call.arguments[Number(index)];
      if (arg) merge(result, classify(arg, scope, seen, rest));
    }
    return result;
  }

  // `x ?? []` and `cond ? x : {}` only build a new empty value on the empty path, where
  // the guarded work is trivially small; reporting them drowns real candidates.
  function isEmptyLiteral(node) {
    const value = unwrap(node);
    return (
      (ts.isArrayLiteralExpression(value) || ts.isObjectLiteralExpression(value)) &&
      (ts.isArrayLiteralExpression(value) ? value.elements.length : value.properties.length) === 0
    );
  }

  function classify(rawExpr, scope, seen = new Set(), pathParts = []) {
    const expr = unwrap(rawExpr);
    if (!expr) return emptyResult();
    if (pathParts.length > 0 && ts.isObjectLiteralExpression(expr))
      return classifyPropertyOf(expr, scope, seen, pathParts);
    if (pathParts.length > 0 && ts.isArrayLiteralExpression(expr)) {
      const element = expr.elements[Number(pathParts[0])];
      return element ? classify(element, scope, seen, pathParts.slice(1)) : emptyResult();
    }
    if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr))
      return unstableResult('inline function');
    if (ts.isObjectLiteralExpression(expr)) return unstableResult('inline object');
    if (ts.isArrayLiteralExpression(expr)) return unstableResult('inline array');
    if (ts.isJsxElement(expr) || ts.isJsxSelfClosingElement(expr) || ts.isJsxFragment(expr))
      return unstableResult('inline JSX');
    if (ts.isNewExpression(expr)) return unstableResult(`new ${expr.expression.getText()}`);
    if (ts.isIdentifier(expr)) return classifyIdentifier(expr, scope, seen, pathParts);
    if (ts.isPropertyAccessExpression(expr)) {
      if (expr.name.text === 'current' && pathParts.length === 0) return emptyResult();
      return classify(expr.expression, scope, seen, [expr.name.text, ...pathParts]);
    }
    if (ts.isElementAccessExpression(expr)) return classify(expr.expression, scope, seen);
    if (ts.isConditionalExpression(expr)) {
      const branches = [expr.whenTrue, expr.whenFalse].filter((branch) => !isEmptyLiteral(branch));
      return branches.reduce(
        (acc, branch) => merge(acc, classify(branch, scope, seen, pathParts)),
        emptyResult()
      );
    }
    if (ts.isBinaryExpression(expr)) {
      const op = expr.operatorToken.kind;
      if (
        op === ts.SyntaxKind.QuestionQuestionToken ||
        op === ts.SyntaxKind.BarBarToken ||
        op === ts.SyntaxKind.AmpersandAmpersandToken
      ) {
        const left = classify(expr.left, scope, seen, pathParts);
        return isEmptyLiteral(expr.right)
          ? left
          : merge(left, classify(expr.right, scope, seen, pathParts));
      }
      return emptyResult();
    }
    if (ts.isCallExpression(expr)) {
      const name = calleeName(expr);
      if (MEMO_HOOKS.has(name)) return classifyDeps(expr, scope, seen);
      if (STABLE_HOOKS.has(name)) {
        if (name === 'useContext') stats.contextValues += 1;
        return emptyResult();
      }
      if (/^use[A-Z0-9]/u.test(name)) return classifyCustomHookCall(expr, scope, seen, pathParts);
      if (name === 'bind') return unstableResult('bind()');
      if (REFERENCE_STABLE_CALLS.has(name)) return emptyResult();
      if (pathParts.length > 0) {
        // Pass-through helpers such as definedProps({ ... }) or pick(props, ...).
        return expr.arguments
          .filter(
            (arg) => ts.isObjectLiteralExpression(unwrap(arg)) || ts.isIdentifier(unwrap(arg))
          )
          .reduce((acc, arg) => merge(acc, classify(arg, scope, seen, pathParts)), emptyResult());
      }
      return isNonPrimitive(expr)
        ? unstableResult(`call ${name || expr.expression.getText()}()`)
        : emptyResult();
    }
    return emptyResult();
  }

  function localFunctionBody(id, scope) {
    const declaration = symbolOf(id)?.valueDeclaration;
    if (!declaration || !contains(scope, declaration)) return null;
    if (ts.isFunctionDeclaration(declaration)) return declaration.body ?? null;
    if (!ts.isVariableDeclaration(declaration)) return null;
    let init = unwrap(declaration.initializer);
    if (init && ts.isCallExpression(init) && MEMO_HOOKS.has(calleeName(init)))
      init = unwrap(init.arguments[0]);
    return init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) ? init.body : null;
  }

  // A nested function only counts when it runs as part of the guarded body: immediately
  // invoked, a synchronous array callback, or (in effects) a promise/timer continuation.
  // Event handlers, subscriptions, cleanups and closures built by a memo do not.
  function runsWithBody(fn, mode) {
    if (ts.isFunctionDeclaration(fn)) return false;
    const parent = fn.parent;
    if (ts.isCallExpression(parent) && parent.expression === fn) return true;
    if (ts.isCallExpression(parent) && parent.arguments.includes(fn)) {
      const name = calleeName(parent);
      if (
        /^(map|flatMap|filter|forEach|reduce|some|every|find|findIndex|sort|toSorted)$/u.test(name)
      )
        return true;
      if (mode === 'memo') return false;
      return !/^(add\w*Listener|subscribe\w*|listen\w*|on[A-Z]\w*|observe|watch\w*|setInterval|register\w*|useCallback)$/u.test(
        name
      );
    }
    if (ts.isNewExpression(parent)) return false;
    if (ts.isReturnStatement(parent)) return false;
    return false;
  }

  function heavySignals(body, scope, mode = 'effect', depth = 0, visited = new Set()) {
    const signals = [];
    const visit = (node) => {
      if (node !== body && isFunctionNode(node) && !runsWithBody(node, mode)) return;
      if (ts.isCallExpression(node)) {
        const name = calleeName(node);
        const text = node.expression.getText().slice(0, 80);
        if (name && !EXCLUDED_CALL_NAMES.has(name)) {
          for (const rule of HEAVY_CALL_RULES) {
            if (rule.test(name, text)) signals.push({ rule: rule.id, call: text, tier: 'heavy' });
          }
          for (const rule of COMPUTE_CALL_RULES) {
            if (rule.test(name, text)) signals.push({ rule: rule.id, call: text, tier: 'compute' });
          }
        }
        const callee = unwrap(node.expression);
        if (ts.isIdentifier(callee) && depth < 3) {
          const localBody = localFunctionBody(callee, scope);
          if (localBody && !visited.has(localBody)) {
            visited.add(localBody);
            signals.push(...heavySignals(localBody, scope, mode, depth + 1, visited));
          }
        }
      } else if (ts.isNewExpression(node)) {
        const name = ts.isIdentifier(node.expression)
          ? node.expression.text
          : node.expression.getText();
        for (const rule of HEAVY_NEW_RULES) {
          if (rule.test(name)) signals.push({ rule: rule.id, call: `new ${name}`, tier: 'heavy' });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(body);
    return signals;
  }

  function componentFunctionOf(declaration) {
    if (!declaration) return null;
    if (ts.isFunctionDeclaration(declaration)) return declaration;
    if (!ts.isVariableDeclaration(declaration)) return null;
    let init = unwrap(declaration.initializer);
    while (init && ts.isCallExpression(init) && /^(memo|forwardRef)$/u.test(calleeName(init)))
      init = unwrap(init.arguments[0]);
    if (init && ts.isIdentifier(init)) return componentFunctionOf(symbolOf(init)?.valueDeclaration);
    if (init && ts.isCallExpression(init) && calleeName(init) === 'lazy') {
      const result = checker.getTypeAtLocation(declaration.name).getProperty('_result');
      const target = result && checker.getTypeOfSymbol(result).getSymbol();
      return target ? componentFunctionOf(target.valueDeclaration) : null;
    }
    return init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) ? init : null;
  }

  function moduleOf(declaration) {
    const match = /node_modules\/((?:@[^/]+\/)?[^/]+)/u.exec(
      declaration.getSourceFile().fileName.replaceAll('\\', '/')
    );
    return match ? match[1] : null;
  }

  // A reviewed false positive is marked at the reported site with
  // `// unstable-reference-ok: <why this reference cannot cause repeated heavy work>`
  // on the same line or the line above. A marker without a reason does not count.
  function exemptionAt(node) {
    const sf = node.getSourceFile();
    const line = sf.getLineAndCharacterOfPosition(node.getStart()).line;
    const lines = sf.text.split('\n');
    for (const text of [lines[line], lines[line - 1]]) {
      const match = /unstable-reference-ok:\s*(\S.*)$/u.exec(text ?? '');
      if (match) return match[1].trim();
    }
    return null;
  }

  const heavyUses = [];
  const edges = [];

  function recordHeavyUse({ node, scope, kind, value, signals, label }) {
    stats.heavyUses += 1;
    heavyUses.push({ node, scope, kind, value, signals, label });
  }

  function visitHookCall(call) {
    const name = calleeName(call);
    if (EFFECT_HOOKS.has(name)) {
      const scope = enclosingRenderScope(call);
      if (!scope) return;
      const callback = unwrap(call.arguments[0]);
      const deps = call.arguments[1];
      if (!callback || !deps || !ts.isArrayLiteralExpression(deps)) return;
      if (!(ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) return;
      const signals = heavySignals(callback.body, scope, name === 'useMemo' ? 'memo' : 'effect');
      if (signals.length === 0 && !options.includeLight) return;
      for (const element of deps.elements) {
        recordHeavyUse({
          node: element,
          scope,
          kind: name,
          value: element,
          signals,
          label: `${name} deps`
        });
      }
      return;
    }
    const scope = enclosingNamedScope(call);
    if (!scope || call.arguments.length === 0) return;
    const target = componentFunctionOf(symbolOf(unwrap(call.expression))?.valueDeclaration);
    if (!target || moduleOf(target) || target === scope) return;
    call.arguments.forEach((arg, index) => {
      edges.push({ scope, targetId: scopeId(target), key: String(index), value: arg, node: arg });
      const objectArg = unwrap(arg);
      if (objectArg && ts.isObjectLiteralExpression(objectArg)) {
        for (const property of objectArg.properties) {
          if (ts.isPropertyAssignment(property)) {
            edges.push({
              scope,
              targetId: scopeId(target),
              key: `${index}.${property.name.getText()}`,
              value: property.initializer,
              node: property
            });
          } else if (ts.isShorthandPropertyAssignment(property)) {
            edges.push({
              scope,
              targetId: scopeId(target),
              key: `${index}.${property.name.text}`,
              value: property.name,
              node: property
            });
          }
        }
      }
    });
  }

  function isInactiveSink(element, entry) {
    return Object.entries(entry.inactiveWhen ?? {}).some(([name, literal]) =>
      element.attributes.properties.some(
        (attribute) =>
          ts.isJsxAttribute(attribute) &&
          attribute.name.getText() === name &&
          attribute.initializer?.getText().replace(/^\{|\}$/gu, '') === literal
      )
    );
  }

  function visitJsx(element) {
    const scope = enclosingNamedScope(element);
    if (!scope) return;
    const tagSymbol = symbolOf(element.tagName);
    const declaration = tagSymbol?.valueDeclaration ?? tagSymbol?.declarations?.[0];
    if (!declaration) return;
    const moduleName = moduleOf(declaration);
    const tagName = element.tagName.getText().split('.').pop();
    for (const attribute of element.attributes.properties) {
      if (ts.isJsxSpreadAttribute(attribute)) {
        stats.spreadEdges += 1;
        const target = moduleName ? null : componentFunctionOf(declaration);
        if (target)
          edges.push({
            scope,
            targetId: scopeId(target),
            key: '0.*',
            value: attribute.expression,
            node: attribute
          });
        continue;
      }
      const value =
        attribute.initializer && ts.isJsxExpression(attribute.initializer)
          ? attribute.initializer.expression
          : null;
      if (!value) continue;
      const propName = attribute.name.getText();
      if (moduleName) {
        const sink = THIRD_PARTY_HEAVY_PROPS.find(
          (entry) =>
            entry.module === moduleName &&
            (entry.components.includes(tagName) || entry.components.includes(tagSymbol.name)) &&
            entry.props.test(propName) &&
            !isInactiveSink(element, entry)
        );
        if (sink) {
          recordHeavyUse({
            node: attribute,
            scope,
            kind: `${moduleName} <${tagName} ${propName}>`,
            value,
            signals: [{ rule: 'third-party', call: sink.label, tier: 'heavy' }],
            label: `${moduleName}.${tagName}.${propName}`
          });
        }
        continue;
      }
      const target = componentFunctionOf(declaration);
      if (target)
        edges.push({
          scope,
          targetId: scopeId(target),
          key: `0.${propName}`,
          value,
          node: attribute
        });
    }
  }

  function collect(sourceFile) {
    stats.files += 1;
    const visit = (node) => {
      if (ts.isCallExpression(node)) visitHookCall(node);
      else if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) visitJsx(node);
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  function run(files) {
    files.forEach(collect);
    stats.edges = edges.length;
    const sinks = new Map();
    const findings = [];
    const exempted = [];
    const pushFinding = (finding, node) => {
      const reason = exemptionAt(node);
      if (reason) exempted.push({ ...finding, exemption: reason });
      else findings.push(finding);
    };
    const queue = [];
    const addSink = (id, key, chain) => {
      const keySet = sinks.get(id) ?? new Map();
      sinks.set(id, keySet);
      if (keySet.has(key)) return;
      keySet.set(key, chain);
      queue.push({ id, key });
    };
    const report = (value, scope, node, result, chain) => {
      for (const reason of new Set(result.unstable)) {
        const tier = chain[chain.length - 1].tier;
        pushFinding(
          {
            tier,
            reason,
            at: where(node),
            owner: scopeId(scope),
            value: value.getText().slice(0, 60),
            chain
          },
          node
        );
      }
    };
    for (const use of heavyUses) {
      if (!isNonPrimitive(use.value)) continue;
      const result = classify(use.value, use.scope);
      const chain = [
        {
          at: where(use.node),
          owner: scopeId(use.scope),
          via: use.label,
          tier: use.signals.some((signal) => signal.tier === 'heavy')
            ? 'heavy'
            : use.signals.length > 0
              ? 'compute'
              : 'light',
          signals: [...new Set(use.signals.map((signal) => `${signal.rule}:${signal.call}`))].slice(
            0,
            4
          )
        }
      ];
      report(use.value, use.scope, use.node, result, chain);
      const isComponent = /^[A-Z]/u.test(functionName(use.scope));
      for (const key of result.inputs) {
        if (key === '0' && isComponent) {
          pushFinding(
            {
              tier: chain[0].tier,
              reason: 'whole props object',
              at: where(use.node),
              owner: scopeId(use.scope),
              value: use.value.getText(),
              chain
            },
            use.node
          );
          continue;
        }
        addSink(scopeId(use.scope), key, [{ ...chain[0], key }]);
      }
    }
    const edgesByTarget = new Map();
    for (const edge of edges) {
      const list = edgesByTarget.get(edge.targetId) ?? [];
      list.push(edge);
      edgesByTarget.set(edge.targetId, list);
    }
    while (queue.length > 0) {
      const { id, key } = queue.shift();
      const chain = sinks.get(id).get(key);
      for (const edge of edgesByTarget.get(id) ?? []) {
        const spreadPath =
          edge.key.endsWith('.*') && key.startsWith(edge.key.slice(0, -1))
            ? key.slice(edge.key.length - 1).split('.')
            : null;
        if ((edge.key !== key && !spreadPath) || (!spreadPath && !isNonPrimitive(edge.value)))
          continue;
        const result = classify(edge.value, edge.scope, new Set(), spreadPath ?? []);
        const nextChain = [
          { at: where(edge.node), owner: scopeId(edge.scope), via: `${id} ${key}` },
          ...chain
        ];
        report(edge.value, edge.scope, edge.node, result, nextChain);
        for (const inputKey of result.inputs)
          addSink(scopeId(edge.scope), inputKey, [{ ...nextChain[0], key: inputKey }, ...chain]);
      }
    }
    return {
      findings: dedupe(findings),
      exempted: dedupe(exempted),
      stats,
      sinkCount: [...sinks.values()].reduce((n, keys) => n + keys.size, 0)
    };
  }

  return { run };
}

export function findingId(finding) {
  const sink = finding.chain[finding.chain.length - 1];
  return [
    finding.owner,
    finding.reason,
    finding.value.replace(/\s+/gu, ' '),
    `${sink.owner} ${sink.via}`
  ].join(' | ');
}

function dedupe(findings) {
  const byId = new Map();
  for (const finding of findings) {
    const id = findingId(finding);
    if (!byId.has(id)) byId.set(id, { id, ...finding });
  }
  const tierRank = { heavy: 0, compute: 1, light: 2 };
  return [...byId.values()].sort(
    (a, b) => tierRank[a.tier] - tierRank[b.tier] || a.id.localeCompare(b.id)
  );
}

export function createProgramFromProject(repoRoot, projectFile) {
  const configPath = path.resolve(repoRoot, projectFile);
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
  return ts.createProgram({
    rootNames: parsed.fileNames,
    options: { ...parsed.options, noEmit: true }
  });
}

function parseArgs(argv) {
  const args = { project: 'tsconfig.json' };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (['--project', '--json', '--baseline', '--write-baseline'].includes(flag))
      args[flag.slice(2)] = argv[++index];
    else if (flag === '--include-light') args.includeLight = true;
    else if (flag === '--guard') args.guard = true;
  }
  return args;
}

function formatFinding(finding) {
  const lines = [
    `- ${finding.tier} [${finding.reason}] ${finding.at} ${finding.owner}: \`${finding.value}\``
  ];
  for (const step of finding.chain) {
    const signals = step.signals ? ` ⇒ ${step.signals.join(', ')}` : '';
    lines.push(`    → ${step.at} ${step.via}${step.key ? ` (input ${step.key})` : ''}${signals}`);
  }
  return lines.join('\n');
}

// Baseline entries carry the audit verdict (a WA row or an exclusion reason) so the
// pre-release run only surfaces candidates nobody has judged yet.
function readBaseline(file) {
  if (!file) return { known: new Map(), meta: {} };
  const { entries = [], ...meta } = JSON.parse(readFileSync(file, 'utf8'));
  return { known: new Map(entries.map((entry) => [entry.id, entry])), meta };
}

// Same file set as the fast quality gate: QUALITY_GATE_CHANGED_FILES, else staged,
// unstaged and untracked files.
export function collectChangedFiles(repoRoot, env = process.env) {
  if (env.QUALITY_GATE_CHANGED_FILES?.trim()) {
    return [...new Set(env.QUALITY_GATE_CHANGED_FILES.split(/\s+/u).filter(Boolean))];
  }
  const git = (args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  return [
    ...new Set(
      [
        git(['diff', '--cached', '--name-only', '--diff-filter=ACMR']),
        git(['diff', '--name-only', '--diff-filter=ACMR']),
        git(['ls-files', '--others', '--exclude-standard'])
      ]
        .join('\n')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    )
  ];
}

const findingFiles = (finding) =>
  [finding.at, ...finding.chain.map((step) => step.at)].map((at) => at.replace(/:\d+$/u, ''));

// The baseline is empty, so any finding whose site or dependency chain touches a changed
// file is new work for that change.
export function selectGuardFindings(findings, changedFiles) {
  const changed = new Set(changedFiles);
  return findings.filter((finding) => findingFiles(finding).some((file) => changed.has(file)));
}

function runGuard(repoRoot, args) {
  const relevant = collectChangedFiles(repoRoot).filter(isProductionFile);
  if (relevant.length === 0) {
    console.log('[unstable-reference-guard] skipped: no changed production src files');
    return 0;
  }
  const program = createProgramFromProject(repoRoot, args.project);
  const files = program
    .getSourceFiles()
    .filter((sf) =>
      isProductionFile(path.relative(repoRoot, sf.fileName).replaceAll(path.sep, '/'))
    );
  const { findings } = createScanner({ program, repoRoot }).run(files);
  const violations = selectGuardFindings(findings, relevant);
  if (violations.length === 0) {
    console.log(
      `[unstable-reference-guard] ok: ${relevant.length} changed files, no new unstable references into heavy work`
    );
    return 0;
  }
  console.error(
    `[unstable-reference-guard] ${violations.length} new reference(s) recreated each render reach heavy work.\n` +
      'Keep the value stable (useCallback/useMemo with real inputs, or read the latest callback through a ref),\n' +
      'or mark a reviewed false positive at the reported line: // unstable-reference-ok: <reason>'
  );
  for (const finding of violations) console.error(formatFinding(finding));
  return 1;
}

function main() {
  const repoRoot = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  if (args.guard) {
    process.exitCode = runGuard(repoRoot, args);
    return;
  }
  const program = createProgramFromProject(repoRoot, args.project);
  const files = program
    .getSourceFiles()
    .filter((sf) =>
      isProductionFile(path.relative(repoRoot, sf.fileName).replaceAll(path.sep, '/'))
    );
  const { findings, stats, sinkCount } = createScanner({
    program,
    repoRoot,
    options: { includeLight: Boolean(args.includeLight) }
  }).run(files);
  const { known, meta } = readBaseline(args.baseline);
  const ids = new Set(findings.map((finding) => finding.id));
  const shown = args.baseline ? findings.filter((finding) => !known.has(finding.id)) : findings;
  if (args.baseline) {
    const gone = [...known.keys()].filter((id) => !ids.has(id));
    console.log(
      `baseline: ${known.size} judged, ${shown.length} new, ${gone.length} no longer reported`
    );
    for (const id of gone) console.log(`  gone (${known.get(id).verdict}): ${id}`);
  }
  console.log(
    `scanned ${stats.files} files; ${stats.heavyUses} heavy dependency uses, ${stats.edges} prop/arg/spread edges ` +
      `(${stats.spreadEdges} JSX spreads), ${sinkCount} sinks; ${findings.length} candidates (not defects). ` +
      `Treated as stable without tracing: ${stats.customHookValues} unresolved or recursive custom-hook values, ` +
      `${stats.contextValues} context values.`
  );
  for (const finding of shown) console.log(formatFinding(finding));
  if (args.json) writeFileSync(args.json, `${JSON.stringify({ stats, findings }, null, 2)}\n`);
  if (args['write-baseline']) {
    const entries = findings.map((finding) => ({
      id: finding.id,
      tier: finding.tier,
      verdict: known.get(finding.id)?.verdict ?? 'unjudged'
    }));
    writeFileSync(args['write-baseline'], `${JSON.stringify({ ...meta, entries }, null, 2)}\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
