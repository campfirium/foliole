import { AIDE_TOOL_REGISTRY } from './aideToolRegistry.js';

interface JsonSchema {
  additionalProperties?: boolean;
  anyOf?: JsonSchema[];
  const?: unknown;
  enum?: unknown[];
  items?: JsonSchema;
  minimum?: number;
  minItems?: number;
  minLength?: number;
  not?: JsonSchema;
  oneOf?: JsonSchema[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  type?: string | string[];
  uniqueItems?: boolean;
}

export function validateAideToolArguments(toolName: string, value: unknown) {
  const definition = AIDE_TOOL_REGISTRY[toolName];
  if (!definition || !matchesSchema(value, definition.inputSchema as JsonSchema)) return null;
  return value as Record<string, unknown>;
}

function matchesSchema(value: unknown, schema: JsonSchema): boolean {
  if (schema.const !== undefined && value !== schema.const) return false;
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.type && !matchesDeclaredType(value, schema)) return false;
  if (schema.required && !hasRequiredProperties(value, schema.required)) return false;
  if (schema.properties && !matchesObjectProperties(value, schema)) return false;
  if (schema.items && !matchesArrayItems(value, schema)) return false;
  if (schema.not && matchesSchema(value, schema.not)) return false;
  if (schema.anyOf && !schema.anyOf.some((option) => matchesSchema(value, option))) return false;
  if (schema.oneOf && schema.oneOf.filter((option) => matchesSchema(value, option)).length !== 1) return false;
  return true;
}

function matchesDeclaredType(value: unknown, schema: JsonSchema) {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  return types.some((type) => matchesType(value, type, schema));
}

function matchesType(value: unknown, type: string | undefined, schema: JsonSchema) {
  if (type === 'null') return value === null;
  if (type === 'object') return isRecord(value);
  if (type === 'string') {
    return typeof value === 'string'
      && (schema.minLength === undefined || value.trim().length >= schema.minLength);
  }
  if (type === 'integer') {
    return Number.isInteger(value) && (schema.minimum === undefined || Number(value) >= schema.minimum);
  }
  if (type === 'array') {
    return Array.isArray(value) && value.length >= (schema.minItems ?? 0)
      && (!schema.uniqueItems || new Set(value).size === value.length);
  }
  return false;
}

function hasRequiredProperties(value: unknown, required: string[]) {
  return isRecord(value) && required.every((key) => Object.hasOwn(value, key));
}

function matchesObjectProperties(value: unknown, schema: JsonSchema) {
  if (!isRecord(value)) return false;
  const properties = schema.properties ?? {};
  if (schema.additionalProperties === false
    && Object.keys(value).some((key) => !Object.hasOwn(properties, key))) return false;
  return Object.entries(value).every(([key, fieldValue]) => {
    const property = properties[key];
    return !property || matchesSchema(fieldValue, property);
  });
}

function matchesArrayItems(value: unknown, schema: JsonSchema) {
  return Array.isArray(value) && value.every((item) => matchesSchema(item, schema.items ?? {}));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
