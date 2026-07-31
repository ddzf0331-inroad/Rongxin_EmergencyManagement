# Prototype Instructions

Run the local server yourself and open the preview in the in-app browser. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

The emergency dashboard configuration workflow lives at `/config`: users manually place map layer points and draw escape routes on the same plant map, save to `emergency-dashboard-map-config-v1`, and the main dashboard at `/` reads that configuration first.

Pending incident reviews must use a compact floating panel contained inside the basemap, without a full-dashboard mask. Multiple pending incidents are browsed within the same panel. Long incident descriptions wrap across lines and remain fully readable through an internal scroll area.

User-facing incident numbers use `SJ-YYYYMMDD-NNNN`, with a four-digit sequence restarting each Asia/Shanghai calendar day. Keep the internal UUID for API routing and lifecycle operations.

Both the overview dashboard and the emergency response dashboard must distribute side-rail card heights by content density. Do not let the last card absorb most of the remaining height; keep chart and video media proportions stable while the rails fill the viewport.

Incident management does not provide editing or a recycle-bin filter. Deletion is soft deletion with confirmation, and deleted incidents are hidden from incident management and normal workflows.

The incident-management date filter is a single start-to-end field that opens a two-month range calendar. Do not replace it with separate native date inputs.
