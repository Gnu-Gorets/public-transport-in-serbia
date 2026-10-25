# BeogradPlus Realtime and Play Integrity on redroid

**Snapshot date:** 2026-10-25
**Status:** Realtime was not restored. All tested redroid containers are stopped; named volumes and images remain.

## Executive summary

- Google BeogradPlus 6.54 starts in redroid but displays `YOUR DEVICE IS NOT SUPPORTED`.
- Removing `/system/xbin/su` did not change result. Android remained `userdebug`, `test-keys`, `ro.debuggable=1`, with shell UID 0.
- Changing `ro.config.low_ram=true` to `false` did not change result.
- Android 13 multilib test reached Google Play Integrity service and logged request callback marker. App still displayed same unsupported screen. No numeric SDK error, confirmed Integrity response, App Check token, backend acceptance, or realtime result was obtained.
- Huawei flavor obtained HMS JWS with `basicIntegrity=false`; app blocked startup and realtime remained unavailable.
- Current local backend uses BusLogic API v1/v2, while inspected Google APK 6.54 uses API v3 plus `X-API-INTEGRITY` and `session_id`. This is separate from redroid attestation problem. Fixing one does not fix other.
- No certified physical Android control run was performed; device availability was not confirmed. Best next diagnostic is one control run on certified physical Android using official app distribution, then obtain safe failure reason and expected Firebase App Check policy from app/backend owner. No reliable redroid-only fix is established.

This note consolidates test history, evidence, limits, and current Docker state. It does not contain tokens, JWS values, private keys, or keybox data.

## Scope and authorization

User authorized limited local testing of BeogradPlus APK and redroid, including ordinary app startup and network egress. Limited token testing was discussed; no token was extracted, copied, replayed, or used for direct API requests. No persistent token service was built.

No APK bytes or signing certificates, project backend, host kernel, or host network settings were changed. Isolated A/B tests used separate Android volumes. Network diagnostics documented Google Play Store/GMS background updates after egress was enabled; no manual package update was performed on original Google container. Exact affected volume and final package state were not rechecked at shutdown, so original package data should not be treated as pristine. Visibility diagnostics applied per-app `FILTER_APPLICATION_QUERY` change `135549675`, reset it after initial A/B, then re-enabled it with explicit approval and left it on a test instance. Exact container association and persisted state in saved containers were not independently verified after shutdown. Treat Android package state as potentially modified. This Android compatibility override is not a Compose setting and does not change Integrity verdict. No PlayStrong, Magisk, Zygisk, LSPosed, AlwaysStrong, fingerprint spoofing, verdict spoofing, TLS interception, or private keybox was used.

All redroid test containers are stopped following user request. No container, image, network, or volume was deleted. Docker reported exit code `137` and `OOMKilled=false` for containers stopped in final cleanup. This is not evidence of Docker-recorded OOM; exact termination cause was not investigated further.

## Problem has several independent layers

```text
redroid image and Android build properties
        |
        +--> Play Core discovers Google Play Store / Integrity service
                  |
                  +--> Play Integrity token request and device verdict
                            |
                            +--> BeogradPlus sends X-API-INTEGRITY
                                      |
                                      +--> BusLogic API v3 / X-API-INTEGRITY handling (server policy unknown)
                                                |
                                                +--> realtime response

Local project backend currently uses older BusLogic API v1/v2.
```

Each arrow is separate test boundary. Successful Android boot, Play Store visibility, service binding, token request callback, token response, positive device verdict, App Check acceptance, backend acceptance, and realtime payload are not interchangeable results.

### Play Integrity and App Check

- Play Integrity is Google client attestation API. Client requests token through Google Play services; verdict is evaluated by Google and, depending on request mode, verified/decrypted by app backend.
- Firebase App Check uses attestation provider to mint App Check tokens. App or backend may attach/enforce tokens separately from raw Play Integrity checker result.
- APK static analysis found `X-API-INTEGRITY` header. After HTTP 401, app refreshes Firebase App Check token through Play Integrity and retries. Exact server enforcement policy was not available.
- Firebase supports apps distributed outside Google Play, but distribution channel changes app-recognition/licensing settings, not device integrity requirements by itself. Current Firebase guidance lists no `PLAY_RECOGNIZED` or `LICENSED` requirement for apps distributed exclusively outside Play, with `Device integrity` as minimum level in advanced settings. Only Firebase/app owner can confirm actual project policy: [Firebase App Check Play Integrity provider](https://firebase.google.com/docs/app-check/android/play-integrity-provider).
- Android 13+ `MEETS_DEVICE_INTEGRITY` requires hardware-backed proof for locked bootloader and certified manufacturer OS image. Empty device verdict is possible for emulator that does not pass Google checks: [Play Integrity setup and verdicts](https://developer.android.com/google/play/integrity/setup).
- Test UI did not reveal exact SDK error code or server verdict. Therefore current evidence supports “redroid is rejected or cannot complete required Integrity path,” not precise claim about which Firebase/backend predicate failed.

## APK and protocol facts

### Google APK

| Field | Value |
|---|---|
| Archive | `BeogradPlus-6.54-arm64.xapk` (28,531,688 bytes) |
| Archive SHA-256 | `baa8b6cd6e7d046cc505e48eaac245073ff25ea4da873b2ff4a07e41cbc9c7be` |
| Package | `buslogic.beogradplus` |
| Version | `6.54`, version code `394` |
| minSdk / targetSdk | `25` / `36` |
| APK set | `buslogic.beogradplus.apk`, `config.arm64_v8a.apk`, `config.en.apk`, `config.xxhdpi.apk` |
| Signer certificate SHA-256 | `c57d0b247f93166a6ed1e24ba6c9f1c174c8a76ed347bcd284b095624d53f470` for base and all three splits |
| Source caveat | Archive came from APKPure, not Google Play. APK signatures verified and split signer digests match, but publisher identity was not independently verified. |

APK runs ARM64 code on x86_64 redroid through Android native bridge. Successful native bridge startup does not imply successful Play Integrity.

| File | SHA-256 |
|---|---|
| `buslogic.beogradplus.apk` | `21a0933e6f1a0c098124cd3f55d6c6b0738324f1ae23fbdc88dfea5826be599f` |
| `config.arm64_v8a.apk` | `ce3568fb8dd04d25ea76f109f70a24aaad94b3cb54e78ffd75a6928490eb5e4e` |
| `config.en.apk` | `a092c75cae679c20804a04d21864ecf13f7d64427b78d0437e4fafa4a1e4a6f9` |
| `config.xxhdpi.apk` | `b012d9e3128b81e1d9e8876f527313a3c81759c5e7f83fe667ff2df2f6293f48` |

XAPK contains full four-part installation set. Preserve `BeogradPlus-6.54-arm64.xapk` or all four APKs to reproduce tested install; one base APK alone is not equivalent to tested bundle.

### BusLogic protocol observed in APK

- Host: `https://online.bgnaplata.rs`.
- Catalog: POST form to `/publicapi/v3/api.php`, action `get_cities_extended_zip`, plus `session_id`.
- Realtime arrivals: same API v3 endpoint, action `data_bulletin`, plus encrypted `base` payload and session identity.
- HTTP client sends `X-API-INTEGRITY`.
- On HTTP 401, app refreshes Firebase App Check token through Play Integrity and retries request.
- `/publicapi/v3/networkextended.php` in APK belongs to Smart City path, not transit catalog path.
- V3 catalog response handling checks `Content-Disposition` for ZIP and reads first `.json` entry; HTTP gzip is separate transport encoding. Actual live response format was not captured.
- Arrival `base` uses AES-CBC/PKCS5Padding and Base64. Static comparison found local crypto and stop-ID mapping compatible with APK; synthetic checks passed. This does not validate live provider response.

These points come from static analysis of APK. Redroid app test did not intercept or replay its requests. Normal app startup may issue app-owned requests; no response proving realtime success was captured. Separate project-provider probes are summarized below.

### Local project backend is separate issue

Current `server/services/providerService.js` and provider status analysis show:

- Provider config targets old host `announcement-bgnaplata.ticketing.rs`. Station catalog uses POST `/publicapi/v1/networkextended.php`; realtime uses API v2 `/publicapi/v2/api.php`, action `data_bulletin`, encrypted `base`.
- `BG_URL` changes host but does not change API version. URL substitution alone cannot migrate v1/v2 client logic to v3.
- Six diagnostic v1 catalog probes across old/current hosts and JSON/form variants produced no HTTP response within configured 12-second probe deadlines. DNS resolved in 9-13 ms; TLS completed in 30-41 ms on independent repeats; no first byte arrived. These were separate probes, not calls through provider service, whose station `GET_TIMEOUT_MS` is 5 seconds. Cause remains unknown.
- Three separate v3 catalog probes used existing local credential but no Integrity header: two omitted `session_id`, one used locally generated session ID. All returned HTTP 401 within 52-77 ms. This does not establish rejection of valid app traffic or identify server policy.
- No valid mobile token/session was replayed. Live realtime v2/v3 response and timetable were not verified; reliable BusLogic stop UID was unavailable.
- Local server sends `X-Api-Authentication`; inspected app uses API v3 plus dynamic `X-API-INTEGRITY` and `session_id`.
- Limited public-source search found no verified alternative realtime feed. One third-party transit service did not list Belgrade as active and restricts use of its hosted proxy by external apps. Official Belgrade GTFS provides scheduled service only; stop-ID compatibility with BusLogic is unconfirmed. GTFS could only support separately labeled timetable fallback, not actual realtime.

Therefore local provider integration is likely stale independently of Android runtime. No API credential, encryption key, IV, app token, or request payload is reproduced here. Do not replace URLs alone and assume compatibility. Authorized API v3 access and integrity handling need separate owner-approved work.

## Runtime test matrix

GMS means Google Mobile Services; Store means Google Play Store. `su` and `low_ram` A/B runs used matched GMS/Store versions. Initial visibility test was exploratory and package versions may differ.

| Test | Environment and controlled change | Observed result | Conclusion |
|---|---|---|---|
| Initial Google visibility test | Android 12 GApps; BeogradPlus 6.54; no app-specific compatibility override | Play Core logged `Phonesky is not installed` although `com.android.vending` package existed. | Package visibility blocked service discovery in this configuration. |
| Visibility override | Per-app `FILTER_APPLICATION_QUERY` change ID `135549675` disabled for `buslogic.beogradplus` only | Play Core bound to `com.google.android.finsky.integrityservice.IntegrityService`; `Phonesky is not installed` disappeared. App still showed unsupported screen. | Visibility was one blocker, not sole blocker. This override does not alter device verdict or root state. |
| Android 12 baseline with `su` | GMS `26.41.31 (200700-1002748488)`; Store `53.7.23-31 [0] [PR] 1001145691`; per-app override applied | UI: `YOUR DEVICE IS NOT SUPPORTED`; message says Play Integrity API unavailable. | Baseline failure established. |
| Android 12 `su` removal | Separate fresh volume; removed only `/system/xbin/su` from test container writable layer; rebooted same container | File remained absent; `userdebug`, `test-keys`, `ro.debuggable=1`, shell UID `0` remained. Same UI. | Removing one root binary did not solve this app. Not equivalent to unrooting system image. |
| Android 12 low-RAM comparison | Separate fresh volume; same Android 12 GApps image, APK, GMS/Store versions, and per-app override; changed `ro.config.low_ram=true` to `false` | Same UI after ~30 seconds. Integrity request marker appeared; no numeric SDK error code. | `low_ram` flag alone did not solve issue. Fresh `/data` meant comparison of fresh instances, not same-volume A/B. |
| Android 13 64-only attempt | Official `redroid/redroid:13.0.0_64only-latest`; copied Android 12 GMS update APK | Update contained only `lib/x86/libconscrypt_gmscore_jni.so`; 64-only image required x86_64. GMS crashed with `UnsatisfiedLinkError` at `NativeCrypto.SSL_CTX_new`. | Invalid ABI pairing. Do not interpret as Android 13 Integrity result. Container stopped; data volume preserved. |
| Android 13 multilib test | Official `redroid/redroid:13.0.0-latest`; GApps overlay; x86_64 and x86 ABIs; GMS same version running as x86; Store same version on x86_64 | Play Integrity service connected, `OnRequestIntegrityTokenCallback : onRequestIntegrityToken` marker appeared, then service unbound. UI still showed same unsupported screen. No numeric error or confirmed token response. | Reaching service/request path did not establish successful verdict or app/backend acceptance. |
| Huawei flavor | Official AppGallery flavor 6.43.2/code 376 plus HMS Core `6.16.2.300`, separate Android 12 container/volume | HMS returned JWS; allowlisted payload check gave `basicIntegrity=false`; UI blocked app. JWS signature matched embedded certificate, but trusted certificate chain was not independently validated. | HMS path produced data but did not pass integrity or unlock realtime. Version differs from Google 6.54, so not provider-only comparison. |

### Package visibility override lifecycle

Per-app `FILTER_APPLICATION_QUERY` change ID `135549675` was disabled only for `buslogic.beogradplus`; this expanded package visibility but did not alter device verdict. Initial override A/B was followed by `am compat reset`, and package dump confirmed no override at that point. After further user approval, override was re-enabled and left active on a test instance. Final state was not rechecked on each stopped container. Do not assume every saved Android volume has identical compat state or that original package state is pristine.

### Android build properties and process evidence

- Android 12 image reported `ro.build.type=userdebug`, `ro.build.tags=test-keys`, `ro.debuggable=1`; Android shell `id` reported `uid=0(root)` after `su` removal.
- Original Google GMS process exit info included `SIGNALED`, status `9`, subreason `TOO MANY EMPTY PROCS`, PSS about 154 MiB. ActivityManager scheduled Integrity service restart.
- With `ro.config.low_ram=false`, GMS exit info again showed `SIGNALED`, status `9`, subreason unknown. Cgroup `oom` and `oom_kill` counters were zero; Docker `OOMKilled=false`. Exact sender/cause of signal and causal relation to Integrity refusal remain unknown.
- Initial Android 13 64-only GMS crash was diagnosed as x86/x86_64 library mismatch, not memory exhaustion.
- Correct Android 13 multilib test had GMS APK `primaryCpuAbi=x86`; Play Store APK ran `x86_64`; cgroup OOM counters remained zero. GMS still had `SIGNALED` exit entry, but Integrity service connection/request callback occurred. Logs do not expose final token result or numeric error.
- App screen text is generic. Do not infer exact Play Integrity code from wording alone.

## Huawei flavor details

- Official AppGallery APK: package `buslogic.beogradplus`, version `6.43.2` / code `376`, APK SHA-256 `a7df74f30928c3575f20d133c1942c9957d0d326a63e2cef978a912d8531ac48`, signer certificate SHA-256 `513297f99a25b19ecfb24dae625789a7256f6122f772145db082bc4ccc62b7a5`.
- HMS Core APK SHA-256 `4bc52f2bcf756e0b2e39e7bd3d94079974fb97ef7ad09704e44e2ed50b8d9cf1`; package `com.huawei.hwid`, version `6.16.2.300` / code `61602300`, signer certificate SHA-256 `b92825c2bd5d6d6d1e7f39eecd17843b7d9016f611136b75441bc6f4d3f00f05`. APK signature verification passed; signer identity was not independently verified against Huawei.
- Huawei signer certificate differs from Google APK signer `c57d0b247f93166a6ed1e24ba6c9f1c174c8a76ed347bcd284b095624d53f470`. Different versions and signatures prevent treating Huawei run as identical build with only provider swapped.
- Huawei implementation uses HMS Safety Detect `sysIntegrity`; transport attaches `X-API-INTEGRITY: HUAWEI <JWS>`.
- Huawei implementation stored compact JWS in preference field `APP_CHECK_TOKEN`; field name does not make it Firebase App Check token. Allowlisted payload inspection found `basicIntegrity=false`, advice present, error field absent. No payload strings were retained.
- Installed BeogradPlus used x86_64; HMS Core used arm64-v8a through native bridge. Test used separate `/data` volume and bridge, no published ports. No account, payment, or manual API replay was performed.
- JWS was not copied into this note or backend. Signature-to-embedded-cert check proves internal consistency only, not certificate trust. No HTTP status or server-side rejection reason was captured.

## Community and official evidence

Community reports below are anecdotes, not guarantees for BeogradPlus:

- [redroid #325](https://github.com/remote-android/redroid-doc/issues/325): one user got one root-checking game working after deleting `/system/xbin/su`; same thread says `test-keys` can also be checked. Report concerns simple local check, not Google Integrity.
- [redroid #416](https://github.com/remote-android/redroid-doc/issues/416): another user deleted `su` but apps still reported root; `id` remained root. Confirms inconsistent app behavior and remaining userdebug/root signals.
- [redroid #378](https://github.com/remote-android/redroid-doc/issues/378): GSF registration was suggested; original author later replied that it did not solve device certification problem. GSF ID registration is not Integrity verdict.
- [redroid-script #49](https://github.com/ayasa520/redroid-script/issues/49): September 2025 screenshot/report claimed Basic and Device checks on Android 13 x86_64 with Magisk, LSPosed, PlayStrong, changed profile, and keybox; Strong remained red. Repository author said method was not reproducible for them. January 2026 comment reported failure despite setup; June 2026 comment asked where PlayStrong source/group had gone. Checker screenshot does not prove BeogradPlus backend acceptance.
- PlayStrong was described in issue comments as closed-source and relying on bug in specific Google Play version. No trusted reproducible artifact was obtained.
- AlwaysStrong v1.0.5 ZIP was preflighted but not installed. Archive SHA-256: `ef2a3987b08287da362207e81662ed6e1cf9281a80f113b39375c1083004de4e`. ZIP contained ARM Zygisk binaries but no `zygisk/x86_64.so` or `zygisk/x86.so`; TEE libraries for x86_64 did not replace missing PIF hook. Its default keybox fetch script used plain HTTP and weak file checks. Script was not run; endpoint was not called; no keybox was fetched through script or used.

## Diagnostic and secret handling

- No Play Integrity JWS, Firebase App Check token, Huawei JWS, keybox, or private key is included here.
- One diagnostic tool output contained partially masked Firebase Crashlytics authentication field. Full value was not copied into project files or this note. Treat raw logcat as sensitive and do not paste unfiltered logs into chat, issue, or Git.
- Safe future logging should retain only allowlisted facts: process exit reason, numeric SDK error code, package versions, service bind/unbind markers, and UI outcome. Redact authorization headers, Firebase installation/auth fields, Integrity token data, nonce, and request bodies before storage.
- Checking field names or token presence is not equivalent to validating token response. Never copy tokens between devices or send them to local backend as substitute for approved auth.

## Docker and artifact state on 2026-10-25

All listed containers are stopped. Each had empty published-port bindings. Named `/data` volumes, bridge networks, and image cache remain. All stopped containers report exit `137` and `OOMKilled=false`; do not infer OOM solely from exit code. Compose files set `stop_grace_period: 30s`; exit `137` is consistent with forced termination after grace-period expiry, but available evidence does not confirm that as cause.

| Container | Role | Container ID | Image | `/data` volume | Bridge network |
|---|---|---|---|---|---|
| `redroid-redroid-1` | Original Google Android 12 GApps | `7e5ffe24ca0066af8c25320b29facee579ab4f69d9dc827bd1e6fdf3062f3ec4` | `redroid-mindthegapps:12.0.0-x86_64` | `redroid_redroid-gapps-data` | `redroid_default` |
| `redroid-huawei-redroid-1` | Huawei/HMS Android 12 | `15a0d0a970e6d4f18035d47c878a1af9109464af4de6d6f7c729c8740011115d` | `redroid/redroid:12.0.0-latest` | `redroid-huawei_redroid-hms-data` | `redroid-huawei_default` |
| `redroid-google-nosu-redroid-1` | Android 12 `su`-only test | `129fb0b4dd2eab18c1f8ae81456eed33ab2a8b89810fed07908d4f7c94e0e771` | `redroid-mindthegapps:12.0.0-x86_64` | `redroid-google-nosu_google-nosu-data` | `redroid-google-nosu_default` |
| `redroid-google-normalram-redroid-1` | Android 12 `low_ram=false` comparison | `97677cb70b5a0c9009977a2b2f1347eaeaa79c0cb4358e81b72c875306e04bbf` | `redroid-mindthegapps:12.0.0-x86_64` | `redroid-google-normalram_google-normalram-data` | `redroid-google-normalram_default` |
| `redroid-google-android13-redroid-1` | Invalid Android 13 64-only ABI test; stopped earlier | `b5631aa9793499a03ed1ee7eaa163d2a9ff34c7a1c2668868b3c79f04652239d` | `redroid-mindthegapps:13.0.0-x86_64` | `redroid-google-android13_google-android13-data` | `redroid-google-android13_default` |
| `redroid-google-android13-multilib-redroid-1` | Corrected Android 13 multilib comparison | `323d9c56bbf2e93280c5174b2f1f68533261bf11973f2ef2d3c925b8f45a3ecd` | `redroid-mindthegapps:13.0.0-x86_64-multilib` | `redroid-google-android13-multilib_google-android13-multilib-data` | `redroid-google-android13-multilib_default` |

Container IDs and volume names remained available; no volumes were removed. Per-app compatibility state may differ between saved Android volumes, as noted above. Additional unmounted Docker volume `redroid_redroid-data` was visible in volume inventory; ownership/content was not examined. Do not delete unclassified volume blindly.

At final stopped state, all listed containers used bridge networks, not host networking. No ports were published. Bridge networking does not enforce egress-only policy: host and peer containers may still reach services inside bridge. All persistent data remains in named volumes. Latest `free -h` after shutdown reported about 6.2 GiB available RAM and no swap.

### Image cache and build inputs

| Image tag | Local image ID | Base/source digest |
|---|---|---|
| `redroid-mindthegapps:12.0.0-x86_64` | `sha256:09528b2d4f0546c737d283a9dee1860f591e701bf574ca4f2ca9d28e6bc9c18a` | `redroid/redroid:12.0.0-latest`, reported digests `sha256:52332b2d74f337982d5ac281a8020ec297fb1ea05cbdcdaaa9c19a2065ae1adc` and `sha256:d176f5e7bf333e089738f57d189a6e15a9fbeae5829f7d021320a6cde45832cf` |
| `redroid-mindthegapps:13.0.0-x86_64` | `sha256:2875592a55b5f6599aee8941757418671f475366d1a6a3439c424b56037f7087` | `redroid/redroid:13.0.0_64only-latest`, `sha256:5a42a569ee1d7c71796c0385e906cbaa4c3e0a162a56d9f26b29bdb1befac13b` |
| `redroid-mindthegapps:13.0.0-x86_64-multilib` | `sha256:57fc0c0ea2ddc7bf31e4a69031cb0e2cd5ce595cae4c875aef4a5fd8b316ee28` | `redroid/redroid:13.0.0-latest`, `sha256:41e5f0c1ff27a4a474c474e5595168cedf6c40fc5dd102c5617f48c80f511e9e` |

Android 12 overlay used MindTheGapps release `MindTheGapps-12.1.0-x86_64-20231025_201056`; build recipe did not pin archive SHA-256 or verify release certificate. Android 13 x86_64 archive SHA-256 was `2076179bcb6f30e78853d52cf70a4bd1d27502c3852332195e5356816cddfdd9`; embedded OTA certificate matched published release certificate. Android 13 overlays used 2 CPU and 2 GiB memory; Android 12 overlays used 2 CPU and 3 GiB. Local image IDs identify current Docker cache, not portable registry tags. Host also retained official Redroid images for Android 12, Android 13 multilib, and Android 13 64-only. No image was deleted.

### Container restart caution

`redroid-google-nosu-redroid-1` had `/system/xbin/su` removed from container writable layer, not from image or shared volume. Starting same stopped container should preserve writable layer; recreating from image can restore `su`. Other test data remains in separate named volumes. Do not run `docker compose down -v`, `docker volume rm`, or `docker rm -v` if preserving Android data. Inspect mounts before any recreation.

Representative Google container settings used during tests:

```yaml
services:
  redroid:
    image: redroid-mindthegapps:12.0.0-x86_64
    privileged: true
    cpus: 2.0
    mem_limit: 3g
    shm_size: 256m
    restart: "no"
    stop_grace_period: 30s
    command:
      - androidboot.redroid_width=480
      - androidboot.redroid_height=800
      - androidboot.redroid_dpi=160
      - androidboot.redroid_fps=15
      - androidboot.redroid_gpu_mode=guest
      - androidboot.use_memfd=true
      - ro.setupwizard.mode=DISABLED
      - ro.config.low_ram=true
    volumes:
      - redroid-gapps-data:/data
```

No `ports:` or `network_mode: host` was configured. Default Compose bridge was used. This snippet documents service shape, not complete reproducible image build. Android 12 GApps overlay used Redroid base plus `MindTheGapps-12.1.0-x86_64-20231025_201056`; archive was fetched at build time without SHA pinning. Source Compose files may be removed by cleanup.

## Current conclusion and next steps

### If goal is working realtime with least uncertainty

1. Use certified physical Android with official BeogradPlus distribution. Avoid APKPure sideload during control test if official Play channel is available.
2. Record only UI result, safe numeric error/status, and whether realtime data appears. Do not export token/JWS.
3. If physical control succeeds, redroid environment is primary difference. If it fails, inspect distribution/signature, backend policy, and service availability before further emulator changes.
4. Ask BusLogic/Firebase owner for required App Check device level, distribution settings, and safe server-side rejection reason. Do not guess from generic UI dialog.

### If redroid remains hard requirement

- No standard supported setup has been found. `su` removal, Play Store visibility, GMS/Store updates, Android 12 `low_ram` toggle, and clean Android 13 multilib test did not restore realtime.
- Do not spend time on GSF registration or random build-property changes as substitutes for certified attestation.
- Modified-attestation route remains unverified, closed-source, version-sensitive, and dependent on architecture-specific hooks/key material. Community checker success is not proof of backend acceptance. Any such test requires separate explicit scope decision and verified artifacts; no module or keybox has been installed.
- Do not replace API v1/v2 backend with v3 based solely on APK static analysis. Obtain owner-approved protocol/auth contract before backend changes.

## Source index

- [Official redroid documentation](https://github.com/remote-android/redroid-doc)
- [Google Play Integrity setup and verdicts](https://developer.android.com/google/play/integrity/setup)
- [Firebase App Check with Play Integrity](https://firebase.google.com/docs/app-check/android/play-integrity-provider)
- [Firebase App Check debug provider](https://firebase.google.com/docs/app-check/android/debug-provider)
- [MindTheGapps Android 12 x86_64 release](https://github.com/MindTheGapps/12.1.0-x86_64/releases/tag/MindTheGapps-12.1.0-x86_64-20231025_201056)
- [MindTheGapps Android 13 x86_64 release](https://github.com/MindTheGapps/13.0.0-x86_64/releases/tag/MindTheGapps-13.0.0-x86_64-20231025_201203)
- [Official Belgrade GTFS dataset](https://data.gov.rs/sr/datasets/gradski-javni-prevoz-u-beogradu-gtfs/)
- [redroid #325: deleting `su` helped one local root check](https://github.com/remote-android/redroid-doc/issues/325)
- [redroid #416: deleting `su` did not satisfy another app](https://github.com/remote-android/redroid-doc/issues/416)
- [redroid #378: GSF registration did not solve certification](https://github.com/remote-android/redroid-doc/issues/378)
- [redroid-script #49: unrepeatable PlayStrong report](https://github.com/ayasa520/redroid-script/issues/49)
- [Official Beograd Plus AppGallery page](https://appgallery.huawei.com/app/C108784077)
- [Huawei Safety Detect documentation](https://developer.huawei.com/consumer/en/codelab/HMSCoreSafetyDetect/)
