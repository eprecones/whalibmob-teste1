# Android middleware

> **IMPORTANT**: This code is not maintained. It's only here for reference if someone is curious how I go about reverse engineering.

### Requirements

1. Rooted android phone with Play Services
2. Magisk with Zygisk enabled and [PlayIntegrityFix module](https://github.com/chiteroman/PlayIntegrityFix) installed
3. [Frida server installed](https://frida.re/docs/android/)
4. Whatsapp and/or Whatsapp business installed on the phone **from the Play Store** (APKs don't work)

### How to run

1. Install matching Frida 17.x client/server binaries and run `npm install` in the android directory
2. Open Whatsapp/Whatsapp Business and try to register a number (needed to load gpia components, won't work if you don't do it)
3. Run:
    - `frida -U "WhatsApp" -l server_with_dependencies.js` (WhatsApp)
    - `frida -U "WhatsApp Business" -l server_with_dependencies.js` (WhatsApp Business)

The middleware uses the public Standard Integrity API exposed by current WhatsApp builds (`IntegrityManagerFactory.createStandard`) and retries only while the application context or provider is still unavailable. A successful bootstrap prints both component messages followed by `Server ready on port 1119` (or `1120` for WhatsApp Business).

`WA_REQUIRE_INSTALLED_APK_MATCH=1` can be set on the Node registration process to require `/info` to report the exact version carried by the APK token material. This is a consistency check only; it does not make or bypass an integrity verdict.
