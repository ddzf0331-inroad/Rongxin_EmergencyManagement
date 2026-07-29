**Source Visual Truth**
- Path: `/Users/fzhao/个人/Codex/应急看板/应急响应.png`
- Target: 16:9 emergency response mode after an incident has started.

**Implementation Evidence**
- Local URL: `http://127.0.0.1:5174/?incident=demo` starts the demo incident, then cleans the URL to `/`.
- Screenshot path: `/private/tmp/emergency-response-page-final.png`
- Full comparison path: `/private/tmp/emergency-response-comparison.jpg`
- Focused comparisons: `/private/tmp/emergency-response-left-focus.jpg`, `/private/tmp/emergency-response-right-focus.jpg`, `/private/tmp/emergency-response-center-focus.jpg`
- Browser-reported viewport: `innerWidth 2495`, `innerHeight 1404`; screenshot was scaled against the 1672x941 source for visual comparison.
- State: active demo incident response page, default camera video open, plan/material/camera layers visible.

**Full-View Comparison Evidence**
- The implementation matches the source screen structure: weather/title/time header, left accident/MSDS/case rail, center warning ticker + 2.5D map + real-time video popup, right plan/alarm/video rail, and layer control.
- The event-response information architecture replaces the normal dashboard statistics as intended, while preserving the existing cyan/blue command-center visual system.
- Remaining full-view difference is the plant-map substrate and exact camera crop. The implementation uses the existing project map asset and cropped video thumbnails from the supplied reference; this is acceptable for this front-end demo build.

**Focused Region Evidence**
- Left rail: weather cards, accident description, MSDS tabs/search, and case panel align with the source hierarchy and content density.
- Right rail: plan search/actions, red alarm table, and four video tiles are present and functional; row spacing and visual emphasis match the reference closely enough for the demo.
- Center region: warning banner, map markers, route overlays, video popup, and layer control are visible. The map view was tuned closer to the reference; exact GIS angle remains a P3 asset fidelity difference.

**Findings**
- No actionable P0/P1/P2 findings remain.

**Required Fidelity Surfaces**
- Fonts and typography: uses the existing dashboard condensed Chinese/numeric stack, with matching large title, compact panel headings, red alarm rows, and small operational table text.
- Spacing and layout rhythm: three-column 16:9 command-screen layout holds without rail overflow; response page panel groups match the screenshot rhythm.
- Colors and visual tokens: dark navy background, cyan panel chrome, amber warning banner, red incident/alarm states, and blue active controls match the existing dashboard design language and reference.
- Image quality and asset fidelity: video thumbnails are cropped from the supplied response screenshot. The plant map remains the project’s existing generated bitmap, not the exact reference GIS render.
- Copy and content: visible Chinese copy matches the response use case: accident description, MSDS, typical case, related plans, alarms, video monitoring, and weather warning.

**Interaction Checks**
- Build: `npm run build` passed.
- Lifecycle: `?incident=demo` opened response mode and cleaned the URL to `/`; refreshing stayed in response mode; terminating cleared the event and returned to the normal dashboard; the normal dashboard start button reopened response mode.
- Plan search: searching `3` filtered the list to `相关预案3`.
- Plan launch: launching the filtered plan changed state to `已启动` and opened the detail popup.
- MSDS search: searching `硫化氢` showed the matching MSDS content and hazard category.
- Video switch: clicking `运输通道入口` changed both the active video tile and the video popup label.
- Layer toggle: `layer-camera` changed from active to inactive and back.

**Patches Made Since QA**
- Added emergency incident lifecycle state backed by `emergency-dashboard-active-incident-v1`.
- Added response snapshot mock data, response page UI, plan/MSDS/video/alarm interactions, demo start/terminate controls, and cropped video assets.
- Added optional initial map view props so response mode can use a closer map framing without changing the normal dashboard or config flow.

**Follow-Up Polish**
- P3: replace `public/assets/plant-map.png` with the customer’s actual GIS/digital-twin render matching the reference angle.
- P3: replace cropped screenshot thumbnails with real camera stream posters once stream URLs are available.

**final result: passed**
