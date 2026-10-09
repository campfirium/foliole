import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

import { useRegisterPdfTopBars } from '../../features/pdf/components/PdfTopBarsContext'
import { DisplayScaleProvider } from '../../features/settings/context/DisplayScaleProvider'
import { renderWithLocalization } from '../../shared/localization/testLocalization'

import { DocumentPanelScaleSurface } from './DocumentPanelScaleSurface'
import { WindowTitleBar } from './WindowTitleBar'
import { WorkspacePdfTopBars } from './WorkspacePdfTopBars'

const controls = vi.hoisted(() => ({ visible: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../shared/platform/windowControls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/platform/windowControls')>()),
  setMainWindowNativeControlsVisible: controls.visible
}))
function ActivePdf() {
  const register = useRegisterPdfTopBars()
  useEffect(() => register?.({ id: 'one', enabled: true }), [register])
  return <p className="pdf-document-page-frame">PDF content</p>
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('floats only the document title and navigation while keeping window controls available', async () => {
  vi.useFakeTimers()
  renderWithLocalization(
    <WorkspacePdfTopBars isImmersiveMode={false}>
      <WindowTitleBar
        activeRightPanelId="review-queue"
        centerTitle="PDF title"
        isListCollapsed={false}
        isRightSidebarCollapsed={false}
        isTrashViewOpen={false}
        listWidth={450}
        rightSidebarWidth={300}
        onOpenTrashView={() => {}}
        onSelectRightPanel={() => {}}
        onToggleListVisibility={() => {}}
        onToggleRightSidebarVisibility={() => {}}
      />
      <DisplayScaleProvider>
        <DocumentPanelScaleSurface
          isPdfSurface
          panelKind="document"
          overlay={null}
          chrome={<button>Navigation</button>}
        >
          <ActivePdf />
        </DocumentPanelScaleSurface>
      </DisplayScaleProvider>
    </WorkspacePdfTopBars>
  )
  await act(async () => {})
  const documentPanel = screen.getByRole('region', { name: 'Document panel' })
  const title = screen.getByTestId('pdf-window-top-bar')
  const navigation = screen.getByTestId('pdf-document-top-bar')
  expect(documentPanel).toContainElement(title)
  expect(title).toHaveTextContent('PDF title')
  act(() => vi.advanceTimersByTime(3000))
  expect(title).toHaveAttribute('data-visible', 'false')
  expect(navigation).toHaveAttribute('data-visible', 'false')
  expect(screen.getByRole('button', { name: 'Toggle left panel' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Toggle right sidebar' })).toBeVisible()
  expect(controls.visible).toHaveBeenLastCalledWith(true)
  vi.spyOn(screen.getByText('PDF content'), 'getBoundingClientRect').mockReturnValue(new DOMRect(200, 0, 600, 1000))
  fireEvent.mouseMove(screen.getByTestId('pdf-top-bars-reveal-zone'), { clientX: 100, clientY: 500 })
  expect(title).toHaveAttribute('data-visible', 'true')
  expect(navigation).toHaveAttribute('data-visible', 'true')
})
