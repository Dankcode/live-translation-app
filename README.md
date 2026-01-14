Hybrid Implementation Plan - Transparent Full-Screen Overlay
This plan resolves the current limitations by separating the Speech Recognition (which works best in a standard browser) from the Subtitle Overlay (which requires Electron for transparency and "above full-screen" behavior).

User Review Required
IMPORTANT

Why this approach?:

Browsers cannot do truly transparent windows or stay on top of full-screen PowerPoint.
Electron cannot do the "free" browser speech recognition without a cloud API key. The Solution: You will open a regular Chrome browser tab to use the microphone. Simultaneously, a small Electron app will run to show the transparent subtitles on top of your PowerPoint. They will talk to each other automatically.
Proposed Changes
1. Unified Local Server (Next.js)
Implement a WebSocket server (using socket.io or simple 
ws
) within the Next.js dev server.
The browser tab sends transcripts to this server.
The Electron window receives and displays them.
2. Transparent Electron Window [NEW/RESTORED]
Create a minimal Electron setup that only opens a fully transparent, always-on-top window.
This window will have ignoreMouseEvents(true) to avoid blocking PowerPoint clicks.
3. Speech Recognition Tab (Chrome)
Update 
page.js
 to be the "Control Center".
It captures the microphone using the Web Speech API (Free/Native).
It emits the text to the local WebSocket server.
Verification Plan
Manual Verification
Launch: Start the server and Electron.
Recognition: Open localhost:3000 in Chrome and start the mic.
Overlay: Verify a transparent subtitle appears on the screen.
Full Screen Test: Open PowerPoint in Slide Show mode. Verify subtitles stay on top and are transparent.
Transparency: Ensure no box/frame is visible around the text.