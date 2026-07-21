# Probe run #1 — evidence (GitHub Actions run 29859449200)

Workflow: `kaggle-gpu-spike.yml` @ probe v1 · dispatched 2026-07-21 18:57 UTC ·
`machine_shape=NvidiaTeslaT4` · job conclusion: **failure** (~4 min).

Decisive log excerpts (ANSI/timestamps stripped), in order:

## 1. Credential sniff — worked, secret never echoed
```
Detected credential mode: string (secret contents never shown)
```
→ `KAGGLE_API_TOKEN` is a raw access-token string (not legacy JSON); routed to the
action's `api_token` input. The value was never printed.

## 2. Kernel authenticated, pushed, and ran on GPU
```
Successfully installed ... kaggle-2.2.3 kagglesdk-0.1.34 ...
Kernel version 1 successfully pushed.  Please check progress at
  https://www.kaggle.com/code/mohidmakhdoomi/nextjs3dfg-webgl-probe
... Current kernel status: nextjs3dfg-webgl-probe has status "KernelWorkerStatus.RUNNING"   (~3.5 min of polling)
[2026-07-21T19:01:36] Current kernel status: nextjs3dfg-webgl-probe has status "KernelWorkerStatus.ERROR"
```
→ Auth + push + remote GPU execution all functioned. The kernel reached a
terminal **ERROR** state.

## 3. The action's result reporting is BROKEN — verdict never surfaced
On kernel ERROR the action tries to dump the kernel log with
`Get-Content $log | ConvertFrom-Json -AsHashtable | %{ $_['data'] }` and crashes:
```
Kernel log downloaded to .../nextjs3dfg-webgl-probe.log
ConvertFrom-Json: ...
  Conversion from JSON failed with error: Additional text encountered after
  finished reading JSON content: ,. Path '', line 1, position 0.
##[error]Process completed with exit code 1.
```
→ The kernel's stdout (nvidia-smi, Playwright install, `UNMASKED_RENDERER_WEBGL`,
the probe VERDICT) was **never printed**. So this run cannot tell us whether the
`ERROR` was the probe's intended `exit(1)` (software WebGL) or a genuine kernel
crash — the answer is hidden behind the action's own defect.

## Findings from run #1
- ✅ **Feasibility of auth/push/run on Kaggle GPU: confirmed.** The sniff + pinned
  action + private GPU kernel path works end-to-end.
- ❌ **Reporting defect (confirmed, not theoretical):** `Frederisk/kaggle-action`
  fails to render the kernel log on failure — the single most important output
  (the WebGL verdict) is lost. Reinforces "crude/fragile reporting" as a reject
  driver for any required-CI role.
- ⏭ **Verdict still open** → probe v2 adds a structured `webgl_probe_result.json`
  artifact + a workflow step that fetches `kaggle kernels output` directly,
  bypassing the broken dump. Re-dispatch reads the real renderer.

Full raw run log is available via `gh run view 29859449200 --log` if needed; it is
not committed (88 KB of ANSI + poll spam).
