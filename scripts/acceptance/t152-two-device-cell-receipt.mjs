import fs from 'node:fs';
import path from 'node:path';

/* global process */

import {
  TWO_DEVICE_CELLS, validateTwoDeviceCell
} from './t152-two-device-matrix-validator.mjs';

function required(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function matrixBinding(env) {
  const cellId = required(env.FOLIOLE_T152_CELL_ID?.trim(), 'T152 cell id is missing.');
  const cell = required(TWO_DEVICE_CELLS.find(({ id }) => id === cellId),
    'T152 cell id is invalid.');
  return {
    attemptId: required(env.FOLIOLE_T152_MATRIX_ATTEMPT?.trim(),
      'T152 attempt id is missing.'),
    cell,
    receiptPath: path.resolve(required(env.FOLIOLE_T152_CELL_RECEIPT?.trim(),
      'T152 cell receipt path is missing.')),
    revision: required(env.FOLIOLE_T152_MATRIX_REVISION?.trim(),
      'T152 revision is missing.'),
    tree: required(env.FOLIOLE_T152_MATRIX_TREE?.trim(), 'T152 tree is missing.')
  };
}

export function writeT152TwoDeviceCellReceipt(proof, {
  env = process.env, exists = fs.existsSync
} = {}) {
  const binding = matrixBinding(env);
  const receipt = { ...proof, attemptId: binding.attemptId, cellId: binding.cell.id,
    creator: binding.cell.creator, joiner: binding.cell.joiner,
    revision: binding.revision, schemaVersion: 1, tree: binding.tree };
  validateTwoDeviceCell(receipt, binding.cell, { exists });
  const temporary = `${binding.receiptPath}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(binding.receiptPath), { recursive: true });
  fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, binding.receiptPath);
  return { receipt, receiptPath: binding.receiptPath };
}
