import { beforeEach, describe, expect, it, vi } from 'vitest';

const capacitorState = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'web'),
  isNativePlatform: vi.fn(() => false),
  registerPlugin: vi.fn(() => ({}))
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: capacitorState,
  registerPlugin: capacitorState.registerPlugin
}));

import {
  isAvailableNativeAndroidCompanionRuntime,
  isAvailableNativeCompanionRuntime,
  isNativeAndroidCompanionRuntime,
  isNativeCompanionAttachmentResourceRuntime,
  isNativeCompanionContentBlobRuntime,
  isNativeCompanionExternalDirectoryRuntime,
  isNativeCompanionExternalDocumentReadRuntime,
  isNativeCompanionExternalDocumentSearchRuntime,
  isNativeCompanionNodeVersionWriteRuntime,
  isNativeCompanionPairingRuntime,
  isNativeCompanionPdfPageTextRuntime,
  isNativeCompanionSyncDiagnosticsRuntime,
  isNativeCompanionSyncObjectReadRuntime,
  isNativeCompanionTopicSearchRuntime,
  isNativeCompanionViewStateWriteRuntime,
  supportsCompanionNodeMutationSurface,
  type CompanionNodeMutationSurface
} from './companionWorkspaceRuntimeRepository';

const NODE_MUTATION_SURFACES: CompanionNodeMutationSurface[] = [
  'existing-highlight-edit',
  'quick-capture',
  'selection-annotation',
  'topic-content-edit',
  'trash-restore'
];

function expectNodeMutationSurfaces(expected: boolean) {
  for (const surface of NODE_MUTATION_SURFACES) {
    expect(supportsCompanionNodeMutationSurface(surface)).toBe(expected);
  }
}

function expectIosRuntimeBoundary() {
  capacitorState.getPlatform.mockReturnValue('ios');
  capacitorState.isNativePlatform.mockReturnValue(true);

  expect(isAvailableNativeAndroidCompanionRuntime()).toBe(false);
  expect(isAvailableNativeCompanionRuntime()).toBe(true);
  expectNodeMutationSurfaces(false);
  expect(isNativeCompanionAttachmentResourceRuntime()).toBe(true);
  expect(isNativeCompanionContentBlobRuntime()).toBe(true);
  expect(isNativeCompanionExternalDirectoryRuntime()).toBe(true);
  expect(isNativeCompanionExternalDocumentReadRuntime()).toBe(true);
  expect(isNativeCompanionExternalDocumentSearchRuntime()).toBe(true);
  expect(isNativeCompanionNodeVersionWriteRuntime()).toBe(true);
  expect(isNativeCompanionPairingRuntime()).toBe(true);
  expect(isNativeCompanionPdfPageTextRuntime()).toBe(true);
  expect(isNativeCompanionSyncDiagnosticsRuntime()).toBe(true);
  expect(isNativeCompanionSyncObjectReadRuntime()).toBe(true);
  expect(isNativeCompanionTopicSearchRuntime()).toBe(true);
  expect(isNativeCompanionViewStateWriteRuntime()).toBe(true);
  expect(() => isNativeAndroidCompanionRuntime()).toThrowError(expect.objectContaining({
    capability: 'native-runtime',
    code: 'NATIVE_COMPANION_CAPABILITY_UNAVAILABLE',
    platform: 'ios'
  }));
}

describe('companion workspace runtime boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capacitorState.getPlatform.mockReturnValue('web');
    capacitorState.isNativePlatform.mockReturnValue(false);
  });

  it('keeps browser preview on the explicit non-native path', () => {
    expect(isNativeAndroidCompanionRuntime()).toBe(false);
    expect(isNativeCompanionAttachmentResourceRuntime()).toBe(false);
    expect(isNativeCompanionContentBlobRuntime()).toBe(false);
    expect(isNativeCompanionExternalDirectoryRuntime()).toBe(false);
    expect(isNativeCompanionExternalDocumentReadRuntime()).toBe(false);
    expect(isNativeCompanionExternalDocumentSearchRuntime()).toBe(false);
    expect(isNativeCompanionNodeVersionWriteRuntime()).toBe(false);
    expect(isNativeCompanionPairingRuntime()).toBe(false);
    expect(isNativeCompanionPdfPageTextRuntime()).toBe(false);
    expect(isNativeCompanionSyncDiagnosticsRuntime()).toBe(false);
    expect(isNativeCompanionSyncObjectReadRuntime()).toBe(false);
    expect(isNativeCompanionTopicSearchRuntime()).toBe(false);
    expect(isNativeCompanionViewStateWriteRuntime()).toBe(false);
    expect(isAvailableNativeAndroidCompanionRuntime()).toBe(false);
    expect(isAvailableNativeCompanionRuntime()).toBe(false);
    expectNodeMutationSurfaces(true);
  });

  it('exposes the implemented Android runtime', () => {
    capacitorState.getPlatform.mockReturnValue('android');
    capacitorState.isNativePlatform.mockReturnValue(true);

    expect(isNativeAndroidCompanionRuntime()).toBe(true);
    expect(isNativeCompanionAttachmentResourceRuntime()).toBe(true);
    expect(isNativeCompanionContentBlobRuntime()).toBe(true);
    expect(isNativeCompanionExternalDirectoryRuntime()).toBe(true);
    expect(isNativeCompanionExternalDocumentReadRuntime()).toBe(true);
    expect(isNativeCompanionExternalDocumentSearchRuntime()).toBe(true);
    expect(isNativeCompanionNodeVersionWriteRuntime()).toBe(true);
    expect(isNativeCompanionPairingRuntime()).toBe(true);
    expect(isNativeCompanionPdfPageTextRuntime()).toBe(true);
    expect(isNativeCompanionSyncDiagnosticsRuntime()).toBe(true);
    expect(isNativeCompanionSyncObjectReadRuntime()).toBe(true);
    expect(isNativeCompanionTopicSearchRuntime()).toBe(true);
    expect(isNativeCompanionViewStateWriteRuntime()).toBe(true);
    expect(isAvailableNativeAndroidCompanionRuntime()).toBe(true);
    expect(isAvailableNativeCompanionRuntime()).toBe(true);
    expectNodeMutationSurfaces(true);
  });

  it('exposes iOS storage capabilities while keeping Android-only operations unavailable', expectIosRuntimeBoundary);
});
