# Tiggr sample app

This private workspace package is a real localhost HTTP target backed only by in-memory `Map`s. Its
suite executes this graph:

```text
createProject
  -> createDocument
    -> processDocument
      -> summarize --\
                      -> search
      -> tag -------/
  -> archiveProject (after the full dependent tree)
```

`processDocument` returns HTTP 202 and completes on an in-process timer. Both fan-out branches poll
until processing settles. `search` consumes both artifacts and creates a same-query document in a
second project to assert that results never cross project boundaries.

After building the workspace, run the full app/CLI boundary with:

```sh
pnpm --filter @tiggr/sample-app dogfood
```

The dogfood runner starts the server on an ephemeral localhost port, invokes the built Tiggr CLI
entrypoint with `run`, requires exit code 0, and inspects the JSON artifact for the full graph,
multi-attempt polling, and a passing isolation observation.
