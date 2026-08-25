# Tiggr CLI

The CLI loads a default-exported `{ definitions, config, metadata? }` object from
`tiggr.config.mjs` or `tiggr.config.js` in the current directory.

```sh
tiggr run
tiggr run search
tiggr run --include smoke,search --exclude slow
tiggr run --dry-run
tiggr run --pretty
```

JSON is the default output and the source-of-truth run record; `--json` selects it explicitly and
`--pretty` formats the same structured result for humans. Positional IDs and `--include` are
combined. Selected tests automatically bring in their dependency closure and applicable resource
teardowns. `--exclude` remains destructive and wins over selection.

For nonstandard automation layouts, `TIGGR_CONFIG` may point to a config module relative to the
current directory.
