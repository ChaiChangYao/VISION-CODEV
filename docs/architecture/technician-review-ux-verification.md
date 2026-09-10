# Technician review UX pilot verification

Implemented September 10, 2026. Explicit Save draft retained; no autosave.

## Delivered

- Main editor: step name, instruction, optional practical tip. Checks and references collapsed.
- Original model observation remains accessible. Vague uncertainty becomes a verification checklist, not a fabricated error diagnosis.
- Named timeline bars, 1/2/4/8x zoom, selected-action frame thumbnail, existing frame navigation.
- Consecutive actions grouped by their existing group labels; no evidence merged, reordered, or automatically approved. Groups can be renamed through Adjust step.
- Timestamped notes with optional normalized frame-region ellipse; video bytes unchanged. Keyboard-accessible position/size sliders.
- Review and advance; edits invalidate review. Publication remains explicitly gated. Unsaved changes indicator and leave-page warning retained, with link-navigation confirmation added.
- English, Malay, Taiwan Traditional Chinese core review labels. Advanced tools remain English and the UI discloses that limitation. Existing instructions are not automatically translated; workshop terminology remains editable.
- Optional browser dictation appends text to the practical tip. Browser speech-service disclosure and typing fallback. No microphone activation on page load, no app audio storage, no automatic API calls.

## Verification

- Web typecheck and production build passed; API build passed.
- 19 web tests and 7 workflow-engine tests passed, including grouping, actionable cues, normalized-region serialization/rejection, and review invalidation.
- Local web/API returned HTTP 200 after restarting with existing app configuration.
- Browser on automotive verification draft: 4x zoom; action selection and next-frame stepping to 633ms; empty note prevents review; note plus circle saved, reloaded, and found at 633ms with region x=.5/y=.5/radius=.1 intact.
- Visually inspected original frame and highlighted region in browser. Temporary test note removed and draft saved; no publication or review approval performed.
- Malay and Traditional Chinese core controls verified; switched back to English.

## Remaining pilot limitations

- Language copy needs native technician review. This is core-flow localization, not complete application localization or a managed terminology glossary.
- Browser speech recognition is browser/service-dependent; real speech and local technical vocabulary were not tested. Use typing where unavailable or not permitted.
- Group quality depends on the detected group labels; semantic regrouping is not inferred by this UI.
- Source-rate stepping remains approximate for variable-frame-rate footage.
- No automatic translation, original-audio note archive, live detection changes, or new model/API spend.
