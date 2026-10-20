import { useEffect, useId, useRef, useState } from 'react'
import { useDialogA11y } from '../hooks/useDialogA11y'
import * as db from '../io/db'
import { tn, useLocale, useT, type MessageKey } from '../i18n'
import '../i18n/en/github'
// The shared-origin warning (#177) lives with the sync strings.
import '../i18n/en/sync'
import { useProjects } from '../store/projects'
import {
  checkRepo,
  DEFAULT_GITHUB_FOLDER,
  GitHubError,
  GITHUB_SETTINGS_KEY,
  setSessionToken,
  withSessionToken,
  isValidFolder,
  isValidRepo,
  normalizeFolder,
  isValidTag,
  listMilestones,
  readMilestone,
  saveMilestone,
  fetchMilestoneImages,
  type GitHubSettings,
  type Milestone,
} from '../sync/github'
import { showToast } from './toastStore'
import { formatDateTime } from '../i18n/dates'
import { sharedOrigin } from './hosting'
import { tabKeyTarget } from './tablistKeys'

type Tab = 'save' | 'history' | 'settings'
const TABS: Tab[] = ['save', 'history', 'settings']

const ERRORS: Record<GitHubError['code'], MessageKey> = {
  token: 'github.error.token',
  'not-found': 'github.error.notFound',
  public: 'github.error.public',
  forbidden: 'github.error.forbidden',
  conflict: 'github.error.conflict',
  network: 'github.error.network',
  other: 'github.error.other',
}

/**
 * GitHub milestones (#112b): save the open project to a private repository as
 * a commit (optionally tagged), browse its milestones and bring one back as a
 * snapshot. The token stays in this browser.
 */
export function GitHubDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const currentId = useProjects((s) => s.currentId)
  const current = useProjects((s) => s.current)
  const [settings, setSettings] = useState<GitHubSettings | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [tab, setTab] = useState<Tab>('save')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [tag, setTag] = useState('')
  const [milestones, setMilestones] = useState<Milestone[] | null>(null)
  // On a shared *.github.io origin the token is not stored by default (#177).
  const [remember, setRemember] = useState(() => !sharedOrigin())
  const [draft, setDraft] = useState<GitHubSettings>({
    repo: '',
    token: '',
    branch: '',
    folder: DEFAULT_GITHUB_FOLDER,
  })
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useDialogA11y(dialogRef, { isOpen: true, onClose, labelledBy: titleId })

  useEffect(() => {
    let cancelled = false
    void db.getSetting<GitHubSettings>(GITHUB_SETTINGS_KEY).then((saved) => {
      if (cancelled) return
      const stored = saved ? withSessionToken(saved) : undefined
      // Without a usable token (not remembered, tab since closed) the
      // settings ask for it again.
      const usable = stored && stored.token ? stored : null
      setSettings(usable)
      if (stored) setDraft(stored)
      if (saved) setRemember(Boolean(saved.token))
      setTab(usable ? 'save' : 'settings')
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const report = (error: unknown) => {
    const key = error instanceof GitHubError ? ERRORS[error.code] : 'github.error.other'
    const detail = error instanceof Error ? error.message : String(error)
    showToast(t(key, { detail }), 'error', 12000)
  }

  const run = (action: () => Promise<void>) => {
    setBusy(true)
    void action()
      .catch(report)
      .finally(() => setBusy(false))
  }

  const saveSettings = () =>
    run(async () => {
      const next: GitHubSettings = {
        repo: draft.repo.trim(),
        token: draft.token.trim(),
        branch: draft.branch?.trim() || undefined,
        folder: normalizeFolder(draft.folder) || DEFAULT_GITHUB_FOLDER,
      }
      await checkRepo(next)
      // Not remembered (#177): only repo, branch and folder are stored.
      setSessionToken(remember ? '' : next.token)
      await db.putSetting(GITHUB_SETTINGS_KEY, remember ? next : { ...next, token: '' })
      setSettings(next)
      setTab('save')
      showToast(t('github.connected', { repo: next.repo }))
    })

  const disconnect = () =>
    run(async () => {
      await db.deleteSetting(GITHUB_SETTINGS_KEY)
      setSessionToken('')
      setSettings(null)
      setDraft({ repo: '', token: '', branch: '', folder: DEFAULT_GITHUB_FOLDER })
      setTab('settings')
    })

  const tagProblem = tag.trim() && !isValidTag(tag.trim())
  const folderProblem = !isValidFolder(draft.folder)
  const save = () =>
    run(async () => {
      if (!settings || !currentId) return
      // A failed save leaves the stored copy behind the editor (#184): do not
      // commit that older version as the milestone.
      if (!(await useProjects.getState().saveCurrent())) {
        showToast(t('github.saveFailed'), 'error', 12000)
        return
      }
      const record = await db.getProject(currentId)
      if (!record) return
      const text = message.trim() || t('github.defaultMessage', { name: record.project.name })
      const saved = await saveMilestone(settings, record, text, tag.trim() || undefined)
      setMessage('')
      setTag('')
      setMilestones(null)
      showToast(t('github.saved', { sha: saved.sha.slice(0, 7) }))
      // More than 10 MB of new pictures: only the project went (#149, HC-D5).
      if (saved.imagesSkipped > 0)
        showToast(tn('github.imagesSkipped', saved.imagesSkipped), 'info', 15000)
    })

  const loadHistory = () =>
    run(async () => {
      if (!settings || !currentId) return
      setMilestones(await listMilestones(settings, currentId))
    })

  const restore = (milestone: Milestone) =>
    run(async () => {
      if (!settings || !currentId) return
      const parsed = await readMilestone(settings, currentId, milestone.sha)
      // The file came back but is not a project this version can open (#212).
      if (!parsed.ok) {
        showToast(
          parsed.newer
            ? t('import.newerVersion')
            : t('github.unreadable', { detail: parsed.detail }),
          'error',
          12000,
        )
        return
      }
      // Its pictures, when this browser does not have them (#149).
      const images = await fetchMilestoneImages(settings, parsed.project, milestone.sha)
      const date = formatDateTime(milestone.date, locale)
      const name = t('github.snapshotName', { date, sha: milestone.sha.slice(0, 7) })
      await db.putSnapshot({
        projectId: currentId,
        name,
        createdAt: new Date().toISOString(),
        project: parsed.project,
      })
      await useProjects.getState().listSnapshots()
      showToast(t('github.restored', { name }), 'info', 9000)
      if (images.missing > 0) showToast(tn('github.imagesMissing', images.missing), 'info', 12000)
    })

  const openTab = (id: Tab) => {
    setTab(id)
    if (id === 'history' && milestones === null) loadHistory()
  }
  const tabDisabled = (id: Tab) => id !== 'settings' && !settings
  const onTabKeyDown = (event: React.KeyboardEvent) => {
    const next = tabKeyTarget(event.key, TABS.indexOf(tab), TABS.length, (i) =>
      tabDisabled(TABS[i]),
    )
    if (next === -1) return
    event.preventDefault()
    openTab(TABS[next])
    document.getElementById(`${titleId}-tab-${TABS[next]}`)?.focus()
  }
  const tabButton = (id: Tab, label: MessageKey) => (
    <button
      type="button"
      role="tab"
      id={`${titleId}-tab-${id}`}
      aria-selected={tab === id}
      aria-controls={tab === id ? `${titleId}-panel` : undefined}
      tabIndex={tab === id ? 0 : -1}
      disabled={tabDisabled(id)}
      onClick={() => openTab(id)}
      data-testid={`github-tab-${id}`}
    >
      {t(label)}
    </button>
  )
  const panel = {
    className: 'github-panel',
    role: 'tabpanel',
    id: `${titleId}-panel`,
    'aria-labelledby': `${titleId}-tab-${tab}`,
  }

  return (
    <div
      className="dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="dialog github-dialog"
        role="dialog"
        aria-labelledby={titleId}
        data-testid="github-dialog"
      >
        <h2 id={titleId}>{t('github.title')}</h2>
        {!loaded ? null : (
          <>
            <div
              className="github-tabs"
              role="tablist"
              aria-label={t('github.tabs')}
              onKeyDown={onTabKeyDown}
            >
              {tabButton('save', 'github.tabSave')}
              {tabButton('history', 'github.tabHistory')}
              {tabButton('settings', 'github.tabSettings')}
            </div>

            {tab === 'save' && settings && (
              <div {...panel}>
                <p className="muted">
                  {t('github.saveIntro', { name: current?.name ?? '', repo: settings.repo })}
                </p>
                <label className="preset-field">
                  <span>{t('github.message')}</span>
                  <textarea
                    rows={3}
                    value={message}
                    placeholder={t('github.defaultMessage', { name: current?.name ?? '' })}
                    onChange={(event) => setMessage(event.target.value)}
                    data-testid="github-message"
                  />
                </label>
                <label className="preset-field">
                  <span>{t('github.tag')}</span>
                  <input
                    value={tag}
                    placeholder="v1.0"
                    onChange={(event) => setTag(event.target.value)}
                    aria-invalid={Boolean(tagProblem)}
                    data-testid="github-tag"
                  />
                </label>
                {tagProblem ? (
                  <p className="preset-editor-problem" role="alert">
                    {t('github.tagInvalid')}
                  </p>
                ) : null}
                <div className="dialog-actions">
                  <button
                    type="button"
                    className="primary"
                    disabled={busy || Boolean(tagProblem) || !currentId}
                    onClick={save}
                    data-testid="github-save"
                  >
                    {t('github.save')}
                  </button>
                </div>
              </div>
            )}

            {tab === 'history' && settings && (
              <div {...panel}>
                {milestones === null ? (
                  <p className="muted">{t('common.loading')}</p>
                ) : milestones.length === 0 ? (
                  <p className="muted">{t('github.noMilestones')}</p>
                ) : (
                  <ul className="project-list github-history" data-testid="github-history">
                    {milestones.map((milestone) => (
                      <li key={milestone.sha}>
                        <span className="snapshot-name">{milestone.message.split('\n')[0]}</span>
                        <span className="muted">
                          {formatDateTime(milestone.date, locale)} · {milestone.sha.slice(0, 7)}
                        </span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => restore(milestone)}
                          aria-label={t('github.restoreLabel', {
                            sha: milestone.sha.slice(0, 7),
                          })}
                        >
                          {t('github.restore')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="dialog-actions">
                  <button type="button" disabled={busy} onClick={loadHistory}>
                    {t('github.refresh')}
                  </button>
                </div>
              </div>
            )}

            {tab === 'settings' && (
              <div {...panel}>
                <p className="muted">{t('github.settingsIntro')}</p>
                <label className="preset-field">
                  <span>{t('github.repo')}</span>
                  <input
                    value={draft.repo}
                    placeholder={t('github.repoPlaceholder')}
                    onChange={(event) => setDraft((d) => ({ ...d, repo: event.target.value }))}
                    data-testid="github-repo"
                  />
                </label>
                <label className="preset-field">
                  <span>{t('github.token')}</span>
                  <input
                    type="password"
                    autoComplete="off"
                    value={draft.token}
                    onChange={(event) => setDraft((d) => ({ ...d, token: event.target.value }))}
                    data-testid="github-token"
                  />
                </label>
                <label className="node-details-check">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(event) => setRemember(event.target.checked)}
                    data-testid="github-remember"
                  />
                  <span>{t('github.remember')}</span>
                </label>
                <p className="muted">{t('github.tokenHelp')}</p>
                {sharedOrigin() ? (
                  <p className="muted" data-testid="github-shared-origin">
                    {t('hosting.sharedOrigin')}
                  </p>
                ) : null}
                <label className="preset-field">
                  <span>{t('github.branch')}</span>
                  <input
                    value={draft.branch ?? ''}
                    placeholder={t('github.branchPlaceholder')}
                    onChange={(event) => setDraft((d) => ({ ...d, branch: event.target.value }))}
                  />
                </label>
                <label className="preset-field">
                  <span>{t('github.folder')}</span>
                  <input
                    value={draft.folder}
                    onChange={(event) => setDraft((d) => ({ ...d, folder: event.target.value }))}
                    aria-invalid={folderProblem}
                    data-testid="github-folder"
                  />
                </label>
                {folderProblem ? (
                  <p className="preset-editor-problem" role="alert">
                    {t('github.folderInvalid')}
                  </p>
                ) : null}
                <div className="dialog-actions">
                  {settings && (
                    <button type="button" disabled={busy} onClick={disconnect}>
                      {t('github.disconnect')}
                    </button>
                  )}
                  <button
                    type="button"
                    className="primary"
                    disabled={
                      busy || !isValidRepo(draft.repo) || !draft.token.trim() || folderProblem
                    }
                    onClick={saveSettings}
                    data-testid="github-connect"
                  >
                    {t('github.connect')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
