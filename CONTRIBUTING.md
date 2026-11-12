# Contributing

## Before you start

- License: AGPL-3.0-only, see [LICENSE](LICENSE).
- Pull requests need a signed [CLA](CLA.md). Unsigned ones are not merged.
- Security problems go to [SECURITY.md](SECURITY.md), not to the issue tracker.
- The name "yuicry" is covered by [TRADEMARK.md](TRADEMARK.md), not by the AGPL.

## Signing the CLA

Put this line in your first pull request:

```text
I have read the CLA.md and I hereby sign the CLA.
```

Add your full legal name. If you contribute as part of your job, confirm that your
employer allows it or has waived its rights. One signature covers your later pull
requests.

## Bug reports

Include:

- what you expected and what happened;
- steps to reproduce, as small as you can make them;
- version or commit, OS, runtime version;
- the error output.

Search open issues first.

## Feature requests

Describe the problem. Say who runs into it and what they do instead today. A solution
with no problem behind it is hard to judge.

## Pull requests

1. Branch from `main`.
2. One change per pull request. Keep refactoring out of behaviour changes.
3. Say what changed and why.
4. Add tests once there is a test suite.
5. Let CI pass.

Commit subject in the imperative, for example `fix: handle empty input`. Put the reason
in the body, not a copy of the diff.

No style is enforced. Match the code next to your change.

## Review

The maintainer may decline a pull request, including a correct one. Sending one does not
obligate a merge.

## Copyright

You keep the copyright in your contribution. The [CLA](CLA.md) gives the maintainer the
right to ship it under AGPL-3.0-only and under commercial terms.
