import { useId, useState, type CSSProperties } from 'react'
import { getPreset, putPreset } from '../io/db'
import { BUILT_IN_PRESETS } from '../io/seed'
import { presetChanged } from '../hooks/usePreset'
import { useT, type MessageKey } from '../i18n'
import '../i18n/en/presets'
import { validateDoc, formatValidationErrors } from '../schema/validate'
import type { Preset, PresetPalette } from '../schema/types'
import { useProjects } from '../store/projects'
import { showToast } from './toastStore'
import { presetNameProblem, suggestName } from './presetNames'
import { MIN_TEXT_CONTRAST, paletteContrastProblems } from '../theme/contrast'

const FONTS: { label: MessageKey; family: string }[] = [
  { label: 'editor.fontSans', family: "system-ui, 'Segoe UI', sans-serif" },
  { label: 'editor.fontSerif', family: "Georgia, 'Times New Roman', serif" },
  { label: 'editor.fontMono', family: "ui-monospace, 'Cascadia Mono', Consolas, monospace" },
  { label: 'editor.fontHand', family: "'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive" },
]

const COLOR_LABELS: Record<Exclude<keyof PresetPalette, 'branchColors'>, MessageKey> = {
  background: 'editor.background',
  text: 'editor.text',
  mutedText: 'editor.mutedText',
  nodeFill: 'editor.nodeFill',
  nodeBorder: 'editor.nodeBorder',
  edge: 'editor.edge',
}

const COLORS = (Object.keys(COLOR_LABELS) as (keyof typeof COLOR_LABELS)[]).map((key) => ({
  key,
  label: COLOR_LABELS[key],
}))

/**
 * Edit a preset's colours, font and lines (#104, decision U-D1: role styles
 * are kept from the preset it started from). Saves to the library; "Save and
 * use" also applies it to the open project.
 */
export function PresetEditor({
  initial,
  taken,
  onDone,
}: {
  /** The preset to start from; its name is kept only when it is a custom preset. */
  initial: Preset
  /** Names already in the library. */
  taken: Set<string>
  onDone: () => void
}) {
  const t = useT()
  const isBuiltIn = BUILT_IN_PRESETS.some((preset) => preset.name === initial.name)
  const [draft, setDraft] = useState<Preset>(() => ({
    ...structuredClone(initial),
    name: isBuiltIn ? suggestName(`${initial.name}-custom`, taken) : initial.name,
  }))
  const [busy, setBusy] = useState(false)
  const nameId = useId()
  const problem = presetNameProblem(draft.name)
  const overwriting = taken.has(draft.name) && draft.name !== (isBuiltIn ? '' : initial.name)

  // Text that is hard to read on its background or node fill (#138). A warning, not a block.
  const contrastProblems = paletteContrastProblems(draft.palette)
  const setPalette = (patch: Partial<PresetPalette>) =>
    setDraft((d) => ({ ...d, palette: { ...d.palette, ...patch } }))
  const setBranch = (index: number, color: string) =>
    setPalette({
      branchColors: draft.palette.branchColors.map((c, i) => (i === index ? color : c)),
    })

  const save = async (use: boolean) => {
    if (problem) return
    const validation = validateDoc(draft)
    if (!validation.ok) {
      showToast(t('editor.invalid', { detail: formatValidationErrors(validation.errors) }), 'error')
      return
    }
    setBusy(true)
    try {
      await putPreset(draft)
      const stored = await getPreset(draft.name)
      presetChanged(stored ?? draft)
      if (use) useProjects.getState().updateCurrent((p) => ({ ...p, preset: draft.name }))
      showToast(t(use ? 'editor.savedUsed' : 'editor.saved', { name: draft.name }))
      onDone()
    } catch (error) {
      showToast(
        t('editor.saveFailed', { error: error instanceof Error ? error.message : String(error) }),
        'error',
        9000,
      )
    } finally {
      setBusy(false)
    }
  }

  const fontKnown = FONTS.some((font) => font.family === draft.font.family)
  const node = (fill: string, text: string, bold: boolean, scale = 1): CSSProperties => ({
    background: fill,
    color: text,
    border: `1.5px solid ${draft.palette.nodeBorder}`,
    fontFamily: draft.font.family,
    fontSize: draft.font.baseSize * scale,
    fontWeight: bold ? 'bold' : 'normal',
  })
  const stroke = {
    stroke: draft.palette.edge,
    strokeWidth: draft.edges.width,
    strokeDasharray: draft.edges.dashed ? '6 4' : undefined,
    fill: 'none',
  }
  const path = (y: number) =>
    draft.edges.curve === 'straight'
      ? `M 95 60 L 175 ${y}`
      : draft.edges.curve === 'bezier'
        ? `M 95 60 C 135 60, 135 ${y}, 175 ${y}`
        : `M 95 60 H 135 V ${y} H 175`

  return (
    <div className="preset-editor" data-testid="preset-editor">
      <div className="preset-editor-form">
        <label className="preset-field" htmlFor={nameId}>
          <span>{t('editor.name')}</span>
          <input
            id={nameId}
            value={draft.name}
            maxLength={64}
            onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value.trim() }))}
            aria-invalid={problem !== null}
            data-testid="preset-editor-name"
          />
        </label>
        {problem ? (
          <p className="preset-editor-problem" role="alert">
            {t(problem)}
          </p>
        ) : overwriting ? (
          <p className="muted">{t('editor.overwrite', { name: draft.name })}</p>
        ) : null}

        <fieldset>
          <legend>{t('editor.colours')}</legend>
          <div className="preset-colour-grid">
            {COLORS.map(({ key, label }) => (
              <label key={key} className="preset-colour">
                <input
                  type="color"
                  value={draft.palette[key]}
                  onChange={(event) => setPalette({ [key]: event.target.value })}
                  data-testid={`preset-colour-${key}`}
                />
                <span>{t(label)}</span>
              </label>
            ))}
          </div>
          {contrastProblems.length > 0 ? (
            <div
              className="preset-contrast-warning"
              role="status"
              data-testid="preset-contrast-warning"
            >
              <p>{t('editor.contrastTitle', { min: MIN_TEXT_CONTRAST })}</p>
              <ul>
                {contrastProblems.map((problem) => (
                  <li key={`${problem.text}-${problem.surface}`}>
                    {t('editor.contrastItem', {
                      text: t(COLOR_LABELS[problem.text]),
                      surface: t(COLOR_LABELS[problem.surface]),
                      ratio: problem.ratio.toFixed(2),
                    })}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="preset-branches">
            <span>{t('editor.branches')}</span>
            {draft.palette.branchColors.map((color, index) => (
              <input
                key={index}
                type="color"
                value={color}
                aria-label={t('editor.branch', { n: index + 1 })}
                onChange={(event) => setBranch(index, event.target.value)}
              />
            ))}
            <button
              type="button"
              aria-label={t('editor.addBranch')}
              disabled={draft.palette.branchColors.length >= 8}
              onClick={() =>
                setPalette({
                  branchColors: [...draft.palette.branchColors, draft.palette.branchColors[0]],
                })
              }
            >
              +
            </button>
            <button
              type="button"
              aria-label={t('editor.removeBranch')}
              disabled={draft.palette.branchColors.length <= 3}
              onClick={() => setPalette({ branchColors: draft.palette.branchColors.slice(0, -1) })}
            >
              −
            </button>
          </div>
        </fieldset>

        <fieldset>
          <legend>{t('editor.font')}</legend>
          <label className="preset-field">
            <span>{t('editor.family')}</span>
            <select
              value={draft.font.family}
              onChange={(event) =>
                setDraft((d) => ({ ...d, font: { ...d.font, family: event.target.value } }))
              }
              data-testid="preset-editor-font"
            >
              {!fontKnown && <option value={draft.font.family}>{t('editor.fontCurrent')}</option>}
              {FONTS.map((font) => (
                <option key={font.family} value={font.family}>
                  {t(font.label)}
                </option>
              ))}
            </select>
          </label>
          <label className="preset-field">
            <span>{t('editor.size', { size: draft.font.baseSize })}</span>
            <input
              type="range"
              min={10}
              max={24}
              step={1}
              value={draft.font.baseSize}
              onChange={(event) =>
                setDraft((d) => ({
                  ...d,
                  font: { ...d.font, baseSize: Number(event.target.value) },
                }))
              }
              data-testid="preset-editor-size"
            />
          </label>
          <label className="preset-field">
            <span>{t('editor.titleScale', { scale: draft.font.titleScale.toFixed(1) })}</span>
            <input
              type="range"
              min={1}
              max={2.5}
              step={0.1}
              value={draft.font.titleScale}
              onChange={(event) =>
                setDraft((d) => ({
                  ...d,
                  font: { ...d.font, titleScale: Math.round(Number(event.target.value) * 10) / 10 },
                }))
              }
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>{t('editor.lines')}</legend>
          <label className="preset-field">
            <span>{t('editor.curve')}</span>
            <select
              value={draft.edges.curve}
              onChange={(event) =>
                setDraft((d) => ({
                  ...d,
                  edges: { ...d.edges, curve: event.target.value as Preset['edges']['curve'] },
                }))
              }
            >
              <option value="smoothstep">{t('editor.curveSteps')}</option>
              <option value="bezier">{t('editor.curveBezier')}</option>
              <option value="straight">{t('editor.curveStraight')}</option>
            </select>
          </label>
          <label className="preset-field">
            <span>{t('editor.width', { width: draft.edges.width })}</span>
            <input
              type="range"
              min={1}
              max={6}
              step={0.5}
              value={draft.edges.width}
              onChange={(event) =>
                setDraft((d) => ({
                  ...d,
                  edges: { ...d.edges, width: Number(event.target.value) },
                }))
              }
            />
          </label>
          <label className="preset-check">
            <input
              type="checkbox"
              checked={draft.edges.dashed}
              onChange={(event) =>
                setDraft((d) => ({ ...d, edges: { ...d.edges, dashed: event.target.checked } }))
              }
            />
            {t('editor.dashed')}
          </label>
        </fieldset>
      </div>

      <figure
        className="preset-preview"
        style={{ background: draft.palette.background }}
        aria-label={t('editor.preview')}
        data-testid="preset-preview"
      >
        <svg viewBox="0 0 260 120" aria-hidden="true" className="preset-preview-lines">
          <path d={path(28)} style={stroke} />
          <path d={path(92)} style={stroke} />
        </svg>
        <span
          className="preset-preview-node preset-preview-root"
          style={node(draft.palette.nodeFill, draft.palette.text, true, draft.font.titleScale)}
        >
          {t('editor.sampleRoot')}
        </span>
        <span
          className="preset-preview-node preset-preview-a"
          style={{
            ...node(draft.palette.nodeFill, draft.palette.text, false),
            borderLeft: `4px solid ${draft.palette.branchColors[0]}`,
          }}
        >
          {t('editor.sampleA')}
        </span>
        <span
          className="preset-preview-node preset-preview-b"
          style={{
            ...node(draft.palette.nodeFill, draft.palette.mutedText, false),
            borderLeft: `4px solid ${draft.palette.branchColors[1] ?? draft.palette.branchColors[0]}`,
          }}
        >
          {t('editor.sampleB')}
        </span>
      </figure>

      <div className="dialog-actions">
        <button type="button" onClick={onDone}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          disabled={busy || problem !== null}
          onClick={() => void save(false)}
          data-testid="preset-editor-save"
        >
          {overwriting ? t('editor.saveOver') : t('editor.save')}
        </button>
        <button
          type="button"
          className="primary"
          disabled={busy || problem !== null || !useProjects.getState().current}
          onClick={() => void save(true)}
          data-testid="preset-editor-save-use"
        >
          {t('editor.saveUse')}
        </button>
      </div>
    </div>
  )
}
