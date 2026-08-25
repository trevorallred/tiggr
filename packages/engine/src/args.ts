import { parseArgs } from 'node:util'

type TiggerCommandLineArgs = {
  runInBand?: boolean
  dryRun?: boolean
  include?: string
  exclude?: string
  showSkipped: boolean
}

export function getArgs(): TiggerCommandLineArgs {
  const args = process.argv.slice(2)

  const { values } = parseArgs({
    args,
    strict: false,
    options: {
      // allows vitest to run locally (pnpm test)
      runInBand: {
        type: 'boolean',
      },
      dryRun: {
        type: 'boolean',
        short: 'd',
      },
      include: {
        type: 'string',
        short: 'i',
      },
      exclude: {
        type: 'string',
        short: 'x',
      },
      showSkipped: {
        type: 'boolean',
        default: true,
      },
    },
  })

  return {
    // runInBand: values.runInBand,
    dryRun: values.dryRun as boolean | undefined,
    include: values.include?.toString(),
    exclude: values.exclude?.toString(),
    showSkipped: values.showSkipped as boolean,
  }
}
