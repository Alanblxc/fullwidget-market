# 性能數據 / Performance data — `fullwidget.perf`

FullWidget 官方插件。組件在 `widget.json` 聲明 `"plugin:fullwidget.perf"` 就能用。

- 每秒送出事件 `stats`：`{ time, gpus: [{ name, util, vramUsed, vramTotal, sharedUsed, temp, power, powerLimit, clock, fan }], fps: { state, value, process, title, message } }`
- 方法：`stats`（同上，立即取一次）、`info`（顯示卡和功能）、`enableFps`（把目前的 Windows 帳號加進「Performance Log Users」群組，Windows 會先請你確認；之後要登出再登入）
- `fps.state`：`ok` 有幀率；`idle` 前景程式沒有在用 Direct3D 繪製；`needs-permission` 需要權限；`signout` 已加入群組，登出再登入後生效；`error` 其他問題（看 `message`）

顯示卡使用率和顯存來自 Windows 的「GPU Engine」「GPU Adapter Memory」計數器（和工作管理員一樣）；NVIDIA 顯示卡的溫度、功耗、時脈和風扇來自驅動附帶的 nvidia-smi。幀率是計算 Direct3D 9–12 程式每秒呼叫 Present 的次數（Windows 事件追蹤），只有系統管理員和「Performance Log Users」群組的成員能讀。

插件的全部程式碼就是 `Perf.cs` 和 `main.ps1`，由 Windows PowerShell 在你的電腦上編譯執行，沒有預先編譯好的檔案。

---

Official FullWidget plugin. Widgets declare `"plugin:fullwidget.perf"` to use it.

- Event `stats` every second: `{ time, gpus: [...], fps: { state, value, process, title, message } }`
- Methods: `stats`, `info`, `enableFps` (adds this Windows account to Performance Log Users after Windows asks you; sign out and in afterwards)
- GPU load and memory come from Windows' GPU counters (as in Task Manager), NVIDIA temperature, power, clock and fan from nvidia-smi, and the frame rate from counting Direct3D 9–12 Present calls with Windows event tracing, which only administrators and Performance Log Users may read.

All of it is `Perf.cs` and `main.ps1`, compiled and run by Windows PowerShell on your PC; nothing prebuilt.
