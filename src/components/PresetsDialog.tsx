import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { deletePreset, listPresets, putPreset } from '../io/db'
import { pickFile } from '../io/files'
import { BUILT_IN_PRESETS } from '../io/seed'
import { DARK_PRESET, LIGHT_PRESET, SYSTEM_PRESET, useSystemDark } from '../theme/system'
import { formatValidationErrors, parseJson, validateDoc } from '../schema/validate'
import type { Preset } from '../schema/types'
import { useProjects } from '../store/projects'
import { useDialogA11y } from '../hooks/useDialogA11y'
import { ConfirmDialog } from './ConfirmDialog'
import { showToast } from './toastStore'
import { useT } from '../i18n'
import '../i18n/en/presets'
import { PresetEditor } from './PresetEditor'
import { presetLabel } from './presetNames'
import { useResolvedPreset } from '../hooks/usePreset'

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span
      className="preset-swatch"
      title={label}
      style={{ background: color, borderColor: 'var(--mms-node-border, #ccc)' }}
    />
  )
}

export function PresetsDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const currentPreset = useProjects((s) => s.current?.preset)
  const systemDark = useSystemDark()
  const [presets, setPresets] = useState<Preset[]>([])
  const [busy, setBusy] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Preset | null>(null)
  // The preset editor (#104) takes the dialog's place while open.
  const [editing, setEditing] = useState<Preset | null>(null)
  const inUse = useResolvedPreset(currentPreset ?? 'default')
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useDialogA11y(dialogRef, { isOpen: true, onClose, labelledBy: titleId })

  useEffect(() => {
    let cancelled = false
    void listPresets().then((all) => {
      if (!cancelled) setPresets(all.sort((a, b) => a.name.localeCompare(b.name)))
    })
    return () => {
      cancelled = true
    }
  }, [])

  const builtInNames = useMemo(() => new Set(BUILT_IN_PRESETS.map((p) => p.name)), [])
  const currentName = typeof currentPreset === 'string' ? currentPreset : null

  const apply = (name: string) => {
    useProjects.getState().updateCurrent((p) => ({ ...p, preset: name }))
    showToast(t('presets.applied', { name: presetLabel(name) }))
    onClose()
  }

  const removePreset = async (preset: Preset) => {
    if (builtInNames.has(preset.name)) return
    if (preset.name === currentName) return
    setBusy(true)
    try {
      await deletePreset(preset.name)
      const all = await listPresets()
      setPresets(all.sort((a, b) => a.name.localeCompare(b.name)))
      showToast(t('presets.deleted', { name: preset.name }))
    } catch (err) {
      showToast(
        t('presets.deleteFailed', { error: err instanceof Error ? err.message : String(err) }),
        'error',
        9000,
      )
    } finally {
      setBusy(false)
    }
  }

  const importPreset = async () => {
    const file = await pickFile('.json')
    if (!file) return
    setBusy(true)
    try {
      const parsed = parseJson(await file.text())
      if (!parsed.ok) {
        showToast(t('presets.importFailed', { error: parsed.error }), 'error')
        return
      }
      const validation = validateDoc(parsed.doc)
      const kind = (parsed.doc as { kind?: unknown }).kind
      if (!validation.ok || kind !== 'preset') {
        const detail = validation.ok
          ? t('presets.wrongKind', { kind: String(kind) })
          : formatValidationErrors(validation.errors)
        showToast(t('presets.invalid', { detail }), 'error')
        return
      }
      const preset = parsed.doc as Preset
      await putPreset(preset)
      const all = await listPresets()
      setPresets(all.sort((a, b) => a.name.localeCompare(b.name)))
      showToast(t('presets.added', { name: preset.name }))
    } catch (err) {
      showToast(
        t('presets.importFailed', { error: err instanceof Error ? err.message : String(err) }),
        'error',
        9000,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div
        className="dialog-backdrop"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <div ref={dialogRef} className="dialog" role="dialog">
          <h2 id={titleId}>{editing ? t('editor.title') : t('presets.title')}</h2>
          {editing ? (
            <PresetEditor
              initial={editing}
              taken={new Set(presets.map((preset) => preset.name))}
              onDone={() => {
                setEditing(null)
                void listPresets().then((all) =>
                  setPresets(all.sort((a, b) => a.name.localeCompare(b.name))),
                )
              }}
            />
          ) : (
            <>
              <p className="muted">{t('presets.intro')}</p>
              <ul className="preset-list" data-testid="preset-list">
                <li
                  className={`preset-row${currentName === SYSTEM_PRESET ? ' preset-current' : ''}`}
                  data-testid={`preset-row-${SYSTEM_PRESET}`}
                >
                  <span className="preset-name">
                    {t('presets.system')}
                    {currentName === SYSTEM_PRESET ? t('presets.inUse') : ''}
                    <span className="muted preset-note">
                      {t('presets.systemNote', {
                        current: presetLabel(systemDark ? DARK_PRESET : LIGHT_PRESET),
                      })}
                    </span>
                  </span>
                  <span className="preset-swatches">
                    {[LIGHT_PRESET, DARK_PRESET].map((name) => {
                      const preset = BUILT_IN_PRESETS.find((candidate) => candidate.name === name)
                      return preset ? (
                        <Swatch
                          key={name}
                          color={preset.palette.background}
                          label={t('presets.swatchBackground', { name: presetLabel(name) })}
                        />
                      ) : null
                    })}
                  </span>
                  <button
                    type="button"
                    disabled={currentName === SYSTEM_PRESET}
                    onClick={() => apply(SYSTEM_PRESET)}
                    data-testid={`preset-apply-${SYSTEM_PRESET}`}
                  >
                    {t('presets.apply')}
                  </button>
                </li>
                {presets.map((preset) => {
                  const isBuiltIn = builtInNames.has(preset.name)
                  const isCurrent = preset.name === currentName
                  return (
                    <li
                      key={preset.name}
                      className={`preset-row${isCurrent ? ' preset-current' : ''}`}
                      data-testid={`preset-row-${preset.name}`}
                    >
                      <span className="preset-name">
                        {presetLabel(preset.name)}
                        {isCurrent ? t('presets.inUse') : ''}
                        {isBuiltIn ? t('presets.builtIn') : ''}
                      </span>
                      <span className="preset-swatches">
                        <Swatch color={preset.palette.background} label={t('presets.background')} />
                        <Swatch color={preset.palette.nodeFill} label={t('presets.nodeFill')} />
                        <Swatch
                          color={preset.palette.branchColors[0]}
                          label={t('presets.branchAccent')}
                        />
                        <Swatch color={preset.palette.edge} label={t('presets.edges')} />
                      </span>
                      <button
                        type="button"
                        disabled={isCurrent}
                        onClick={() => apply(preset.name)}
                        data-testid={`preset-apply-${preset.name}`}
                      >
                        {t('presets.apply')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(preset)}
                        aria-label={t(isBuiltIn ? 'editor.customizeLabel' : 'editor.editLabel', {
                          name: presetLabel(preset.name),
                        })}
                        data-testid={`preset-edit-${preset.name}`}
                      >
                        {isBuiltIn ? t('editor.customize') : t('editor.edit')}
                      </button>
                      <button
                        type="button"
                        className="danger"
                        disabled={isBuiltIn || isCurrent || busy}
                        onClick={() => setPendingDelete(preset)}
                        data-testid={`preset-delete-${preset.name}`}
                        title={
                          isBuiltIn
                            ? t('presets.builtInTitle')
                            : isCurrent
                              ? t('presets.inUseTitle')
                              : t('presets.deleteTitle')
                        }
                      >
                        {t('presets.delete')}
                      </button>
                    </li>
                  )
                })}
              </ul>
              <div className="dialog-actions">
                <button type="button" onClick={() => setEditing(inUse)} data-testid="preset-new">
                  {t('editor.new')}
                </button>
                <button type="button" disabled={busy} onClick={() => void importPreset()}>
                  {t('presets.import')}
                </button>
                <button type="button" onClick={onClose}>
                  {t('common.close')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {pendingDelete && (
        <ConfirmDialog
          title={t('presets.confirmTitle')}
          message={t('presets.confirm', { name: pendingDelete.name })}
          onClose={() => setPendingDelete(null)}
          onConfirm={() => {
            const preset = pendingDelete
            setPendingDelete(null)
            void removePreset(preset)
          }}
        />
      )}
    </>
  )
}
