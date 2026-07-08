import "./globals.css";

export const metadata = {
  title: "LingoLoop",
  description: "Loop-first dual-subtitle video studio with local transcription",
};

import StyledJsxRegistry from "./registry";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <StyledJsxRegistry>{children}</StyledJsxRegistry>
      </body>
    </html>
  );
}
