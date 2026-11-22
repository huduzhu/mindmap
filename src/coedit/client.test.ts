import { describe, expect, it } from 'vitest'
import { validateProposalParams } from './client'

describe('validateProposalParams (browser boundary)', () => {
  it('accepts valid propose_edits payloads for all operation types', () => {
    const res = validateProposalParams({
      baseRev: 2,
      summary: 'Organize launch tasks',
      operations: [
        { type: 'add_node', parentId: 'root', id: 'n1', title: 'Draft', notes: 'Notes', index: 0 },
        { type: 'rename_node', id: 'n1', title: 'Draft v2' },
        { type: 'move_node', id: 'n1', newParentId: 'b', index: 1 },
        { type: 'update_notes', id: 'n1', notes: '' },
      ],
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.baseRev).toBe(2)
      expect(res.summary).toBe('Organize launch tasks')
      expect(res.operations).toHaveLength(4)
    }
  })

  it('rejects extra fields, invalid baseRev, blank summary, and malformed operations', () => {
    const validOps = [{ type: 'rename_node', id: 'a', title: 'B' }]
    const badInputs: Record<string, unknown>[] = [
      { baseRev: 1, summary: 'Extra', operations: validOps, extra: true },
      { baseRev: 0, summary: 'Zero rev', operations: validOps },
      { baseRev: 1.5, summary: 'Float rev', operations: validOps },
      { baseRev: 1, summary: '   ', operations: validOps },
      { baseRev: 1, summary: 'Empty ops', operations: [] },
      {
        baseRev: 1,
        summary: 'Extra op key',
        operations: [{ type: 'rename_node', id: 'a', title: 'B', unexpected: 1 }],
      },
      { baseRev: 1, summary: 'Missing parent', operations: [{ type: 'add_node', title: 'X' }] },
      { baseRev: 1, summary: 'Missing dest', operations: [{ type: 'move_node', id: 'a' }] },
      {
        baseRev: 1,
        summary: 'Non-string notes',
        operations: [{ type: 'update_notes', id: 'a', notes: 42 }],
      },
      { baseRev: 1, summary: 'Unsupported op', operations: [{ type: 'delete_node', id: 'a' }] },
    ]

    for (const input of badInputs) {
      const res = validateProposalParams(input)
      expect(res.ok).toBe(false)
    }
  })
})
