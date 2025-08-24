src/
  app/
    layout.(tsx)
    page.(tsx)                    # redirect → /rooms/general
    rooms/
      [roomId]/
        page.(tsx)                # channel view (default)
        thread/
          [messageId]/
            page.(tsx)            # deep-linked thread view (optional route)
    dm/
      [userId]/
        page.(tsx)                # DM view
    search/
      page.(tsx)                  # global/in-room search
  components/
    layout/
      AppShell.tsx
      LeftNav.tsx
      ChannelNav.tsx
      HeaderBar.tsx
      RightPanel.tsx
      MobileDrawer.tsx
    messages/
      MessageList.tsx             # virtualized; placeholder now
      MessageItem.tsx
      DayDivider.tsx
      NewMessagesBar.tsx
      Composer.tsx                # placeholder now
    overlays/
      QuickSwitcher.tsx
      SettingsSheet.tsx
    primitives/
      ConnectionBanner.tsx
      ToastHost.tsx
      EmptyState.tsx
      ErrorBoundary.tsx
  lib/
    routes.ts                     # path builders: roomPath(id), dmPath(id)…
    types.ts                      # shared types/interfaces
    state/
      ui-store.ts                 # drawer open, right-panel open, etc.
      draft-store.ts              # per-room draft text
      presence-store.ts           # online users map (placeholder)
    net/
      api.ts                      # REST client placeholders
      ws.ts                       # WS client placeholder
