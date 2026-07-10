# ZeroAI Studio Legacy — offline licensing

Ed25519 signed, machine-bound, 100% offline. Only the holder of `private.pem`
can mint keys; the app ships only `public.pem`.

## One-time setup (you)
    node cli.js keygen          # creates private.pem (SECRET) + public.pem
    # back up private.pem offline (USB, password manager). If it leaks, anyone
    # can mint keys → you'd have to re-key and reissue. NEVER commit or ship it.
    # copy public.pem into the app bundle (it's embedded in the verifier).

## Activating a school (all offline — WhatsApp/paper)
    1. School installs ZeroAI Studio Legacy, opens it → it shows a Machine ID.
    2. School reads you the Machine ID + school name.
    3. You:  node cli.js mint --school "St. Marys, Kabwe" --machine <id> --days 365
    4. You send them the key. They paste it → activated on THAT machine only.

## Guarantees (and the honest limit)
- Forging a key without private.pem is cryptographically impossible.
- A leaked key won't work on another school's machine (hardware-bound).
- Editing/tampering a key breaks the signature.
- LIMIT: no client-side check is uncrackable — a determined attacker could patch
  the binary to skip verification. This stops *forging* and *sharing*, not a
  reverse-engineer. Obfuscation at build time raises that bar further.
