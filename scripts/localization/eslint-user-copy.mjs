import path from 'node:path';

import legacyNoticeCopy from './legacy-notice-copy.json' with { type: 'json' };

const dialogFields = new Set(['title', 'description', 'confirmLabel', 'cancelLabel', 'inputLabel', 'moreLabel']);
const choiceFields = new Set(['label']);
const dialogCalls = new Set(['requestAppConfirmation', 'requestAppTextInput', 'requestAppChoice']);
const wrappers = new Set(['TSAsExpression', 'TSNonNullExpression', 'TSSatisfiesExpression', 'TSTypeAssertion']);

function propertyName(node) {
  if (node.type !== 'Property') return undefined;
  return node.key.type === 'Literal' ? node.key.value : !node.computed ? node.key.name : undefined;
}

function checkCopy(node, report) {
  if (!node) return;
  if (node.type === 'Literal' && typeof node.value === 'string' && node.value.trim()) report(node, node.value);
  if (node.type === 'TemplateLiteral' && node.quasis.some((part) => /\p{L}/u.test(part.value.raw))) report(node);
  if (node.type === 'ConditionalExpression') {
    checkCopy(node.consequent, report);
    checkCopy(node.alternate, report);
  }
  if (node.type === 'LogicalExpression') {
    if (node.operator !== '&&') checkCopy(node.left, report);
    checkCopy(node.right, report);
  }
  if (node.type === 'ArrayExpression') node.elements.forEach((entry) => checkCopy(entry, report));
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    checkCopy(node.left, report);
    checkCopy(node.right, report);
  }
  if (wrappers.has(node.type)) checkCopy(node.expression, report);
}

function checkProperties(node, fields, report) {
  if (node?.type !== 'ObjectExpression') return;
  for (const property of node.properties) {
    const name = propertyName(property);
    if (fields.has(name)) checkCopy(property.value, report);
    if (name === 'choices' && property.value.type === 'ArrayExpression') {
      for (const choice of property.value.elements) checkProperties(choice, choiceFields, report);
    }
  }
}

export const noHardcodedUserCopy = {
  meta: {
    type: 'problem',
    schema: [],
    messages: { hardcoded: 'Put this user-facing text in the translation catalog and pass the translated value.' }
  },
  create(context) {
    const report = (node) => context.report({ node, messageId: 'hardcoded' });
    const relativeFile = path.relative(context.cwd, context.filename).split(path.sep).join('/');
    const noticeAllowance = new Map(Object.entries(legacyNoticeCopy[relativeFile] ?? {}));
    const reportNotice = (node, literal) => {
      const copy = literal ?? context.sourceCode.getText(node);
      const remaining = noticeAllowance.get(copy) ?? 0;
      if (remaining === 0) report(node);
      else noticeAllowance.set(copy, remaining - 1);
    };
    return {
      CallExpression(node) {
        const name = node.callee.type === 'Identifier' ? node.callee.name : node.callee.property?.name;
        if (dialogCalls.has(name)) checkProperties(node.arguments[0], dialogFields, report);
        if (name === 'showAppRuntimeNotice') checkCopy(node.arguments[0], reportNotice);
      }
    };
  }
};
