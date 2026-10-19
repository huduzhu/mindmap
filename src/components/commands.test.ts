import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { type Command, commandScore, filterCommands } from './commands'

function cmd(id: string, title: string, group: string, keywords?: string): Command {
  return { id, title, group, keywords, run: () => undefined }
}

describe('commandScore', () => {
  it('treats an empty query as a neutral match so registry order survives', () => {
    const command = cmd('a', 'Go to Outline', 'View')
    expect(commandScore(command, '')).toBe(1)
    expect(commandScore(command, '   ')).toBe(1)
  })

  it('ranks title-prefix above title-substring above keyword above fuzzy', () => {
    const command = cmd('a', 'Go to Outline', 'View', 'tab switch indented')
    expect(commandScore(command, 'go to outline')).toBeGreaterThan(
      commandScore(command, 'to outline'),
    )
    expect(commandScore(command, 'to outline')).toBeGreaterThan(commandScore(command, 'indented'))
    expect(commandScore(command, 'indented')).toBeGreaterThan(commandScore(command, 'gtoln'))
  })

  it('returns 0 when nothing matches', () => {
    expect(commandScore(cmd('a', 'Go to Outline', 'View', 'tab'), 'zzzz')).toBe(0)
  })

  it('matches case-insensitively', () => {
    expect(commandScore(cmd('a', 'Go to Outline', 'View'), 'OUTLINE')).toBeGreaterThan(0)
  })
})

describe('filterCommands', () => {
  const commands = [
    cmd('one', 'Go to Outline', 'View', 'tab switch'),
    cmd('two', 'Export Markdown outline', 'Export', 'md bullets'),
    cmd('three', 'Undo', 'Edit', 'revert'),
  ]

  it('keeps every command in order when the query is empty', () => {
    expect(filterCommands(commands, '').map((c) => c.id)).toEqual(['one', 'two', 'three'])
  })

  it('drops non-matching commands and sorts by score', () => {
    expect(filterCommands(commands, 'outline').map((c) => c.id)).toEqual(['one', 'two'])
  })

  it('breaks score ties by registry order', () => {
    const tied = [cmd('first', 'Alpha', 'G'), cmd('second', 'Alpha', 'G')]
    expect(filterCommands(tied, 'alpha').map((c) => c.id)).toEqual(['first', 'second'])
  })

  it('can match on the group name alone, ahead of a fuzzy title match', () => {
    const matched = filterCommands(commands, 'edit')
    expect(matched[0].id).toBe('three')
    expect(matched.map((c) => c.id)).toContain('three')
  })
})
