# TODO

Track outstanding work items for the project. Each todo has a title, date, completion status, and summary with optional supporting details.

## Example

- [x] **Example todo title** — _2026-03-01_
  Short summary of what was done or needs doing.
  - Optional step or bullet point
  - General notes or considerations

---

_Todos to be added below this line_

---

- [ ] **Investigate better markdown integrations** — _2026-03-15_
  Check whether mirrors/adapters natively support markdown (per their docs) and, if so, submit content raw or minimally formatted instead of routing through our `markdown.ts` parser/transformer. Also find a potentially open-source library on JSR or npm that could replace parts or all of the custom parsing in `markdown.ts`.
  - Review each mirror/adapter's documentation for native markdown support
  - Identify which formatting steps in `markdown.ts` become unnecessary when native support exists
  - Search JSR and npm for mature markdown parsing libraries that could replace custom logic
  - Evaluate candidates on feature coverage, bundle size, and maintenance activity

- [ ] **Converting charts and media** — _2026-03-15_
  Implement an approach to dynamically handle charts (e.g. Mermaid and other popular markdown chart formats) and media like images so they render correctly on mirrors. This could involve native integrations (e.g. uploading an image to Confluence and tracking it), replacing images with base64-renderable strings, or pre-rendering charts to images and embedding those in the mirrored content.
  - Inventory chart syntaxes commonly used in markdown (Mermaid, PlantUML, etc.)
  - Determine which mirrors support native chart rendering vs. requiring image fallback
  - Prototype image upload flow for at least one mirror (e.g. Confluence)
  - Evaluate base64 inline images as a fallback for mirrors that lack upload APIs
  - Ensure media references remain stable across syncs (track uploaded asset IDs)
