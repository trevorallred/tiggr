# Tigger CLI

The CLI loads a default-exported `{ definitions, config, metadata? }` object from
`tigger.config.mjs` or `tigger.config.js` in the current directory.

```sh
tigger run
tigger run search
tigger run --include smoke,search --exclude slow
tigger run --dry-run
tigger run --pretty
```

JSON is the default output and the source-of-truth run record; `--json` selects it explicitly and
`--pretty` formats the same structured result for humans. Positional IDs and `--include` are
combined. Selected tests automatically bring in their dependency closure and applicable resource
teardowns. `--exclude` remains destructive and wins over selection.

For nonstandard automation layouts, `TIGGER_CONFIG` may point to a config module relative to the
current directory.
