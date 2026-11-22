import { expect, test } from '@playwright/test'
import { createMcpHandler } from '../bridge/mcp.mjs'
import { createBridgeRelay } from '../bridge/relay.mjs'
import { addChild, mapNode, newProject, projectMenu } from './helpers.ts'

test('reconnects the same project after a dropped connection without replaying pending edits', async ({
  page,
}) => {
  const probe = createBridgeRelay({ port: 0 })
  const { port } = await probe.start()
  await probe.stop()
  const relay = createBridgeRelay({ port, token: 'test-reconnect-code-N2r4V6x8p0Q1' })
  await relay.start()
  // Stopping and reopening this listener simulates a transient socket loss
  // without discarding the bridge instance's in-memory pairing.
  const replacement = relay
  try {
    await newProject(page)
    await addChild(page, 'Existing branch')
    await projectMenu(page, 'Connect AI agent…')
    await page.getByTestId('coedit-port').fill(String(port))
    await page.getByTestId('coedit-token').fill('test-reconnect-code-N2r4V6x8p0Q1')
    await page.getByTestId('coedit-mode-approve').check()
    await page.getByTestId('coedit-connect').click()
    const dialog = page.getByTestId('coedit-dialog')
    await expect(page.getByTestId('coedit-connected-summary')).toBeVisible()
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    const active = relay.getStatus()
    if (!active.connected) throw new Error('Expected a paired project')
    const before = await mcpCall(createMcpHandler(relay), 1, 'get_map')
    const root = before.data.root as MapNode
    const queued = await mcpCall(createMcpHandler(relay), 2, 'propose_edits', {
      baseRev: before.data.rev,
      summary: 'Unapproved proposal',
      operations: [{ type: 'add_node', parentId: root.id, title: 'Do not replay' }],
    })
    expect(queued.data.queued).toBe(true)
    await relay.stop()
    await expect(page.getByTestId('coedit-badge')).toContainText('Reconnecting')
    await mapNode(page, 'Untitled project').click()
    await addChild(page, 'Human edit while offline')
    await replacement.start()
    const { rev: originalRev, ...pairing } = active
    await expect.poll(() => replacement.getStatus()).toMatchObject(pairing)
    const resumed = await mcpCall(createMcpHandler(replacement), 3, 'get_map')
    expect(Number(resumed.data.rev)).toBeGreaterThan(Number(originalRev))
    await expect(mapNode(page, 'Existing branch')).toBeVisible()
    await expect(mapNode(page, 'Human edit while offline')).toBeVisible()
    await expect(mapNode(page, 'Do not replay')).toHaveCount(0)
    await expect(page.getByTestId('coedit-badge')).not.toContainText('pending')
    await replacement.stop()
    await expect(page.getByTestId('coedit-badge')).toContainText('Reconnecting')
    await page.getByTestId('coedit-badge').click()
    await page.getByTestId('coedit-disconnect').click()
    await expect(page.getByTestId('coedit-badge')).toHaveCount(0)
    await replacement.start()
    // Wait past the first retry slot to verify Disconnect actually cancels it.
    await new Promise((resolve) => setTimeout(resolve, 750))
    await expect(page.getByTestId('coedit-badge')).toHaveCount(0)
    expect(replacement.getStatus()).toEqual({ connected: false })
  } finally {
    await replacement.stop()
    await relay.stop()
  }
})

test('requires manual pairing after a new bridge starts even with the same code', async ({
  page,
}) => {
  const token = 'test-reconnect-code-N2r4V6x8p0Q1'
  const relay = createBridgeRelay({ port: 0, token })
  const { port } = await relay.start()
  const replacement = createBridgeRelay({ port, token })
  try {
    await newProject(page)
    await projectMenu(page, 'Connect AI agent…')
    await page.getByTestId('coedit-port').fill(String(port))
    await page.getByTestId('coedit-token').fill(token)
    await page.getByTestId('coedit-connect').click()
    await expect(page.getByTestId('coedit-connected-summary')).toBeVisible()
    await relay.stop()
    await expect(page.getByTestId('coedit-badge')).toContainText('Reconnecting')
    await replacement.start()
    await expect(page.getByTestId('coedit-badge')).toHaveCount(0)
    await expect(page.getByTestId('coedit-connect')).toBeVisible()
    expect(replacement.getStatus()).toEqual({ connected: false })
  } finally {
    await replacement.stop()
    await relay.stop()
  }
})

interface MapNode {
  id: string
  title: string
  notes?: string
  children?: MapNode[]
}

interface McpToolCallResult {
  content: { text: string }[]
  isError?: boolean
}

const CSP_RECORD = `
window.__cspViolations = []
document.addEventListener('securitypolicyviolation', (event) => {
  window.__cspViolations.push(event.effectiveDirective + ' ' + event.blockedURI)
})
`

async function mcpCall(
  mcp: ReturnType<typeof createMcpHandler>,
  id: number,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ raw: McpToolCallResult; data: Record<string, unknown> }> {
  const res = (await mcp.handleMessage({
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name, arguments: args },
  })) as { result: McpToolCallResult }
  const text = res.result.content[0]?.text ?? '{}'
  return { raw: res.result, data: JSON.parse(text) as Record<string, unknown> }
}

test('Issue #37 acceptance flow: pair Hermes bridge, concurrent edits, conflict, selective undo, disconnect', async ({
  page,
}) => {
  await page.addInitScript({ content: CSP_RECORD })
  const relay = createBridgeRelay({ port: 0, token: 'e2e-hermes-token' })
  const info = await relay.start()
  const mcp = createMcpHandler(relay)

  try {
    await newProject(page)
    await addChild(page, 'Branch A')
    await mapNode(page, 'Untitled project').click()
    await addChild(page, 'Branch B')

    // 1. Pair explicitly with the open project through Project ▾ -> Connect AI agent…
    await projectMenu(page, 'Connect AI agent…')
    const dialog = page.getByTestId('coedit-dialog')
    await expect(dialog).toBeVisible()
    await page.getByTestId('coedit-port').fill(String(info.port))
    await page.getByTestId('coedit-token').fill('e2e-hermes-token')
    await page.getByTestId('coedit-mode-approve').check()
    await page.getByTestId('coedit-connect').click()

    await expect(page.getByTestId('coedit-connected-summary')).toContainText('Hermes')
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByTestId('coedit-badge')).toBeVisible()

    // MCP reads the paired map and stable node IDs
    const status1 = await mcpCall(mcp, 1, 'mindmap_status')
    expect(status1.data).toMatchObject({ connected: true, mode: 'approve-writes' })

    const map1 = await mcpCall(mcp, 2, 'get_map')
    const root1 = map1.data.root as MapNode
    const baseRev1 = Number(map1.data.rev)
    const branchA = root1.children?.find((c) => c.title === 'Branch A')
    const branchB = root1.children?.find((c) => c.title === 'Branch B')
    expect(branchA).toBeTruthy()
    expect(branchB).toBeTruthy()

    // 2. Concurrent edits on different branches: human edits Branch A notes while Hermes adds child under Branch B
    const notes = page.getByTestId('node-details-notes')
    await mapNode(page, 'Branch A').click()
    await notes.fill('Human note on A')
    await mapNode(page, 'Untitled project').click()

    const propose1 = await mcpCall(mcp, 3, 'propose_edits', {
      baseRev: baseRev1,
      summary: 'Add milestone under Branch B',
      operations: [{ type: 'add_node', parentId: branchB!.id, title: 'Hermes child on B' }],
    })
    expect(propose1.raw.isError).toBeUndefined()
    expect(propose1.data.queued).toBe(true)

    await expect(page.getByTestId('coedit-badge')).toContainText('1 pending')
    await page.getByTestId('coedit-badge').click()
    await expect(page.getByTestId('coedit-pending-batch')).toContainText(
      'Add milestone under Branch B',
    )
    await page.getByTestId('coedit-approve').click()
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()

    // Both edits appear live in the open map without reload or duplicate project
    await expect(mapNode(page, 'Hermes child on B')).toBeVisible()
    await mapNode(page, 'Branch A').click()
    await expect(notes).toHaveValue('Human note on A')

    // 3. Same-field conflict + selective undo without losing unrelated human edits
    const map2 = await mcpCall(mcp, 4, 'get_map')
    const baseRev2 = Number(map2.data.rev)

    // Human edits Branch A notes after Hermes read baseRev2
    await mapNode(page, 'Branch A').click()
    await notes.fill('Human v2')
    await mapNode(page, 'Untitled project').click()

    const propose2 = await mcpCall(mcp, 5, 'propose_edits', {
      baseRev: baseRev2,
      summary: 'Update Branch A notes',
      operations: [{ type: 'update_notes', id: branchA!.id, notes: 'Hermes conflicting note' }],
    })
    expect(propose2.raw.isError).toBeUndefined()

    await page.getByTestId('coedit-badge').click()
    await expect(page.getByTestId('coedit-pending-batch')).toContainText('Hermes conflicting note')
    await page.getByTestId('coedit-approve').click()
    await expect(page.getByTestId('coedit-conflicts')).toContainText('Human v2')
    await expect(page.getByTestId('coedit-conflicts')).toContainText('Hermes conflicting note')

    // Resolve keeping the human edit
    await page.getByTestId('coedit-keep-mine-0').click()
    await page.getByTestId('coedit-approve').click()

    // Selectively undo the earlier Branch B addition while preserving 'Human v2' on Branch A
    const undoButtons = page.getByTestId('coedit-undo')
    await undoButtons.last().click()
    await expect(page.getByTestId('coedit-undone-tag')).toBeVisible()

    // 4. Disconnect revokes all reads and writes immediately
    await page.getByTestId('coedit-disconnect').click()
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByTestId('coedit-badge')).toHaveCount(0)

    await expect(mapNode(page, 'Hermes child on B')).toHaveCount(0)
    await mapNode(page, 'Branch A').click()
    await expect(notes).toHaveValue('Human v2')

    const statusAfter = await mcpCall(mcp, 6, 'mindmap_status')
    expect(statusAfter.data).toEqual({ connected: false })
    const readAfter = await mcpCall(mcp, 7, 'get_map')
    expect(readAfter.raw.isError).toBe(true)
    expect(readAfter.raw.content[0]?.text).toContain('NOT_CONNECTED')
    const writeAfter = await mcpCall(mcp, 8, 'propose_edits', {
      baseRev: 1,
      summary: 'After disconnect',
      operations: [{ type: 'rename_node', id: branchA!.id, title: 'Blocked' }],
    })
    expect(writeAfter.raw.isError).toBe(true)
    expect(writeAfter.raw.content[0]?.text).toContain('NOT_CONNECTED')

    const violations = await page.evaluate<string[]>('window.__cspViolations')
    expect(violations).toEqual([])
  } finally {
    await relay.stop()
  }
})

for (const dismiss of ['close button', 'leaving the project']) {
  test(`${dismiss} cancels a handshake that has not finished`, async ({ page }) => {
    const hello = Promise.withResolvers<void>()
    let closed = false
    await page.routeWebSocket('ws://127.0.0.1:4317/ws', (socket) => {
      socket.onMessage(() => hello.resolve())
      socket.onClose(() => {
        closed = true
      })
    })
    await newProject(page)
    await projectMenu(page, 'Connect AI agent…')
    const dialog = page.getByTestId('coedit-dialog')
    await page.getByTestId('coedit-token').fill('synthetic-test-code')
    await page.getByTestId('coedit-connect').click()
    await hello.promise
    if (dismiss === 'close button') {
      await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    } else {
      // Simulate navigation initiated elsewhere while the modal traps pointer input.
      await page
        .getByRole('button', { name: 'Home', exact: true })
        .evaluate((button) => (button as unknown as { click(): void }).click())
    }
    await expect(dialog).toHaveCount(0)
    await expect.poll(() => closed, { timeout: 1500 }).toBe(true)
    await expect(page.getByTestId('coedit-badge')).toHaveCount(0)
  })
}
