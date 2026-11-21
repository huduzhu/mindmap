import { registerMessages } from '../index'

/**
 * English text for the Connect AI agent dialog (#37). Lives in its own lazy
 * chunk alongside CoeditDialog so the startup bundle stays unchanged.
 */
export const coeditMessages = {
  'coedit.title': 'Connect AI agent',
  'coedit.close': 'Close',
  'coedit.intro':
    'Pair a local agent (such as Hermes Agent) through the local bridge so it can read this project and propose edits while your map stays open.',
  'coedit.port': 'Bridge port',
  'coedit.token': 'Pairing token',
  'coedit.tokenPlaceholder': 'Paste token from npm run bridge',
  'coedit.modeLabel': 'Access level',
  'coedit.mode.readOnly': 'Read-only (agent can read and search this map)',
  'coedit.mode.approveWrites': 'Approve writes (review batches before applying)',
  'coedit.connect': 'Connect',
  'coedit.connecting': 'Connecting…',
  'coedit.disconnect': 'Disconnect',
  'coedit.hermesTip': 'Start the local bridge in your repo or Hermes config with npm run bridge.',
  'coedit.connectedTo': 'Connected to {agent} on port {port} for “{project}”.',
  'coedit.pendingTitle': 'Pending proposals',
  'coedit.noPending': 'No pending edit batches from the agent.',
  'coedit.approve': 'Approve & apply',
  'coedit.reject': 'Reject',
  'coedit.keepMine': 'Keep mine',
  'coedit.takeAgent': 'Take agent’s',
  'coedit.conflictTitle': 'Conflict on {node} ({field}):',
  'coedit.conflictValues': 'Yours: “{current}” · Agent: “{proposed}”',
  'coedit.conflictDeleted': 'Removed in this map since the agent read it.',
  'coedit.batchErrors': 'Could not apply some changes: {errors}',
  'coedit.resolvedKeepMine': 'Selected: Keep mine',
  'coedit.resolvedTakeAgent': 'Selected: Take agent’s',
  'coedit.activityTitle': 'Agent activity',
  'coedit.noActivity': 'No agent batches have been applied yet.',
  'coedit.nodesAffected.one': '{count} node touched',
  'coedit.nodesAffected.other': '{count} nodes touched',
  'coedit.undo': 'Undo agent change',
  'coedit.undoneTag': 'Undone',
  'coedit.undoConflict': 'You edited one or more of these nodes after the agent batch was applied.',
  'coedit.forceUndo': 'Force undo',
  'coedit.op.addNode': 'Add “{title}” under {parent}',
  'coedit.op.renameNode': 'Rename {node} → “{title}”',
  'coedit.op.moveNode': 'Move {node} under {parent}',
  'coedit.proposedNotes': 'Proposed notes:',
  'coedit.emptyNotes': 'Empty',
  'coedit.op.updateNotes': 'Update notes on {node}',
  'coedit.error.invalid_port': 'Enter a valid port between 1 and 65535.',
  'coedit.error.empty_token': 'Enter the pairing token shown by the local bridge.',
  'coedit.error.no_project': 'Open a project before connecting an agent.',
  'coedit.error.invalid_token': 'Pairing token was rejected by the local bridge.',
  'coedit.error.already_paired': 'Another browser tab is already paired with this bridge.',
  'coedit.error.connection_failed': 'Could not connect to the bridge on 127.0.0.1.',
} as const

registerMessages(coeditMessages)
