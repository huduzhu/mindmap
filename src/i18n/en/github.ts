import { registerMessages } from '../index'

/**
 * English text used only by the GitHub dialog (#110, H-0). It ships in that
 * lazily loaded chunk, not the startup bundle: every module that uses one of
 * these keys imports this file, which registers the table before the module
 * runs.
 */
export const githubMessages = {
  'github.title': 'GitHub milestones',
  'github.tabSave': 'Save milestone',
  'github.tabHistory': 'History',
  'github.tabSettings': 'Settings',
  'github.saveIntro': 'Saves “{name}” to {repo} as a commit you can come back to.',
  'github.message': 'What changed',
  'github.defaultMessage': 'Milestone: {name}',
  'github.tag': 'Tag (optional)',
  'github.tagInvalid':
    'Use letters, digits, dots, dashes, underscores and slashes, e.g. v1.0 or quotes/smith.',
  'github.save': 'Save milestone',
  'github.saved': 'Milestone saved to GitHub ({sha}).',
  'github.noMilestones': 'No milestones for this project yet.',
  'github.refresh': 'Refresh',
  'github.restore': 'Restore as snapshot',
  'github.restoreLabel': 'Restore milestone {sha} as a snapshot',
  'github.snapshotName': 'GitHub {date} ({sha})',
  'github.restored': 'Added snapshot “{name}”. Open Project ▾ → Snapshots to restore it.',
  'github.settingsIntro':
    'Milestones go to a private GitHub repository you own, for example one made just for your mind maps. Do not use the app’s own repository.',
  'github.repo': 'Repository (owner/name)',
  'github.repoPlaceholder': 'your-name/mindmap-backups',
  'github.token': 'Access token',
  'github.tokenHelp':
    'Create a fine-grained personal access token on GitHub limited to this one repository, with Contents: Read and write. It is kept in this browser only.',
  'github.branch': 'Branch (optional)',
  'github.branchPlaceholder': 'main',
  'github.folder': 'Folder in the repository',
  'github.folderInvalid':
    'Use a plain folder path such as mindmaps or backups/2026, without “..”, “?”, “#” or backslashes.',
  'github.connect': 'Check and save',
  'github.disconnect': 'Forget these settings',
  'github.connected': 'Connected to {repo}.',
  'github.error.token': 'GitHub did not accept the token ({detail}).',
  'github.error.notFound': 'Repository or file not found, or the token cannot see it ({detail}).',
  'github.error.public':
    'That repository is public. Milestones contain your whole project, so use a private repository.',
  'github.error.forbidden': 'GitHub refused ({detail}). Check the token’s permissions.',
  'github.error.conflict':
    'GitHub reported a conflict ({detail}). If the tag exists already, choose another.',
  'github.error.network': 'Could not reach GitHub ({detail}). Check your connection.',
  'github.error.other': 'GitHub request failed: {detail}',
  // Images in milestones (#149, HC-D5)
  'github.imagesSkipped.one':
    'The milestone was saved without its new image: new images over 10 MB are left out of one milestone.',
  'github.imagesSkipped.other':
    'The milestone was saved without its {count} new images: they come to more than 10 MB, the most one milestone takes.',
  'github.imagesMissing.one':
    '{count} image of this milestone is not in the repository; the snapshot shows a placeholder for it.',
  'github.imagesMissing.other':
    '{count} images of this milestone are not in the repository; the snapshot shows placeholders for them.',
} as const

registerMessages(githubMessages)
