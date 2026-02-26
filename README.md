# DragOn

English | [한국어](README.ko.md)

![banner](media/banner.png)

DragOn is a Chrome extension that captures your current text selection as Markdown or as a cropped image. It is designed for quickly archiving web content like job descriptions before links expire.

## What You Can Do

- `Alt+Shift+D` copies the current selection as Markdown
- `Alt+Shift+C` captures the selection as a PNG and shows a popup with download/copy
- Toast feedback for success, failure, or no selection
- No analytics or cloud sync. Image capture may fetch referenced images to inline them.

Note: On macOS, `Option` is the same key as `Alt`. The default shortcuts use `Alt+Shift+D` and `Alt+Shift+C`.

### Copy as Markdown

<video controls src="media/demo-markdown.mov" title="markdown"></video>

Converts the selected text into Markdown and copies it to the clipboard. Depending on page structure, headings, lists, and links are converted to Markdown syntax.

The video shows the default copy command and the `Alt+Shift+D` shortcut. When using the shortcut, the selection is converted to Markdown, copied to the clipboard, and a toast appears.

### Capture as Image

<video controls src="media/demo-image.mov" title="image"></video>

Captures the selection as a PNG image and opens a popup overlay where you can download or copy the image. The capture includes the visual styling and layout, not just text.

The video shows the default copy command and the `Alt+Shift+C` shortcut. After capture, the popup appears and the image can be downloaded or copied, with a toast notification.

## Install

1. Install dependencies: `npm install`
2. Build the extension: `npm run build`
3. Load the extension in Chrome. Open `chrome://extensions`, enable Developer mode, click "Load unpacked", then select the `dist` folder.

## Usage

1. Select text on any webpage
2. Press `Alt+Shift+D` to copy Markdown or `Alt+Shift+C` to capture an image
3. If needed, change shortcuts at `chrome://extensions/shortcuts`

## Mascot

![dragon](media/character.png)

Yes, it’s a dragon.

## License

MIT
