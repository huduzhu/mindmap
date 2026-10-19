import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { downloadJson, pickFile, slugify } from '../io/files'
import { exportProjectJson } from './exportActions'
import { filterProjectRecords, sortProjectRecords, useProjects } from '../store/projects'
import { isTrashAutoPurgeOn, TRASH_RETENTION_DAYS } from '../store/session'
import { LazyTrashDialog } from './lazyDialogs'
import { RenameInput } from './RenameInput'
import { StorageMeter } from './StorageMeter'
import { backUpLibrary, IMPORT_ACCEPT, importAndAnnounce } from './importFile'
import { ConfirmDialog } from './ConfirmDialog'
import { openGuide } from './guide'
import { ProjectRowMenu } from './ProjectRowMenu'
import { showToast } from './toastStore'
import { searchProjects } from './projectSearch'
import { openSyncDialog } from '../sync/store'
import { SyncBadge, SyncReconnectPrompt } from './SyncBadge'
import { LOCALES, setLocale, tn, useLocale, useT, type Locale } from '../i18n'
import { formatDateTime } from '../i18n/dates'

export function StartScreen() {
  const t = useT()
  const locale = useLocale((state) => state.locale)
  const records = useProjects((s) => s.records)
  const trashed = useProjects((s) => s.trashed)
  const openError = useProjects((s) => s.openError)
  const projects = useProjects.getState()
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [filterTag, setFilterTag] = useState<string | null>(null)
  const [addingTagId, setAddingTagId] = useState<string | null>(null)
  const [tagDraft, setTagDraft] = useState('')

  const [query, setQuery] = useState('')
  // Titles of every project are searched, so keep typing responsive (#103).
  const deferredQuery = useDeferredValue(query)
  const matches = useMemo(
    () =>
      searchProjects(filterProjectRecords(sortProjectRecords(records), filterTag), deferredQuery),
    [records, filterTag, deferredQuery],
  )
  const searchRef = useRef<HTMLInputElement>(null)
  // "/" jumps to the search box, as on many sites.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]'))
        return
      if (!searchRef.current) return
      event.preventDefault()
      searchRef.current.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
  const availableTags = [
    ...new Map(
      records.flatMap((record) =>
        (record.project.tags ?? []).map((tag) => [tag.toLocaleLowerCase(), tag] as const),
      ),
    ).values(),
  ].sort((a, b) => a.localeCompare(b))
  const [trashOpen, setTrashOpen] = useState(false)
  const [trashingId, setTrashingId] = useState<string | null>(null)
  const trashing = trashingId ? records.find((record) => record.id === trashingId) : undefined

  const duplicate = (id: string) => {
    void projects.duplicate(id).then(
      (copyId) => {
        const copy = useProjects.getState().records.find((record) => record.id === copyId)
        if (copy) showToast(t('row.duplicated', { name: copy.project.name }))
      },
      (error: unknown) =>
        showToast(
          t('row.duplicateFailed', {
            error: error instanceof Error ? error.message : String(error),
          }),
          'error',
        ),
    )
  }

  const rename = (id: string, draft: string) => {
    setRenamingId(null)
    void projects.rename(id, draft).then((ok) => {
      if (ok) showToast(t('toast.renamed', { name: draft.trim() }))
      else showToast(t('toast.renameRejected'), 'error')
    })
  }

  const addTag = (id: string) => {
    const draft = tagDraft
    void projects.addTag(id, draft).then((ok) => {
      if (!ok) {
        showToast(t('start.tagRejected'), 'error')
        return
      }
      setAddingTagId(null)
      setTagDraft('')
    })
  }

  return (
    <div className="start-screen">
      <h1>{t('toolbar.brand')}</h1>
      <p>{t('start.tagline')}</p>
      {records.length === 0 && (
        <p className="start-empty" data-testid="start-empty">
          {t('start.empty')}
        </p>
      )}
      <div className="start-actions">
        <button type="button" className="primary" onClick={() => void projects.createProject()}>
          {t('start.new')}
        </button>
        <button
          type="button"
          onClick={() =>
            void pickFile(IMPORT_ACCEPT).then((file) => file && importAndAnnounce(file))
          }
        >
          {t('start.import')}
        </button>
        <button type="button" onClick={() => void openGuide()}>
          {t('start.guide')}
        </button>
      </div>
      <p className="muted start-drop-hint">{t('start.dropHint')}</p>
      {openError && (
        <div className="open-error" role="alert">
          <p>{t('start.openError', { name: openError.name })}</p>
          <pre className="open-error-details">{openError.message}</pre>
          <button
            type="button"
            onClick={() => {
              const record = records.find((candidate) => candidate.id === openError.id)
              if (record) downloadJson(`${slugify(record.project.name)}-raw.json`, record.project)
            }}
          >
            {t('start.downloadRaw')}
          </button>
          <button type="button" onClick={() => projects.clearOpenError()}>
            {t('start.dismiss')}
          </button>
        </div>
      )}
      <SyncReconnectPrompt />
      {/* Always shown: a second computer starts empty and links the folder first (#107). */}
      <div className="start-actions start-actions-secondary">
        <button type="button" onClick={() => openSyncDialog()} data-testid="start-sync">
          {t('sync.menu')}
        </button>
        <SyncBadge />
        {records.length > 0 && (
          <button type="button" onClick={() => void backUpLibrary()}>
            {t('start.backup')}
          </button>
        )}
        {trashed.length > 0 && (
          <button type="button" onClick={() => setTrashOpen(true)}>
            {t('start.trash', { count: trashed.length })}
          </button>
        )}
      </div>
      {records.length > 0 && (
        <>
          <div className="project-list-header">
            <h2>{t('start.recent')}</h2>
            {records.length > 1 && (
              <input
                ref={searchRef}
                type="search"
                className="project-search"
                value={query}
                placeholder={t('start.searchPlaceholder')}
                aria-label={t('start.search')}
                aria-keyshortcuts="/"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && query) {
                    event.preventDefault()
                    setQuery('')
                  }
                }}
                data-testid="project-search"
              />
            )}
          </div>
          {(availableTags.length > 0 || filterTag) && (
            <div className="project-filter" aria-label={t('start.tagFilters')}>
              <span className="muted">{t('start.filterBy')}</span>
              {availableTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="project-tag project-tag-filter"
                  aria-pressed={filterTag?.toLocaleLowerCase() === tag.toLocaleLowerCase()}
                  aria-label={t('start.filterTag', { tag })}
                  onClick={() => setFilterTag(tag)}
                >
                  {tag}
                </button>
              ))}
              {filterTag && (
                <button
                  type="button"
                  className="project-filter-clear"
                  onClick={() => setFilterTag(null)}
                >
                  {t('start.clearFilter')}
                </button>
              )}
            </div>
          )}
          {query.trim() && matches.length === 0 ? (
            <p className="muted project-search-empty" data-testid="project-search-empty">
              {t('start.noMatches', { query: query.trim() })}{' '}
              <button type="button" className="link-button" onClick={() => setQuery('')}>
                {t('start.clearSearch')}
              </button>
            </p>
          ) : null}
          <ul className="project-list">
            {matches.map(({ record, foundIn, tagged }) => (
              <li key={record.id}>
                <div className="project-row-main">
                  {renamingId === record.id ? (
                    <RenameInput
                      className="project-rename-input"
                      initial={record.project.name}
                      onCommit={(draft) => rename(record.id, draft)}
                      onCancel={() => setRenamingId(null)}
                    />
                  ) : (
                    <button type="button" onClick={() => void projects.loadProject(record.id)}>
                      {record.project.name}
                    </button>
                  )}
                  <button
                    type="button"
                    className="project-pin-trigger"
                    aria-label={t(record.project.pinned ? 'start.unpin' : 'start.pin', {
                      name: record.project.name,
                    })}
                    aria-pressed={record.project.pinned === true}
                    onClick={() => void projects.togglePinned(record.id)}
                  >
                    {record.project.pinned ? '★' : '☆'}
                  </button>
                  <button
                    type="button"
                    className="project-rename-trigger"
                    aria-label={t('start.rename', { name: record.project.name })}
                    onClick={() => setRenamingId(record.id)}
                  >
                    ✎
                  </button>
                  <ProjectRowMenu
                    name={record.project.name}
                    items={[
                      {
                        label: t('row.open'),
                        onSelect: () => void projects.loadProject(record.id),
                      },
                      { label: t('row.rename'), onSelect: () => setRenamingId(record.id) },
                      { label: t('row.duplicate'), onSelect: () => duplicate(record.id) },
                      {
                        label: t('row.exportJson'),
                        onSelect: () => void exportProjectJson(record.project),
                      },
                      {
                        label: t('row.moveToTrash'),
                        danger: true,
                        onSelect: () => setTrashingId(record.id),
                      },
                    ]}
                  />
                </div>
                <div
                  className="project-tags"
                  aria-label={t('start.tagsFor', { name: record.project.name })}
                >
                  {(record.project.tags ?? []).map((tag) => (
                    <span className="project-tag-chip" key={tag}>
                      <button
                        type="button"
                        className="project-tag"
                        aria-label={t('start.filterTag', { tag })}
                        onClick={() => setFilterTag(tag)}
                      >
                        {tag}
                      </button>
                      <button
                        type="button"
                        className="project-tag-remove"
                        aria-label={t('start.removeTag', { tag, name: record.project.name })}
                        onClick={() => void projects.removeTag(record.id, tag)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {addingTagId === record.id ? (
                    <input
                      className="project-tag-input"
                      aria-label={t('start.newTag', { name: record.project.name })}
                      value={tagDraft}
                      maxLength={40}
                      autoFocus
                      onChange={(event) => setTagDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          addTag(record.id)
                        } else if (event.key === 'Escape') {
                          setAddingTagId(null)
                          setTagDraft('')
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="project-tag-add"
                      aria-label={t('start.addTag', { name: record.project.name })}
                      onClick={() => {
                        setAddingTagId(record.id)
                        setTagDraft('')
                      }}
                    >
                      {t('start.addTagButton')}
                    </button>
                  )}
                </div>
                {tagged ? (
                  <span className="muted project-found-in" data-testid="project-tagged">
                    {tn('start.tagged', tagged.count, { tag: tagged.tag })}
                  </span>
                ) : null}
                {foundIn !== undefined && (
                  <span className="muted project-found-in">
                    {t('start.foundIn', { title: foundIn })}
                  </span>
                )}
                <span className="muted">{formatDateTime(record.updatedAt)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <StorageMeter />
      <label className="start-language">
        {t('start.language')}{' '}
        <select value={locale} onChange={(event) => void setLocale(event.target.value as Locale)}>
          {LOCALES.map((option) => (
            <option key={option.id} value={option.id} lang={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
      {trashOpen && <LazyTrashDialog onClose={() => setTrashOpen(false)} />}
      {trashing && (
        <ConfirmDialog
          title={t('row.trashTitle')}
          message={t('row.trashMessage', {
            name: trashing.project.name,
            retention: isTrashAutoPurgeOn()
              ? t('row.trashRetention', { days: TRASH_RETENTION_DAYS })
              : '',
          })}
          confirmLabel={t('row.trashAccept')}
          onClose={() => setTrashingId(null)}
          onConfirm={() => {
            const { id, project } = trashing
            setTrashingId(null)
            void projects.remove(id).then(() => showToast(t('row.trashed', { name: project.name })))
          }}
        />
      )}
    </div>
  )
}
