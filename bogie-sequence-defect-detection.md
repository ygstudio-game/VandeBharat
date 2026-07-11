# Sequence-Prior Component Detection + Closed/Open-Set Defect Detection

Design doc for under-bogie component identification and defect detection,
built on top of the existing YOLOv8 detection pipeline (`infer.py`,
`config.py`).

## 1. Problem

- Under-bogie video → extracted frames (already deduped via `dedup.py`,
  sharpest-frame selection).
- Each frame may contain **multiple components**, not one.
- Component physical layout is **fixed per coach type** (ICF vs LHB),
  varies only by coach type — not per rake, not per run.
- ~20–21 component classes total. Some visually near-identical
  (battery box vs transformer housing at certain angles/distances).
- Each component has a **known set of common defects** (crack, leak,
  corrosion, missing bolt, bracket loose, etc.) — but new/unlisted
  defects must still be caught, not silently dropped.

Two separate sub-problems, don't conflate them:

1. **Component identification** — which of the 20-21 parts is this?
2. **Defect detection on that component** — is it damaged, and how?

## 2. Architecture overview

```
Video → dedup (existing) → frame
           │
           ▼
   [Coach-type classifier]  ── ICF or LHB (picks which sequence graph to use)
           │
           ▼
   [YOLOv8 detector]  ── existing model, raw per-frame detections
           │  (class, confidence, bbox, frame_index)
           ▼
   [Sequence-prior re-ranker]  ── HMM/Markov, corrects/boosts component label
           │
           ▼
   [Per-component defect classifier]  ── closed-set, conditioned on component class
           │
           ├──> known defect (high conf)        → auto-label
           ├──> ambiguous component/defect       → human review queue
           └──> open-set anomaly score high      → "unknown defect" flag → human review
                       │
                       ▼
              Human correction ──> feedback store ──> updates:
                                     - sequence transition matrix
                                     - defect taxonomy per component
                                     - embedding gallery / classifier fine-tune data
```

Detection (localization) and identification (which class) stay separate
from the sequence-prior layer. The prior **re-ranks and boosts confidence
after detection**, it does not replace the detector and does not act as
a hard filter.

## 3. Coach-type detection (prerequisite)

Everything downstream depends on knowing ICF vs LHB — wrong coach type
means the wrong sequence graph is applied, and the prior will actively
fight the detector instead of helping it.

- Simple binary classifier (ResNet/EfficientNet, small) on
  full-bogie-view frame, or derived from rake metadata if available
  (train consist data, if you have it, is more reliable than vision-only).
- If both a metadata signal and a vision signal exist, prefer metadata;
  use vision only as fallback/cross-check.
- Log disagreement between metadata and vision classifier — that
  disagreement rate is your canary for when this assumption breaks.

## 4. Sequence-prior via Markov Chain / HMM

### 4.1 Model

- **States** = component classes, ordered per coach type. Two transition
  matrices: `T_ICF`, `T_LHB` (built from known physical layout, refined
  from data later).
- **Observations** = YOLOv8 raw detection (class + confidence) per
  frame, in frame/time order along the video pass.
- **Transition probability** `P(component_{t+1} | component_t)` — high
  for the physically-next component in that coach's fixed layout, low
  otherwise. Not a strict 1-to-1 chain — model as a **left-to-right HMM
  with skip transitions**, because:
  - components can be occluded/missed by the detector in a given frame
  - camera speed varies, so more than one frame can land on the same
    component, or a component can be skipped entirely if capture gap
    is large
- Add explicit **"skip 1", "skip 2" transition states** so the model
  doesn't force an unnatural jump when a component is genuinely
  missing from the frame sequence (missing due to occlusion ≠ missing
  due to component actually absent — track this distinction, don't
  conflate).

### 4.2 Decoding

- Run **Viterbi decoding** over a sliding window of N frames (not the
  whole video at once — keeps it online/causal, usable during
  inference not just post-hoc).
- Final label per frame = argmax over:
  `α · P(class | detector)  +  (1 − α) · P(class | sequence_prior)`
  — a weighted blend, not prior-only. Start `α` high (trust detector
  more, e.g. 0.7) and only lower it for the specific class-pairs that
  historically confuse the detector (battery box ↔ transformer), not
  globally. Global low-α means the prior can steamroll a correct
  detection in the majority of unambiguous cases — don't do that.

### 4.3 Error-propagation guard

This is the real risk with HMM-style priors: one wrong high-confidence
detection early in the sequence can drag every following frame's label
via the transition matrix.

Mitigations:
- Cap how many consecutive re-ranked (prior-overridden) labels are
  allowed before forcing a "review" flag — if the prior is correcting
  3+ frames in a row, something is off (wrong coach type picked, or
  genuinely unusual bogie), don't let it run unchecked.
- Always log `detector_label` vs `final_label` separately per frame —
  when they disagree, that's a free audit trail, use it to catch
  systematic prior errors early.

## 5. Defect detection: closed-set + open-set

### 5.1 Closed-set (known defects)

- Once component class is resolved (step 4), route the crop to a
  **per-component defect classifier** — either one shared multi-head
  model (component embedding + defect head) or separate lightweight
  classifiers per component if defect visual signatures don't
  transfer across components (likely, given how different a crack on
  a bio-tank looks vs. a bracket).
- Known-defect taxonomy per component = your existing labeled data,
  organized as `{component: [defect_type, ...]}`. This narrows the
  classifier's decision space per component — exactly your original
  idea, and it's the easy part.

### 5.2 Open-set (unknown/novel defects) — the hard part

Do not treat this as a bolt-on. Real risk: naive reconstruction-based
anomaly detectors (autoencoder reconstruction error) flag dirt, oil
stains, shadows, and lighting variation as "anomalous" constantly in
real under-bogie conditions — high false-positive rate, and it will
erode trust in the whole system if the review queue fills with noise.

Recommended approach, in order of effort/robustness:

1. **Distance-in-embedding-space method** (cheaper, more robust than
   pixel reconstruction): use the same embedding model backing your
   component gallery. For a given component class, keep a distribution
   of "normal" embeddings (healthy examples). Score new crops by
   Mahalanobis distance or k-NN distance to that normal distribution.
   Large distance = flag as anomaly. This is far less sensitive to
   lighting/dirt than pixel-level reconstruction because embeddings
   trained/fine-tuned for component identity already suppress a lot of
   nuisance variation.
2. **Calibrate thresholds per component, not globally** — some
   components (anything near wheels/brakes) will have naturally higher
   visual variance (dirt, wear) than others (a sealed tank). A global
   anomaly threshold will over-flag dirty components and under-flag
   clean ones.
3. Only after (1) is calibrated and stable, consider a
   reconstruction-based method (autoencoder/diffusion-based
   reconstruction error) as a second opinion — ensemble the two, flag
   only when both agree, to control false-positive rate.
4. Every "unknown defect" flag that a human confirms as real becomes a
   new labeled example — closed-set taxonomy grows over time, open-set
   detector's job shrinks over time. This is the actual self-learning
   loop, and it's the point: open-set detection should get less busy
   as the closed-set list matures, not stay static.

### 5.3 Decision logic per crop

```
if component_confidence < component_threshold:
    → human review (component identification uncertain)
elif defect_classifier_confidence >= defect_threshold:
    → auto-label as known defect
elif anomaly_score >= anomaly_threshold:
    → flag "unknown defect", human review
else:
    → auto-label as "no defect"
```

Thresholds are per-component, not global — set from validation data,
revisit periodically as feedback accumulates.

## 6. Feedback loop — with an audit safeguard

Every human correction feeds three things:

1. Sequence transition matrix (`T_ICF`/`T_LHB`) — nudge probabilities
   toward what was actually observed.
2. Defect taxonomy per component — new confirmed defect type gets
   added to closed-set list.
3. Embedding gallery / fine-tune dataset — corrected crop becomes a
   new reference example.

**Don't blindly trust every correction.** A rushed or wrong human call
goes straight into all three stores above and compounds silently.
Mitigation:
- Periodic spot-check: sample N% of accepted human corrections for a
  second reviewer or a scheduled audit pass.
- Track correction agreement rate per reviewer — outlier reviewers
  (high disagreement with consensus) get flagged for the audit pass
  first.
- Version the gallery/taxonomy (don't overwrite in place) so a bad
  batch of corrections can be rolled back.

## 7. What this does NOT solve — flag separately

- **Image quality** (motion blur from train speed, poor under-bogie
  lighting, dirt/oil obscuring the part) is very likely the actual
  bottleneck on real footage, not the labeling method. No amount of
  sequence-prior or open-set cleverness fixes an unusable frame.
  Worth measuring: what fraction of frames are even usable
  (sharpness score from `dedup.py` is already a proxy — check its
  distribution before investing further here).
- **Class imbalance** — with 20-21 components, some defect types will
  have very few historical examples. Self-learning grows the gallery
  slowly for those; it doesn't solve cold-start scarcity by itself.
  Consider targeted data collection for rare defect classes rather
  than waiting for the loop to organically surface them.

## 8. Rollout order (suggested)

1. Confirm coach-type classifier reliability first — everything else
   depends on it.
2. Build and calibrate the sequence-prior HMM using **existing**
   detector output (no model changes yet) — measure how much it
   actually improves component ID accuracy before investing further.
3. Build closed-set defect classifier per component (straightforward,
   reuses labeled data you already have).
4. Build open-set anomaly detector using embedding-distance method,
   calibrate per-component thresholds on real (not synthetic) negative
   data before trusting it in the loop.
5. Wire up feedback loop with audit sampling from day one — don't add
   the audit step later after trust issues surface.
