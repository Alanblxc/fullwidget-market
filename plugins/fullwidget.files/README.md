# 檔案 / Files — `fullwidget.files`

FullWidget 官方插件。組件在 `widget.json` 聲明 `"plugin:fullwidget.files"` 就能用。給「資料夾盒子」這類要顯示資料夾內容的組件用。

**只能碰用戶選的資料夾。** 組件先呼叫 `pick`，插件打開 Windows 的選資料夾視窗，用戶選了哪個，那個組件才能用哪個（和它裏面的子資料夾）。每個組件各自記住，存在 FullWidget 資料位置的 `plugin-data\fullwidget.files\folders.json`。其他方法的 `root` 都必須是選過的資料夾，`path` 都是相對於它的路徑，跑不出去。

| 方法 | 參數 | 結果 |
|---|---|---|
| `pick` | `{ title? }` | 用戶選的 `{ root, name }`；取消時是 `null` |
| `folders` | | 這個組件選過的資料夾 |
| `forget` | `{ root }` | 不再讓這個組件用它 |
| `list` | `{ root, folder? }` | `{ root, name, folder, items: [{ path, name, file, ext, dir, size, modified }], more }`。不含隱藏和系統檔，最多 2000 項 |
| `icons` | `{ root, paths, size? }` | `{ path: "data:image/png;base64,…" }`：檔案總管顯示的圖示，圖片和影片是縮圖 |
| `open` | `{ root, path }` | 用預設的程式打開；資料夾在檔案總管打開 |
| `reveal` | `{ root, path }` | 在檔案總管裏選中它 |
| `drag` | `{ root, paths }` | 把它們拖出去（拖到別的資料夾、聊天視窗、編輯器）。要在滑鼠還按著的時候呼叫；結果是 `copy`、`move`、`link` 或 `none` |
| `add` | `{ root, folder?, files, mode? }` | 把別處的檔案放進來。`mode`：`auto`（同一個磁碟搬過來，不同磁碟複製，和檔案總管一樣）、`copy`、`move`。名字重複時自動改名 |
| `rename` | `{ root, path, name }` | 新的 `path` |
| `mkdir` | `{ root, folder?, name }` | 新資料夾的 `path`（重名時加上 (2)） |
| `trash` | `{ root, paths }` | 刪到資源回收筒 |
| `copyPath` | `{ root, paths }` | 把完整路徑複製到剪貼簿 |
| `watch` / `unwatch` | `{ root }` | 開始／停止留意變化。有變化時送出事件 `changed`：`{ root }`（同一批變化只送一次） |

複製、搬移和刪除用的是 Windows 自己的檔案操作：大的檔案會有 Windows 的進度視窗，刪除的東西在資源回收筒裏找得回來。

插件的全部程式碼就是 `Files.cs` 和 `main.ps1`，由 Windows PowerShell 在你的電腦上編譯執行，沒有預先編譯好的檔案。

---

Official FullWidget plugin. Widgets declare `"plugin:fullwidget.files"` to use it; it's for widgets that show a folder, such as Folder box.

**It only touches folders the user picked.** A widget calls `pick`, the plugin opens Windows' folder picker, and the widget may use the folder the user chose (and what's inside), each widget its own; they're remembered in `plugin-data\fullwidget.files\folders.json` in FullWidget's data folder. Every other method's `root` must be such a folder, and `path` is relative to it and can't leave it.

- `pick { title? }` → `{ root, name }` or `null`; `folders`; `forget { root }`
- `list { root, folder? }` → `{ root, name, folder, items: [{ path, name, file, ext, dir, size, modified }], more }` (no hidden or system files, up to 2000)
- `icons { root, paths, size? }` → `{ path: data URI }`: Explorer's icons, thumbnails for pictures and videos
- `open`, `reveal { root, path }`; `drag { root, paths }` while the mouse button is still down → `copy`, `move`, `link` or `none`
- `add { root, folder?, files, mode? }` (`auto` moves from the same drive and copies from another, like Explorer; `copy`; `move`; clashing names get renamed), `rename { root, path, name }`, `mkdir { root, folder?, name }`, `trash { root, paths }` (to the Recycle Bin), `copyPath { root, paths }`
- `watch` / `unwatch { root }`: a `changed` event `{ root }` when something in it changes (one per burst)

Copying, moving and deleting go through Windows' own file operations: its progress window for big ones, and deleted things can be restored from the Recycle Bin.

All of it is `Files.cs` and `main.ps1`, compiled and run by Windows PowerShell on your PC; nothing prebuilt.
