# Implementation Plan - AI Agent Desktop UI

## Technology Stack
- **Framework**: Electron (Host) + Next.js (App)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + Custom CSS Variables
- **Editor**: Lexical or CodeMirror (for Obsidian-like live markdown)
- **State Management**: Zustand or React Context

## Design System
- **Background (Dark)**: `#23242A`
- **Secondary/Cards (Dark)**: `#323741`
- **Primary/Action**: `#F5AFAF` (Rose)
- **Primary Hover**: `#F9DFDF`
- **Primary Active**: `#FBEFEF`
- **Typography**: Inter / Outfit (Black/White text)

## Layout Structure
1. **Left Sidebar (250px)**: File Explorer
   - Drag-and-drop support
   - Multi-level folder nesting
   - Search bar at the top
2. **Main Content (Flexible)**: Live Markdown Editor
   - "Hidden markup" logic: `#` disappears on blur, reappears on focus
   - Fluid typography transitions
   - Auto-save to local FS
3. **Right Sidebar (350px)**: AI Chat
   - Streaming text responses
   - Tool execution logs
   - Glassmorphism overlays

## Development Steps
1.  **Phase 1: Scaffolding**
    - Initialize Next.js project in `/frontend`
    - Configure Electron main/preload scripts
    - Set up Tailwind with the specified color palette
2.  **Phase 2: Core Components**
    - Sidebar (Tree view)
    - Editor (Obsidian-style logic)
    - Chat UI (Message flow)
3.  **Phase 3: Integration**
    - IPC communication between Electron and the Node.js agent service
    - File system watchers for real-time updates
4.  **Phase 4: Polish**
    - Framer Motion animations
    - Light/Dark mode toggles
