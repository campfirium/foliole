const EMPTY_ARGS = { optional: [], required: [] };

export const AGENT_CLI_CONTRACT_VERSION = 1;
export const AGENT_CONTROL_PROTOCOL_VERSION = 1;

export const AGENT_CONTROL_ROUTE_REGISTRY = /** @type {const} */ ([
  registryRoute('foundation', 'GET', 'capabilities', 'foundation.capabilities', {
    cli: cliRoute('capabilities', 'List the enabled Foliole capabilities.')
  }),
  registryRoute('public', 'GET', 'health', null, {
    cli: cliRoute('health', 'Check whether Foliole Agent Control is available.', { auth: false })
  }),
  registryRoute('foundation', 'POST', 'auth/verify', 'foundation.auth.verify'),
  registryRoute('product', 'POST', 'materials/create', 'materials.create', {
    capabilityOrder: 3,
    cli: cliRoute('materials/create', 'Create a Topic, Folder, or question-answer Item.', optionalAndRequired(['content', 'parent-id', 'reveal', 'title'], ['kind'])),
    writeKind: 'material'
  }),
  registryRoute('product', 'POST', 'materials/delete-soft', 'materials.deleteSoft', {
    capabilityOrder: 17,
    cli: cliRoute('materials/delete-soft', 'Move a Topic, Folder, or Item to trash.', optionalAndRequired(['expected-updated-at'], ['id'])),
    writeKind: 'material'
  }),
  registryRoute('product', 'POST', 'materials/list-children', 'materials.listChildren', {
    capabilityOrder: 2,
    cli: cliRoute('materials/list-children', 'List Topics and Folders directly inside a Folder.', optional('parent-id', 'limit'))
  }),
  registryRoute('product', 'POST', 'materials/move', 'materials.move', {
    capabilityOrder: 4,
    cli: cliRoute('materials/move', 'Move a Topic, Folder, or Item.', required('id', 'parent-id', 'expected-updated-at')),
    writeKind: 'material'
  }),
  registryRoute('product', 'POST', 'materials/read', 'materials.read', {
    capabilityOrder: 0,
    cli: cliRoute('materials/read', 'Read one Topic, Folder, or Item.', required('id'))
  }),
  registryRoute('product', 'POST', 'materials/search', 'materials.search', {
    capabilityOrder: 1,
    cli: cliRoute('materials/search', 'Search readable Topics and Folders.', optionalAndRequired(['limit'], ['query']))
  }),
  registryRoute('product', 'POST', 'materials/reorder', 'materials.reorder', {
    capabilityOrder: 5,
    cli: cliRoute('materials/reorder', 'Set the order inside a Folder.', optionalAndRequired(['parent-id'], ['material-ids'])),
    writeKind: 'material'
  }),
  registryRoute('product', 'POST', 'materials/restore', 'materials.restore', {
    capabilityOrder: 6,
    cli: cliRoute('materials/restore', 'Restore a Topic, Folder, or Item from trash.', required('id', 'expected-updated-at')),
    writeKind: 'material'
  }),
  registryRoute('product', 'POST', 'materials/update', 'materials.update', {
    capabilityOrder: 16,
    cli: cliRoute('materials/update', 'Update a Topic or Item.', optionalAndRequired(['content', 'reveal', 'title'], ['id', 'expected-updated-at'])),
    writeKind: 'material'
  }),
  registryRoute('product', 'POST', 'virtual-folders/add-items', 'virtualFolders.addItems', {
    capabilityOrder: 10,
    cli: cliRoute('virtual-folders/add-items', 'Add Topics to a virtual Folder.', required('folder-id', 'material-ids')),
    writeKind: 'virtual_folder'
  }),
  registryRoute('product', 'POST', 'virtual-folders/create', 'virtualFolders.create', {
    capabilityOrder: 9,
    cli: cliRoute('virtual-folders/create', 'Create a virtual Folder.', required('title')),
    writeKind: 'virtual_folder'
  }),
  registryRoute('product', 'POST', 'virtual-folders/delete-soft', 'virtualFolders.deleteSoft', {
    capabilityOrder: 14,
    cli: cliRoute('virtual-folders/delete-soft', 'Move a virtual Folder to trash.', required('id', 'expected-updated-at')),
    writeKind: 'virtual_folder'
  }),
  registryRoute('product', 'POST', 'virtual-folders/list', 'virtualFolders.list', {
    capabilityOrder: 7,
    cli: cliRoute('virtual-folders/list', 'List virtual Folders.', optional('limit'))
  }),
  registryRoute('product', 'POST', 'virtual-folders/read', 'virtualFolders.read', {
    capabilityOrder: 8,
    cli: cliRoute('virtual-folders/read', 'Read a virtual Folder and its ordered items.', optionalAndRequired(['limit'], ['id']))
  }),
  registryRoute('product', 'POST', 'virtual-folders/remove-items', 'virtualFolders.removeItems', {
    capabilityOrder: 11,
    cli: cliRoute('virtual-folders/remove-items', 'Remove Topics from a virtual Folder.', required('folder-id', 'material-ids')),
    writeKind: 'virtual_folder'
  }),
  registryRoute('product', 'POST', 'virtual-folders/restore', 'virtualFolders.restore', {
    capabilityOrder: 15,
    cli: cliRoute('virtual-folders/restore', 'Restore a virtual Folder from trash.', required('id', 'expected-updated-at')),
    writeKind: 'virtual_folder'
  }),
  registryRoute('product', 'POST', 'virtual-folders/update', 'virtualFolders.update', {
    capabilityOrder: 13,
    cli: cliRoute('virtual-folders/update', 'Rename a virtual Folder.', required('id', 'expected-updated-at', 'title')),
    writeKind: 'virtual_folder'
  }),
  registryRoute('product', 'POST', 'virtual-folders/reorder', 'virtualFolders.reorder', {
    capabilityOrder: 12,
    cli: cliRoute('virtual-folders/reorder', 'Reorder Topics in a virtual Folder.', required('folder-id', 'material-ids')),
    writeKind: 'virtual_folder'
  })
]);

export const AGENT_CONTROL_PRODUCT_CAPABILITIES = AGENT_CONTROL_ROUTE_REGISTRY
  .filter((entry) => entry.access === 'product')
  .sort((left, right) => left.capabilityOrder - right.capabilityOrder)
  .map((entry) => entry.capability);

export const AGENT_CLI_ROUTES = Object.fromEntries(
  AGENT_CONTROL_ROUTE_REGISTRY.flatMap((entry) => entry.cli ? [[entry.cli.name, {
    args: entry.cli.args,
    description: entry.cli.description,
    method: entry.apiMethod,
    path: entry.cli.name,
    ...(entry.cli.auth === false ? { auth: false } : {}),
    ...(entry.access === 'product' ? { capability: entry.capability } : {}),
    ...(entry.writeKind ? { writeKind: entry.writeKind } : {})
  }]] : [])
);

export function createAgentCliHelp() {
  return {
    commands: Object.entries(AGENT_CLI_ROUTES).map(([name, value]) => ({
      access: value.writeKind ? 'write' : 'read',
      arguments: value.args,
      description: value.description,
      name
    })),
    name: 'foliole',
    version: AGENT_CLI_CONTRACT_VERSION
  };
}

export function findAgentControlRoute(method, pathname) {
  return AGENT_CONTROL_ROUTE_REGISTRY.find((entry) =>
    entry.apiPath === pathname && (
      entry.apiMethod === method ||
      (method === 'OPTIONS' && entry.access === 'product' && entry.apiMethod === 'POST')
    )
  );
}

export function isAgentControlWritePath(pathname, writeKind) {
  return AGENT_CONTROL_ROUTE_REGISTRY.some((entry) =>
    entry.apiPath === pathname && entry.writeKind === writeKind
  );
}

/**
 * @template {'foundation' | 'product' | 'public'} Access
 * @template {'GET' | 'POST'} Method
 * @template {string | null} Capability
 * @param {Access} access
 * @param {Method} apiMethod
 * @param {string} path
 * @param {Capability} capability
 * @param {{ capabilityOrder?: number, cli?: ReturnType<typeof cliRoute>, writeKind?: 'material' | 'virtual_folder' }} options
 */
function registryRoute(access, apiMethod, path, capability, options = {}) {
  return {
    access,
    apiMethod,
    apiPath: `/agent-control/v1/${path}`,
    capability,
    capabilityOrder: -1,
    cli: null,
    writeKind: null,
    ...options
  };
}

/**
 * @param {string} name
 * @param {string} description
 * @param {{ auth?: false, optional?: string[], required?: string[] }} options
 */
function cliRoute(name, description, options = {}) {
  const args = options.optional || options.required ? options : EMPTY_ARGS;
  return { args, auth: options.auth, description, name };
}

function optional(...names) {
  return { optional: names, required: [] };
}

function required(...names) {
  return { optional: [], required: names };
}

function optionalAndRequired(optionalNames, requiredNames) {
  return { optional: optionalNames, required: requiredNames };
}
