# Changelog

All notable changes to Team Manager are documented here.

## [0.2.0.1] - 2026-04-16

### Fixed
- Manager portal no longer crashes with a client-side TypeError when a TEAM_MANAGER user has no team assigned. All four manager pages (dashboard, fixture, players, voting) now check the HTTP response status before parsing JSON, so an unassigned manager sees a clear "No team assigned" message instead of a blank screen.

## [0.2.0.0] - 2026-04-02

### Added
- Share Round Duties panel on the manager roster page and dashboard — team managers can now copy a pre-formatted duty message or send it directly to WhatsApp in one tap
- Round selector on the roster page lets managers share duties for any upcoming round, not just the next one
- New API endpoint `/api/manager/next-round-duties` returns the next upcoming round's duty assignments for the dashboard

## [0.1.0.0] - 2026-04-02

### Added
- Mobile-responsive sidebar for admin, manager, and family portals — hamburger menu on small screens, slide-in panel with overlay backdrop, auto-close on navigation
